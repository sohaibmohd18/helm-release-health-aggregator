import type { HealthStatus, UpgradeSeverity } from '@/types'

export const HEALTH_COLORS: Record<HealthStatus, string> = {
  Healthy: '#22c55e',
  Degraded: '#f59e0b',
  Failed: '#ef4444',
  Unknown: '#6b7280',
}

export const UPGRADE_COLORS: Record<UpgradeSeverity, string> = {
  none: '#22c55e',
  patch: '#3b82f6',
  minor: '#f59e0b',
  major: '#ef4444',
}

export function healthBadgeClasses(health: HealthStatus): string {
  const map: Record<HealthStatus, string> = {
    Healthy: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    Degraded: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    Unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  }
  return map[health]
}

export function upgradeBadgeClasses(severity: UpgradeSeverity): string {
  const map: Record<UpgradeSeverity, string> = {
    none: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    patch: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    minor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    major: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  }
  return map[severity]
}

export function severityScore(
  health: HealthStatus,
  upgradeSeverity: UpgradeSeverity,
  driftCount: number,
): number {
  let score = 0
  if (health === 'Failed') score += 500
  if (upgradeSeverity === 'major') score += 400
  if (health === 'Degraded') score += 300
  if (upgradeSeverity === 'minor') score += 200
  if (upgradeSeverity === 'patch') score += 100
  if (driftCount > 0) score += 50
  return score
}
