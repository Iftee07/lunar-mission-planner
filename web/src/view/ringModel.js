// "Move a little" ring on the globe and the Polar HD map: each point coloured by the chosen share, on the same
// ramp as the sidebar card (dark blue at 0%, Sun yellow or Earth blue at 100%). Pure, no DOM.

import { rampColor } from "@/engine/sensitivity.js"
import { hexToRgb } from "./polarLayerModel.js"

export const RING_SHARE_KEY = { sun: "sunlitFraction", earth: "earthFraction" }

// points: state.js sensitivity.points; metric "sun" | "earth"; theme: lib/theme.js readTheme().
// -> [{ lat, lon, value (0..1) | null, color "rgb(r, g, b)" | null }]; null where the point has no value.
export function ringMarkers(points, metric, theme) {
  const lo = hexToRgb(theme.layerSunLow)
  const hi = hexToRgb(metric === "earth" ? theme.earth : theme.sun)
  return points.map((p) => {
    const v = p.shares?.[RING_SHARE_KEY[metric]]
    const ok = Number.isFinite(v)
    return { lat: p.lat, lon: p.lon, value: ok ? v : null, color: ok ? `rgb(${rampColor(v, lo, hi).join(", ")})` : null }
  })
}
