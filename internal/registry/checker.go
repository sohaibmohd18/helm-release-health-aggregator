// Package registry queries ArtifactHub for the latest chart version and
// computes the upgrade severity by comparing semver strings.
//
// OCI registry support (oci:// prefix) is stubbed and will be wired in Part 15.
package registry

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

const artifactHubBase = "https://artifacthub.io/api/v1/packages/helm"

// artifactHubPackage is the minimal shape of an ArtifactHub package response.
type artifactHubPackage struct {
	Version    string `json:"version"`
	AppVersion string `json:"app_version"`
}

// Checker looks up the latest available chart version.
type Checker struct {
	httpClient *http.Client
}

// NewChecker creates a Checker using http.DefaultClient.
func NewChecker() *Checker {
	return &Checker{httpClient: http.DefaultClient}
}

// NewCheckerWithClient creates a Checker using the supplied HTTP client.
// Intended for testing — pass in an httptest-backed client.
func NewCheckerWithClient(c *http.Client) *Checker {
	return &Checker{httpClient: c}
}

// LatestVersion returns the latest (chartVersion, appVersion) for chartName
// found in the ArtifactHub repository identified by repoURL.
//
// repoURL is treated as the ArtifactHub repository slug
// (e.g. "prometheus-community") unless it begins with "oci://" in which case
// ("", "", nil) is returned immediately (OCI support lands in Part 15).
//
// A 404 from ArtifactHub is not an error — it means the chart is not listed
// there; ("", "", nil) is returned so callers can treat it as "unknown".
func (c *Checker) LatestVersion(chartName, repoURL string) (string, string, error) {
	if strings.HasPrefix(repoURL, "oci://") {
		return "", "", nil
	}
	if repoURL == "" || chartName == "" {
		return "", "", nil
	}

	url := fmt.Sprintf("%s/%s/%s", artifactHubBase, repoURL, chartName)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return "", "", fmt.Errorf("artifacthub request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return "", "", nil
	}
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("artifacthub returned HTTP %d for %s/%s", resp.StatusCode, repoURL, chartName)
	}

	var pkg artifactHubPackage
	if err := json.NewDecoder(resp.Body).Decode(&pkg); err != nil {
		return "", "", fmt.Errorf("decode artifacthub response: %w", err)
	}
	return pkg.Version, pkg.AppVersion, nil
}

// ComputeSeverity returns the UpgradeSeverity by comparing semver strings.
// Both installed and latest must be non-empty and parseable; otherwise
// SeverityNone is returned.
func ComputeSeverity(installed, latest string) v1alpha1.UpgradeSeverity {
	if installed == "" || latest == "" || installed == latest {
		return v1alpha1.SeverityNone
	}

	iMaj, iMin, iPat, ok1 := parseSemver(installed)
	lMaj, lMin, lPat, ok2 := parseSemver(latest)
	if !ok1 || !ok2 {
		return v1alpha1.SeverityNone
	}

	switch {
	case lMaj > iMaj:
		return v1alpha1.SeverityMajor
	case lMaj == iMaj && lMin > iMin:
		return v1alpha1.SeverityMinor
	case lMaj == iMaj && lMin == iMin && lPat > iPat:
		return v1alpha1.SeverityPatch
	default:
		return v1alpha1.SeverityNone
	}
}

// parseSemver parses a version string of the form [v]MAJOR.MINOR.PATCH.
// It is intentionally lenient: a missing MINOR or PATCH defaults to 0.
func parseSemver(v string) (major, minor, patch int, ok bool) {
	v = strings.TrimPrefix(v, "v")
	parts := strings.SplitN(v, ".", 3)
	if len(parts) == 0 {
		return 0, 0, 0, false
	}

	maj, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, 0, 0, false
	}

	var min, pat int
	if len(parts) > 1 {
		// Strip any pre-release suffix (e.g. "1-beta.1")
		min, err = strconv.Atoi(strings.SplitN(parts[1], "-", 2)[0])
		if err != nil {
			return 0, 0, 0, false
		}
	}
	if len(parts) > 2 {
		pat, err = strconv.Atoi(strings.SplitN(parts[2], "-", 2)[0])
		if err != nil {
			return 0, 0, 0, false
		}
	}

	return maj, min, pat, true
}
