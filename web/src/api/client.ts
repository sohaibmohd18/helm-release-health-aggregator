import { useQuery } from '@tanstack/react-query'
import type { ListResponse, Release, ReleaseDetail, ClusterSummary, NamespaceSummary, HelmEvent, UpgradeCandidate } from '@/types'

// ---------------------------------------------------------------------------
// Base URL
// VITE_API_BASE_URL is empty in production (same-origin) and set to
// http://localhost:8080 only if bypassing the Vite dev proxy.
// ---------------------------------------------------------------------------

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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
// Core fetch helper — throws on non-2xx responses
// ---------------------------------------------------------------------------

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Hooks — Part 16: real fetch calls backed by the Go REST API
// ---------------------------------------------------------------------------

export function useClusterSummary() {
  return useQuery<ClusterSummary>({
    queryKey: ['clusterSummary'],
    queryFn: () => fetchJSON('/api/v1/cluster/summary'),
  })
}

export function useNamespaceSummaries() {
  return useQuery<NamespaceSummary[]>({
    queryKey: ['namespaceSummaries'],
    queryFn: () => fetchJSON('/api/v1/namespaces/summaries'),
  })
}

export function useReleases(filters: ReleasesFilter = {}) {
  return useQuery<ListResponse<Release>>({
    queryKey: ['releases', filters],
    queryFn: () => {
      const params = new URLSearchParams()

      if (filters.namespaces && filters.namespaces.length > 0) {
        // Backend accepts comma-separated namespace values
        params.set('namespace', filters.namespaces.join(','))
      }
      if (filters.health && filters.health.length > 0) {
        params.set('health', filters.health.join(','))
      }
      if (filters.upgradeAvailable !== undefined) {
        params.set('upgradeAvailable', String(filters.upgradeAvailable))
      }
      if (filters.hasDrift !== undefined) {
        params.set('hasDrift', String(filters.hasDrift))
      }
      if (filters.search) {
        params.set('search', filters.search)
      }
      if (filters.page != null) {
        params.set('page', String(filters.page))
      }
      if (filters.pageSize != null) {
        params.set('pageSize', String(filters.pageSize))
      }

      const qs = params.toString()
      return fetchJSON(`/api/v1/releases${qs ? `?${qs}` : ''}`)
    },
  })
}

export function useRelease(namespace: string, name: string) {
  return useQuery<ReleaseDetail>({
    queryKey: ['release', namespace, name],
    queryFn: () => fetchJSON(`/api/v1/releases/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`),
    enabled: Boolean(namespace && name),
  })
}

export function useUpgrades() {
  return useQuery<UpgradeCandidate[]>({
    queryKey: ['upgrades'],
    queryFn: () => fetchJSON('/api/v1/upgrades'),
  })
}

export function useEvents() {
  return useQuery<HelmEvent[]>({
    queryKey: ['events'],
    queryFn: () => fetchJSON('/api/v1/events'),
  })
}
