import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
          <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          Try again
        </Button>
      </div>
    )
  }
}
