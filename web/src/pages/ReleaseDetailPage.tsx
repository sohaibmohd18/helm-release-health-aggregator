import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { dump as toYaml } from 'js-yaml'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { RefreshCw, ChevronRight, CheckCircle2, ExternalLink } from 'lucide-react'
import { useRelease } from '@/api/client'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { UpgradeBadge } from '@/components/shared/UpgradeBadge'
import { CopyButton } from '@/components/shared/CopyButton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { ReleaseDetail, ReleaseStatus, DriftSeverity, WorkloadSummary } from '@/types'

// ---------------------------------------------------------------------------
// Dark mode hook
// ---------------------------------------------------------------------------

function useIsDark() {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark'),
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

// ---------------------------------------------------------------------------
// Release status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ReleaseStatus }) {
  const map: Record<ReleaseStatus, string> = {
    deployed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    superseded: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    'pending-install': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'pending-upgrade': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'pending-rollback': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', map[status])}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Drift severity badge
// ---------------------------------------------------------------------------

function DriftSeverityBadge({ severity }: { severity: DriftSeverity }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        severity === 'warning'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      )}
    >
      {severity}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <Skeleton className="h-5 w-48" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-10 w-80" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function WorkloadCard({ wl }: { wl: WorkloadSummary }) {
  const allReady = wl.ready >= wl.desired
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground">{wl.kind}</p>
        <p className="mt-0.5 truncate text-sm font-medium">{wl.name}</p>
        <p className={cn('mt-2 text-2xl font-bold tabular-nums',
          wl.ready === 0 && wl.desired > 0 ? 'text-red-600 dark:text-red-400' :
          !allReady ? 'text-amber-600 dark:text-amber-400' :
          'text-green-600 dark:text-green-400'
        )}>
          {wl.ready}/{wl.desired}
        </p>
        <p className="text-xs text-muted-foreground">ready</p>
      </CardContent>
    </Card>
  )
}

function OverviewTab({ release }: { release: ReleaseDetail }) {
  const fmt = (iso: string) => new Date(iso).toLocaleString()

  return (
    <div className="flex flex-col gap-6">
      {/* Workload cards */}
      {release.workloads.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Workloads</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {release.workloads.map(wl => (
              <WorkloadCard key={`${wl.kind}/${wl.name}`} wl={wl} />
            ))}
          </div>
        </div>
      )}

      {/* Pod table */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Pods ({release.pods.length})
        </h3>
        {release.pods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pods found.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Ready</TableHead>
                  <TableHead>Restarts</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Node</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {release.pods.map(pod => (
                  <TableRow key={pod.name}>
                    <TableCell className="font-mono text-xs">{pod.name}</TableCell>
                    <TableCell>
                      <span className={cn('flex items-center gap-1.5 text-xs',
                        pod.phase === 'Running' ? 'text-green-600 dark:text-green-400' :
                        pod.phase === 'Pending' ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400'
                      )}>
                        <span className={cn('inline-block h-1.5 w-1.5 rounded-full',
                          pod.phase === 'Running' ? 'bg-green-500' :
                          pod.phase === 'Pending' ? 'bg-amber-400' :
                          'bg-red-500'
                        )} />
                        {pod.phase}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={pod.ready ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {pod.ready ? 'Yes' : 'No'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={pod.restarts > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                        {pod.restarts}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{pod.age}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{pod.node}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Release info */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">Release Info</h3>
        <Card>
          <CardContent className="pt-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              {[
                ['Revision', String(release.revision)],
                ['Status', <StatusBadge key="s" status={release.status} />],
                ['App Version', release.appVersion],
                ['Chart', `${release.chartName} ${release.chartVersion}`],
                ['First Deployed', fmt(release.firstDeployed)],
                ['Last Deployed', fmt(release.lastDeployed)],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Values drift
// ---------------------------------------------------------------------------

function DriftTab({ release }: { release: ReleaseDetail }) {
  const isDark = useIsDark()

  if (release.driftCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-16 text-center">
        <CheckCircle2 size={36} className="text-green-500" />
        <p className="mt-3 font-medium">No drift detected</p>
        <p className="mt-1 text-sm text-muted-foreground">
          All deployed values match the chart defaults.
        </p>
      </div>
    )
  }

  const defaultYaml = toYaml(release.chartDefaults)
  const deployedYaml = toYaml(release.deployedValues)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{release.driftCount}</span> value
        {release.driftCount === 1 ? '' : 's'} differ from chart defaults
      </p>

      {/* Drift entries table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key path</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Deployed</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {release.driftEntries.map(d => (
              <TableRow key={d.key}>
                <TableCell className="font-mono text-xs">{d.key}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {d.defaultValue === null ? <span className="italic">—</span> : JSON.stringify(d.defaultValue)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {JSON.stringify(d.userValue)}
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{d.type}</span>
                </TableCell>
                <TableCell>
                  <DriftSeverityBadge severity={d.severity} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* YAML diff viewer */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Full values diff — chart defaults (left) vs deployed (right)
        </h3>
        <div className="overflow-hidden rounded-lg border text-xs">
          <ReactDiffViewer
            oldValue={defaultYaml}
            newValue={deployedYaml}
            splitView
            compareMethod={DiffMethod.WORDS}
            useDarkTheme={isDark}
            leftTitle="Chart defaults"
            rightTitle="Deployed values"
            styles={{
              variables: {
                dark: { diffViewerBackground: '#1c1c1c' },
                light: { diffViewerBackground: '#ffffff' },
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Version history
// ---------------------------------------------------------------------------

function HistoryTab({ release }: { release: ReleaseDetail }) {
  return (
    <div className="flex flex-col gap-0">
      {release.history.map((rev, i) => {
        const isCurrent = rev.revision === release.revision
        return (
          <div key={rev.revision} className="flex gap-4">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'mt-3.5 h-3 w-3 shrink-0 rounded-full border-2',
                isCurrent
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground/30 bg-background',
              )} />
              {i < release.history.length - 1 && (
                <div className="w-0.5 flex-1 bg-border" />
              )}
            </div>

            {/* Content */}
            <div className={cn(
              'mb-4 flex-1 rounded-lg border p-4',
              isCurrent && 'border-primary/30 bg-primary/5',
            )}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Revision {rev.revision}</span>
                {isCurrent && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    current
                  </span>
                )}
                <StatusBadge status={rev.status} />
                <span className="font-mono text-xs text-muted-foreground">{rev.chartVersion}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{new Date(rev.deployedAt).toLocaleString()}</span>
                {rev.deployedBy && <span>by {rev.deployedBy}</span>}
                {rev.description && <span>{rev.description}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Upgrade advisor
// ---------------------------------------------------------------------------

function UpgradeTab({ release }: { release: ReleaseDetail }) {
  const { versionStatus, name, namespace, chartName } = release

  if (!versionStatus.upgradeAvailable) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border py-16 text-center">
        <CheckCircle2 size={36} className="text-green-500" />
        <p className="mt-3 font-medium">Up to date</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {name} is running the latest chart version ({versionStatus.deployed}).
        </p>
      </div>
    )
  }

  const upgradeCmd = `helm upgrade ${name} ${chartName} --version ${versionStatus.latest} -n ${namespace}`

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-amber-200 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Upgrade available
            <UpgradeBadge severity={versionStatus.severity} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-muted-foreground">Current version</p>
              <p className="mt-0.5 font-mono font-medium">{versionStatus.deployed}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Latest version</p>
              <p className="mt-0.5 font-mono font-medium text-green-600 dark:text-green-400">
                {versionStatus.latest}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Versions behind</p>
              <p className="mt-0.5 font-medium">{versionStatus.skippedVersions}</p>
            </div>
          </div>

          {versionStatus.changelogUrl && (
            <a
              href={versionStatus.changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4 hover:no-underline"
            >
              View changelog <ExternalLink size={12} />
            </a>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Upgrade command</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs">
                {upgradeCmd}
              </code>
              <CopyButton text={upgradeCmd} label="Copy command" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReleaseDetailPage() {
  const { namespace = '', name = '' } = useParams<{ namespace: string; name: string }>()
  const navigate = useNavigate()
  const { data: release, isLoading, isError } = useRelease(namespace, name)

  if (isLoading) return <DetailSkeleton />

  if (isError || !release) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="font-medium">Release not found</p>
        <p className="mt-1 text-sm text-muted-foreground">{namespace}/{name}</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/releases')}>
          Back to releases
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/releases" className="hover:text-foreground">Releases</Link>
        <ChevronRight size={14} />
        <span className="text-muted-foreground">{namespace}</span>
        <ChevronRight size={14} />
        <span className="font-medium text-foreground">{name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{release.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {release.namespace}
            </span>
            <span className="text-muted-foreground">
              {release.chartName} {release.chartVersion}
            </span>
            <HealthBadge health={release.health} />
            <StatusBadge status={release.status} />
            <span className="text-muted-foreground text-xs">
              Last deployed {relativeTime(release.lastDeployed)}
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" disabled>
          <RefreshCw size={14} />
          Trigger refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="drift">
            Values Drift
            {release.driftCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                {release.driftCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Version History</TabsTrigger>
          <TabsTrigger value="upgrade">
            Upgrade Advisor
            {release.versionStatus.upgradeAvailable && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                {release.versionStatus.severity}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <OverviewTab release={release} />
          </TabsContent>
          <TabsContent value="drift">
            <DriftTab release={release} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab release={release} />
          </TabsContent>
          <TabsContent value="upgrade">
            <UpgradeTab release={release} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
