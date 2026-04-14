// Package v1alpha1 contains the Go types that represent the HelmSight domain model.
// These types are the single source of truth for JSON serialisation; the frontend
// TypeScript interfaces in web/src/types/index.ts must match exactly.
package v1alpha1

// HealthStatus represents the aggregated health of a Helm release.
type HealthStatus string

const (
	Healthy  HealthStatus = "Healthy"
	Degraded HealthStatus = "Degraded"
	Failed   HealthStatus = "Failed"
	Unknown  HealthStatus = "Unknown"
)

// UpgradeSeverity classifies how far behind a chart version is.
type UpgradeSeverity string

const (
	SeverityNone  UpgradeSeverity = "none"
	SeverityPatch UpgradeSeverity = "patch"
	SeverityMinor UpgradeSeverity = "minor"
	SeverityMajor UpgradeSeverity = "major"
)

// ReleaseStatus mirrors the Helm release status string.
type ReleaseStatus string

const (
	StatusDeployed        ReleaseStatus = "deployed"
	StatusFailed          ReleaseStatus = "failed"
	StatusPending         ReleaseStatus = "pending-install"
	StatusPendingUpgrade  ReleaseStatus = "pending-upgrade"
	StatusPendingRollback ReleaseStatus = "pending-rollback"
	StatusSuperseded      ReleaseStatus = "superseded"
	StatusUninstalled     ReleaseStatus = "uninstalled"
)

// DriftType classifies a single values drift entry.
// Both "removed" and "modified" defaults map to "changed" to match the TS contract.
type DriftType string

const (
	DriftAdded    DriftType = "added"
	DriftRemoved  DriftType = "changed" // default removed — treated as "changed"
	DriftModified DriftType = "changed" // default value changed
)

// DriftSeverity classifies the impact of a drift entry.
type DriftSeverity string

const (
	DriftLow    DriftSeverity = "info"    // cosmetic change
	DriftMedium DriftSeverity = "warning" // image / version key
	DriftHigh   DriftSeverity = "warning" // resource / replica key
)

// EventType classifies a Helm lifecycle event.
type EventType string

const (
	EventReconciled       EventType = "reconciled"
	EventHealthChanged    EventType = "health_changed"
	EventUpgradeAvailable EventType = "upgrade_available"
	EventDriftDetected    EventType = "drift_detected"
	EventError            EventType = "error"
)

// VersionStatus holds current and latest version info for a release.
// JSON tag "deployed" matches the TypeScript VersionStatus.deployed field.
type VersionStatus struct {
	Installed        string          `json:"deployed"`                  // TS: deployed
	Latest           string          `json:"latest"`
	UpgradeAvailable bool            `json:"upgradeAvailable"`
	Severity         UpgradeSeverity `json:"severity"`
	LatestAppVersion string          `json:"latestAppVersion,omitempty"`
	SkippedVersions  int             `json:"skippedVersions"`
	ChangelogURL     string          `json:"changelogUrl,omitempty"`
}

// DriftEntry represents a single values key that differs from chart defaults.
// JSON tag "userValue" matches the TypeScript DriftEntry.userValue field.
type DriftEntry struct {
	Key           string        `json:"key"`
	DefaultValue  any           `json:"defaultValue"`
	DeployedValue any           `json:"userValue"` // TS: userValue
	Type          DriftType     `json:"type"`
	Severity      DriftSeverity `json:"severity"`
}

// PodSummary holds per-pod health information.
type PodSummary struct {
	Name     string `json:"name"`
	Ready    bool   `json:"ready"`
	Phase    string `json:"phase"`
	Restarts int    `json:"restarts"`
	Age      string `json:"age"`
	Node     string `json:"node"`
}

// WorkloadSummary holds per-workload (Deployment/StatefulSet/DaemonSet) health.
// Health is stored internally but not part of the TS contract; the frontend
// derives display state from desired/ready counts.
type WorkloadSummary struct {
	Name      string       `json:"name"`
	Kind      string       `json:"kind"`
	Desired   int          `json:"desired"`
	Ready     int          `json:"ready"`
	Available int          `json:"available"`
	Health    HealthStatus `json:"health"` // internal; extra field is harmless to TS
}

// RevisionEntry is one entry in a release's rollout history.
// JSON tag "chartVersion" matches the TypeScript RevisionEntry.chartVersion field.
type RevisionEntry struct {
	Revision    int    `json:"revision"`
	Status      string `json:"status"`
	Chart       string `json:"chartVersion"` // TS: chartVersion
	DeployedAt  string `json:"deployedAt"`
	DeployedBy  string `json:"deployedBy,omitempty"`
	Description string `json:"description,omitempty"`
}

// Release is the list-view representation of a Helm release.
type Release struct {
	ID             string        `json:"id"`
	Name           string        `json:"name"`
	Namespace      string        `json:"namespace"`
	ChartName      string        `json:"chartName"`
	ChartVersion   string        `json:"chartVersion"`
	AppVersion     string        `json:"appVersion"`
	Status         ReleaseStatus `json:"status"`
	Health         HealthStatus  `json:"health"`
	PodDesired     int           `json:"podDesired"`
	PodReady       int           `json:"podReady"`
	DriftCount     int           `json:"driftCount"`
	VersionStatus  VersionStatus `json:"versionStatus"`
	LastReconciled string        `json:"lastReconciled"`
	FirstDeployed  string        `json:"firstDeployed"`
	LastDeployed   string        `json:"lastDeployed"`
	Revision       int           `json:"revision"`
}

// ReleaseDetail extends Release with pod, workload, drift and history data.
type ReleaseDetail struct {
	Release
	Pods           []PodSummary      `json:"pods"`
	Workloads      []WorkloadSummary `json:"workloads"`
	DriftEntries   []DriftEntry      `json:"driftEntries"`
	History        []RevisionEntry   `json:"history"`
	ChartDefaults  map[string]any    `json:"chartDefaults"`
	DeployedValues map[string]any    `json:"deployedValues"`
}

// ClusterSummary is the top-level overview shown on the dashboard.
// JSON field names match the TypeScript ClusterSummary interface exactly.
type ClusterSummary struct {
	ClusterName       string `json:"clusterName"`
	TotalReleases     int    `json:"totalReleases"`
	HealthyReleases   int    `json:"healthyReleases"`
	DegradedReleases  int    `json:"degradedReleases"`
	FailedReleases    int    `json:"failedReleases"`
	UnknownReleases   int    `json:"unknownReleases"`
	UpgradesAvailable int    `json:"upgradesAvailable"`
	MajorUpgrades     int    `json:"majorUpgrades"`
	MinorUpgrades     int    `json:"minorUpgrades"`
	PatchUpgrades     int    `json:"patchUpgrades"`
	TotalPodsTracked  int    `json:"totalPodsTracked"`
	TotalDriftEntries int    `json:"totalDriftEntries"`
	LastUpdated       string `json:"lastScanTime"` // TS: lastScanTime
}

// NamespaceSummary aggregates health counts per namespace.
// JSON field names match the TypeScript NamespaceSummary interface.
// Internal count fields are not serialised (json:"-").
type NamespaceSummary struct {
	Namespace         string       `json:"namespace"`
	ReleaseCount      int          `json:"releaseCount"`
	HealthyCount      int          `json:"-"` // internal; used to derive Health
	DegradedCount     int          `json:"-"` // internal
	FailedCount       int          `json:"-"` // internal
	Health            HealthStatus `json:"worstHealth"` // TS: worstHealth
	UpgradesAvailable int          `json:"upgradesAvailable"`
}

// HelmEvent is a lifecycle event emitted during reconciliation.
// Message is stored as "description" in JSON to match the TypeScript HelmEvent.
// Details is stored as "delta" in JSON to match the TypeScript HelmEvent.delta.
type HelmEvent struct {
	ID        string         `json:"id"`
	Timestamp string         `json:"timestamp"`
	Type      EventType      `json:"type"`
	Release   string         `json:"release"`
	Namespace string         `json:"namespace"`
	Message   string         `json:"description"` // TS: description
	Severity  string         `json:"severity"`
	Details   map[string]any `json:"delta,omitempty"` // TS: delta
}

// UpgradeCandidate pairs a release with its recommended upgrade info.
type UpgradeCandidate struct {
	Release            Release `json:"release"`
	LatestVersion      string  `json:"latestVersion,omitempty"`
	HelmUpgradeCommand string  `json:"helmUpgradeCommand"`
}

// ListResponse is the paginated list envelope used by all collection endpoints.
type ListResponse[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// ReleaseFilters are the optional query parameters accepted by GET /api/v1/releases.
type ReleaseFilters struct {
	Namespace        string
	Namespaces       []string // multi-namespace filter
	Health           []HealthStatus
	Search           string
	SortBy           string
	SortOrder        string
	Page             int
	PageSize         int
	UpgradeAvailable *bool // nil = no filter; true = only with upgrade available
	HasDrift         *bool // nil = no filter; true = only with drift entries
}
