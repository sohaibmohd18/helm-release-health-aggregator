package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap"

	v1alpha1 "github.com/sohaibmohmd18/helmsightss/pkg/apis/v1alpha1"
	"github.com/sohaibmohmd18/helmsightss/internal/store"
)

// newTestServer opens an in-memory DB and returns a wired-up Server + chi router.
func newTestServer(t *testing.T) (http.Handler, *store.DB) {
	t.Helper()
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	log := zap.NewNop()
	hub := NewHub(log)
	srv := NewServer(db, hub, "test-cluster", log)
	router := NewRouter(srv, log)
	return router, db
}

// upsert is a test helper that fatals on error.
func upsert(t *testing.T, db *store.DB, r v1alpha1.ReleaseDetail) {
	t.Helper()
	if err := db.Upsert(r); err != nil {
		t.Fatalf("upsert %s/%s: %v", r.Namespace, r.Name, err)
	}
}

func makeRelease(ns, name string, health v1alpha1.HealthStatus) v1alpha1.ReleaseDetail {
	return v1alpha1.ReleaseDetail{
		Release: v1alpha1.Release{
			ID:           ns + "/" + name,
			Name:         name,
			Namespace:    ns,
			ChartName:    name + "-chart",
			ChartVersion: "1.0.0",
			AppVersion:   "1.0.0",
			Status:       v1alpha1.StatusDeployed,
			Health:       health,
			PodDesired:   2,
			PodReady:     2,
			VersionStatus: v1alpha1.VersionStatus{
				Installed: "1.0.0",
				Latest:    "1.0.0",
				Severity:  v1alpha1.SeverityNone,
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
// /healthz
// ---------------------------------------------------------------------------

func TestHandleHealthz(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status: got %d, want 200", w.Code)
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/cluster/summary
// ---------------------------------------------------------------------------

func TestHandleClusterSummary_Empty(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/cluster/summary", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var summary v1alpha1.ClusterSummary
	if err := json.NewDecoder(w.Body).Decode(&summary); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if summary.ClusterName != "test-cluster" {
		t.Errorf("ClusterName: got %q, want test-cluster", summary.ClusterName)
	}
	if summary.TotalReleases != 0 {
		t.Errorf("TotalReleases: got %d, want 0", summary.TotalReleases)
	}
}

func TestHandleClusterSummary_WithData(t *testing.T) {
	router, db := newTestServer(t)

	upsert(t, db, makeRelease("ns", "a", v1alpha1.Healthy))
	upsert(t, db, makeRelease("ns", "b", v1alpha1.Failed))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/cluster/summary", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var summary v1alpha1.ClusterSummary
	if err := json.NewDecoder(w.Body).Decode(&summary); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if summary.TotalReleases != 2 {
		t.Errorf("TotalReleases: got %d, want 2", summary.TotalReleases)
	}
	if summary.HealthyReleases != 1 {
		t.Errorf("HealthyReleases: got %d, want 1", summary.HealthyReleases)
	}
	if summary.FailedReleases != 1 {
		t.Errorf("FailedReleases: got %d, want 1", summary.FailedReleases)
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/namespaces/summaries
// ---------------------------------------------------------------------------

func TestHandleNamespaceSummaries(t *testing.T) {
	router, db := newTestServer(t)

	upsert(t, db, makeRelease("monitoring", "prometheus", v1alpha1.Healthy))
	upsert(t, db, makeRelease("default", "redis", v1alpha1.Degraded))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/namespaces/summaries", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var summaries []v1alpha1.NamespaceSummary
	if err := json.NewDecoder(w.Body).Decode(&summaries); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(summaries) != 2 {
		t.Errorf("len: got %d, want 2", len(summaries))
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/releases
// ---------------------------------------------------------------------------

func TestHandleListReleases_NoFilter(t *testing.T) {
	router, db := newTestServer(t)

	upsert(t, db, makeRelease("ns", "a", v1alpha1.Healthy))
	upsert(t, db, makeRelease("ns", "b", v1alpha1.Degraded))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var resp v1alpha1.ListResponse[v1alpha1.Release]
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 2 {
		t.Errorf("Total: got %d, want 2", resp.Total)
	}
	if len(resp.Items) != 2 {
		t.Errorf("Items len: got %d, want 2", len(resp.Items))
	}
}

func TestHandleListReleases_NamespaceFilter(t *testing.T) {
	router, db := newTestServer(t)

	upsert(t, db, makeRelease("monitoring", "prometheus", v1alpha1.Healthy))
	upsert(t, db, makeRelease("default", "redis", v1alpha1.Healthy))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases?namespace=monitoring", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var resp v1alpha1.ListResponse[v1alpha1.Release]
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Total != 1 {
		t.Errorf("Total: got %d, want 1", resp.Total)
	}
	if resp.Items[0].Namespace != "monitoring" {
		t.Errorf("namespace: got %q, want monitoring", resp.Items[0].Namespace)
	}
}

func TestHandleListReleases_ContentType(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/releases/{namespace}/{name}
// ---------------------------------------------------------------------------

func TestHandleGetRelease_Found(t *testing.T) {
	router, db := newTestServer(t)

	r := makeRelease("monitoring", "prometheus", v1alpha1.Healthy)
	r.DriftEntries = []v1alpha1.DriftEntry{
		{Key: "replicas", Type: v1alpha1.DriftModified, Severity: v1alpha1.DriftLow},
	}
	upsert(t, db, r)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases/monitoring/prometheus", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var detail v1alpha1.ReleaseDetail
	if err := json.NewDecoder(w.Body).Decode(&detail); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if detail.Name != "prometheus" {
		t.Errorf("Name: got %q, want prometheus", detail.Name)
	}
	if detail.Namespace != "monitoring" {
		t.Errorf("Namespace: got %q, want monitoring", detail.Namespace)
	}
	if len(detail.DriftEntries) != 1 {
		t.Errorf("DriftEntries len: got %d, want 1", len(detail.DriftEntries))
	}
}

func TestHandleGetRelease_NotFound(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases/missing/nowhere", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status: got %d, want 404", w.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["error"] == "" {
		t.Error("expected error field in 404 response")
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/upgrades
// ---------------------------------------------------------------------------

func TestHandleUpgrades(t *testing.T) {
	router, db := newTestServer(t)

	current := makeRelease("ns", "up-to-date", v1alpha1.Healthy)

	stale := makeRelease("ns", "needs-upgrade", v1alpha1.Healthy)
	stale.VersionStatus = v1alpha1.VersionStatus{
		Installed:        "1.0.0",
		Latest:           "2.0.0",
		UpgradeAvailable: true,
		Severity:         v1alpha1.SeverityMajor,
	}

	upsert(t, db, current)
	upsert(t, db, stale)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/upgrades", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var candidates []v1alpha1.UpgradeCandidate
	if err := json.NewDecoder(w.Body).Decode(&candidates); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(candidates) != 1 {
		t.Fatalf("len: got %d, want 1", len(candidates))
	}
	if candidates[0].Release.Name != "needs-upgrade" {
		t.Errorf("name: got %q", candidates[0].Release.Name)
	}
}

// ---------------------------------------------------------------------------
// GET /api/v1/events
// ---------------------------------------------------------------------------

func TestHandleListEvents_Empty(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var events []v1alpha1.HelmEvent
	if err := json.NewDecoder(w.Body).Decode(&events); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if events == nil {
		t.Error("events should be empty slice, not null")
	}
}

func TestHandleListEvents_WithData(t *testing.T) {
	router, db := newTestServer(t)

	now := time.Now().UTC()
	for i, id := range []string{"e1", "e2", "e3"} {
		e := v1alpha1.HelmEvent{
			ID:        id,
			Timestamp: now.Add(time.Duration(i) * time.Second).UTC().Format(time.RFC3339),
			Type:      v1alpha1.EventReconciled,
			Release:   "prometheus",
			Namespace: "monitoring",
			Message:   "reconciled",
			Severity:  "info",
			Details:   map[string]any{},
		}
		if err := db.InsertEvent(e); err != nil {
			t.Fatalf("insert event: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/events?limit=2", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d, want 200", w.Code)
	}

	var events []v1alpha1.HelmEvent
	if err := json.NewDecoder(w.Body).Decode(&events); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(events) != 2 {
		t.Errorf("len: got %d, want 2 (limit applied)", len(events))
	}
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

func TestCORSHeaders(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/releases", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin: got %q, want *", got)
	}
}

func TestCORSPreflight(t *testing.T) {
	router, _ := newTestServer(t)

	req := httptest.NewRequest(http.MethodOptions, "/api/v1/releases", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("preflight status: got %d, want 204", w.Code)
	}
}
