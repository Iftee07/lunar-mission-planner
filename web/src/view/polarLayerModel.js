// Pure logic behind the Polar HD map layers (view/polarMap.js, view/polarLayers.worker.js): slope bands,
// decoding the sunlight / shadow PNGs, colouring, and the value under the cursor. No DOM, so it is unit-tested.
// All three layers sit on the near grid (120 m, the same bounds as hillshade.png).

import { SLOPE_NASA_LIMIT_DEG, SLOPE_POSSIBLE_MAX_DEG } from "@/engine/ratings.js"

export const LAYER_NODATA = 255

// Layer ids in drawing order (bottom first). `opacity` is the default.
export const POLAR_LAYERS = [
  { id: "sunlight", label: "Average sunlight", opacity: 0.7 },
  { id: "psr", label: "Permanent shadow (PSR)", opacity: 0.8 },
  { id: "slope", label: "Slope", opacity: 0.7 },
]
export const LAYER_IDS = POLAR_LAYERS.map((l) => l.id)

// Slope band with the Landing rating's cut-offs: "ok" under 8° (landing possible), "warn" 8° to 10° (NASA's
// limit), "bad" over 10°; null without data.
export function slopeBand(deg) {
  if (!Number.isFinite(deg)) return null
  if (deg < SLOPE_POSSIBLE_MAX_DEG) return "ok"
  if (deg <= SLOPE_NASA_LIMIT_DEG) return "warn"
  return "bad"
}

// Values from a decoded grey + alpha PNG (RGBA bytes, as a canvas returns them; pipeline/13_build_illumination.py):
// sunlight -> percent 0..100, psr -> 1 (permanent shadow) or 0; LAYER_NODATA where alpha is 0 (outside 84 S).
export function decodeLayerPixels(kind, rgba) {
  const n = rgba.length / 4
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const grey = rgba[4 * i]
    if (rgba[4 * i + 3] === 0) out[i] = LAYER_NODATA
    else out[i] = kind === "psr" ? (grey >= 128 ? 1 : 0) : grey
  }
  return out
}

// "#rrggbb" -> [r, g, b]
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`)
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

// RGBA image of a layer. values: Uint8Array (slope: raw slope bytes, degrees = value * scale, nodata `nodata`;
// sunlight: percent; psr: 1/0). colors: { ok, warn, bad, sunLow, sunHigh, psr } as [r, g, b].
// No data and "not PSR" pixels are transparent; opacity is applied by the map, not here.
export function colorizeLayer(kind, values, { colors, scale = 1, nodata = LAYER_NODATA }) {
  const out = new Uint8ClampedArray(values.length * 4)
  const put = (i, c) => {
    out[4 * i] = c[0]
    out[4 * i + 1] = c[1]
    out[4 * i + 2] = c[2]
    out[4 * i + 3] = 255
  }
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === nodata) continue
    if (kind === "slope") put(i, colors[slopeBand(v * scale)])
    else if (kind === "psr") {
      if (v === 1) put(i, colors.psr)
    } else {
      const t = Math.min(1, v / 100)
      const lo = colors.sunLow
      const hi = colors.sunHigh
      put(i, [lo[0] + (hi[0] - lo[0]) * t, lo[1] + (hi[1] - lo[1]) * t, lo[2] + (hi[2] - lo[2]) * t])
    }
  }
  return out
}

// Nearest pixel of a grid ({ width, height, pixelM, xMin, yMax, data }, row 0 = max y) at projected (x, y) in
// metres; null outside the grid.
export function pixelAt(g, x, y) {
  const c = Math.floor((x - g.xMin) / g.pixelM)
  const r = Math.floor((g.yMax - y) / g.pixelM)
  if (c < 0 || r < 0 || c >= g.width || r >= g.height) return null
  return g.data[r * g.width + c]
}

// Cursor readout for one layer: slope in degrees (bilinear, as the Landing card), sunlight percent, PSR 1/0.
// null when there is no data there.
export function layerReadout(kind, value) {
  if (value === null || value === undefined || Number.isNaN(value) || value === LAYER_NODATA) return null
  if (kind === "slope") return `slope ${value.toFixed(1)}°`
  if (kind === "psr") return value === 1 ? "permanent shadow" : "not PSR"
  return `sunlit ${value}% of the time`
}
