package store

import (
	"testing"
	"time"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// openMem opens an in-memory SQLite database for testing.
func openMem(t *testing.T) *DB {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// makeRelease returns a minimal valid ReleaseDetail with sensible defaults.
func makeRelease(namespace, name string, health v1alpha1.HealthStatus) v1alpha1.ReleaseDetail {
	return v1alpha1.ReleaseDetail{
		Release: v1alpha1.Release{
			ID:           namespace + "/" + name,
			Name:         name,
			Namespace:    namespace,
			ChartName:    name + "-chart",
			ChartVersion: "1.0.0",
			AppVersion:   "1.0.0",
			Status:       v1alpha1.StatusDeployed,
			Health:       health,
			PodDesired:   2,
			PodReady:     2,
			DriftCount:   0,
			VersionStatus: v1alpha1.VersionStatus{
				Installed:        "1.0.0",
				Latest:           "1.0.0",
				UpgradeAvailable: false,
				Severity:         v1alpha1.SeverityNone,
			},
			LastReconciled: time.Now().UTC().Format(time.RFC3339),
			FirstDeployed:  time.Now().UTC().Format(time.RFC3339),
			LastDeployed:   time.Now().UTC().Format(time.RFC3339),
			Revision:       1,
		},
		Pods:           []v1alpha1.PodSummary{},
		Workloads:      []v1alpha1.WorkloadSummary{},
		DriftEntries:   []v1alpha1.DriftEntry{},
		History:        []v1alpha1.RevisionEntry{},
		ChartDefaults:  map[string]any{},
		DeployedValues: map[string]any{},
	}
}

// ---------------------------------------------------------------------------
// Upsert / GetRelease
// ---------------------------------------------------------------------------

func TestUpsertAndGetRelease(t *testing.T) {
	db := openMem(t)

	r := makeRelease("monitoring", "prometheus", v1alpha1.Healthy)
	r.DriftCount = 3
	r.DriftEntries = []v1alpha1.DriftEntry{
		{Key: "replicas", DefaultValue: 1, DeployedValue: 3, Type: v1alpha1.DriftModified, Severity: v1alpha1.DriftLow},
	}
	r.VersionStatus = v1alpha1.VersionStatus{
		Installed:        "15.0.0",
		Latest:           "16.0.0",
		UpgradeAvailable: true,
		Severity:         v1alpha1.SeverityMajor,
	}

	if err := db.Upsert(r); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	got, err := db.GetRelease("monitoring", "prometheus")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got == nil {
		t.Fatal("expected release, got nil")
	}

	if got.ID != r.ID {
		t.Errorf("ID: got %q, want %q", got.ID, r.ID)
	}
	if got.Health != v1alpha1.Healthy {
		t.Errorf("Health: got %q, want Healthy", got.Health)
	}
	if got.DriftCount != 3 {
		t.Errorf("DriftCount: got %d, want 3", got.DriftCount)
	}
	if len(got.DriftEntries) != 1 {
		t.Errorf("DriftEntries len: got %d, want 1", len(got.DriftEntries))
	}
	if !got.VersionStatus.UpgradeAvailable {
		t.Error("VersionStatus.UpgradeAvailable: want true")
	}
	if got.VersionStatus.Severity != v1alpha1.SeverityMajor {
		t.Errorf("Severity: got %q, want major", got.VersionStatus.Severity)
	}
}

func TestUpsert_UpdateExisting(t *testing.T) {
	db := openMem(t)

	r := makeRelease("default", "nginx", v1alpha1.Healthy)
	if err := db.Upsert(r); err != nil {
		t.Fatalf("initial upsert: %v", err)
	}

	// Update health
	r.Health = v1alpha1.Degraded
	r.PodReady = 1
	if err := db.Upsert(r); err != nil {
		t.Fatalf("update upsert: %v", err)
	}

	got, err := db.GetRelease("default", "nginx")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Health != v1alpha1.Degraded {
		t.Errorf("Health after update: got %q, want Degraded", got.Health)
	}
	if got.PodReady != 1 {
		t.Errorf("PodReady after update: got %d, want 1", got.PodReady)
	}
}

func TestGetRelease_NotFound(t *testing.T) {
	db := openMem(t)

	got, err := db.GetRelease("missing", "nowhere")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for missing release, got %+v", got)
	}
}

func TestDelete(t *testing.T) {
	db := openMem(t)

	r := makeRelease("default", "redis", v1alpha1.Healthy)
	if err := db.Upsert(r); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := db.Delete(r.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	got, err := db.GetRelease("default", "redis")
	if err != nil {
		t.Fatalf("get after delete: %v", err)
	}
	if got != nil {
		t.Error("expected nil after delete")
	}
}

// ---------------------------------------------------------------------------
// ListReleases
// ---------------------------------------------------------------------------

func TestListReleases_NoFilter(t *testing.T) {
	db := openMem(t)

	releases := []v1alpha1.ReleaseDetail{
		makeRelease("monitoring", "prometheus", v1alpha1.Healthy),
		makeRelease("monitoring", "grafana", v1alpha1.Degraded),
		makeRelease("default", "redis", v1alpha1.Failed),
	}
	for _, r := range releases {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert %s: %v", r.Name, err)
		}
	}

	got, total, err := db.ListReleases(v1alpha1.ReleaseFilters{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 3 {
		t.Errorf("total: got %d, want 3", total)
	}
	if len(got) != 3 {
		t.Errorf("len: got %d, want 3", len(got))
	}
}

func TestListReleases_NamespaceFilter(t *testing.T) {
	db := openMem(t)

	for _, r := range []v1alpha1.ReleaseDetail{
		makeRelease("monitoring", "prometheus", v1alpha1.Healthy),
		makeRelease("monitoring", "grafana", v1alpha1.Healthy),
		makeRelease("default", "redis", v1alpha1.Healthy),
	} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	got, total, err := db.ListReleases(v1alpha1.ReleaseFilters{Namespace: "monitoring"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 {
		t.Errorf("total: got %d, want 2", total)
	}
	if len(got) != 2 {
		t.Errorf("len: got %d, want 2", len(got))
	}
	for _, r := range got {
		if r.Namespace != "monitoring" {
			t.Errorf("unexpected namespace %q", r.Namespace)
		}
	}
}

func TestListReleases_HealthFilter(t *testing.T) {
	db := openMem(t)

	for _, r := range []v1alpha1.ReleaseDetail{
		makeRelease("ns", "a", v1alpha1.Healthy),
		makeRelease("ns", "b", v1alpha1.Degraded),
		makeRelease("ns", "c", v1alpha1.Failed),
		makeRelease("ns", "d", v1alpha1.Unknown),
	} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	got, total, err := db.ListReleases(v1alpha1.ReleaseFilters{
		Health: []v1alpha1.HealthStatus{v1alpha1.Failed, v1alpha1.Degraded},
	})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 {
		t.Errorf("total: got %d, want 2", total)
	}
	_ = got
}

func TestListReleases_SearchFilter(t *testing.T) {
	db := openMem(t)

	for _, r := range []v1alpha1.ReleaseDetail{
		makeRelease("ns", "my-app-backend", v1alpha1.Healthy),
		makeRelease("ns", "my-app-frontend", v1alpha1.Healthy),
		makeRelease("ns", "redis", v1alpha1.Healthy),
	} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	got, total, err := db.ListReleases(v1alpha1.ReleaseFilters{Search: "my-app"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 {
		t.Errorf("total: got %d, want 2", total)
	}
	_ = got
}

func TestListReleases_Pagination(t *testing.T) {
	db := openMem(t)

	for i := 0; i < 5; i++ {
		r := makeRelease("ns", "release-"+string(rune('a'+i)), v1alpha1.Healthy)
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	// Page 1: 2 per page
	p1, total, err := db.ListReleases(v1alpha1.ReleaseFilters{Page: 1, PageSize: 2})
	if err != nil {
		t.Fatalf("list page 1: %v", err)
	}
	if total != 5 {
		t.Errorf("total: got %d, want 5", total)
	}
	if len(p1) != 2 {
		t.Errorf("page 1 len: got %d, want 2", len(p1))
	}

	// Page 3: 1 remaining
	p3, _, err := db.ListReleases(v1alpha1.ReleaseFilters{Page: 3, PageSize: 2})
	if err != nil {
		t.Fatalf("list page 3: %v", err)
	}
	if len(p3) != 1 {
		t.Errorf("page 3 len: got %d, want 1", len(p3))
	}
}

func TestListReleases_EmptyResult(t *testing.T) {
	db := openMem(t)

	got, total, err := db.ListReleases(v1alpha1.ReleaseFilters{Namespace: "nonexistent"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 0 {
		t.Errorf("total: got %d, want 0", total)
	}
	if got == nil {
		t.Error("items should be empty slice, not nil")
	}
	if len(got) != 0 {
		t.Errorf("len: got %d, want 0", len(got))
	}
}

// ---------------------------------------------------------------------------
// ClusterSummary
// ---------------------------------------------------------------------------

func TestClusterSummary(t *testing.T) {
	db := openMem(t)

	healthy := makeRelease("ns", "a", v1alpha1.Healthy)
	degraded := makeRelease("ns", "b", v1alpha1.Degraded)
	failed := makeRelease("ns", "c", v1alpha1.Failed)
	unknown := makeRelease("ns", "d", v1alpha1.Unknown)

	// Give one release an upgrade available
	withUpgrade := makeRelease("ns", "e", v1alpha1.Healthy)
	withUpgrade.VersionStatus = v1alpha1.VersionStatus{
		Installed:        "1.0.0",
		Latest:           "2.0.0",
		UpgradeAvailable: true,
		Severity:         v1alpha1.SeverityMajor,
	}

	for _, r := range []v1alpha1.ReleaseDetail{healthy, degraded, failed, unknown, withUpgrade} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	summary, err := db.ClusterSummary("test-cluster")
	if err != nil {
		t.Fatalf("summary: %v", err)
	}

	if summary.ClusterName != "test-cluster" {
		t.Errorf("ClusterName: got %q", summary.ClusterName)
	}
	if summary.TotalReleases != 5 {
		t.Errorf("TotalReleases: got %d, want 5", summary.TotalReleases)
	}
	if summary.HealthyReleases != 2 {
		t.Errorf("HealthyReleases: got %d, want 2", summary.HealthyReleases)
	}
	if summary.DegradedReleases != 1 {
		t.Errorf("DegradedReleases: got %d, want 1", summary.DegradedReleases)
	}
	if summary.FailedReleases != 1 {
		t.Errorf("FailedReleases: got %d, want 1", summary.FailedReleases)
	}
	if summary.UnknownReleases != 1 {
		t.Errorf("UnknownReleases: got %d, want 1", summary.UnknownReleases)
	}
	if summary.UpgradesAvailable != 1 {
		t.Errorf("UpgradesAvailable: got %d, want 1", summary.UpgradesAvailable)
	}
}

func TestClusterSummary_Empty(t *testing.T) {
	db := openMem(t)

	summary, err := db.ClusterSummary("empty-cluster")
	if err != nil {
		t.Fatalf("summary on empty db: %v", err)
	}
	if summary.TotalReleases != 0 {
		t.Errorf("TotalReleases: got %d, want 0", summary.TotalReleases)
	}
}

// ---------------------------------------------------------------------------
// NamespaceSummaries
// ---------------------------------------------------------------------------

func TestNamespaceSummaries(t *testing.T) {
	db := openMem(t)

	for _, r := range []v1alpha1.ReleaseDetail{
		makeRelease("monitoring", "prometheus", v1alpha1.Healthy),
		makeRelease("monitoring", "grafana", v1alpha1.Degraded),
		makeRelease("default", "redis", v1alpha1.Healthy),
	} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	summaries, err := db.NamespaceSummaries()
	if err != nil {
		t.Fatalf("summaries: %v", err)
	}
	if len(summaries) != 2 {
		t.Fatalf("len: got %d, want 2", len(summaries))
	}

	// Results ordered by namespace ASC: default, monitoring
	def := summaries[0]
	if def.Namespace != "default" {
		t.Errorf("first namespace: got %q, want default", def.Namespace)
	}
	if def.ReleaseCount != 1 {
		t.Errorf("default.ReleaseCount: got %d, want 1", def.ReleaseCount)
	}
	if def.Health != v1alpha1.Healthy {
		t.Errorf("default.Health: got %q, want Healthy", def.Health)
	}

	mon := summaries[1]
	if mon.Namespace != "monitoring" {
		t.Errorf("second namespace: got %q, want monitoring", mon.Namespace)
	}
	if mon.ReleaseCount != 2 {
		t.Errorf("monitoring.ReleaseCount: got %d, want 2", mon.ReleaseCount)
	}
	// One degraded → namespace is Degraded
	if mon.Health != v1alpha1.Degraded {
		t.Errorf("monitoring.Health: got %q, want Degraded", mon.Health)
	}
}

func TestNamespaceSummaries_Empty(t *testing.T) {
	db := openMem(t)

	summaries, err := db.NamespaceSummaries()
	if err != nil {
		t.Fatalf("summaries on empty db: %v", err)
	}
	if summaries == nil {
		t.Error("summaries should be empty slice, not nil")
	}
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

func makeEvent(id, ns, release string, ts time.Time) v1alpha1.HelmEvent {
	return v1alpha1.HelmEvent{
		ID:        id,
		Timestamp: ts.UTC().Format(time.RFC3339),
		Type:      v1alpha1.EventReconciled,
		Release:   release,
		Namespace: ns,
		Message:   "reconciled",
		Severity:  "info",
		Details:   map[string]any{},
	}
}

func TestInsertAndListEvents(t *testing.T) {
	db := openMem(t)

	now := time.Now().UTC()
	events := []v1alpha1.HelmEvent{
		makeEvent("e1", "monitoring", "prometheus", now.Add(-2*time.Minute)),
		makeEvent("e2", "monitoring", "grafana", now.Add(-1*time.Minute)),
		makeEvent("e3", "default", "redis", now),
	}
	for _, e := range events {
		if err := db.InsertEvent(e); err != nil {
			t.Fatalf("insert event %s: %v", e.ID, err)
		}
	}

	got, err := db.ListEvents(10)
	if err != nil {
		t.Fatalf("list events: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("len: got %d, want 3", len(got))
	}
	// Newest first
	if got[0].ID != "e3" {
		t.Errorf("first event: got %q, want e3", got[0].ID)
	}
	if got[2].ID != "e1" {
		t.Errorf("last event: got %q, want e1", got[2].ID)
	}
}

func TestListEvents_Limit(t *testing.T) {
	db := openMem(t)

	now := time.Now().UTC()
	for i := 0; i < 5; i++ {
		e := makeEvent("e"+string(rune('0'+i)), "ns", "release", now.Add(time.Duration(i)*time.Second))
		if err := db.InsertEvent(e); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	got, err := db.ListEvents(3)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 3 {
		t.Errorf("len: got %d, want 3", len(got))
	}
}

func TestListEvents_Empty(t *testing.T) {
	db := openMem(t)

	got, err := db.ListEvents(10)
	if err != nil {
		t.Fatalf("list on empty db: %v", err)
	}
	if got == nil {
		t.Error("events should be empty slice, not nil")
	}
}

func TestInsertEvent_Idempotent(t *testing.T) {
	db := openMem(t)

	e := makeEvent("dup", "ns", "release", time.Now())
	if err := db.InsertEvent(e); err != nil {
		t.Fatalf("first insert: %v", err)
	}
	// Second insert of same ID must not error (INSERT OR IGNORE)
	if err := db.InsertEvent(e); err != nil {
		t.Fatalf("duplicate insert: %v", err)
	}

	got, err := db.ListEvents(10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("expected 1 event after duplicate insert, got %d", len(got))
	}
}

func TestPruneOldEvents(t *testing.T) {
	db := openMem(t)

	now := time.Now().UTC()
	old := makeEvent("old", "ns", "release", now.Add(-2*time.Hour))
	recent := makeEvent("new", "ns", "release", now.Add(-30*time.Second))

	for _, e := range []v1alpha1.HelmEvent{old, recent} {
		if err := db.InsertEvent(e); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	if err := db.PruneOldEvents(1 * time.Hour); err != nil {
		t.Fatalf("prune: %v", err)
	}

	got, err := db.ListEvents(10)
	if err != nil {
		t.Fatalf("list after prune: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("len after prune: got %d, want 1", len(got))
	}
	if got[0].ID != "new" {
		t.Errorf("surviving event: got %q, want new", got[0].ID)
	}
}

// ---------------------------------------------------------------------------
// UpgradeCandidates
// ---------------------------------------------------------------------------

func TestUpgradeCandidates(t *testing.T) {
	db := openMem(t)

	current := makeRelease("ns", "up-to-date", v1alpha1.Healthy)

	stale := makeRelease("ns", "needs-upgrade", v1alpha1.Healthy)
	stale.VersionStatus = v1alpha1.VersionStatus{
		Installed:        "1.0.0",
		Latest:           "2.0.0",
		UpgradeAvailable: true,
		Severity:         v1alpha1.SeverityMajor,
	}

	for _, r := range []v1alpha1.ReleaseDetail{current, stale} {
		if err := db.Upsert(r); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	candidates, err := db.UpgradeCandidates()
	if err != nil {
		t.Fatalf("candidates: %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("len: got %d, want 1", len(candidates))
	}
	if candidates[0].Release.Name != "needs-upgrade" {
		t.Errorf("name: got %q, want needs-upgrade", candidates[0].Release.Name)
	}
	if candidates[0].LatestVersion != "2.0.0" {
		t.Errorf("LatestVersion: got %q, want 2.0.0", candidates[0].LatestVersion)
	}
	if candidates[0].HelmUpgradeCommand == "" {
		t.Error("HelmUpgradeCommand should not be empty")
	}
}
