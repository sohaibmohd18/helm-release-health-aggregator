import { cn } from '@/lib/utils'
import { healthBadgeClasses } from '@/lib/health'
import type { HealthStatus } from '@/types'

interface Props {
  health: HealthStatus
  className?: string
}

export function HealthBadge({ health, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        healthBadgeClasses(health),
        className,
      )}
    >
      {health}
    </span>
  )
}
