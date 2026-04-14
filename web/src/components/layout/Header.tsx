import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

function getInitialDark(): boolean {
  try {
    const saved = localStorage.getItem('helmsights-theme')
    if (saved) return saved === 'dark'
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('helmsights-theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(getInitialDark)

  useEffect(() => { applyDark(isDark) }, [isDark])

  // Apply on first mount without waiting for state setter
  useEffect(() => { applyDark(getInitialDark()) }, [])

  return [isDark, setIsDark] as const
}

// ---------------------------------------------------------------------------
// Page title map
// ---------------------------------------------------------------------------

function usePageTitle(): string {
  const { pathname } = useLocation()
  if (pathname === '/') return 'Cluster Overview'
  if (pathname === '/releases') return 'Release Inventory'
  if (pathname === '/upgrades') return 'Upgrade Advisor'
  if (pathname === '/events') return 'Live Events Feed'
  if (pathname.startsWith('/releases/')) {
    const parts = pathname.split('/').filter(Boolean)
    if (parts.length === 3) return `${parts[1]} / ${parts[2]}`
  }
  return 'HelmSight'
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

function useCountdown(from: number) {
  const [count, setCount] = useState(from)
  useEffect(() => {
    const t = setInterval(() => setCount(c => (c <= 1 ? from : c - 1)), 1000)
    return () => clearInterval(t)
  }, [from])
  return count
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface Props {
  isDark: boolean
  onToggleDark: () => void
}

export function Header({ isDark, onToggleDark }: Props) {
  const title = usePageTitle()
  const countdown = useCountdown(60)
  const [spinning, setSpinning] = useState(false)

  function handleRefresh() {
    setSpinning(true)
    setTimeout(() => setSpinning(false), 800)
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-6">
      <h2 className="text-sm font-semibold">{title}</h2>

      <div className="flex items-center gap-2">
        {/* Countdown */}
        <span className="hidden text-xs text-muted-foreground sm:block">
          Next scan in{' '}
          <span className="tabular-nums font-medium text-foreground">{countdown}s</span>
        </span>

        {/* Refresh */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} title="Refresh">
          <RefreshCw size={14} className={cn(spinning && 'animate-spin')} />
        </Button>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onToggleDark}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </div>
    </header>
  )
}
