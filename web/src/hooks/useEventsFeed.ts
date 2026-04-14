/**
 * useEventsFeed — real WebSocket connection to /api/v1/ws/events.
 *
 * Exposes the same shape as the mock implementation:
 *   { events, connected, clearEvents }
 *
 * Reconnects automatically with capped exponential backoff (1 s → 30 s).
 * The Vite dev proxy (vite.config.ts server.proxy) forwards the WS upgrade
 * to the Go backend, so no CORS configuration is needed in development.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HelmEvent } from '@/types'

// Maximum number of events kept in memory.
const MAX_EVENTS = 500

// Build the WebSocket URL from the current page origin so it works both in
// development (proxied by Vite) and in production (same-origin serving).
function wsURL(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/api/v1/ws/events`
}

export interface EventFeedState {
  events: HelmEvent[]
  connected: boolean
  clearEvents: () => void
}

export function useEventsFeed(): EventFeedState {
  const [events, setEvents] = useState<HelmEvent[]>([])
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(1_000)
  const unmounted = useRef(false)

  const connect = useCallback(() => {
    if (unmounted.current) return

    const ws = new WebSocket(wsURL())
    wsRef.current = ws

    ws.onopen = () => {
      if (unmounted.current) { ws.close(); return }
      setConnected(true)
      retryDelay.current = 1_000 // reset backoff on success
    }

    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const event = JSON.parse(ev.data) as HelmEvent
        setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS))
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      if (unmounted.current) return
      setConnected(false)
      // Exponential backoff capped at 30 s
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
        connect()
      }, retryDelay.current)
    }

    ws.onerror = () => {
      // onclose fires after onerror — reconnect logic is handled there
      ws.close()
    }
  }, [])

  useEffect(() => {
    unmounted.current = false
    connect()
    return () => {
      unmounted.current = true
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { events, connected, clearEvents }
}
