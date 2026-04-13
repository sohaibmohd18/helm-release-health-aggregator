import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ArrowRight } from 'lucide-react'
import { useReleases } from '@/api/client'
import { useNamespaceSummaries } from '@/api/client'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { UpgradeBadge } from '@/components/shared/UpgradeBadge'
import { MultiSelect } from '@/components/shared/MultiSelect'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { Release, HealthStatus, UpgradeSeverity } from '@/types'

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type SortCol =
  | 'name'
  | 'namespace'
  | 'chart'
  | 'deployedVersion'
  | 'versionGap'
  | 'health'
  | 'podRatio'
  | 'driftCount'
  | 'lastReconciled'

const SEVERITY_ORDER: Record<UpgradeSeverity, number> = { major: 3, minor: 2, patch: 1, none: 0 }
const HEALTH_ORDER: Record<HealthStatus, number> = { Failed: 3, Degraded: 2, Unknown: 1, Healthy: 0 }

function sortReleases(items: Release[], col: SortCol, dir: 'asc' | 'desc'): Release[] {
  return [...items].sort((a, b) => {
    let cmp = 0
    switch (col) {
      case 'name':            cmp = a.name.localeCompare(b.name); break
      case 'namespace':       cmp = a.namespace.localeCompare(b.namespace); break
      case 'chart':           cmp = a.chartName.localeCompare(b.chartName); break
      case 'deployedVersion': cmp = a.chartVersion.localeCompare(b.chartVersion); break
      case 'versionGap':      cmp = SEVERITY_ORDER[a.versionStatus.severity] - SEVERITY_ORDER[b.versionStatus.severity]; break
      case 'health':          cmp = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health]; break
      case 'podRatio': {
        const ra = a.podDesired ? a.podReady / a.podDesired : 0
        const rb = b.podDesired ? b.podReady / b.podDesired : 0
        cmp = ra - rb
        break
      }
      case 'driftCount':      cmp = a.driftCount - b.driftCount; break
      case 'lastReconciled':  cmp = new Date(a.lastReconciled).getTime() - new Date(b.lastReconciled).getTime(); break
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

// ---------------------------------------------------------------------------
// Sort header
// ---------------------------------------------------------------------------

interface SortHeaderProps {
  col: SortCol
  current: SortCol
  dir: 'asc' | 'desc'
  onClick: (col: SortCol) => void
  children: React.ReactNode
  className?: string
}

function SortHeader({ col, current, dir, onClick, children, className }: SortHeaderProps) {
  const active = col === current
  return (
    <TableHead
      className={cn('cursor-pointer select-none whitespace-nowrap', className)}
      onClick={() => onClick(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        {active ? (
          dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        ) : (
          <ChevronsUpDown size={14} className="text-muted-foreground/50" />
        )}
      </span>
    </TableHead>
  )
}

// ---------------------------------------------------------------------------
// Row left-border accent
// ---------------------------------------------------------------------------

function rowAccent(health: HealthStatus) {
  if (health === 'Failed') return 'border-l-4 border-l-red-500'
  if (health === 'Degraded') return 'border-l-4 border-l-amber-400'
  return 'border-l-4 border-l-transparent'
}

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-4 w-10" /></TableCell>
          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-7 w-7 rounded-md" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (ps: number) => void
}

function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = Math.min((page - 1) * pageSize + 1, total)
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-1 py-3 text-sm">
      <span className="text-muted-foreground">
        {total === 0 ? 'No results' : `${start}–${end} of ${total} releases`}
      </span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Rows</span>
          <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPage(1) }}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            ‹
          </Button>
          <span className="min-w-[80px] text-center text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={11} className="py-16 text-center">
        <p className="font-medium text-foreground">No releases found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters ? 'Try adjusting or clearing your filters.' : 'No Helm releases detected in the cluster.'}
        </p>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const HEALTH_OPTIONS = [
  { value: 'Healthy', label: 'Healthy' },
  { value: 'Degraded', label: 'Degraded' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Unknown', label: 'Unknown' },
]

export default function ReleasesPage() {
  const navigate = useNavigate()

  // Filter state
  const [search, setSearch] = useState('')
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
  const [selectedHealth, setSelectedHealth] = useState<string[]>([])
  const [upgradeOnly, setUpgradeOnly] = useState(false)
  const [driftOnly, setDriftOnly] = useState(false)

  // Sort state
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Namespace options for filter
  const { data: nsSummaries } = useNamespaceSummaries()
  const namespaceOptions = useMemo(
    () => (nsSummaries ?? []).map(ns => ({ value: ns.namespace, label: ns.namespace })),
    [nsSummaries],
  )

  // Fetch all filtered data (sorting + pagination done client-side)
  const { data, isLoading } = useReleases({
    namespaces: selectedNamespaces,
    health: selectedHealth,
    upgradeAvailable: upgradeOnly ? true : undefined,
    hasDrift: driftOnly ? true : undefined,
    search,
    pageSize: 100,
  })

  // Sort
  const sorted = useMemo(
    () => (data ? sortReleases(data.items, sortCol, sortDir) : []),
    [data, sortCol, sortDir],
  )

  // Paginate
  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  // Reset to page 1 when filters or sort change
  useEffect(() => { setPage(1) }, [search, selectedNamespaces, selectedHealth, upgradeOnly, driftOnly, sortCol])

  function handleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const hasFilters =
    search !== '' ||
    selectedNamespaces.length > 0 ||
    selectedHealth.length > 0 ||
    upgradeOnly ||
    driftOnly

  function clearFilters() {
    setSearch('')
    setSelectedNamespaces([])
    setSelectedHealth([])
    setUpgradeOnly(false)
    setDriftOnly(false)
  }

  const sortProps = { current: sortCol, dir: sortDir, onClick: handleSort }

  return (
    <div className="flex flex-col gap-4 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Release Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All Helm releases across all namespaces
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search releases or charts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <MultiSelect
          options={namespaceOptions}
          value={selectedNamespaces}
          onChange={setSelectedNamespaces}
          placeholder="Namespace"
          className="w-[160px]"
        />
        <MultiSelect
          options={HEALTH_OPTIONS}
          value={selectedHealth}
          onChange={setSelectedHealth}
          placeholder="Health"
          className="w-[140px]"
        />
        <Button
          variant={upgradeOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => setUpgradeOnly(v => !v)}
        >
          Upgrades only
        </Button>
        <Button
          variant={driftOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9"
          onClick={() => setDriftOnly(v => !v)}
        >
          Has drift
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader col="namespace" {...sortProps}>Namespace</SortHeader>
              <SortHeader col="name" {...sortProps}>Release</SortHeader>
              <SortHeader col="chart" {...sortProps}>Chart</SortHeader>
              <SortHeader col="deployedVersion" {...sortProps}>Deployed</SortHeader>
              <TableHead>Latest</TableHead>
              <SortHeader col="versionGap" {...sortProps}>Gap</SortHeader>
              <SortHeader col="health" {...sortProps}>Health</SortHeader>
              <SortHeader col="podRatio" {...sortProps}>Pods</SortHeader>
              <SortHeader col="driftCount" {...sortProps} className="text-center">Drift</SortHeader>
              <SortHeader col="lastReconciled" {...sortProps}>Reconciled</SortHeader>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows count={8} />
            ) : paginated.length === 0 ? (
              <EmptyState hasFilters={hasFilters} />
            ) : (
              paginated.map(r => (
                <TableRow
                  key={r.id}
                  className={cn('cursor-pointer hover:bg-muted/50', rowAccent(r.health))}
                  onClick={() => navigate(`/releases/${r.namespace}/${r.name}`)}
                >
                  <TableCell className="text-muted-foreground text-xs">{r.namespace}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{r.chartName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.chartVersion}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.versionStatus.latest}
                  </TableCell>
                  <TableCell>
                    <UpgradeBadge severity={r.versionStatus.severity} />
                  </TableCell>
                  <TableCell>
                    <HealthBadge health={r.health} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-sm tabular-nums',
                        r.podReady < r.podDesired ? 'text-amber-600 dark:text-amber-400' : '',
                        r.podReady === 0 && r.podDesired > 0 ? 'text-red-600 dark:text-red-400' : '',
                      )}
                    >
                      {r.podReady}/{r.podDesired}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {r.driftCount > 0 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {r.driftCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {relativeTime(r.lastReconciled)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={e => { e.stopPropagation(); navigate(`/releases/${r.namespace}/${r.name}`) }}
                    >
                      <ArrowRight size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={sorted.length}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      )}
    </div>
  )
}
