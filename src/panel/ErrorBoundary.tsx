import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  onFail: (error: unknown) => void
}

/**
 * Removes its own UI when the tree below it throws.
 *
 * A try/catch around `root.render()` does not catch a render error — React surfaces it
 * out of band, so the call returns normally and the caller believes it succeeded while
 * an uncaught exception lands on Amazon's page and an empty host node is left behind.
 * On a listing page that would repeat once per tile.
 *
 * There is no fallback UI on purpose: a badge that cannot render has nothing useful to
 * say, and the honest outcome is no badge at all.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[country-made-in] UI failed to render; removing it', error, info.componentStack)
    this.props.onFail(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
