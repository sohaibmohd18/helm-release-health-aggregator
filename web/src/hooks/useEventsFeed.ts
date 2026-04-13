/**
 * useEventsFeed — mock implementation of the live event stream.
 *
 * Exposes the same shape that the real WebSocket hook (Part 16) will expose:
 *   { events, connected, clearEvents }
 *
 * In Part 16, swap the body of this hook for a real WebSocket connection.
 * No component code changes required.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { mockEvents, mockReleases } from '@/api/mock'
import type { HelmEvent, EventType } from '@/types'

// ---------------------------------------------------------------------------
// Random event generator — same schema as real WS messages
// ---------------------------------------------------------------------------

let idCounter = 1000

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

const EVENT_TEMPLATES: Array<{
  type: EventType
  severity: HelmEvent['severity']
  descFn: (name: string) => string
  delta?: HelmEvent['delta']
}> = [
  {
    type: 'reconciled',
    severity: 'info',
    descFn: name => `Release ${name} reconciled successfully`,
  },
  {
    type: 'health_changed',
    severity: 'warning',
    descFn: name => `Health changed for ${name}: Healthy → Degraded`,
    delta: { health: 'Degraded', previousHealth: 'Healthy' },
  },
  {
    type: 'health_changed',
    severity: 'error',
    descFn: name => `Health changed for ${name}: Degraded → Failed`,
    delta: { health: 'Failed', previousHealth: 'Degraded' },
  },
  {
    type: 'upgrade_available',
    severity: 'warning',
    descFn: name => `New chart version available for ${name}`,
    delta: { upgradeAvailable: true, latestVersion: '99.0.0' },
  },
  {
    type: 'drift_detected',
    severity: 'warning',
    descFn: name => `Values drift detected in ${name}: 2 keys changed`,
  },
  {
    type: 'error',
    severity: 'error',
    descFn: name => `Pod crash loop detected in ${name}`,
  },
]

function generateEvent(): HelmEvent {
  const release = randomItem(mockReleases)
  const tpl = randomItem(EVENT_TEMPLATES)
  return {
    id: `evt-gen-${idCounter++}`,
    type: tpl.type,
    namespace: release.namespace,
    release: release.name,
    timestamp: new Date().toISOString(),
    description: tpl.descFn(release.name),
    severity: tpl.severity,
    delta: tpl.delta,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface EventFeedState {
  events: HelmEvent[]
  connected: boolean
  clearEvents: () => void
}

export function useEventsFeed(): EventFeedState {
  const [events, setEvents] = useState<HelmEvent[]>([...mockEvents])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulate a WebSocket connection — always "Connected" in mock mode
  const connected = true

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setEvents(prev => [generateEvent(), ...prev])
    }, 8_000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, connected, clearEvents }
}
