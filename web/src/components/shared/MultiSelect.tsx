import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  className?: string
}

export function MultiSelect({ options, value, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val))
    } else {
      onChange([...value, val])
    }
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm ring-offset-background',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open && 'ring-2 ring-ring',
        )}
      >
        <span className={value.length === 0 ? 'text-muted-foreground' : ''}>
          {value.length === 0
            ? placeholder
            : value.length === 1
              ? options.find(o => o.value === value[0])?.label ?? value[0]
              : `${value.length} selected`}
        </span>
        <span className="flex items-center gap-1">
          {value.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onChange([])}
              onClick={e => { e.stopPropagation(); onChange([]) }}
              className="rounded p-0.5 hover:bg-muted"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] rounded-md border bg-popover shadow-md">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-primary"
                checked={value.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
