package registry

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// ---------------------------------------------------------------------------
// ComputeSeverity
// ---------------------------------------------------------------------------

func TestComputeSeverity(t *testing.T) {
	tests := []struct {
		installed string
		latest    string
		want      v1alpha1.UpgradeSeverity
	}{
		// Identical
		{"1.2.3", "1.2.3", v1alpha1.SeverityNone},
		// Empty inputs
		{"", "1.2.3", v1alpha1.SeverityNone},
		{"1.2.3", "", v1alpha1.SeverityNone},
		{"", "", v1alpha1.SeverityNone},
		// Major bump
		{"1.2.3", "2.0.0", v1alpha1.SeverityMajor},
		{"0.9.9", "1.0.0", v1alpha1.SeverityMajor},
		// Minor bump
		{"1.2.3", "1.3.0", v1alpha1.SeverityMinor},
		{"1.0.0", "1.1.0", v1alpha1.SeverityMinor},
		// Patch bump
		{"1.2.3", "1.2.4", v1alpha1.SeverityPatch},
		{"1.2.0", "1.2.1", v1alpha1.SeverityPatch},
		// Leading-v tolerated
		{"v1.2.3", "v2.0.0", v1alpha1.SeverityMajor},
		{"v1.2.3", "v1.3.0", v1alpha1.SeverityMinor},
		{"v1.2.3", "v1.2.4", v1alpha1.SeverityPatch},
		{"v1.2.3", "v1.2.3", v1alpha1.SeverityNone},
		// Mixed v prefix
		{"v1.2.3", "1.3.0", v1alpha1.SeverityMinor},
		{"1.2.3", "v1.2.4", v1alpha1.SeverityPatch},
		// Non-semver inputs
		{"not-semver", "1.2.3", v1alpha1.SeverityNone},
		{"1.2.3", "not-semver", v1alpha1.SeverityNone},
		{"not", "either", v1alpha1.SeverityNone},
		// Downgrade → none
		{"2.0.0", "1.0.0", v1alpha1.SeverityNone},
		// Two-part versions (missing patch)
		{"1.2", "1.3", v1alpha1.SeverityMinor},
		{"1.2", "2.0", v1alpha1.SeverityMajor},
		// Pre-release suffix stripped
		{"1.2.3-beta.1", "1.2.3", v1alpha1.SeverityNone},
		{"1.2.2", "1.2.3-beta.1", v1alpha1.SeverityPatch},
	}

	for _, tc := range tests {
		t.Run(tc.installed+"→"+tc.latest, func(t *testing.T) {
			got := ComputeSeverity(tc.installed, tc.latest)
			if got != tc.want {
				t.Errorf("ComputeSeverity(%q, %q) = %q, want %q",
					tc.installed, tc.latest, got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// LatestVersion — helpers
// ---------------------------------------------------------------------------

// newMockArtifactHub starts an httptest server that responds to
// GET /{repo}/{chart} with the given status code and optional body.
func newMockArtifactHub(t *testing.T, status int, body any) (*Checker, *httptest.Server) {
	t.Helper()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if body != nil {
			_ = json.NewEncoder(w).Encode(body)
		}
	}))
	t.Cleanup(srv.Close)

	// Point the checker at our mock by overriding the base URL via a
	// custom transport that rewrites the host.
	client := srv.Client()
	checker := NewCheckerWithClient(client)

	// We need the checker to hit srv.URL instead of artifacthub.io.
	// Simplest approach: replace the httpClient with one whose transport
	// rewrites the scheme+host.
	checker.httpClient = &http.Client{
		Transport: &rewriteTransport{base: srv.URL, inner: srv.Client().Transport},
	}
	return checker, srv
}

// rewriteTransport replaces the scheme+host of every request with base.
type rewriteTransport struct {
	base  string
	inner http.RoundTripper
}

func (rt *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	// Keep the path/query; replace host with mock server.
	clone.URL.Scheme = "http"
	// srv.URL is "http://127.0.0.1:PORT" — strip the scheme to get the host.
	host := strings.TrimPrefix(rt.base, "http://")
	host = strings.TrimPrefix(host, "https://")
	clone.URL.Host = host
	return rt.inner.RoundTrip(clone)
}

// ---------------------------------------------------------------------------
// LatestVersion tests
// ---------------------------------------------------------------------------

func TestLatestVersion_Found(t *testing.T) {
	payload := artifactHubPackage{
		Version:    "55.5.0",
		AppVersion: "v0.72.0",
	}
	checker, _ := newMockArtifactHub(t, http.StatusOK, payload)

	chart, app, err := checker.LatestVersion("kube-prometheus-stack", "prometheus-community")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chart != "55.5.0" {
		t.Errorf("chart version: got %q, want 55.5.0", chart)
	}
	if app != "v0.72.0" {
		t.Errorf("app version: got %q, want v0.72.0", app)
	}
}

func TestLatestVersion_NotFound(t *testing.T) {
	checker, _ := newMockArtifactHub(t, http.StatusNotFound, nil)

	chart, app, err := checker.LatestVersion("nonexistent-chart", "some-repo")
	if err != nil {
		t.Fatalf("expected nil error for 404, got: %v", err)
	}
	if chart != "" || app != "" {
		t.Errorf("expected empty versions for 404, got chart=%q app=%q", chart, app)
	}
}

func TestLatestVersion_ServerError(t *testing.T) {
	checker, _ := newMockArtifactHub(t, http.StatusInternalServerError, nil)

	_, _, err := checker.LatestVersion("some-chart", "some-repo")
	if err == nil {
		t.Error("expected error for HTTP 500, got nil")
	}
}

func TestLatestVersion_OCI(t *testing.T) {
	// No HTTP call should be made — verify by using a nil client that panics.
	checker := &Checker{httpClient: nil}

	chart, app, err := checker.LatestVersion("my-chart", "oci://registry.example.com/charts")
	if err != nil {
		t.Fatalf("unexpected error for OCI prefix: %v", err)
	}
	if chart != "" || app != "" {
		t.Errorf("expected empty versions for OCI stub, got chart=%q app=%q", chart, app)
	}
}

func TestLatestVersion_EmptyInputs(t *testing.T) {
	checker := NewChecker()

	tests := []struct{ name, repo string }{
		{"", "prometheus-community"},
		{"prometheus", ""},
		{"", ""},
	}
	for _, tc := range tests {
		chart, app, err := checker.LatestVersion(tc.name, tc.repo)
		if err != nil {
			t.Errorf("LatestVersion(%q, %q): unexpected error %v", tc.name, tc.repo, err)
		}
		if chart != "" || app != "" {
			t.Errorf("LatestVersion(%q, %q): expected empty, got chart=%q app=%q",
				tc.name, tc.repo, chart, app)
		}
	}
}
