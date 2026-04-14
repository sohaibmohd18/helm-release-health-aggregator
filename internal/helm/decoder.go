// Package helm provides utilities for decoding Helm release secrets stored
// in Kubernetes and for computing values drift.
//
// Helm v3 stores each release in a Kubernetes Secret whose "release" data key
// contains:  base64( gzip( json(releaseObject) ) )
//
// Real Kubernetes wiring (listing/watching secrets) is added in Part 14.
package helm

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"strings"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// Release is the in-memory representation of a decoded Helm secret.
type Release struct {
	Name           string
	Namespace      string
	Chart          string
	Version        string
	AppVersion     string
	Status         v1alpha1.ReleaseStatus
	Revision       int
	FirstDeployed  string
	LastDeployed   string
	// Values as deployed by the operator (user overrides)
	DeployedValues map[string]any
	// Chart defaults extracted from the chart archive
	ChartDefaults map[string]any
}

// ---------------------------------------------------------------------------
// Minimal Helm v3 JSON shapes (avoids pulling in helm.sh/helm/v3 SDK)
// ---------------------------------------------------------------------------

type helmRelease struct {
	Name      string    `json:"name"`
	Namespace string    `json:"namespace"`
	Version   int       `json:"version"` // revision number
	Info      helmInfo  `json:"info"`
	Chart     helmChart `json:"chart"`
	// Config holds the user-supplied override values.
	Config map[string]any `json:"config"`
}

type helmInfo struct {
	Status       string `json:"status"`
	FirstDeployed string `json:"first_deployed"`
	LastDeployed  string `json:"last_deployed"`
}

type helmChart struct {
	Metadata helmMeta       `json:"metadata"`
	Values   map[string]any `json:"values"` // chart defaults
}

type helmMeta struct {
	Name       string `json:"name"`
	Version    string `json:"version"`
	AppVersion string `json:"appVersion"`
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

// Decoder decodes Helm release secrets from Kubernetes.
type Decoder struct{}

// NewDecoder creates a Decoder.
func NewDecoder() *Decoder { return &Decoder{} }

// DecodeSecret parses a base64-encoded, gzip-compressed Helm release secret
// and returns the decoded Release.
//
// The input is the raw bytes of the Kubernetes Secret's "release" data key
// (client-go already strips the outer Kubernetes base64 layer, so what
// arrives here is:  base64( gzip( json(release) ) ) ).
func (d *Decoder) DecodeSecret(raw []byte) (*Release, error) {
	// Step 1: base64-decode
	decoded := make([]byte, base64.StdEncoding.DecodedLen(len(raw)))
	n, err := base64.StdEncoding.Decode(decoded, raw)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	decoded = decoded[:n]

	// Step 2: gzip-decompress
	gr, err := gzip.NewReader(bytes.NewReader(decoded))
	if err != nil {
		return nil, fmt.Errorf("gzip open: %w", err)
	}
	defer gr.Close()

	jsonBytes, err := io.ReadAll(gr)
	if err != nil {
		return nil, fmt.Errorf("gzip read: %w", err)
	}

	// Step 3: JSON-unmarshal into the minimal Helm struct
	var hr helmRelease
	if err := json.Unmarshal(jsonBytes, &hr); err != nil {
		return nil, fmt.Errorf("json unmarshal: %w", err)
	}

	// Step 4: map to our domain type
	rel := &Release{
		Name:          hr.Name,
		Namespace:     hr.Namespace,
		Chart:         hr.Chart.Metadata.Name,
		Version:       hr.Chart.Metadata.Version,
		AppVersion:    hr.Chart.Metadata.AppVersion,
		Status:        v1alpha1.ReleaseStatus(hr.Info.Status),
		Revision:      hr.Version,
		FirstDeployed: hr.Info.FirstDeployed,
		LastDeployed:  hr.Info.LastDeployed,
		ChartDefaults: hr.Chart.Values,
		DeployedValues: hr.Config,
	}
	if rel.ChartDefaults == nil {
		rel.ChartDefaults = map[string]any{}
	}
	if rel.DeployedValues == nil {
		rel.DeployedValues = map[string]any{}
	}
	return rel, nil
}

// ---------------------------------------------------------------------------
// DiffValues
// ---------------------------------------------------------------------------

// DiffValues compares deployed values (user overrides) against chart defaults
// and returns the set of entries that differ.
//
// Keys present only in deployed  → DriftAdded
// Keys present only in defaults  → DriftRemoved
// Keys present in both but differ → DriftModified
//
// Nested maps are traversed recursively; the key path uses dot notation
// (e.g. "ingress.enabled").
func DiffValues(deployed, defaults map[string]any) []v1alpha1.DriftEntry {
	var entries []v1alpha1.DriftEntry
	diffMaps("", deployed, defaults, &entries)
	return entries
}

func diffMaps(prefix string, deployed, defaults map[string]any, out *[]v1alpha1.DriftEntry) {
	// Keys in deployed (added or modified)
	for k, dv := range deployed {
		path := joinPath(prefix, k)
		defVal, inDefaults := defaults[k]

		switch {
		case !inDefaults:
			// Key only in deployed → added
			*out = append(*out, v1alpha1.DriftEntry{
				Key:           path,
				DefaultValue:  nil,
				DeployedValue: dv,
				Type:          v1alpha1.DriftAdded,
				Severity:      keySeverity(k),
			})

		default:
			// Both have the key — recurse if both are maps, otherwise compare
			dvMap, dvIsMap := dv.(map[string]any)
			defMap, defIsMap := defVal.(map[string]any)

			if dvIsMap && defIsMap {
				diffMaps(path, dvMap, defMap, out)
			} else if !reflect.DeepEqual(dv, defVal) {
				*out = append(*out, v1alpha1.DriftEntry{
					Key:           path,
					DefaultValue:  defVal,
					DeployedValue: dv,
					Type:          v1alpha1.DriftModified,
					Severity:      keySeverity(k),
				})
			}
		}
	}

	// Keys only in defaults → removed
	for k, defVal := range defaults {
		path := joinPath(prefix, k)
		if _, inDeployed := deployed[k]; !inDeployed {
			*out = append(*out, v1alpha1.DriftEntry{
				Key:           path,
				DefaultValue:  defVal,
				DeployedValue: nil,
				Type:          v1alpha1.DriftRemoved,
				Severity:      keySeverity(k),
			})
		}
	}
}

// keySeverity assigns a DriftSeverity based on the leaf key name.
func keySeverity(key string) v1alpha1.DriftSeverity {
	lower := strings.ToLower(key)
	switch {
	case containsAny(lower, "replica", "resource", "limit", "request", "memory", "cpu"):
		return v1alpha1.DriftHigh
	case containsAny(lower, "image", "tag", "version", "registry"):
		return v1alpha1.DriftMedium
	default:
		return v1alpha1.DriftLow
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func joinPath(prefix, key string) string {
	if prefix == "" {
		return key
	}
	return prefix + "." + key
}
