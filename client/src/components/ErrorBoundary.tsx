import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Something went wrong</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            this.setState({ error: null })
            window.location.hash = '#/'
            window.location.reload()
          }}
        >
          Reload
        </Button>
      </div>
    )
  }
}