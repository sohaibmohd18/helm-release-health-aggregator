import { describe, it, expect } from 'vitest'
import {
  mockReleases,
  mockReleaseDetails,
  mockClusterSummary,
  mockNamespaceSummaries,
  mockEvents,
  mockUpgradeCandidates,
} from './mock'

describe('mockReleases — data invariants', () => {
  it('has exactly 12 releases', () => {
    expect(mockReleases).toHaveLength(12)
  })

  it('has at least 2 Failed releases', () => {
    const failed = mockReleases.filter(r => r.health === 'Failed')
    expect(failed.length).toBeGreaterThanOrEqual(2)
  })

  it('has at least 3 Degraded releases', () => {
    const degraded = mockReleases.filter(r => r.health === 'Degraded')
    expect(degraded.length).toBeGreaterThanOrEqual(3)
  })

  it('has at least 4 major upgrades', () => {
    const major = mockReleases.filter(r => r.versionStatus.severity === 'major')
    expect(major.length).toBeGreaterThanOrEqual(4)
  })

  it('has at least 3 releases with drift', () => {
    const drifted = mockReleases.filter(r => r.driftCount > 0)
    expect(drifted.length).toBeGreaterThanOrEqual(3)
  })

  it('has at least 1 perfect release (healthy, current, no drift)', () => {
    const perfect = mockReleases.filter(
      r => r.health === 'Healthy' && !r.versionStatus.upgradeAvailable && r.driftCount === 0,
    )
    expect(perfect.length).toBeGreaterThanOrEqual(1)
  })

  it('id is namespace/name for every release', () => {
    for (const r of mockReleases) {
      expect(r.id).toBe(`${r.namespace}/${r.name}`)
    }
  })

  it('podReady <= podDesired for every release', () => {
    for (const r of mockReleases) {
      expect(r.podReady).toBeLessThanOrEqual(r.podDesired)
    }
  })

  it('covers exactly 4 namespaces', () => {
    const ns = new Set(mockReleases.map(r => r.namespace))
    expect(ns.size).toBe(4)
    expect(ns).toContain('monitoring')
    expect(ns).toContain('ingress-nginx')
    expect(ns).toContain('cert-manager')
    expect(ns).toContain('default')
  })
})

describe('mockReleaseDetails', () => {
  it('has a detail entry for every release', () => {
    for (const r of mockReleases) {
      expect(mockReleaseDetails[r.id]).toBeDefined()
    }
  })

  it('detail driftEntries count matches release driftCount', () => {
    for (const r of mockReleases) {
      const detail = mockReleaseDetails[r.id]
      expect(detail.driftEntries).toHaveLength(r.driftCount)
    }
  })

  it('detail extends base release fields', () => {
    const detail = mockReleaseDetails['monitoring/grafana']
    expect(detail.name).toBe('grafana')
    expect(detail.pods).toBeDefined()
    expect(detail.workloads).toBeDefined()
    expect(detail.history).toBeDefined()
  })
})

describe('mockClusterSummary', () => {
  it('totalReleases matches mockReleases length', () => {
    expect(mockClusterSummary.totalReleases).toBe(mockReleases.length)
  })

  it('health counts sum to totalReleases', () => {
    const { healthyReleases, degradedReleases, failedReleases, unknownReleases, totalReleases } = mockClusterSummary
    expect(healthyReleases + degradedReleases + failedReleases + unknownReleases).toBe(totalReleases)
  })

  it('clusterName is set', () => {
    expect(mockClusterSummary.clusterName).toBeTruthy()
  })
})

describe('mockNamespaceSummaries', () => {
  it('has one entry per unique namespace', () => {
    const ns = new Set(mockReleases.map(r => r.namespace))
    expect(mockNamespaceSummaries).toHaveLength(ns.size)
  })

  it('releaseCount per namespace is correct', () => {
    for (const summary of mockNamespaceSummaries) {
      const count = mockReleases.filter(r => r.namespace === summary.namespace).length
      expect(summary.releaseCount).toBe(count)
    }
  })
})

describe('mockEvents', () => {
  it('has events', () => {
    expect(mockEvents.length).toBeGreaterThan(0)
  })

  it('every event has required fields', () => {
    for (const e of mockEvents) {
      expect(e.id).toBeTruthy()
      expect(e.type).toBeTruthy()
      expect(e.namespace).toBeTruthy()
      expect(e.release).toBeTruthy()
      expect(e.timestamp).toBeTruthy()
      expect(e.description).toBeTruthy()
      expect(['info', 'warning', 'error']).toContain(e.severity)
    }
  })
})

describe('mockUpgradeCandidates', () => {
  it('only contains releases with upgradeAvailable=true', () => {
    for (const c of mockUpgradeCandidates) {
      expect(c.release.versionStatus.upgradeAvailable).toBe(true)
    }
  })

  it('helmUpgradeCommand includes release name and namespace', () => {
    for (const c of mockUpgradeCandidates) {
      expect(c.helmUpgradeCommand).toContain(c.release.name)
      expect(c.helmUpgradeCommand).toContain(c.release.namespace)
      expect(c.helmUpgradeCommand).toContain(c.release.versionStatus.latest)
    }
  })

  it('is sorted major first', () => {
    const severities = mockUpgradeCandidates.map(c => c.release.versionStatus.severity)
    const majorIdx = severities.lastIndexOf('major')
    const minorIdx = severities.indexOf('minor')
    if (majorIdx >= 0 && minorIdx >= 0) {
      expect(majorIdx).toBeLessThan(minorIdx)
    }
  })
})
