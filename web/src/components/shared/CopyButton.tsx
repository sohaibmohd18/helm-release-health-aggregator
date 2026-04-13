import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  text: string
  label?: string
  size?: 'sm' | 'icon'
}

export function CopyButton({ text, label = 'Copy', size = 'sm' }: Props) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (size === 'icon') {
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
        {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleCopy}>
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </Button>
  )
}
