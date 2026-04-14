// Package controller implements the Kubernetes informer loop that watches Helm
// release secrets and drives the SQLite store + WebSocket event stream.
//
// Flow: Watch secrets (owner=helm) → decode → fetch workloads+pods → health
// roll-up → version check → drift diff → upsert store → broadcast WS event.
package controller

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/health"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/helm"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/registry"
	"github.com/sohaibmohmd18/helm-release-health-aggregator/internal/store"
	v1alpha1 "github.com/sohaibmohmd18/helm-release-health-aggregator/pkg/apis/v1alpha1"
)

// EventBroadcaster publishes HelmEvents to connected WebSocket clients.
// Satisfied by *api.Hub without importing the api package from here.
type EventBroadcaster interface {
	Broadcast(e v1alpha1.HelmEvent)
}

// Config holds optional wiring overrides.
type Config struct {
	// KubeconfigPath overrides the default in-cluster / ~/.kube/config lookup.
	KubeconfigPath string
	// Workers is the number of concurrent reconcile goroutines (default 4).
	Workers int
}

// Reconciler watches Helm release secrets and writes results to the store.
type Reconciler struct {
	k8s     kubernetes.Interface
	store   *store.DB
	hub     EventBroadcaster
	reg     *registry.Checker
	agg     *health.Aggregator
	decoder *helm.Decoder
	log     *zap.Logger
	sem     chan struct{} // bounded worker semaphore
}

// NewReconciler builds a Reconciler wired to a real Kubernetes cluster.
// Config resolution order: explicit KubeconfigPath → in-cluster → ~/.kube/config.
func NewReconciler(
	db *store.DB,
	hub EventBroadcaster,
	reg *registry.Checker,
	agg *health.Aggregator,
	log *zap.Logger,
	cfg Config,
) (*Reconciler, error) {
	if cfg.Workers <= 0 {
		cfg.Workers = 4
	}

	k8sCfg, err := buildK8sConfig(cfg.KubeconfigPath)
	if err != nil {
		return nil, fmt.Errorf("k8s config: %w", err)
	}

	k8s, err := kubernetes.NewForConfig(k8sCfg)
	if err != nil {
		return nil, fmt.Errorf("k8s client: %w", err)
	}

	return &Reconciler{
		k8s:     k8s,
		store:   db,
		hub:     hub,
		reg:     reg,
		agg:     agg,
		decoder: helm.NewDecoder(),
		log:     log,
		sem:     make(chan struct{}, cfg.Workers),
	}, nil
}

// Start begins the informer watch loop and blocks until ctx is cancelled.
func (r *Reconciler) Start(ctx context.Context) error {
	factory := informers.NewSharedInformerFactoryWithOptions(
		r.k8s,
		5*time.Minute, // resync period
		informers.WithTweakListOptions(func(opts *metav1.ListOptions) {
			opts.LabelSelector = "owner=helm"
		}),
	)

	secretInformer := factory.Core().V1().Secrets().Informer()
	if _, err := secretInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj interface{}) { r.enqueue(ctx, obj, false) },
		UpdateFunc: func(_, obj interface{}) { r.enqueue(ctx, obj, false) },
		DeleteFunc: func(obj interface{}) { r.enqueue(ctx, obj, true) },
	}); err != nil {
		return fmt.Errorf("add event handler: %w", err)
	}

	factory.Start(ctx.Done())

	r.log.Info("waiting for informer cache sync")
	if !cache.WaitForCacheSync(ctx.Done(), secretInformer.HasSynced) {
		return fmt.Errorf("cache sync timed out")
	}
	r.log.Info("informer synced — controller running")

	<-ctx.Done()
	r.log.Info("controller stopping")
	return nil
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (r *Reconciler) enqueue(ctx context.Context, obj interface{}, deleted bool) {
	r.sem <- struct{}{} // acquire
	go func() {
		defer func() { <-r.sem }() // release

		secret, ok := toSecret(obj)
		if !ok {
			return
		}

		if deleted {
			if err := r.handleDeleted(secret); err != nil {
				r.log.Error("handle deleted", zap.String("secret", secret.Name), zap.Error(err))
			}
			return
		}

		if err := r.reconcileSecret(ctx, secret); err != nil {
			r.log.Error("reconcile secret", zap.String("secret", secret.Name), zap.Error(err))
		}
	}()
}

func (r *Reconciler) reconcileSecret(ctx context.Context, secret *corev1.Secret) error {
	raw, ok := secret.Data["release"]
	if !ok {
		return nil // not a Helm release secret
	}

	rel, err := r.decoder.DecodeSecret(raw)
	if err != nil {
		return fmt.Errorf("decode %s/%s: %w", secret.Namespace, secret.Name, err)
	}

	// Fetch live workload and pod data.
	workloads, pods, err := r.fetchWorkloadHealth(ctx, rel.Namespace, rel.Name)
	if err != nil {
		r.log.Warn("fetch workload health (non-fatal)",
			zap.String("release", rel.Namespace+"/"+rel.Name), zap.Error(err))
	}

	// Roll up health status.
	healthStatus := r.agg.Rollup(workloads, rel.Status)

	// Version check (best-effort — 404 from ArtifactHub is not an error).
	vs := v1alpha1.VersionStatus{
		Installed: rel.Version,
		Latest:    rel.Version,
		Severity:  v1alpha1.SeverityNone,
	}
	if latest, latestApp, verErr := r.reg.LatestVersion(rel.Chart, rel.Chart); verErr == nil && latest != "" {
		vs.Latest = latest
		vs.LatestAppVersion = latestApp
		vs.UpgradeAvailable = latest != rel.Version
		vs.Severity = registry.ComputeSeverity(rel.Version, latest)
	}

	// Compute values drift.
	driftEntries := helm.DiffValues(rel.DeployedValues, rel.ChartDefaults)

	// Build pod summaries.
	now := time.Now().UTC()
	podSummaries := make([]v1alpha1.PodSummary, 0, len(pods))
	for _, p := range pods {
		ps := v1alpha1.PodSummary{
			Name:  p.Name,
			Phase: string(p.Status.Phase),
		}
		for _, cs := range p.Status.ContainerStatuses {
			ps.Restarts += int(cs.RestartCount)
			if cs.Ready {
				ps.Ready = true
			}
		}
		if !p.CreationTimestamp.IsZero() {
			ps.Age = now.Sub(p.CreationTimestamp.Time).Round(time.Second).String()
		}
		podSummaries = append(podSummaries, ps)
	}

	// Sum desired/ready across all workloads.
	podDesired, podReady := 0, 0
	for _, w := range workloads {
		podDesired += w.Desired
		podReady += w.Ready
	}

	detail := v1alpha1.ReleaseDetail{
		Release: v1alpha1.Release{
			ID:             rel.Namespace + "/" + rel.Name,
			Name:           rel.Name,
			Namespace:      rel.Namespace,
			ChartName:      rel.Chart,
			ChartVersion:   rel.Version,
			AppVersion:     rel.AppVersion,
			Status:         rel.Status,
			Health:         healthStatus,
			PodDesired:     podDesired,
			PodReady:       podReady,
			DriftCount:     len(driftEntries),
			VersionStatus:  vs,
			LastReconciled: now.Format(time.RFC3339),
			FirstDeployed:  rel.FirstDeployed,
			LastDeployed:   rel.LastDeployed,
			Revision:       rel.Revision,
		},
		Pods:           podSummaries,
		Workloads:      workloads,
		DriftEntries:   driftEntries,
		ChartDefaults:  rel.ChartDefaults,
		DeployedValues: rel.DeployedValues,
	}

	if err := r.store.Upsert(detail); err != nil {
		return fmt.Errorf("upsert %s/%s: %w", rel.Namespace, rel.Name, err)
	}

	r.emit(v1alpha1.EventReconciled, rel.Namespace, rel.Name,
		fmt.Sprintf("Reconciled %s/%s — %s", rel.Namespace, rel.Name, healthStatus), "info")

	if vs.UpgradeAvailable {
		r.emit(v1alpha1.EventUpgradeAvailable, rel.Namespace, rel.Name,
			fmt.Sprintf("Upgrade available: %s → %s", vs.Installed, vs.Latest), "warning")
	}
	if len(driftEntries) > 0 {
		r.emit(v1alpha1.EventDriftDetected, rel.Namespace, rel.Name,
			fmt.Sprintf("%d values drift entries detected", len(driftEntries)), "warning")
	}

	r.log.Info("reconciled",
		zap.String("release", rel.Namespace+"/"+rel.Name),
		zap.String("health", string(healthStatus)),
		zap.Int("drift", len(driftEntries)),
		zap.Bool("upgrade", vs.UpgradeAvailable),
	)
	return nil
}

func (r *Reconciler) handleDeleted(secret *corev1.Secret) error {
	name := releaseNameFromSecret(secret.Name)
	if name == "" {
		return nil
	}
	id := secret.Namespace + "/" + name
	if err := r.store.Delete(id); err != nil {
		return fmt.Errorf("delete %s: %w", id, err)
	}
	r.emit(v1alpha1.EventReconciled, secret.Namespace, name,
		fmt.Sprintf("Release %s/%s removed", secret.Namespace, name), "info")
	r.log.Info("deleted release", zap.String("id", id))
	return nil
}

// fetchWorkloadHealth lists Deployments, StatefulSets, and DaemonSets that
// belong to the Helm release (label app.kubernetes.io/instance=<releaseName>),
// plus all matching Pods for per-pod health data.
func (r *Reconciler) fetchWorkloadHealth(
	ctx context.Context,
	namespace, releaseName string,
) ([]v1alpha1.WorkloadSummary, []*corev1.Pod, error) {
	sel := "app.kubernetes.io/instance=" + releaseName
	opts := metav1.ListOptions{LabelSelector: sel}

	var workloads []v1alpha1.WorkloadSummary

	deps, err := r.k8s.AppsV1().Deployments(namespace).List(ctx, opts)
	if err != nil {
		return nil, nil, fmt.Errorf("list deployments: %w", err)
	}
	for i := range deps.Items {
		d := &deps.Items[i]
		desired := 1
		if d.Spec.Replicas != nil {
			desired = int(*d.Spec.Replicas)
		}
		ready := int(d.Status.ReadyReplicas)
		workloads = append(workloads, v1alpha1.WorkloadSummary{
			Name:    d.Name,
			Kind:    "Deployment",
			Desired: desired,
			Ready:   ready,
			Health:  workloadHealth(desired, ready),
		})
	}

	stss, err := r.k8s.AppsV1().StatefulSets(namespace).List(ctx, opts)
	if err != nil {
		return nil, nil, fmt.Errorf("list statefulsets: %w", err)
	}
	for i := range stss.Items {
		s := &stss.Items[i]
		desired := 1
		if s.Spec.Replicas != nil {
			desired = int(*s.Spec.Replicas)
		}
		ready := int(s.Status.ReadyReplicas)
		workloads = append(workloads, v1alpha1.WorkloadSummary{
			Name:    s.Name,
			Kind:    "StatefulSet",
			Desired: desired,
			Ready:   ready,
			Health:  workloadHealth(desired, ready),
		})
	}

	dss, err := r.k8s.AppsV1().DaemonSets(namespace).List(ctx, opts)
	if err != nil {
		return nil, nil, fmt.Errorf("list daemonsets: %w", err)
	}
	for i := range dss.Items {
		d := &dss.Items[i]
		desired := int(d.Status.DesiredNumberScheduled)
		ready := int(d.Status.NumberReady)
		workloads = append(workloads, v1alpha1.WorkloadSummary{
			Name:    d.Name,
			Kind:    "DaemonSet",
			Desired: desired,
			Ready:   ready,
			Health:  workloadHealth(desired, ready),
		})
	}

	// Pods — also scan for crash-looping containers to mark workloads Failed.
	podList, err := r.k8s.CoreV1().Pods(namespace).List(ctx, opts)
	if err != nil {
		return nil, nil, fmt.Errorf("list pods: %w", err)
	}
	pods := make([]*corev1.Pod, len(podList.Items))
	for i := range podList.Items {
		pods[i] = &podList.Items[i]
		for _, cs := range podList.Items[i].Status.ContainerStatuses {
			if cs.State.Waiting != nil &&
				(cs.State.Waiting.Reason == "CrashLoopBackOff" ||
					cs.State.Waiting.Reason == "OOMKilled") {
				for j := range workloads {
					workloads[j].Health = v1alpha1.Failed
				}
			}
		}
	}

	if workloads == nil {
		workloads = []v1alpha1.WorkloadSummary{}
	}
	return workloads, pods, nil
}

func (r *Reconciler) emit(t v1alpha1.EventType, namespace, name, message, severity string) {
	e := v1alpha1.HelmEvent{
		ID:        fmt.Sprintf("%s/%s/%d", namespace, name, time.Now().UnixNano()),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Type:      t,
		Release:   name,
		Namespace: namespace,
		Message:   message,
		Severity:  severity,
	}
	r.hub.Broadcast(e)
	if err := r.store.InsertEvent(e); err != nil {
		r.log.Warn("store event", zap.Error(err))
	}
}

// ---------------------------------------------------------------------------
// Pure helpers (no receiver)
// ---------------------------------------------------------------------------

// workloadHealth derives health from replica counts.
func workloadHealth(desired, ready int) v1alpha1.HealthStatus {
	switch {
	case desired == 0:
		return v1alpha1.Unknown
	case ready >= desired:
		return v1alpha1.Healthy
	case ready == 0:
		return v1alpha1.Failed
	default:
		return v1alpha1.Degraded
	}
}

// releaseNameFromSecret parses the Helm release name out of a Kubernetes
// secret name.  Helm v3 uses the pattern: sh.helm.release.v1.<name>.v<N>
func releaseNameFromSecret(secretName string) string {
	const prefix = "sh.helm.release.v1."
	if !strings.HasPrefix(secretName, prefix) {
		return ""
	}
	tail := strings.TrimPrefix(secretName, prefix)
	if idx := strings.LastIndex(tail, ".v"); idx != -1 {
		return tail[:idx]
	}
	return tail
}

// toSecret extracts a *corev1.Secret from an informer event object, handling
// the DeletedFinalStateUnknown tombstone that the informer may emit.
func toSecret(obj interface{}) (*corev1.Secret, bool) {
	if s, ok := obj.(*corev1.Secret); ok {
		return s, true
	}
	if t, ok := obj.(cache.DeletedFinalStateUnknown); ok {
		if s, ok := t.Obj.(*corev1.Secret); ok {
			return s, true
		}
	}
	return nil, false
}

// buildK8sConfig resolves a *rest.Config using the standard lookup order.
func buildK8sConfig(kubeconfigPath string) (*rest.Config, error) {
	if kubeconfigPath != "" {
		return clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	}
	cfg, err := rest.InClusterConfig()
	if err == nil {
		return cfg, nil
	}
	// Fall back to ~/.kube/config
	return clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
}
