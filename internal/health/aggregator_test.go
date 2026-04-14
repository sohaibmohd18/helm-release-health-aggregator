package health

import (
	"testing"

	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

func TestRollup(t *testing.T) {
	healthy := v1alpha1.WorkloadSummary{Name: "deploy", Kind: "Deployment", Desired: 2, Ready: 2, Health: v1alpha1.Healthy}
	degraded := v1alpha1.WorkloadSummary{Name: "deploy", Kind: "Deployment", Desired: 2, Ready: 1, Health: v1alpha1.Degraded}
	failedW := v1alpha1.WorkloadSummary{Name: "deploy", Kind: "Deployment", Desired: 2, Ready: 0, Health: v1alpha1.Failed}

	tests := []struct {
		name       string
		workloads  []v1alpha1.WorkloadSummary
		helmStatus v1alpha1.ReleaseStatus
		want       v1alpha1.HealthStatus
	}{
		{
			name:       "no workloads → Unknown",
			workloads:  nil,
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Unknown,
		},
		{
			name:       "empty workloads → Unknown",
			workloads:  []v1alpha1.WorkloadSummary{},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Unknown,
		},
		{
			name:       "helm failed → Failed regardless of workloads",
			workloads:  []v1alpha1.WorkloadSummary{healthy},
			helmStatus: v1alpha1.StatusFailed,
			want:       v1alpha1.Failed,
		},
		{
			name:       "helm failed with no workloads → Failed",
			workloads:  nil,
			helmStatus: v1alpha1.StatusFailed,
			want:       v1alpha1.Failed,
		},
		{
			name:       "all healthy workloads → Healthy",
			workloads:  []v1alpha1.WorkloadSummary{healthy, healthy},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Healthy,
		},
		{
			name:       "one degraded workload → Degraded",
			workloads:  []v1alpha1.WorkloadSummary{healthy, degraded},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Degraded,
		},
		{
			name:       "all degraded → Degraded",
			workloads:  []v1alpha1.WorkloadSummary{degraded, degraded},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Degraded,
		},
		{
			name:       "one failed workload → Failed",
			workloads:  []v1alpha1.WorkloadSummary{healthy, failedW},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Failed,
		},
		{
			name:       "failed workload beats degraded → Failed",
			workloads:  []v1alpha1.WorkloadSummary{degraded, failedW},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Failed,
		},
		{
			name:       "ready < desired but not marked failed → Degraded",
			workloads:  []v1alpha1.WorkloadSummary{{Name: "d", Kind: "Deployment", Desired: 3, Ready: 2, Health: v1alpha1.Healthy}},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Degraded,
		},
		{
			name:       "single healthy workload → Healthy",
			workloads:  []v1alpha1.WorkloadSummary{healthy},
			helmStatus: v1alpha1.StatusDeployed,
			want:       v1alpha1.Healthy,
		},
	}

	agg := NewAggregator()
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := agg.Rollup(tc.workloads, tc.helmStatus)
			if got != tc.want {
				t.Errorf("Rollup() = %q, want %q", got, tc.want)
			}
		})
	}
}
