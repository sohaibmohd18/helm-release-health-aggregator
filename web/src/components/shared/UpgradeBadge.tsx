import { cn } from '@/lib/utils'
import { upgradeBadgeClasses } from '@/lib/health'
import type { UpgradeSeverity } from '@/types'

const labels: Record<UpgradeSeverity, string> = {
  none: 'Current',
  patch: 'Patch',
  minor: 'Minor',
  major: 'Major',
}

interface Props {
  severity: UpgradeSeverity
  className?: string
}

export function UpgradeBadge({ severity, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        upgradeBadgeClasses(severity),
        className,
      )}
    >
      {labels[severity]}
    </span>
  )
}
