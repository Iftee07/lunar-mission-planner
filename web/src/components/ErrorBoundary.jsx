import { Component } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

// Keeps a crash in one heavy view (map, surface) from blanking the whole planner.
// "Try again" remounts the children. `active` = false hides the error card (view not shown).
export default class ErrorBoundary extends Component {
  state = { error: null, attempt: 0 }

  static getDerivedStateFromError(error) {
    return { error }
  }

  retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))

  render() {
    const { error, attempt } = this.state
    if (!error) return <div key={attempt} className="contents">{this.props.children}</div>
    if (this.props.active === false) return null
    return (
      <div role="alert" className="absolute inset-0 grid place-items-center bg-background p-6">
        <div className="max-w-sm space-y-3 rounded-lg border p-5 text-sm">
          <p className="flex items-center gap-2 font-heading font-semibold text-lspb-bad">
            <TriangleAlert className="size-4" aria-hidden="true" /> The {this.props.label} stopped working
          </p>
          <p className="font-mono text-xs break-words text-muted-foreground">{String(error.message || error)}</p>
          <Button variant="outline" size="sm" onClick={this.retry}>
            Try again
          </Button>
        </div>
      </div>
    )
  }
}
