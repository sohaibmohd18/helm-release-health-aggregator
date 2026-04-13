import { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowRight, CheckCircle2, ArrowUpDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUpgrades } from '@/api/client'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { CopyButton } from '@/components/shared/CopyButton'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { UpgradeCandidate, UpgradeSeverity } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortMode = 'behind' | 'name'

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  Exclude<UpgradeSeverity, 'none'>,
  { label: string; headerClass: string; countClass: string; dotClass: string }
> = {
  major: {
    label: 'Major',
    headerClass: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    countClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    dotClass: 'bg-red-500',
  },
  minor: {
    label: 'Minor',
    headerClass: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    countClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    dotClass: 'bg-amber-400',
  },
  patch: {
    label: 'Patch',
    headerClass: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    countClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
}

// ---------------------------------------------------------------------------
// Sort candidates
// ---------------------------------------------------------------------------

function sortCandidates(items: UpgradeCandidate[], mode: SortMode): UpgradeCandidate[] {
  return [...items].sort((a, b) => {
    if (mode === 'behind') {
      return b.release.versionStatus.skippedVersions - a.release.versionStatus.skippedVersions
    }
    return a.release.name.localeCompare(b.release.name)
  })
}

// ---------------------------------------------------------------------------
// Upgrade entry row (table row — shares colgroup with sibling sections)
// ---------------------------------------------------------------------------

function UpgradeRow({ candidate }: { candidate: UpgradeCandidate }) {
  const navigate = useNavigate()
  const { release, helmUpgradeCommand } = candidate
  const { versionStatus } = release

  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/40 cursor-pointer"
      onClick={() => navigate(`/releases/${release.namespace}/${release.name}`)}
    >
      <td className="px-4 py-3">
        <p className="text-sm font-medium">{release.name}</p>
        <p className="text-xs text-muted-foreground">{release.namespace}</p>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-0">
        {release.chartName}
      </td>
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
        <span className="text-muted-foreground">{versionStatus.deployed}</span>
        <ArrowRight size={11} className="mx-1.5 inline text-muted-foreground/50" />
        <span className="font-medium text-green-600 dark:text-green-400">{versionStatus.latest}</span>
      </td>
      <td className="px-4 py-3 text-center text-xs text-muted-foreground tabular-nums">
        {versionStatus.skippedVersions}
      </td>
      <td className="px-4 py-3">
        <HealthBadge health={release.health} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
          <CopyButton text={helmUpgradeCommand} label="Copy cmd" size="sm" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigate(`/releases/${release.namespace}/${release.name}`)}
          >
            <ArrowRight size={13} />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Section group — renders two <tbody> elements inside a shared parent table
// ---------------------------------------------------------------------------

interface SectionBodyProps {
  severity: Exclude<UpgradeSeverity, 'none'>
  candidates: UpgradeCandidate[]
}

function SectionBody({ severity, candidates }: SectionBodyProps) {
  const [open, setOpen] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('behind')
  const cfg = SEVERITY_CONFIG[severity]
  const sorted = sortCandidates(candidates, sortMode)

  return (
    <>
      {/* Section header row — spans all columns */}
      <tbody>
        <tr className={cn('border-b', cfg.headerClass)}>
          <td colSpan={6} className="px-4 py-0">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="flex flex-1 items-center gap-2 py-3 text-left"
                onClick={() => setOpen(o => !o)}
              >
                <span className={cn('h-2 w-2 rounded-full', cfg.dotClass)} />
                <span className="text-sm font-semibold">{cfg.label} upgrades</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.countClass)}>
                  {candidates.length}
                </span>
                {open ? <ChevronDown size={15} className="ml-1" /> : <ChevronRight size={15} className="ml-1" />}
              </button>
              {open && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSortMode(m => (m === 'behind' ? 'name' : 'behind'))}
                >
                  <ArrowUpDown size={11} />
                  {sortMode === 'behind' ? 'By versions behind' : 'By name'}
                </button>
              )}
            </div>
          </td>
        </tr>
      </tbody>

      {/* Data rows */}
      {open && (
        <tbody>
          {sorted.map(c => (
            <UpgradeRow key={c.release.id} candidate={c} />
          ))}
        </tbody>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function UpgradesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-full rounded-lg" />
      {[5, 3, 2].map((n, i) => (
        <div key={i} className="overflow-hidden rounded-lg border">
          <Skeleton className="h-11 w-full rounded-none" />
          {Array.from({ length: n }).map((_, j) => (
            <div key={j} className="flex items-center gap-4 border-b px-4 py-3 last:border-0">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Exclude<UpgradeSeverity, 'none'>[] = ['major', 'minor', 'patch']

export default function UpgradesPage() {
  const { data: candidates, isLoading } = useUpgrades()

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-semibold">Upgrade Advisor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Releases with available chart upgrades</p>
        </div>
        <UpgradesSkeleton />
      </div>
    )
  }

  const grouped = {
    major: (candidates ?? []).filter(c => c.release.versionStatus.severity === 'major'),
    minor: (candidates ?? []).filter(c => c.release.versionStatus.severity === 'minor'),
    patch: (candidates ?? []).filter(c => c.release.versionStatus.severity === 'patch'),
  }

  const total = (candidates ?? []).length

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Upgrade Advisor</h1>
        <p className="mt-1 text-sm text-muted-foreground">Releases with available chart upgrades</p>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border py-24 text-center">
          <CheckCircle2 size={40} className="text-green-500" />
          <p className="mt-3 text-lg font-medium">All releases up to date</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every release is running the latest available chart version.
          </p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            {SEVERITY_ORDER.map(s => {
              const count = grouped[s].length
              const cfg = SEVERITY_CONFIG[s]
              return (
                <span key={s} className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full', cfg.dotClass)} />
                  <span className="font-semibold">{count}</span>
                  <span className="text-muted-foreground">{cfg.label.toLowerCase()}</span>
                </span>
              )
            })}
            <span className="ml-auto text-muted-foreground">
              <span className="font-medium text-foreground">{total}</span> total pending
            </span>
          </div>

          {/* Single table — all sections share one colgroup for perfect alignment */}
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[24%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/20 text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Release</th>
                  <th className="px-4 py-2 text-left font-medium">Chart</th>
                  <th className="px-4 py-2 text-left font-medium">Version</th>
                  <th className="px-4 py-2 text-center font-medium">Behind</th>
                  <th className="px-4 py-2 text-left font-medium">Health</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              {SEVERITY_ORDER.filter(s => grouped[s].length > 0).map(s => (
                <SectionBody key={s} severity={s} candidates={grouped[s]} />
              ))}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
