import { describe, it, expect } from 'vitest'
import {
  HEALTH_COLORS,
  UPGRADE_COLORS,
  healthBadgeClasses,
  upgradeBadgeClasses,
  severityScore,
} from './health'

describe('HEALTH_COLORS', () => {
  it('defines a color for every HealthStatus', () => {
    expect(HEALTH_COLORS.Healthy).toBeTruthy()
    expect(HEALTH_COLORS.Degraded).toBeTruthy()
    expect(HEALTH_COLORS.Failed).toBeTruthy()
    expect(HEALTH_COLORS.Unknown).toBeTruthy()
  })

  it('uses green for Healthy', () => {
    expect(HEALTH_COLORS.Healthy).toMatch(/22c55e/)
  })

  it('uses red for Failed', () => {
    expect(HEALTH_COLORS.Failed).toMatch(/ef4444/)
  })
})

describe('UPGRADE_COLORS', () => {
  it('uses red for major', () => expect(UPGRADE_COLORS.major).toMatch(/ef4444/))
  it('uses amber for minor', () => expect(UPGRADE_COLORS.minor).toMatch(/f59e0b/))
  it('uses blue for patch', () => expect(UPGRADE_COLORS.patch).toMatch(/3b82f6/))
  it('uses green for none', () => expect(UPGRADE_COLORS.none).toMatch(/22c55e/))
})

describe('healthBadgeClasses', () => {
  it('includes green classes for Healthy', () => {
    expect(healthBadgeClasses('Healthy')).toContain('green')
  })
  it('includes amber classes for Degraded', () => {
    expect(healthBadgeClasses('Degraded')).toContain('amber')
  })
  it('includes red classes for Failed', () => {
    expect(healthBadgeClasses('Failed')).toContain('red')
  })
  it('includes gray classes for Unknown', () => {
    expect(healthBadgeClasses('Unknown')).toContain('gray')
  })
})

describe('upgradeBadgeClasses', () => {
  it('includes green for none', () => expect(upgradeBadgeClasses('none')).toContain('green'))
  it('includes blue for patch', () => expect(upgradeBadgeClasses('patch')).toContain('blue'))
  it('includes amber for minor', () => expect(upgradeBadgeClasses('minor')).toContain('amber'))
  it('includes red for major', () => expect(upgradeBadgeClasses('major')).toContain('red'))
})

describe('severityScore', () => {
  it('ranks Failed highest', () => {
    const failed = severityScore('Failed', 'none', 0)
    const degraded = severityScore('Degraded', 'none', 0)
    expect(failed).toBeGreaterThan(degraded)
  })

  it('ranks major upgrade above Degraded', () => {
    const major = severityScore('Healthy', 'major', 0)
    const degraded = severityScore('Degraded', 'none', 0)
    expect(major).toBeGreaterThan(degraded)
  })

  it('ranks drift lowest among non-zero signals', () => {
    const drift = severityScore('Healthy', 'none', 3)
    const patch = severityScore('Healthy', 'patch', 0)
    expect(patch).toBeGreaterThan(drift)
  })

  it('returns 0 for a perfect release', () => {
    expect(severityScore('Healthy', 'none', 0)).toBe(0)
  })

  it('accumulates multiple signals', () => {
    const combined = severityScore('Failed', 'major', 5)
    const failed = severityScore('Failed', 'none', 0)
    expect(combined).toBeGreaterThan(failed)
  })
})
