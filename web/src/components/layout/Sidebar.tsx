import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Package, TrendingUp, Radio, Layers, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/',        label: 'Overview',  icon: LayoutDashboard, end: true },
  { to: '/releases', label: 'Releases', icon: Package },
  { to: '/upgrades', label: 'Upgrades', icon: TrendingUp },
  { to: '/events',   label: 'Events',   icon: Radio },
]

const SHORTCUTS: Record<string, string> = {
  '/': 'G O',
  '/releases': 'G R',
  '/upgrades': 'G U',
  '/events': 'G E',
}

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Layers size={15} className="text-primary-foreground" />
        </div>
        <span className="text-base font-semibold tracking-tight">HelmSight</span>
      </div>

      {/* Cluster selector */}
      <div className="border-b px-3 py-2.5">
        <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Cluster
        </p>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
        >
          <span className="flex items-center gap-2 truncate">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="truncate font-medium">eks-prod-us-east-1</span>
          </span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Navigation
        </p>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="flex items-center gap-2.5">
                  <Icon size={16} />
                  {label}
                </span>
                <kbd className={cn(
                  'hidden rounded px-1 py-0.5 font-mono text-[9px] lg:block',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground/70'
                    : 'bg-muted text-muted-foreground group-hover:bg-accent-foreground/10',
                )}>
                  {SHORTCUTS[to]}
                </kbd>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Connected
        </div>
        <p className="text-[10px] text-muted-foreground/60">HelmSight v0.1.0</p>
      </div>
    </aside>
  )
}
