import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const SHORTCUTS: Record<string, string> = {
  o: '/',
  r: '/releases',
  u: '/upgrades',
  e: '/events',
}

/**
 * GitHub-style two-key navigation: press G then O/R/U/E to jump to a page.
 * Ignored when focus is inside an input, textarea, or contenteditable.
 */
export function useKeyboardNav() {
  const navigate = useNavigate()
  const awaitingSecondKey = useRef(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()

      if (awaitingSecondKey.current) {
        if (resetTimer.current) clearTimeout(resetTimer.current)
        awaitingSecondKey.current = false
        const path = SHORTCUTS[key]
        if (path) navigate(path)
        return
      }

      if (key === 'g') {
        awaitingSecondKey.current = true
        resetTimer.current = setTimeout(() => {
          awaitingSecondKey.current = false
        }, 1500)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [navigate])
}
