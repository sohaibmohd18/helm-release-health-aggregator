import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header, useDarkMode } from './Header'
import { useKeyboardNav } from '@/hooks/useKeyboardNav'

interface Props { children: ReactNode }

export function Layout({ children }: Props) {
  const [isDark, setIsDark] = useDarkMode()
  useKeyboardNav()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header isDark={isDark} onToggleDark={() => setIsDark(d => !d)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
