import { LoaderCircle, RotateCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { retryData, useStore } from "@/state.js"

// First-load progress and data-error card over the main view (map / surface) until data is ready.
export default function DataStatus() {
  const dataReady = useStore((s) => s.dataReady)
  const dataError = useStore((s) => s.dataError)
  const { done, total } = useStore((s) => s.dataProgress)
  if (dataReady) return null

  if (dataError) {
    return (
      <div className="absolute inset-0 z-(--lspb-z-map-ui) grid place-items-center bg-background p-6">
        <div role="alert" className="w-full max-w-md space-y-3 rounded-lg border border-lspb-bad/60 p-5 text-sm">
          <p className="flex items-center gap-2 font-heading text-base font-semibold text-lspb-bad">
            <TriangleAlert className="size-5" aria-hidden="true" /> Could not load the lunar data
          </p>
          <p className="font-mono text-xs break-words">{dataError}</p>
          <p className="text-muted-foreground">
            The planner needs the files in <span className="font-mono">public/data</span>. Restore the file (or re-run the
            pipeline, see the README), then retry.
          </p>
          <Button variant="outline" size="sm" onClick={retryData}>
            <RotateCw /> Retry
          </Button>
        </div>
      </div>
    )
  }

  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="absolute inset-0 z-(--lspb-z-map-ui) grid place-items-center bg-background p-6" aria-busy="true">
      <div className="w-full max-w-xs space-y-3 text-sm">
        <p className="flex items-center gap-2 font-heading font-semibold">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading lunar data
        </p>
        <div
          role="progressbar"
          aria-label="Data files loaded"
          aria-valuemin={0}
          aria-valuemax={total || 1}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-lspb-earth transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Ephemeris 2026 to 2030, terrain and slope maps ({done} of {total || 6} files)
        </p>
      </div>
    </div>
  )
}
