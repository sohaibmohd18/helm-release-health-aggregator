import { useEffect, useMemo, useRef, useState } from 'react'
import { Wifi, WifiOff, Trash2, PauseCircle, PlayCircle } from 'lucide-react'
import { useEventsFeed } from '@/hooks/useEventsFeed'
import { MultiSelect } from '@/components/shared/MultiSelect'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EventType, HelmEvent } from '@/types'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: 'reconciled',        label: 'Reconciled' },
  { value: 'health_changed',    label: 'Health changed' },
  { value: 'upgrade_available', label: 'Upgrade available' },
  { value: 'drift_detected',    label: 'Drift detected' },
  { value: 'error',             label: 'Error' },
]

const SEVERITY_OPTIONS = [
  { value: 'info',    label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error',   label: 'Error' },
]

// ---------------------------------------------------------------------------
// Event type badge
// ---------------------------------------------------------------------------

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  reconciled:        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  health_changed:    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  upgrade_available: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  drift_detected:    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  error:             'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  reconciled:        'Reconciled',
  health_changed:    'Health changed',
  upgrade_available: 'Upgrade available',
  drift_detected:    'Drift detected',
  error:             'Error',
}

function EventTypeBadge({ type }: { type: EventType }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      EVENT_TYPE_STYLES[type],
    )}>
      {EVENT_TYPE_LABELS[type]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Severity dot
// ---------------------------------------------------------------------------

const SEVERITY_DOT: Record<HelmEvent['severity'], string> = {
  info:    'bg-blue-400',
  warning: 'bg-amber-400',
  error:   'bg-red-500',
}

const SEVERITY_BORDER: Record<HelmEvent['severity'], string> = {
  info:    'border-l-blue-400',
  warning: 'border-l-amber-400',
  error:   'border-l-red-500',
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className={cn(
      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
      connected
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse',
        connected ? 'bg-green-500' : 'bg-red-500',
      )} />
      {connected ? 'Connected' : 'Disconnected'}
      {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------

function EventCard({ event }: { event: HelmEvent }) {
  const time = new Date(event.timestamp)
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const isToday = time.toDateString() === new Date().toDateString()

  return (
    <div className={cn(
      'flex gap-3 rounded-lg border border-l-4 bg-card px-4 py-3 transition-all',
      SEVERITY_BORDER[event.severity],
    )}>
      {/* Severity dot */}
      <div className="mt-1.5 shrink-0">
        <span className={cn('block h-2 w-2 rounded-full', SEVERITY_DOT[event.severity])} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <EventTypeBadge type={event.type} />
          <span className="text-sm font-medium">{event.release}</span>
          <span className="text-xs text-muted-foreground">
            {event.namespace}
          </span>
          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {isToday ? timeStr : `${dateStr} ${timeStr}`}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>

        {/* Delta info */}
        {event.delta && (
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {event.delta.previousHealth && event.delta.health && (
              <span>
                {event.delta.previousHealth}
                <span className="mx-1 text-muted-foreground/50">→</span>
                {event.delta.health}
              </span>
            )}
            {event.delta.latestVersion && (
              <span>Latest: <span className="font-mono">{event.delta.latestVersion}</span></span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border py-20 text-center">
      <p className="font-medium">No events</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters ? 'No events match the current filters.' : 'Waiting for cluster events…'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EventsPage() {
  const { events, connected, clearEvents } = useEventsFeed()

  // Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([])

  // Auto-scroll
  const [autoScroll, setAutoScroll] = useState(true)
  const feedRef = useRef<HTMLDivElement>(null)
  const isManualScrolling = useRef(false)

  // Namespace options derived from current events
  const namespaceOptions = useMemo(() => {
    const ns = [...new Set(events.map(e => e.namespace))].sort()
    return ns.map(n => ({ value: n, label: n }))
  }, [events])

  // Filter events
  const filtered = useMemo(() => {
    let result = events
    if (selectedTypes.length > 0)      result = result.filter(e => selectedTypes.includes(e.type))
    if (selectedNamespaces.length > 0) result = result.filter(e => selectedNamespaces.includes(e.namespace))
    if (selectedSeverities.length > 0) result = result.filter(e => selectedSeverities.includes(e.severity))
    return result
  }, [events, selectedTypes, selectedNamespaces, selectedSeverities])

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (!autoScroll || !feedRef.current) return
    feedRef.current.scrollTo({ top: 0, behavior: 'smooth' })
  }, [events.length, autoScroll])

  // Pause auto-scroll when user scrolls down, resume at top
  function handleScroll() {
    if (!feedRef.current || isManualScrolling.current) return
    const atTop = feedRef.current.scrollTop < 40
    if (!atTop && autoScroll)  setAutoScroll(false)
    if (atTop && !autoScroll)  setAutoScroll(true)
  }

  const hasFilters = selectedTypes.length > 0 || selectedNamespaces.length > 0 || selectedSeverities.length > 0

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Live Events Feed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time cluster events — {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatus connected={connected} />
          <Button
            variant={autoScroll ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setAutoScroll(v => !v)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {autoScroll
              ? <><PauseCircle size={14} /> Auto-scroll</>
              : <><PlayCircle size={14} /> Auto-scroll</>
            }
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={clearEvents}
          >
            <Trash2 size={14} />
            Clear
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          options={EVENT_TYPE_OPTIONS}
          value={selectedTypes}
          onChange={setSelectedTypes}
          placeholder="Event type"
          className="w-[170px]"
        />
        <MultiSelect
          options={namespaceOptions}
          value={selectedNamespaces}
          onChange={setSelectedNamespaces}
          placeholder="Namespace"
          className="w-[150px]"
        />
        <MultiSelect
          options={SEVERITY_OPTIONS}
          value={selectedSeverities}
          onChange={setSelectedSeverities}
          placeholder="Severity"
          className="w-[130px]"
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setSelectedTypes([])
              setSelectedNamespaces([])
              setSelectedSeverities([])
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className="flex flex-col gap-2 pb-4">
            {filtered.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
