export type HealthStatus = 'Healthy' | 'Degraded' | 'Failed' | 'Unknown'
export type UpgradeSeverity = 'none' | 'patch' | 'minor' | 'major'
export type ReleaseStatus = 'deployed' | 'failed' | 'pending-install' |
                            'pending-upgrade' | 'pending-rollback' | 'superseded'
export type DriftType = 'changed' | 'added'
export type DriftSeverity = 'info' | 'warning'
export type EventType = 'reconciled' | 'health_changed' | 'upgrade_available' |
                        'drift_detected' | 'error'

export interface DriftEntry {
  key: string
  type: DriftType
  defaultValue: unknown
  userValue: unknown
  severity: DriftSeverity
}

export interface PodSummary {
  name: string
  phase: string
  ready: boolean
  restarts: number
  age: string
  node: string
}

export interface WorkloadSummary {
  kind: string
  name: string
  desired: number
  ready: number
  available: number
}

export interface RevisionEntry {
  revision: number
  chartVersion: string
  status: ReleaseStatus
  deployedAt: string
  deployedBy?: string
  description?: string
}

export interface VersionStatus {
  deployed: string
  latest: string
  upgradeAvailable: boolean
  severity: UpgradeSeverity
  skippedVersions: number
  changelogUrl?: string
}

export interface Release {
  id: string                    // "{namespace}/{name}"
  name: string
  namespace: string
  chartName: string
  chartVersion: string
  appVersion: string
  status: ReleaseStatus
  health: HealthStatus
  podDesired: number
  podReady: number
  driftCount: number
  versionStatus: VersionStatus
  lastReconciled: string
  firstDeployed: string
  lastDeployed: string
  revision: number
}

export interface ReleaseDetail extends Release {
  pods: PodSummary[]
  workloads: WorkloadSummary[]
  driftEntries: DriftEntry[]
  history: RevisionEntry[]
  chartDefaults: Record<string, unknown>
  deployedValues: Record<string, unknown>
}

export interface ClusterSummary {
  totalReleases: number
  healthyReleases: number
  degradedReleases: number
  failedReleases: number
  unknownReleases: number
  upgradesAvailable: number
  majorUpgrades: number
  minorUpgrades: number
  patchUpgrades: number
  totalPodsTracked: number
  totalDriftEntries: number
  lastScanTime: string
  clusterName: string
}

export interface NamespaceSummary {
  namespace: string
  releaseCount: number
  worstHealth: HealthStatus
  upgradesAvailable: number
}

export interface HelmEvent {
  id: string
  type: EventType
  namespace: string
  release: string
  timestamp: string
  description: string
  severity: 'info' | 'warning' | 'error'
  delta?: {
    health?: HealthStatus
    previousHealth?: HealthStatus
    upgradeAvailable?: boolean
    latestVersion?: string
  }
}

export interface UpgradeCandidate {
  release: Release
  helmUpgradeCommand: string
}

export interface ListResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
