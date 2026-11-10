import { LoaderCircle, RotateCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ensureTier, retryData, useStore } from "@/state.js"

// What each data tier holds (engine/data.js), for the progress and error cards.
const TIER_TEXT = {
  core: { title: "Loading lunar data", detail: "Sun and Earth positions" },
  polar: { title: "Loading Polar HD terrain", detail: "120 m south pole terrain and slope maps" },
}

const mb = (bytes) => (bytes / 1e6).toFixed(1)

// Progress and error card over the main view while a data tier loads: "core" at start (covers the
// whole main view), "polar" when the Polar HD map opens. Hidden once the tier is ready.
export default function DataStatus({ tier = "core" }) {
  const { status, done, total, error } = useStore((s) => s.tiers[tier])
  if (status === "ready" || status === "idle") return null
  const text = TIER_TEXT[tier]

  if (status === "error") {
    const retry = tier === "core" ? retryData : () => ensureTier(tier).catch(() => {})
    return (
      <div className="absolute inset-0 z-(--lspb-z-map-ui) grid place-items-center bg-background p-6">
        <div role="alert" className="w-full max-w-md space-y-3 rounded-lg border border-lspb-bad/60 p-5 text-sm">
          <p className="flex items-center gap-2 font-heading text-base font-semibold text-lspb-bad">
            <TriangleAlert className="size-5" aria-hidden="true" /> Could not load the lunar data
          </p>
          <p className="font-mono text-xs break-words">{error}</p>
          <p className="text-muted-foreground">
            The planner needs the files in <span className="font-mono">public/data</span>. Restore the file (or re-run the
            pipeline, see the README), then retry.
          </p>
          <Button variant="outline" size="sm" onClick={retry}>
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
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> {text.title}
        </p>
        <div
          role="progressbar"
          aria-label={text.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-lspb-earth transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {text.detail} ({total ? `${mb(done)} of ${mb(total)} MB` : "starting"})
        </p>
      </div>
    </div>
  )
}
