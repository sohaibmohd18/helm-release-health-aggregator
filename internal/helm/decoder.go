// Package helm provides utilities for decoding Helm release secrets stored
// in Kubernetes and for computing values drift.
//
// In Part 9 (foundation), this package contains stubs that will be wired
// to real Kubernetes client-go calls in Part 14 (controller integration).
package helm

import (
	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// Release is the in-memory representation of a decoded Helm secret.
type Release struct {
	Name      string
	Namespace string
	Chart     string
	Version   string
	AppVersion string
	Status    v1alpha1.ReleaseStatus
	Revision  int
	// Values as deployed by the operator
	DeployedValues map[string]any
	// Chart defaults extracted from the chart archive
	ChartDefaults map[string]any
}

// Decoder decodes Helm release secrets from Kubernetes.
// Real implementation added in Part 14.
type Decoder struct{}

// NewDecoder creates a Decoder.
func NewDecoder() *Decoder { return &Decoder{} }

// DecodeSecret parses a base64-encoded, gzip-compressed Helm release secret
// and returns the decoded Release. Stub returns an empty Release.
func (d *Decoder) DecodeSecret(_ []byte) (*Release, error) {
	return &Release{
		DeployedValues: map[string]any{},
		ChartDefaults:  map[string]any{},
	}, nil
}

// DiffValues compares deployed values against chart defaults and returns
// the set of entries that differ.  Stub returns empty slice.
func DiffValues(_, _ map[string]any) []v1alpha1.DriftEntry {
	return []v1alpha1.DriftEntry{}
}
