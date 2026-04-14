package helm

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"sort"
	"testing"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// encodeSecret mirrors Helm v3's storage encoding:
// base64( gzip( json(release) ) )
func encodeSecret(t *testing.T, hr helmRelease) []byte {
	t.Helper()

	jsonBytes, err := json.Marshal(hr)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write(jsonBytes); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}

	encoded := base64.StdEncoding.EncodeToString(buf.Bytes())
	return []byte(encoded)
}

// ---------------------------------------------------------------------------
// DecodeSecret
// ---------------------------------------------------------------------------

func TestDecodeSecret_AllFields(t *testing.T) {
	hr := helmRelease{
		Name:      "prometheus",
		Namespace: "monitoring",
		Version:   3,
		Info: helmInfo{
			Status:        "deployed",
			FirstDeployed: "2024-01-01T00:00:00Z",
			LastDeployed:  "2024-06-01T00:00:00Z",
		},
		Chart: helmChart{
			Metadata: helmMeta{
				Name:       "kube-prometheus-stack",
				Version:    "55.0.0",
				AppVersion: "v0.70.0",
			},
			Values: map[string]any{
				"replicaCount": float64(1),
				"image": map[string]any{
					"tag": "v0.70.0",
				},
			},
		},
		Config: map[string]any{
			"replicaCount": float64(3),
		},
	}

	raw := encodeSecret(t, hr)
	d := NewDecoder()
	got, err := d.DecodeSecret(raw)
	if err != nil {
		t.Fatalf("DecodeSecret: %v", err)
	}

	if got.Name != "prometheus" {
		t.Errorf("Name: got %q, want prometheus", got.Name)
	}
	if got.Namespace != "monitoring" {
		t.Errorf("Namespace: got %q, want monitoring", got.Namespace)
	}
	if got.Chart != "kube-prometheus-stack" {
		t.Errorf("Chart: got %q, want kube-prometheus-stack", got.Chart)
	}
	if got.Version != "55.0.0" {
		t.Errorf("Version: got %q, want 55.0.0", got.Version)
	}
	if got.AppVersion != "v0.70.0" {
		t.Errorf("AppVersion: got %q, want v0.70.0", got.AppVersion)
	}
	if got.Status != v1alpha1.StatusDeployed {
		t.Errorf("Status: got %q, want deployed", got.Status)
	}
	if got.Revision != 3 {
		t.Errorf("Revision: got %d, want 3", got.Revision)
	}
	if got.FirstDeployed != "2024-01-01T00:00:00Z" {
		t.Errorf("FirstDeployed: got %q", got.FirstDeployed)
	}
	if got.LastDeployed != "2024-06-01T00:00:00Z" {
		t.Errorf("LastDeployed: got %q", got.LastDeployed)
	}

	// DeployedValues = user overrides (Config)
	if v, ok := got.DeployedValues["replicaCount"]; !ok || v != float64(3) {
		t.Errorf("DeployedValues[replicaCount]: got %v", got.DeployedValues["replicaCount"])
	}
	// ChartDefaults = chart's values.yaml
	if v, ok := got.ChartDefaults["replicaCount"]; !ok || v != float64(1) {
		t.Errorf("ChartDefaults[replicaCount]: got %v", got.ChartDefaults["replicaCount"])
	}
}

func TestDecodeSecret_NilMapsBecomEmpty(t *testing.T) {
	hr := helmRelease{
		Name:      "minimal",
		Namespace: "default",
		Version:   1,
		Info:      helmInfo{Status: "deployed"},
		Chart:     helmChart{Metadata: helmMeta{Name: "minimal", Version: "1.0.0"}},
		// Config and Chart.Values intentionally nil
	}

	raw := encodeSecret(t, hr)
	d := NewDecoder()
	got, err := d.DecodeSecret(raw)
	if err != nil {
		t.Fatalf("DecodeSecret: %v", err)
	}
	if got.DeployedValues == nil {
		t.Error("DeployedValues should be empty map, not nil")
	}
	if got.ChartDefaults == nil {
		t.Error("ChartDefaults should be empty map, not nil")
	}
}

func TestDecodeSecret_InvalidBase64(t *testing.T) {
	d := NewDecoder()
	_, err := d.DecodeSecret([]byte("!!!not-valid-base64!!!"))
	if err == nil {
		t.Error("expected error for invalid base64, got nil")
	}
}

func TestDecodeSecret_InvalidGzip(t *testing.T) {
	d := NewDecoder()
	// Valid base64 but the decoded bytes are not a valid gzip stream
	raw := base64.StdEncoding.EncodeToString([]byte("this is not gzip data"))
	_, err := d.DecodeSecret([]byte(raw))
	if err == nil {
		t.Error("expected error for invalid gzip, got nil")
	}
}

func TestDecodeSecret_InvalidJSON(t *testing.T) {
	// Build a valid base64(gzip(bad_json)) payload
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	_, _ = w.Write([]byte("{not valid json"))
	_ = w.Close()
	raw := []byte(base64.StdEncoding.EncodeToString(buf.Bytes()))

	d := NewDecoder()
	_, err := d.DecodeSecret(raw)
	if err == nil {
		t.Error("expected error for invalid JSON, got nil")
	}
}

// ---------------------------------------------------------------------------
// DiffValues — basic operations
// ---------------------------------------------------------------------------

func TestDiffValues_NoChanges(t *testing.T) {
	deployed := map[string]any{"replicas": float64(2), "enabled": true}
	defaults := map[string]any{"replicas": float64(2), "enabled": true}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for identical maps, got %d: %+v", len(entries), entries)
	}
}

func TestDiffValues_EmptyMaps(t *testing.T) {
	entries := DiffValues(map[string]any{}, map[string]any{})
	if len(entries) != 0 {
		t.Errorf("expected 0 entries for empty maps, got %d", len(entries))
	}
}

func TestDiffValues_Added(t *testing.T) {
	deployed := map[string]any{"extraKey": "value", "common": "same"}
	defaults := map[string]any{"common": "same"}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	e := entries[0]
	if e.Key != "extraKey" {
		t.Errorf("Key: got %q, want extraKey", e.Key)
	}
	if e.Type != v1alpha1.DriftAdded {
		t.Errorf("Type: got %q, want added", e.Type)
	}
	if e.DefaultValue != nil {
		t.Errorf("DefaultValue: got %v, want nil", e.DefaultValue)
	}
	if e.DeployedValue != "value" {
		t.Errorf("DeployedValue: got %v, want value", e.DeployedValue)
	}
}

func TestDiffValues_Removed(t *testing.T) {
	deployed := map[string]any{"common": "same"}
	defaults := map[string]any{"common": "same", "removedKey": "original"}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	e := entries[0]
	if e.Key != "removedKey" {
		t.Errorf("Key: got %q, want removedKey", e.Key)
	}
	if e.Type != v1alpha1.DriftRemoved {
		t.Errorf("Type: got %q, want removed", e.Type)
	}
	if e.DeployedValue != nil {
		t.Errorf("DeployedValue: got %v, want nil", e.DeployedValue)
	}
	if e.DefaultValue != "original" {
		t.Errorf("DefaultValue: got %v, want original", e.DefaultValue)
	}
}

func TestDiffValues_Modified(t *testing.T) {
	deployed := map[string]any{"replicas": float64(3)}
	defaults := map[string]any{"replicas": float64(1)}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Key != "replicas" {
		t.Errorf("Key: got %q, want replicas", e.Key)
	}
	if e.Type != v1alpha1.DriftModified {
		t.Errorf("Type: got %q, want modified", e.Type)
	}
	if e.DefaultValue != float64(1) {
		t.Errorf("DefaultValue: got %v, want 1", e.DefaultValue)
	}
	if e.DeployedValue != float64(3) {
		t.Errorf("DeployedValue: got %v, want 3", e.DeployedValue)
	}
}

// ---------------------------------------------------------------------------
// DiffValues — nested maps
// ---------------------------------------------------------------------------

func TestDiffValues_NestedPath(t *testing.T) {
	deployed := map[string]any{
		"ingress": map[string]any{
			"enabled": true,
			"host":    "app.example.com",
		},
	}
	defaults := map[string]any{
		"ingress": map[string]any{
			"enabled": false,
			"host":    "app.example.com",
		},
	}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].Key != "ingress.enabled" {
		t.Errorf("Key: got %q, want ingress.enabled", entries[0].Key)
	}
	if entries[0].Type != v1alpha1.DriftModified {
		t.Errorf("Type: got %q, want modified", entries[0].Type)
	}
}

func TestDiffValues_DeepNested(t *testing.T) {
	deployed := map[string]any{
		"resources": map[string]any{
			"limits": map[string]any{
				"memory": "512Mi",
			},
		},
	}
	defaults := map[string]any{
		"resources": map[string]any{
			"limits": map[string]any{
				"memory": "256Mi",
			},
		},
	}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d: %+v", len(entries), entries)
	}
	if entries[0].Key != "resources.limits.memory" {
		t.Errorf("Key: got %q, want resources.limits.memory", entries[0].Key)
	}
}

func TestDiffValues_Mixed(t *testing.T) {
	deployed := map[string]any{
		"replicas": float64(3), // modified
		"newKey":   "hello",    // added
		// "removedKey" absent → removed
	}
	defaults := map[string]any{
		"replicas":   float64(1),
		"removedKey": "bye",
	}

	entries := DiffValues(deployed, defaults)
	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d: %+v", len(entries), entries)
	}

	// Sort by key for deterministic assertion
	sort.Slice(entries, func(i, j int) bool { return entries[i].Key < entries[j].Key })

	if entries[0].Key != "newKey" || entries[0].Type != v1alpha1.DriftAdded {
		t.Errorf("entry 0: got key=%q type=%q", entries[0].Key, entries[0].Type)
	}
	if entries[1].Key != "removedKey" || entries[1].Type != v1alpha1.DriftRemoved {
		t.Errorf("entry 1: got key=%q type=%q", entries[1].Key, entries[1].Type)
	}
	if entries[2].Key != "replicas" || entries[2].Type != v1alpha1.DriftModified {
		t.Errorf("entry 2: got key=%q type=%q", entries[2].Key, entries[2].Type)
	}
}

// ---------------------------------------------------------------------------
// DiffValues — severity assignment
// ---------------------------------------------------------------------------

func TestDiffValues_Severity(t *testing.T) {
	tests := []struct {
		key      string
		wantSev  v1alpha1.DriftSeverity
	}{
		{"replicaCount", v1alpha1.DriftHigh},
		{"replicas", v1alpha1.DriftHigh},
		{"resources", v1alpha1.DriftHigh},
		{"memoryLimit", v1alpha1.DriftHigh},
		{"cpuRequest", v1alpha1.DriftHigh},
		{"imageTag", v1alpha1.DriftMedium},
		{"image", v1alpha1.DriftMedium},
		{"version", v1alpha1.DriftMedium},
		{"registry", v1alpha1.DriftMedium},
		{"enabled", v1alpha1.DriftLow},
		{"host", v1alpha1.DriftLow},
		{"annotations", v1alpha1.DriftLow},
	}

	for _, tc := range tests {
		t.Run(tc.key, func(t *testing.T) {
			deployed := map[string]any{tc.key: "new"}
			defaults := map[string]any{tc.key: "old"}
			entries := DiffValues(deployed, defaults)
			if len(entries) != 1 {
				t.Fatalf("expected 1 entry, got %d", len(entries))
			}
			if entries[0].Severity != tc.wantSev {
				t.Errorf("Severity: got %q, want %q", entries[0].Severity, tc.wantSev)
			}
		})
	}
}

func TestDiffValues_NilDeployed(t *testing.T) {
	// nil deployed treated as empty map — all defaults become Removed
	entries := DiffValues(nil, map[string]any{"key": "val"})
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Type != v1alpha1.DriftRemoved {
		t.Errorf("Type: got %q, want removed", entries[0].Type)
	}
}

func TestDiffValues_NilDefaults(t *testing.T) {
	// nil defaults treated as empty map — all deployed become Added
	entries := DiffValues(map[string]any{"key": "val"}, nil)
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].Type != v1alpha1.DriftAdded {
		t.Errorf("Type: got %q, want added", entries[0].Type)
	}
}
