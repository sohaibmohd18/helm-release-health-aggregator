import { useQuery } from '@tanstack/react-query'
import type { ListResponse, Release, ReleaseDetail, ClusterSummary, NamespaceSummary, HelmEvent, UpgradeCandidate } from '@/types'
import {
  mockReleases,
  mockReleaseDetails,
  mockClusterSummary,
  mockNamespaceSummaries,
  mockEvents,
  mockUpgradeCandidates,
} from './mock'

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

export interface ReleasesFilter {
  namespaces?: string[]
  health?: string[]
  upgradeAvailable?: boolean
  hasDrift?: boolean
  search?: string
  page?: number
  pageSize?: number
}

// ---------------------------------------------------------------------------
// Hooks — swap mock data source for real fetch in Part 16
// To migrate: replace the `queryFn` body with `await fetch(BASE_URL + '/api/v1/...')`
// ---------------------------------------------------------------------------

export function useClusterSummary() {
  return useQuery<ClusterSummary>({
    queryKey: ['clusterSummary'],
    queryFn: async () => {
      await delay(350)
      return mockClusterSummary
    },
  })
}

export function useNamespaceSummaries() {
  return useQuery<NamespaceSummary[]>({
    queryKey: ['namespaceSummaries'],
    queryFn: async () => {
      await delay(300)
      return mockNamespaceSummaries
    },
  })
}

export function useReleases(filters: ReleasesFilter = {}) {
  return useQuery<ListResponse<Release>>({
    queryKey: ['releases', filters],
    queryFn: async () => {
      await delay(400)
      let items = [...mockReleases]

      if (filters.namespaces && filters.namespaces.length > 0) {
        items = items.filter(r => filters.namespaces!.includes(r.namespace))
      }
      if (filters.health && filters.health.length > 0) {
        items = items.filter(r => filters.health!.includes(r.health))
      }
      if (filters.upgradeAvailable !== undefined) {
        items = items.filter(r => r.versionStatus.upgradeAvailable === filters.upgradeAvailable)
      }
      if (filters.hasDrift !== undefined) {
        if (filters.hasDrift) {
          items = items.filter(r => r.driftCount > 0)
        } else {
          items = items.filter(r => r.driftCount === 0)
        }
      }
      if (filters.search) {
        const q = filters.search.toLowerCase()
        items = items.filter(r => r.name.toLowerCase().includes(q) || r.chartName.toLowerCase().includes(q))
      }

      const page = filters.page ?? 1
      const pageSize = filters.pageSize ?? 25
      const total = items.length
      const start = (page - 1) * pageSize
      const paged = items.slice(start, start + pageSize)

      return { items: paged, total, page, pageSize }
    },
  })
}

export function useRelease(namespace: string, name: string) {
  return useQuery<ReleaseDetail>({
    queryKey: ['release', namespace, name],
    queryFn: async () => {
      await delay(450)
      const id = `${namespace}/${name}`
      const detail = mockReleaseDetails[id]
      if (!detail) throw new Error(`Release ${id} not found`)
      return detail
    },
    enabled: Boolean(namespace && name),
  })
}

export function useUpgrades() {
  return useQuery<UpgradeCandidate[]>({
    queryKey: ['upgrades'],
    queryFn: async () => {
      await delay(350)
      return mockUpgradeCandidates
    },
  })
}

export function useEvents() {
  return useQuery<HelmEvent[]>({
    queryKey: ['events'],
    queryFn: async () => {
      await delay(300)
      return mockEvents
    },
  })
}
