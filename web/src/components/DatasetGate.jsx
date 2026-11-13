import { useState } from "react"
import { CircleCheck, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react"
import { ProgressBar } from "@/components/DataStatus"
import { Button } from "@/components/ui/button"
import { PRELOAD_TIERS, ensureTier, retryData, useStore } from "@/state.js"

// The datasets the gate waits for (engine/data.js tiers), in the order they are listed.
const ROWS = {
  core: { title: "Sun and Earth positions", detail: "Ephemeris" },
  polar: { title: "Polar HD terrain", detail: "LOLA 120 m south pole terrain and slope maps" },
  global: { title: "Global terrain", detail: "LOLA terrain for the whole Moon, ~1.9 km" },
}
const GATED = ["core", ...PRELOAD_TIERS]

const mb = (bytes) => (bytes / 1e6).toFixed(1)
const retryTier = (tier) => (tier === "core" ? retryData() : ensureTier(tier).catch(() => {}))

function Row({ tier, state }) {
  const { status, done, total, error } = state
  const text = ROWS[tier]
  const pct = total ? Math.round((done / total) * 100) : 0
  let note = "waiting"
  if (status === "ready") note = "ready"
  else if (status === "error") note = "failed"
  else if (total && done >= total) note = "preparing"
  else if (total) note = `${mb(done)} of ${mb(total)} MB`
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 font-semibold">
          {status === "ready" ? (
            <CircleCheck className="size-3.5 shrink-0 text-lspb-ok" aria-hidden="true" />
          ) : status === "error" ? (
            <TriangleAlert className="size-3.5 shrink-0 text-lspb-bad" aria-hidden="true" />
          ) : (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          )}
          {text.title}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{note}</span>
      </div>
      <ProgressBar label={text.title} pct={status === "ready" ? 100 : pct} />
      <p className="text-xs text-muted-foreground">{text.detail}</p>
      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="w-full font-mono text-xs break-words">{error}</p>
          <Button variant="outline" size="sm" onClick={() => retryTier(tier)}>
            <RotateCw /> Retry
          </Button>
        </div>
      )}
    </li>
  )
}

// Production: the main view (globe, Polar HD map, surface view) mounts only once the ephemeris and both
// terrain tiers are downloaded (state.js preloadTerrain started them when the site opened). Until then it
// shows their progress. After an error the user may continue: the views then load terrain on demand.
export default function DatasetGate({ children }) {
  const tiers = useStore((s) => s.tiers)
  const [skipped, setSkipped] = useState(false)
  const ready = GATED.every((t) => tiers[t].status === "ready")
  if (PRELOAD_TIERS.length === 0 || ready || skipped) return children

  const failed = GATED.some((t) => tiers[t].status === "error")
  const sized = GATED.every((t) => tiers[t].total > 0)
  const done = GATED.reduce((s, t) => s + (tiers[t].status === "ready" ? tiers[t].total : tiers[t].done), 0)
  const total = GATED.reduce((s, t) => s + tiers[t].total, 0)

  return (
    <div className="absolute inset-0 z-(--lspb-z-map-ui) grid place-items-center overflow-y-auto bg-background p-4 sm:p-6" aria-busy={!failed}>
      <div className="w-full max-w-sm space-y-4 text-sm">
        <div className="space-y-1">
          <p className="font-heading text-base font-semibold">Downloading lunar datasets</p>
          <p className="text-xs text-muted-foreground">
            Once per visit, so every pin, map and horizon opens without waiting
            {sized ? ` (${mb(done)} of ${mb(total)} MB)` : ""}.
          </p>
        </div>
        <ul className="space-y-4">
          {GATED.map((t) => (
            <Row key={t} tier={t} state={tiers[t]} />
          ))}
        </ul>
        {failed && (
          <Button variant="ghost" size="sm" onClick={() => setSkipped(true)}>
            Continue without it (terrain loads when needed)
          </Button>
        )}
      </div>
    </div>
  )
}
