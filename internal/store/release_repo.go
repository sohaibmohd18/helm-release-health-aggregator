package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// Upsert inserts or replaces a release (matched on id).
func (db *DB) Upsert(r v1alpha1.ReleaseDetail) error {
	vsJSON, _ := json.Marshal(r.VersionStatus)
	podsJSON, _ := json.Marshal(r.Pods)
	workloadsJSON, _ := json.Marshal(r.Workloads)
	driftJSON, _ := json.Marshal(r.DriftEntries)
	historyJSON, _ := json.Marshal(r.History)
	defaultsJSON, _ := json.Marshal(r.ChartDefaults)
	valuesJSON, _ := json.Marshal(r.DeployedValues)

	_, err := db.Exec(`
		INSERT INTO releases
			(id, name, namespace, chart_name, chart_version, app_version,
			 status, health, pod_desired, pod_ready, drift_count,
			 version_status, last_reconciled, first_deployed, last_deployed, revision,
			 pods, workloads, drift_entries, history, chart_defaults, deployed_values,
			 updated_at)
		VALUES
			(?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name            = excluded.name,
			namespace       = excluded.namespace,
			chart_name      = excluded.chart_name,
			chart_version   = excluded.chart_version,
			app_version     = excluded.app_version,
			status          = excluded.status,
			health          = excluded.health,
			pod_desired     = excluded.pod_desired,
			pod_ready       = excluded.pod_ready,
			drift_count     = excluded.drift_count,
			version_status  = excluded.version_status,
			last_reconciled = excluded.last_reconciled,
			first_deployed  = excluded.first_deployed,
			last_deployed   = excluded.last_deployed,
			revision        = excluded.revision,
			pods            = excluded.pods,
			workloads       = excluded.workloads,
			drift_entries   = excluded.drift_entries,
			history         = excluded.history,
			chart_defaults  = excluded.chart_defaults,
			deployed_values = excluded.deployed_values,
			updated_at      = excluded.updated_at`,
		r.ID, r.Name, r.Namespace, r.ChartName, r.ChartVersion, r.AppVersion,
		string(r.Status), string(r.Health), r.PodDesired, r.PodReady, r.DriftCount,
		string(vsJSON), r.LastReconciled, r.FirstDeployed, r.LastDeployed, r.Revision,
		string(podsJSON), string(workloadsJSON), string(driftJSON),
		string(historyJSON), string(defaultsJSON), string(valuesJSON),
		time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// Delete removes a release by id.
func (db *DB) Delete(id string) error {
	_, err := db.Exec(`DELETE FROM releases WHERE id = ?`, id)
	return err
}

// GetRelease returns the full detail for a single release.
func (db *DB) GetRelease(namespace, name string) (*v1alpha1.ReleaseDetail, error) {
	row := db.QueryRow(`SELECT `+releaseDetailCols+` FROM releases WHERE namespace = ? AND name = ?`, namespace, name)
	return scanDetail(row)
}

// ListReleases applies filters and returns a paginated list of releases.
func (db *DB) ListReleases(f v1alpha1.ReleaseFilters) ([]v1alpha1.Release, int, error) {
	where, args := buildWhere(f)
	orderClause := buildOrder(f.SortBy, f.SortOrder)

	var total int
	if err := db.QueryRow(`SELECT COUNT(*) FROM releases`+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count releases: %w", err)
	}

	if f.Page < 1 {
		f.Page = 1
	}
	if f.PageSize < 1 {
		f.PageSize = 25
	}
	offset := (f.Page - 1) * f.PageSize

	rows, err := db.Query(
		`SELECT `+releaseListCols+` FROM releases`+where+orderClause+` LIMIT ? OFFSET ?`,
		append(args, f.PageSize, offset)...,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("query releases: %w", err)
	}
	defer rows.Close()

	var releases []v1alpha1.Release
	for rows.Next() {
		r, err := scanRelease(rows)
		if err != nil {
			return nil, 0, err
		}
		releases = append(releases, r)
	}
	if releases == nil {
		releases = []v1alpha1.Release{}
	}
	return releases, total, rows.Err()
}

// ClusterSummary aggregates counts across all releases.
func (db *DB) ClusterSummary(clusterName string) (v1alpha1.ClusterSummary, error) {
	row := db.QueryRow(`
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN health='Healthy'  THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN health='Degraded' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN health='Failed'   THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN health='Unknown'  THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN json_extract(version_status,'$.upgradeAvailable')=1 THEN 1 ELSE 0 END), 0)
		FROM releases`)
	var s v1alpha1.ClusterSummary
	s.ClusterName = clusterName
	s.LastUpdated = time.Now().UTC().Format(time.RFC3339)
	err := row.Scan(&s.TotalReleases, &s.HealthyReleases, &s.DegradedReleases,
		&s.FailedReleases, &s.UnknownReleases, &s.UpgradesAvailable)
	return s, err
}

// NamespaceSummaries returns one summary row per namespace.
func (db *DB) NamespaceSummaries() ([]v1alpha1.NamespaceSummary, error) {
	rows, err := db.Query(`
		SELECT
			namespace,
			COUNT(*) AS total,
			SUM(CASE WHEN health='Healthy'  THEN 1 ELSE 0 END),
			SUM(CASE WHEN health='Degraded' THEN 1 ELSE 0 END),
			SUM(CASE WHEN health='Failed'   THEN 1 ELSE 0 END)
		FROM releases
		GROUP BY namespace
		ORDER BY namespace`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []v1alpha1.NamespaceSummary
	for rows.Next() {
		var ns v1alpha1.NamespaceSummary
		if err := rows.Scan(&ns.Namespace, &ns.ReleaseCount,
			&ns.HealthyCount, &ns.DegradedCount, &ns.FailedCount); err != nil {
			return nil, err
		}
		ns.Health = namespaceHealth(ns)
		summaries = append(summaries, ns)
	}
	if summaries == nil {
		summaries = []v1alpha1.NamespaceSummary{}
	}
	return summaries, rows.Err()
}

// UpgradeCandidates returns all releases with an upgrade available.
func (db *DB) UpgradeCandidates() ([]v1alpha1.UpgradeCandidate, error) {
	rows, err := db.Query(
		`SELECT ` + releaseListCols + ` FROM releases WHERE json_extract(version_status,'$.upgradeAvailable')=1`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var candidates []v1alpha1.UpgradeCandidate
	for rows.Next() {
		r, err := scanRelease(rows)
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, v1alpha1.UpgradeCandidate{
			Release:            r,
			LatestVersion:      r.VersionStatus.Latest,
			HelmUpgradeCommand: buildHelmCmd(r),
		})
	}
	if candidates == nil {
		candidates = []v1alpha1.UpgradeCandidate{}
	}
	return candidates, rows.Err()
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const releaseListCols = `
	id, name, namespace, chart_name, chart_version, app_version,
	status, health, pod_desired, pod_ready, drift_count,
	version_status, last_reconciled, first_deployed, last_deployed, revision`

const releaseDetailCols = releaseListCols + `, pods, workloads, drift_entries, history, chart_defaults, deployed_values`

func scanRelease(row interface {
	Scan(...any) error
}) (v1alpha1.Release, error) {
	var r v1alpha1.Release
	var vsRaw string
	err := row.Scan(
		&r.ID, &r.Name, &r.Namespace, &r.ChartName, &r.ChartVersion, &r.AppVersion,
		&r.Status, &r.Health, &r.PodDesired, &r.PodReady, &r.DriftCount,
		&vsRaw, &r.LastReconciled, &r.FirstDeployed, &r.LastDeployed, &r.Revision,
	)
	if err != nil {
		return r, err
	}
	_ = json.Unmarshal([]byte(vsRaw), &r.VersionStatus)
	return r, nil
}

func scanDetail(row *sql.Row) (*v1alpha1.ReleaseDetail, error) {
	var d v1alpha1.ReleaseDetail
	var vsRaw, podsRaw, workRaw, driftRaw, histRaw, defaultsRaw, valuesRaw string
	err := row.Scan(
		&d.ID, &d.Name, &d.Namespace, &d.ChartName, &d.ChartVersion, &d.AppVersion,
		&d.Status, &d.Health, &d.PodDesired, &d.PodReady, &d.DriftCount,
		&vsRaw, &d.LastReconciled, &d.FirstDeployed, &d.LastDeployed, &d.Revision,
		&podsRaw, &workRaw, &driftRaw, &histRaw, &defaultsRaw, &valuesRaw,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(vsRaw), &d.VersionStatus)
	_ = json.Unmarshal([]byte(podsRaw), &d.Pods)
	_ = json.Unmarshal([]byte(workRaw), &d.Workloads)
	_ = json.Unmarshal([]byte(driftRaw), &d.DriftEntries)
	_ = json.Unmarshal([]byte(histRaw), &d.History)
	_ = json.Unmarshal([]byte(defaultsRaw), &d.ChartDefaults)
	_ = json.Unmarshal([]byte(valuesRaw), &d.DeployedValues)
	if d.Pods == nil {
		d.Pods = []v1alpha1.PodSummary{}
	}
	if d.Workloads == nil {
		d.Workloads = []v1alpha1.WorkloadSummary{}
	}
	if d.DriftEntries == nil {
		d.DriftEntries = []v1alpha1.DriftEntry{}
	}
	if d.History == nil {
		d.History = []v1alpha1.RevisionEntry{}
	}
	if d.ChartDefaults == nil {
		d.ChartDefaults = map[string]any{}
	}
	if d.DeployedValues == nil {
		d.DeployedValues = map[string]any{}
	}
	return &d, nil
}

func buildWhere(f v1alpha1.ReleaseFilters) (string, []any) {
	var clauses []string
	var args []any

	if f.Namespace != "" {
		clauses = append(clauses, "namespace = ?")
		args = append(args, f.Namespace)
	}
	if len(f.Health) > 0 {
		placeholders := make([]string, len(f.Health))
		for i, h := range f.Health {
			placeholders[i] = "?"
			args = append(args, string(h))
		}
		clauses = append(clauses, "health IN ("+strings.Join(placeholders, ",")+")")
	}
	if f.Search != "" {
		clauses = append(clauses, "(name LIKE ? OR chart_name LIKE ?)")
		like := "%" + f.Search + "%"
		args = append(args, like, like)
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

func buildOrder(sortBy, order string) string {
	cols := map[string]string{
		"name":      "name",
		"namespace": "namespace",
		"health":    "health",
		"chart":     "chart_name",
		"version":   "chart_version",
		"pods":      "pod_ready",
		"revision":  "revision",
	}
	col, ok := cols[sortBy]
	if !ok {
		col = "name"
	}
	dir := "ASC"
	if strings.ToLower(order) == "desc" {
		dir = "DESC"
	}
	return " ORDER BY " + col + " " + dir
}

func namespaceHealth(ns v1alpha1.NamespaceSummary) v1alpha1.HealthStatus {
	if ns.FailedCount > 0 {
		return v1alpha1.Failed
	}
	if ns.DegradedCount > 0 {
		return v1alpha1.Degraded
	}
	if ns.HealthyCount == ns.ReleaseCount {
		return v1alpha1.Healthy
	}
	return v1alpha1.Unknown
}

func buildHelmCmd(r v1alpha1.Release) string {
	return fmt.Sprintf(
		"helm upgrade %s %s --namespace %s --version %s",
		r.Name, r.ChartName, r.Namespace, r.VersionStatus.Latest,
	)
}
