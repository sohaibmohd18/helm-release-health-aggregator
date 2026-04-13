import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { relativeTime } from './time'

describe('relativeTime', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns "just now" for < 1 minute ago', () => {
    const now = new Date()
    vi.setSystemTime(new Date(now.getTime() + 30_000))
    expect(relativeTime(now.toISOString())).toBe('just now')
  })

  it('returns minutes for < 1 hour ago', () => {
    const now = new Date()
    vi.setSystemTime(new Date(now.getTime() + 5 * 60_000))
    expect(relativeTime(now.toISOString())).toBe('5m ago')
  })

  it('returns hours for < 24 hours ago', () => {
    const now = new Date()
    vi.setSystemTime(new Date(now.getTime() + 3 * 60 * 60_000))
    expect(relativeTime(now.toISOString())).toBe('3h ago')
  })

  it('returns days for >= 24 hours ago', () => {
    const now = new Date()
    vi.setSystemTime(new Date(now.getTime() + 2 * 24 * 60 * 60_000))
    expect(relativeTime(now.toISOString())).toBe('2d ago')
  })
})
