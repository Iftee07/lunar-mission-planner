import { formatLatLon, formatTerrain } from "@/lib/format.js"
import { useStore } from "@/state.js"

// Slim site line above the cards: lat, lon, ground elevation and terrain source of the pin.
export default function SiteLine() {
  const pin = useStore((s) => s.pin)
  if (!pin) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-sm" data-testid="site-line">
      <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Site</span>
      <span className="font-mono tabular-nums">{formatLatLon(pin.lat, pin.lon)}</span>
      <span className="font-mono text-muted-foreground tabular-nums">ground {pin.groundM.toFixed(0)} m</span>
      <span className="rounded-sm border px-1.5 text-xs text-muted-foreground" data-testid="terrain-badge">
        {formatTerrain(pin.terrainSource, pin.resolutionM)}
      </span>
    </div>
  )
}
