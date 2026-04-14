// Package health aggregates pod and workload health into a HealthStatus.
//
// Roll-up logic:
//   Failed   — any pod in CrashLoopBackOff / OOMKilled, or Helm status = failed
//   Degraded — ready < desired for any workload
//   Healthy  — all workloads at desired capacity, Helm status = deployed
//   Unknown  — no workloads found
//
// Real implementation (client-go calls) added in Part 14.
package health

import (
	v1alpha1 "github.com/sohaibmohmd18/helmsightss/pkg/apis/v1alpha1"
)

// Aggregator computes health for a Helm release.
type Aggregator struct{}

// NewAggregator creates an Aggregator.
func NewAggregator() *Aggregator { return &Aggregator{} }

// Rollup derives the overall HealthStatus for a release given its workloads
// and Helm status.  Stub returns Unknown until real implementation in Part 14.
func (a *Aggregator) Rollup(
	workloads []v1alpha1.WorkloadSummary,
	helmStatus v1alpha1.ReleaseStatus,
) v1alpha1.HealthStatus {
	if helmStatus == v1alpha1.StatusFailed {
		return v1alpha1.Failed
	}
	if len(workloads) == 0 {
		return v1alpha1.Unknown
	}
	for _, w := range workloads {
		if w.Health == v1alpha1.Failed {
			return v1alpha1.Failed
		}
	}
	for _, w := range workloads {
		if w.Ready < w.Desired {
			return v1alpha1.Degraded
		}
	}
	return v1alpha1.Healthy
}
