import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useClusterSummary, useNamespaceSummaries, useReleases } from '@/api/client'
import { HEALTH_COLORS, severityScore } from '@/lib/health'
import { HealthBadge } from '@/components/shared/HealthBadge'
import { UpgradeBadge } from '@/components/shared/UpgradeBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Package, TrendingUp, AlertTriangle } from 'lucide-react'
import type { HealthStatus } from '@/types'

// ---------------------------------------------------------------------------
// Custom Recharts tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric summary cards
// ---------------------------------------------------------------------------

interface MetricCardProps {
  title: string
  value: number | string
  sub?: string
  icon: React.ReactNode
  accent?: string
}

function MetricCard({ title, value, sub, icon, accent = 'text-foreground' }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${accent}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
        <Skeleton className="mt-2 h-3 w-24" />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Namespace bar chart
// ---------------------------------------------------------------------------

function NamespaceBarChart() {
  const { data, isLoading } = useNamespaceSummaries()

  if (isLoading || !data) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Releases by Namespace</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    )
  }

  const chartData = data.map(ns => ({
    namespace: ns.namespace,
    releases: ns.releaseCount,
    worstHealth: ns.worstHealth as HealthStatus,
    upgradesAvailable: ns.upgradesAvailable,
  }))

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Releases by Namespace</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="opacity-10" />
            <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="namespace"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={96}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="releases" name="Releases" radius={[0, 4, 4, 0]} maxBarSize={28}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={HEALTH_COLORS[entry.worstHealth]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(Object.entries(HEALTH_COLORS) as [HealthStatus, string][]).map(([h, color]) => (
            <span key={h} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
              {h}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Health donut chart
// ---------------------------------------------------------------------------

function HealthDonutChart() {
  const { data, isLoading } = useClusterSummary()

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Health Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="mx-auto h-48 w-48 rounded-full" />
        </CardContent>
      </Card>
    )
  }

  const pieData = [
    { name: 'Healthy', value: data.healthyReleases, color: HEALTH_COLORS.Healthy },
    { name: 'Degraded', value: data.degradedReleases, color: HEALTH_COLORS.Degraded },
    { name: 'Failed', value: data.failedReleases, color: HEALTH_COLORS.Failed },
    { name: 'Unknown', value: data.unknownReleases, color: HEALTH_COLORS.Unknown },
  ].filter(d => d.value > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Health Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="45%"
              innerRadius={58}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Needs attention panel
// ---------------------------------------------------------------------------

function NeedsAttentionPanel() {
  const { data, isLoading } = useReleases({ pageSize: 100 })

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs Attention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const top5 = [...data.items]
    .sort(
      (a, b) =>
        severityScore(b.health, b.versionStatus.severity, b.driftCount) -
        severityScore(a.health, a.versionStatus.severity, a.driftCount),
    )
    .slice(0, 5)
    .filter(r => severityScore(r.health, r.versionStatus.severity, r.driftCount) > 0)

  if (top5.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Needs Attention</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-4 text-center">
            All releases are healthy and up to date.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Needs Attention</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {top5.map(r => (
          <div key={r.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.namespace}</p>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:block">
                {r.podReady}/{r.podDesired} pods
              </span>
              {r.driftCount > 0 && (
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline">
                  {r.driftCount} drift
                </span>
              )}
              {r.versionStatus.upgradeAvailable && (
                <UpgradeBadge severity={r.versionStatus.severity} />
              )}
              <HealthBadge health={r.health} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar() {
  const { data, isLoading } = useClusterSummary()

  if (isLoading || !data) {
    return (
      <div className="flex flex-wrap gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-40" />
        ))}
      </div>
    )
  }

  const lastScan = new Date(data.lastScanTime).toLocaleString()

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">{data.totalPodsTracked}</span> pods tracked
      </span>
      <span>
        <span className="font-medium text-foreground">{data.totalDriftEntries}</span> drift entries
      </span>
      <span>
        Cluster: <span className="font-medium text-foreground">{data.clusterName}</span>
      </span>
      <span className="ml-auto">Last scan: {lastScan}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { data: summary, isLoading } = useClusterSummary()

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Cluster Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Helm release health across all namespaces
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              title="Total Releases"
              value={summary.totalReleases}
              icon={<Package size={18} />}
            />
            <MetricCard
              title="Healthy"
              value={summary.healthyReleases}
              sub={`${Math.round((summary.healthyReleases / summary.totalReleases) * 100)}% of releases`}
              icon={<Activity size={18} />}
              accent="text-green-600 dark:text-green-400"
            />
            <MetricCard
              title="Degraded / Failed"
              value={summary.degradedReleases + summary.failedReleases}
              sub={`${summary.degradedReleases} degraded, ${summary.failedReleases} failed`}
              icon={<AlertTriangle size={18} />}
              accent={
                summary.failedReleases > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }
            />
            <MetricCard
              title="Upgrades Available"
              value={summary.upgradesAvailable}
              sub={`${summary.majorUpgrades} major · ${summary.minorUpgrades} minor · ${summary.patchUpgrades} patch`}
              icon={<TrendingUp size={18} />}
              accent={summary.majorUpgrades > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}
            />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NamespaceBarChart />
        <HealthDonutChart />
      </div>

      {/* Needs attention */}
      <NeedsAttentionPanel />

      {/* Stats bar */}
      <StatsBar />
    </div>
  )
}
