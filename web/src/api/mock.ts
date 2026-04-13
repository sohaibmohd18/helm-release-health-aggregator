import type {
  Release,
  ReleaseDetail,
  ClusterSummary,
  NamespaceSummary,
  HelmEvent,
  UpgradeCandidate,
  DriftEntry,
  PodSummary,
  WorkloadSummary,
  RevisionEntry,
} from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iso(daysAgo: number, hoursAgo = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(d.getHours() - hoursAgo)
  return d.toISOString()
}

function pods(count: number, ready: number, node = 'ip-10-0-1-42'): PodSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `pod-${i + 1}-abc${i}d`,
    phase: i < ready ? 'Running' : 'CrashLoopBackOff',
    ready: i < ready,
    restarts: i < ready ? 0 : 3 + i,
    age: `${(i + 1) * 3}d`,
    node,
  }))
}

function workload(
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet',
  name: string,
  desired: number,
  ready: number,
): WorkloadSummary {
  return { kind, name, desired, ready, available: ready }
}

function history(releases: Array<{ rev: number; ver: string; status: Release['status']; daysAgo: number }>): RevisionEntry[] {
  return releases.map(r => ({
    revision: r.rev,
    chartVersion: r.ver,
    status: r.status,
    deployedAt: iso(r.daysAgo),
    deployedBy: 'ci-bot',
  }))
}

// ---------------------------------------------------------------------------
// Drift entries
// ---------------------------------------------------------------------------

const prometheusStackDrift: DriftEntry[] = [
  { key: 'alertmanager.enabled', type: 'changed', defaultValue: true, userValue: false, severity: 'warning' },
  { key: 'prometheus.prometheusSpec.retention', type: 'changed', defaultValue: '10d', userValue: '30d', severity: 'info' },
  { key: 'grafana.enabled', type: 'changed', defaultValue: true, userValue: false, severity: 'info' },
  { key: 'prometheus.prometheusSpec.resources.requests.memory', type: 'changed', defaultValue: '400Mi', userValue: '2Gi', severity: 'info' },
]

const grafanaDrift: DriftEntry[] = [
  { key: 'persistence.enabled', type: 'changed', defaultValue: false, userValue: true, severity: 'info' },
  { key: 'persistence.storageClass', type: 'added', defaultValue: null, userValue: 'gp3', severity: 'info' },
  { key: 'adminPassword', type: 'changed', defaultValue: 'prom-operator', userValue: 'REDACTED', severity: 'warning' },
]

const myAppBackendDrift: DriftEntry[] = [
  { key: 'replicaCount', type: 'changed', defaultValue: 1, userValue: 3, severity: 'info' },
  { key: 'resources.requests.memory', type: 'changed', defaultValue: '128Mi', userValue: '512Mi', severity: 'info' },
  { key: 'env.DATABASE_URL', type: 'added', defaultValue: null, userValue: 'postgres://...', severity: 'warning' },
  { key: 'env.REDIS_URL', type: 'added', defaultValue: null, userValue: 'redis://...', severity: 'warning' },
]

// ---------------------------------------------------------------------------
// Base releases
// ---------------------------------------------------------------------------

export const mockReleases: Release[] = [
  // monitoring/prometheus-stack — Degraded, major upgrade, drift
  {
    id: 'monitoring/prometheus-stack',
    name: 'prometheus-stack',
    namespace: 'monitoring',
    chartName: 'kube-prometheus-stack',
    chartVersion: '55.5.0',
    appVersion: '0.70.0',
    status: 'deployed',
    health: 'Degraded',
    podDesired: 5,
    podReady: 4,
    driftCount: prometheusStackDrift.length,
    versionStatus: {
      deployed: '55.5.0',
      latest: '72.3.0',
      upgradeAvailable: true,
      severity: 'major',
      skippedVersions: 17,
      changelogUrl: 'https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack',
    },
    lastReconciled: iso(0, 1),
    firstDeployed: iso(180),
    lastDeployed: iso(14),
    revision: 8,
  },

  // monitoring/grafana — Degraded, minor upgrade, drift
  {
    id: 'monitoring/grafana',
    name: 'grafana',
    namespace: 'monitoring',
    chartName: 'grafana',
    chartVersion: '7.3.7',
    appVersion: '10.3.3',
    status: 'deployed',
    health: 'Degraded',
    podDesired: 1,
    podReady: 0,
    driftCount: grafanaDrift.length,
    versionStatus: {
      deployed: '7.3.7',
      latest: '8.9.1',
      upgradeAvailable: true,
      severity: 'minor',
      skippedVersions: 4,
      changelogUrl: 'https://artifacthub.io/packages/helm/grafana/grafana',
    },
    lastReconciled: iso(0, 2),
    firstDeployed: iso(200),
    lastDeployed: iso(30),
    revision: 12,
  },

  // monitoring/alertmanager — Failed, patch upgrade
  {
    id: 'monitoring/alertmanager',
    name: 'alertmanager',
    namespace: 'monitoring',
    chartName: 'alertmanager',
    chartVersion: '1.9.0',
    appVersion: '0.27.0',
    status: 'failed',
    health: 'Failed',
    podDesired: 1,
    podReady: 0,
    driftCount: 0,
    versionStatus: {
      deployed: '1.9.0',
      latest: '1.9.3',
      upgradeAvailable: true,
      severity: 'patch',
      skippedVersions: 3,
      changelogUrl: 'https://artifacthub.io/packages/helm/prometheus-community/alertmanager',
    },
    lastReconciled: iso(0, 3),
    firstDeployed: iso(150),
    lastDeployed: iso(7),
    revision: 3,
  },

  // monitoring/loki — Degraded, no upgrade
  {
    id: 'monitoring/loki',
    name: 'loki',
    namespace: 'monitoring',
    chartName: 'loki',
    chartVersion: '6.6.3',
    appVersion: '3.1.0',
    status: 'deployed',
    health: 'Degraded',
    podDesired: 3,
    podReady: 2,
    driftCount: 0,
    versionStatus: {
      deployed: '6.6.3',
      latest: '6.6.3',
      upgradeAvailable: false,
      severity: 'none',
      skippedVersions: 0,
    },
    lastReconciled: iso(0, 1),
    firstDeployed: iso(90),
    lastDeployed: iso(5),
    revision: 5,
  },

  // ingress-nginx/ingress-nginx — Healthy, major upgrade
  {
    id: 'ingress-nginx/ingress-nginx',
    name: 'ingress-nginx',
    namespace: 'ingress-nginx',
    chartName: 'ingress-nginx',
    chartVersion: '4.8.4',
    appVersion: '1.9.6',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 2,
    podReady: 2,
    driftCount: 0,
    versionStatus: {
      deployed: '4.8.4',
      latest: '5.4.0',
      upgradeAvailable: true,
      severity: 'major',
      skippedVersions: 12,
      changelogUrl: 'https://artifacthub.io/packages/helm/ingress-nginx/ingress-nginx',
    },
    lastReconciled: iso(0, 0),
    firstDeployed: iso(365),
    lastDeployed: iso(60),
    revision: 15,
  },

  // ingress-nginx/cert-manager — Healthy, minor upgrade
  {
    id: 'ingress-nginx/cert-manager',
    name: 'cert-manager',
    namespace: 'ingress-nginx',
    chartName: 'cert-manager',
    chartVersion: '1.13.3',
    appVersion: '1.13.3',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 3,
    podReady: 3,
    driftCount: 0,
    versionStatus: {
      deployed: '1.13.3',
      latest: '1.17.2',
      upgradeAvailable: true,
      severity: 'minor',
      skippedVersions: 6,
      changelogUrl: 'https://artifacthub.io/packages/helm/cert-manager/cert-manager',
    },
    lastReconciled: iso(0, 1),
    firstDeployed: iso(300),
    lastDeployed: iso(90),
    revision: 6,
  },

  // cert-manager/cert-manager-csi-driver — Healthy, patch upgrade
  {
    id: 'cert-manager/cert-manager-csi-driver',
    name: 'cert-manager-csi-driver',
    namespace: 'cert-manager',
    chartName: 'cert-manager-csi-driver',
    chartVersion: '0.7.0',
    appVersion: '0.7.0',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 3,
    podReady: 3,
    driftCount: 0,
    versionStatus: {
      deployed: '0.7.0',
      latest: '0.7.2',
      upgradeAvailable: true,
      severity: 'patch',
      skippedVersions: 2,
    },
    lastReconciled: iso(0, 2),
    firstDeployed: iso(200),
    lastDeployed: iso(45),
    revision: 4,
  },

  // cert-manager/trust-manager — PERFECT: Healthy, current, no drift
  {
    id: 'cert-manager/trust-manager',
    name: 'trust-manager',
    namespace: 'cert-manager',
    chartName: 'trust-manager',
    chartVersion: '0.10.0',
    appVersion: '0.10.0',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 1,
    podReady: 1,
    driftCount: 0,
    versionStatus: {
      deployed: '0.10.0',
      latest: '0.10.0',
      upgradeAvailable: false,
      severity: 'none',
      skippedVersions: 0,
    },
    lastReconciled: iso(0, 0),
    firstDeployed: iso(100),
    lastDeployed: iso(30),
    revision: 2,
  },

  // default/my-app-backend — Failed, major upgrade, drift
  {
    id: 'default/my-app-backend',
    name: 'my-app-backend',
    namespace: 'default',
    chartName: 'my-app-backend',
    chartVersion: '1.4.2',
    appVersion: '1.4.2',
    status: 'failed',
    health: 'Failed',
    podDesired: 3,
    podReady: 0,
    driftCount: myAppBackendDrift.length,
    versionStatus: {
      deployed: '1.4.2',
      latest: '2.1.0',
      upgradeAvailable: true,
      severity: 'major',
      skippedVersions: 5,
    },
    lastReconciled: iso(0, 4),
    firstDeployed: iso(120),
    lastDeployed: iso(2),
    revision: 9,
  },

  // default/my-app-frontend — Degraded, patch upgrade
  {
    id: 'default/my-app-frontend',
    name: 'my-app-frontend',
    namespace: 'default',
    chartName: 'my-app-frontend',
    chartVersion: '0.9.1',
    appVersion: '0.9.1',
    status: 'deployed',
    health: 'Degraded',
    podDesired: 2,
    podReady: 1,
    driftCount: 0,
    versionStatus: {
      deployed: '0.9.1',
      latest: '0.9.4',
      upgradeAvailable: true,
      severity: 'patch',
      skippedVersions: 3,
    },
    lastReconciled: iso(0, 1),
    firstDeployed: iso(90),
    lastDeployed: iso(3),
    revision: 7,
  },

  // default/redis — Healthy, major upgrade
  {
    id: 'default/redis',
    name: 'redis',
    namespace: 'default',
    chartName: 'redis',
    chartVersion: '18.6.4',
    appVersion: '7.2.4',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 1,
    podReady: 1,
    driftCount: 0,
    versionStatus: {
      deployed: '18.6.4',
      latest: '20.11.3',
      upgradeAvailable: true,
      severity: 'major',
      skippedVersions: 20,
      changelogUrl: 'https://artifacthub.io/packages/helm/bitnami/redis',
    },
    lastReconciled: iso(0, 0),
    firstDeployed: iso(400),
    lastDeployed: iso(120),
    revision: 3,
  },

  // default/postgresql — Healthy, major upgrade
  {
    id: 'default/postgresql',
    name: 'postgresql',
    namespace: 'default',
    chartName: 'postgresql',
    chartVersion: '13.4.4',
    appVersion: '16.2.0',
    status: 'deployed',
    health: 'Healthy',
    podDesired: 1,
    podReady: 1,
    driftCount: 0,
    versionStatus: {
      deployed: '13.4.4',
      latest: '16.7.4',
      upgradeAvailable: true,
      severity: 'major',
      skippedVersions: 18,
      changelogUrl: 'https://artifacthub.io/packages/helm/bitnami/postgresql',
    },
    lastReconciled: iso(0, 0),
    firstDeployed: iso(500),
    lastDeployed: iso(180),
    revision: 2,
  },
]

// ---------------------------------------------------------------------------
// Release details (extends base releases with extra fields)
// ---------------------------------------------------------------------------

const releaseDetails: Record<string, ReleaseDetail> = {}

for (const r of mockReleases) {
  let extraPods: PodSummary[] = []
  let extraWorkloads: WorkloadSummary[] = []
  let driftEntries: DriftEntry[] = []
  let hist: RevisionEntry[] = []

  switch (r.id) {
    case 'monitoring/prometheus-stack':
      extraPods = pods(5, 4, 'ip-10-0-1-42')
      extraWorkloads = [
        workload('Deployment', 'prometheus-stack-operator', 1, 1),
        workload('StatefulSet', 'prometheus-prometheus-stack', 2, 1),
        workload('StatefulSet', 'alertmanager-prometheus-stack', 1, 1),
        workload('DaemonSet', 'prometheus-stack-node-exporter', 3, 3),
      ]
      driftEntries = prometheusStackDrift
      hist = history([
        { rev: 8, ver: '55.5.0', status: 'deployed', daysAgo: 14 },
        { rev: 7, ver: '51.2.0', status: 'superseded', daysAgo: 60 },
        { rev: 6, ver: '48.0.0', status: 'superseded', daysAgo: 90 },
        { rev: 5, ver: '45.7.0', status: 'superseded', daysAgo: 120 },
      ])
      break

    case 'monitoring/grafana':
      extraPods = pods(1, 0, 'ip-10-0-1-55')
      extraWorkloads = [workload('Deployment', 'grafana', 1, 0)]
      driftEntries = grafanaDrift
      hist = history([
        { rev: 12, ver: '7.3.7', status: 'deployed', daysAgo: 30 },
        { rev: 11, ver: '7.2.1', status: 'superseded', daysAgo: 60 },
        { rev: 10, ver: '7.0.0', status: 'superseded', daysAgo: 90 },
      ])
      break

    case 'monitoring/alertmanager':
      extraPods = pods(1, 0, 'ip-10-0-1-42')
      extraWorkloads = [workload('StatefulSet', 'alertmanager', 1, 0)]
      driftEntries = []
      hist = history([
        { rev: 3, ver: '1.9.0', status: 'failed', daysAgo: 7 },
        { rev: 2, ver: '1.8.0', status: 'superseded', daysAgo: 45 },
        { rev: 1, ver: '1.7.0', status: 'superseded', daysAgo: 90 },
      ])
      break

    case 'monitoring/loki':
      extraPods = pods(3, 2, 'ip-10-0-1-55')
      extraWorkloads = [workload('StatefulSet', 'loki', 3, 2)]
      driftEntries = []
      hist = history([
        { rev: 5, ver: '6.6.3', status: 'deployed', daysAgo: 5 },
        { rev: 4, ver: '6.5.0', status: 'superseded', daysAgo: 30 },
        { rev: 3, ver: '6.3.0', status: 'superseded', daysAgo: 60 },
      ])
      break

    case 'ingress-nginx/ingress-nginx':
      extraPods = pods(2, 2, 'ip-10-0-2-10')
      extraWorkloads = [workload('Deployment', 'ingress-nginx-controller', 2, 2)]
      driftEntries = []
      hist = history([
        { rev: 15, ver: '4.8.4', status: 'deployed', daysAgo: 60 },
        { rev: 14, ver: '4.7.0', status: 'superseded', daysAgo: 120 },
        { rev: 13, ver: '4.5.2', status: 'superseded', daysAgo: 180 },
      ])
      break

    case 'ingress-nginx/cert-manager':
      extraPods = pods(3, 3, 'ip-10-0-2-10')
      extraWorkloads = [
        workload('Deployment', 'cert-manager', 1, 1),
        workload('Deployment', 'cert-manager-cainjector', 1, 1),
        workload('Deployment', 'cert-manager-webhook', 1, 1),
      ]
      driftEntries = []
      hist = history([
        { rev: 6, ver: '1.13.3', status: 'deployed', daysAgo: 90 },
        { rev: 5, ver: '1.12.0', status: 'superseded', daysAgo: 180 },
        { rev: 4, ver: '1.11.0', status: 'superseded', daysAgo: 270 },
      ])
      break

    case 'cert-manager/cert-manager-csi-driver':
      extraPods = pods(3, 3, 'ip-10-0-3-20')
      extraWorkloads = [workload('DaemonSet', 'cert-manager-csi-driver', 3, 3)]
      driftEntries = []
      hist = history([
        { rev: 4, ver: '0.7.0', status: 'deployed', daysAgo: 45 },
        { rev: 3, ver: '0.6.0', status: 'superseded', daysAgo: 90 },
      ])
      break

    case 'cert-manager/trust-manager':
      extraPods = pods(1, 1, 'ip-10-0-3-20')
      extraWorkloads = [workload('Deployment', 'trust-manager', 1, 1)]
      driftEntries = []
      hist = history([
        { rev: 2, ver: '0.10.0', status: 'deployed', daysAgo: 30 },
        { rev: 1, ver: '0.9.0', status: 'superseded', daysAgo: 90 },
      ])
      break

    case 'default/my-app-backend':
      extraPods = pods(3, 0, 'ip-10-0-4-5')
      extraWorkloads = [workload('Deployment', 'my-app-backend', 3, 0)]
      driftEntries = myAppBackendDrift
      hist = history([
        { rev: 9, ver: '1.4.2', status: 'failed', daysAgo: 2 },
        { rev: 8, ver: '1.4.1', status: 'superseded', daysAgo: 10 },
        { rev: 7, ver: '1.3.0', status: 'superseded', daysAgo: 30 },
      ])
      break

    case 'default/my-app-frontend':
      extraPods = pods(2, 1, 'ip-10-0-4-5')
      extraWorkloads = [workload('Deployment', 'my-app-frontend', 2, 1)]
      driftEntries = []
      hist = history([
        { rev: 7, ver: '0.9.1', status: 'deployed', daysAgo: 3 },
        { rev: 6, ver: '0.9.0', status: 'superseded', daysAgo: 14 },
        { rev: 5, ver: '0.8.2', status: 'superseded', daysAgo: 30 },
      ])
      break

    case 'default/redis':
      extraPods = pods(1, 1, 'ip-10-0-4-6')
      extraWorkloads = [workload('StatefulSet', 'redis-master', 1, 1)]
      driftEntries = []
      hist = history([
        { rev: 3, ver: '18.6.4', status: 'deployed', daysAgo: 120 },
        { rev: 2, ver: '17.0.0', status: 'superseded', daysAgo: 300 },
        { rev: 1, ver: '16.0.0', status: 'superseded', daysAgo: 400 },
      ])
      break

    case 'default/postgresql':
      extraPods = pods(1, 1, 'ip-10-0-4-6')
      extraWorkloads = [workload('StatefulSet', 'postgresql', 1, 1)]
      driftEntries = []
      hist = history([
        { rev: 2, ver: '13.4.4', status: 'deployed', daysAgo: 180 },
        { rev: 1, ver: '12.0.0', status: 'superseded', daysAgo: 500 },
      ])
      break
  }

  const chartDefaults: Record<string, unknown> = {
    replicaCount: 1,
    image: { pullPolicy: 'IfNotPresent' },
    resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } },
    service: { type: 'ClusterIP', port: 80 },
  }

  const deployedValues: Record<string, unknown> = { ...chartDefaults }
  for (const d of driftEntries) {
    if (d.type === 'changed' || d.type === 'added') {
      deployedValues[d.key] = d.userValue
    }
  }

  releaseDetails[r.id] = {
    ...r,
    pods: extraPods,
    workloads: extraWorkloads,
    driftEntries,
    history: hist,
    chartDefaults,
    deployedValues,
  }
}

export const mockReleaseDetails = releaseDetails

// ---------------------------------------------------------------------------
// Cluster summary
// ---------------------------------------------------------------------------

export const mockClusterSummary: ClusterSummary = {
  totalReleases: mockReleases.length,
  healthyReleases: mockReleases.filter(r => r.health === 'Healthy').length,
  degradedReleases: mockReleases.filter(r => r.health === 'Degraded').length,
  failedReleases: mockReleases.filter(r => r.health === 'Failed').length,
  unknownReleases: mockReleases.filter(r => r.health === 'Unknown').length,
  upgradesAvailable: mockReleases.filter(r => r.versionStatus.upgradeAvailable).length,
  majorUpgrades: mockReleases.filter(r => r.versionStatus.severity === 'major').length,
  minorUpgrades: mockReleases.filter(r => r.versionStatus.severity === 'minor').length,
  patchUpgrades: mockReleases.filter(r => r.versionStatus.severity === 'patch').length,
  totalPodsTracked: mockReleases.reduce((sum, r) => sum + r.podDesired, 0),
  totalDriftEntries: mockReleases.reduce((sum, r) => sum + r.driftCount, 0),
  lastScanTime: iso(0, 0),
  clusterName: 'eks-prod-us-east-1',
}

// ---------------------------------------------------------------------------
// Namespace summaries
// ---------------------------------------------------------------------------

function worstHealth(releases: Release[]): Release['health'] {
  if (releases.some(r => r.health === 'Failed')) return 'Failed'
  if (releases.some(r => r.health === 'Degraded')) return 'Degraded'
  if (releases.some(r => r.health === 'Healthy')) return 'Healthy'
  return 'Unknown'
}

const namespaces = [...new Set(mockReleases.map(r => r.namespace))]
export const mockNamespaceSummaries: NamespaceSummary[] = namespaces.map(ns => {
  const releases = mockReleases.filter(r => r.namespace === ns)
  return {
    namespace: ns,
    releaseCount: releases.length,
    worstHealth: worstHealth(releases),
    upgradesAvailable: releases.filter(r => r.versionStatus.upgradeAvailable).length,
  }
})

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

let eventIdCounter = 1
function makeEvent(
  type: HelmEvent['type'],
  namespace: string,
  release: string,
  description: string,
  severity: HelmEvent['severity'],
  hoursAgo: number,
  delta?: HelmEvent['delta'],
): HelmEvent {
  return {
    id: `evt-${eventIdCounter++}`,
    type,
    namespace,
    release,
    timestamp: iso(0, hoursAgo),
    description,
    severity,
    delta,
  }
}

export const mockEvents: HelmEvent[] = [
  makeEvent('error', 'default', 'my-app-backend', 'Pod crash loop detected: OOMKilled (exit code 137)', 'error', 0.1),
  makeEvent('health_changed', 'default', 'my-app-backend', 'Health changed: Healthy → Failed', 'error', 0.2, { health: 'Failed', previousHealth: 'Healthy' }),
  makeEvent('reconciled', 'cert-manager', 'trust-manager', 'Release reconciled successfully, no changes detected', 'info', 0.5),
  makeEvent('upgrade_available', 'default', 'redis', 'New chart version available: 18.6.4 → 20.11.3 (major)', 'warning', 1, { upgradeAvailable: true, latestVersion: '20.11.3' }),
  makeEvent('drift_detected', 'monitoring', 'prometheus-stack', 'Values drift detected: 4 keys differ from chart defaults', 'warning', 1.5),
  makeEvent('reconciled', 'ingress-nginx', 'ingress-nginx', 'Release reconciled successfully', 'info', 2),
  makeEvent('health_changed', 'monitoring', 'grafana', 'Health changed: Healthy → Degraded', 'warning', 3, { health: 'Degraded', previousHealth: 'Healthy' }),
  makeEvent('upgrade_available', 'ingress-nginx', 'ingress-nginx', 'New chart version available: 4.8.4 → 5.4.0 (major)', 'warning', 4, { upgradeAvailable: true, latestVersion: '5.4.0' }),
  makeEvent('error', 'monitoring', 'alertmanager', 'Helm release install failed: CrashLoopBackOff', 'error', 5),
  makeEvent('reconciled', 'cert-manager', 'cert-manager-csi-driver', 'Release reconciled successfully', 'info', 6),
  makeEvent('drift_detected', 'monitoring', 'grafana', 'Values drift detected: 3 keys differ from chart defaults', 'warning', 8),
  makeEvent('upgrade_available', 'default', 'postgresql', 'New chart version available: 13.4.4 → 16.7.4 (major)', 'warning', 12, { upgradeAvailable: true, latestVersion: '16.7.4' }),
  makeEvent('reconciled', 'default', 'my-app-frontend', 'Release reconciled successfully', 'info', 16),
  makeEvent('reconciled', 'monitoring', 'loki', 'Release reconciled successfully', 'info', 20),
  makeEvent('upgrade_available', 'cert-manager', 'cert-manager-csi-driver', 'New chart version available: 0.7.0 → 0.7.2 (patch)', 'info', 24),
]

// ---------------------------------------------------------------------------
// Upgrade candidates
// ---------------------------------------------------------------------------

export const mockUpgradeCandidates: UpgradeCandidate[] = mockReleases
  .filter(r => r.versionStatus.upgradeAvailable)
  .map(r => ({
    release: r,
    helmUpgradeCommand: `helm upgrade ${r.name} ${r.chartName} --version ${r.versionStatus.latest} -n ${r.namespace}`,
  }))
  .sort((a, b) => {
    const order = { major: 0, minor: 1, patch: 2, none: 3 }
    return order[a.release.versionStatus.severity] - order[b.release.versionStatus.severity]
  })
