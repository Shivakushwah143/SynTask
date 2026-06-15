import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('React ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[320px] flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-4 rounded-full bg-red-100 p-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-text-primary">Something went wrong</h2>
          <p className="mb-6 max-w-md text-sm text-text-secondary">
            This section hit an error. Other pages are unaffected.
          </p>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={() => this.setState({ hasError: false })}
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
