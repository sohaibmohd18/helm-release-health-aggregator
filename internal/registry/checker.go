// Package registry queries ArtifactHub and OCI registries for the latest
// chart version and computes the upgrade severity.
//
// Real implementation added in Part 15.
package registry

import (
	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// Checker looks up the latest available chart version.
type Checker struct{}

// NewChecker creates a Checker.
func NewChecker() *Checker { return &Checker{} }

// LatestVersion returns the latest version of chartName from the registry.
// Stub always returns the installed version (no upgrade).
func (c *Checker) LatestVersion(chartName, _ string) (string, string, error) {
	// Returns (latestChartVersion, latestAppVersion, error)
	// Stub returns empty strings until Part 15.
	return "", "", nil
}

// ComputeSeverity returns the UpgradeSeverity by comparing semver strings.
// Stub returns "none" until Part 15.
func ComputeSeverity(installed, latest string) v1alpha1.UpgradeSeverity {
	if installed == "" || latest == "" || installed == latest {
		return v1alpha1.SeverityNone
	}
	// Real semver comparison in Part 15
	return v1alpha1.SeverityNone
}
