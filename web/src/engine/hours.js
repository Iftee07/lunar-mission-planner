// Visibility and hours (PRD section 5.5). Plain ES module, no React.
// All durations are in hours.

import { azElFromSite, makeSite } from "./geometry.js"
import { horizonAt } from "./horizon.js"

export const STEP_H = 0.25
export const LOOKAHEAD_H = 1500
export const WINDOW_H = 156
export const BISECT_TOLERANCE_H = 0.01
export const SUN_SEMIDIAMETER_DEG = 0.267
const HOUR_MS = 3600000

// Visibility test for one body at one time. Returns true/false, or null outside the ephemeris.
export function makeVisibility(body, horizon, tableAccessor, antennaM, sunMode) {
  const { pin } = tableAccessor
  const site = makeSite(pin.lat, pin.lon, pin.groundM, antennaM)
  const extra = sunMode === "any_part" && body === "sun" ? SUN_SEMIDIAMETER_DEG : 0
  return (tMs) => {
    const v = tableAccessor.vectorAt(body, tMs)
    if (!v) return null
    const { azDeg, elDeg } = azElFromSite(site, v)
    return elDeg + extra > horizonAt(horizon, azDeg)
  }
}

// Bisection between hours a (state sa) and b (state !sa); returns the change time in hours.
function bisect(visible, startMs, a, b, sa) {
  while (b - a > BISECT_TOLERANCE_H) {
    const m = (a + b) / 2
    if (visible(startMs + m * HOUR_MS) === sa) a = m
    else b = m
  }
  return (a + b) / 2
}

// First state change after hour `from` (whose state is `state`), scanning in STEP_H steps
// up to LOOKAHEAD_H from the start. Returns { at, stepAfter } on a change, otherwise
// { at: null, truncated } where truncated = the scan ran off the end of the ephemeris table.
function nextChange(visible, startMs, from, state) {
  for (let h = from + STEP_H; h <= LOOKAHEAD_H + 1e-9; h += STEP_H) {
    const s = visible(startMs + h * HOUR_MS)
    if (s === null) return { at: null, truncated: true }
    if (s !== state) return { at: bisect(visible, startMs, h - STEP_H, h, state), stepAfter: h }
  }
  return { at: null, truncated: false }
}

// {
//   visibleNow, hoursToChange|null, nextPeriodHours|null, continuous,
//   windowVisibleHours, windowHiddenHours,
//   lookaheadTruncated   (true if LOOKAHEAD_H runs past the end of the ephemeris table)
// }  or null if startUtcMs is outside the ephemeris.
// tableAccessor = { pin: { lat, lon, groundM }, vectorAt(body, tMs) -> [x,y,z] km | null }
export function computeHours(body, horizon, tableAccessor, startUtcMs, antennaM, sunMode) {
  const visible = makeVisibility(body, horizon, tableAccessor, antennaM, sunMode)
  const visibleNow = visible(startUtcMs)
  if (visibleNow === null) return null

  const first = nextChange(visible, startUtcMs, 0, visibleNow)
  let nextPeriodHours = null
  let truncated = first.truncated
  if (first.at !== null) {
    // the period that starts at the first change ends at the second change
    const second = nextChange(visible, startUtcMs, first.stepAfter, !visibleNow)
    if (second.at !== null) nextPeriodHours = second.at - first.at
    truncated = second.truncated
  }

  // Visible hours over the next WINDOW_H: STEP_H samples at 0, 0.25, ..., WINDOW_H - 0.25.
  let n = 0
  let counted = 0
  for (let h = 0; h < WINDOW_H - 1e-9; h += STEP_H) {
    const s = visible(startUtcMs + h * HOUR_MS)
    if (s === null) break
    counted++
    if (s) n++
  }
  const windowVisibleHours = n * STEP_H
  return {
    visibleNow,
    hoursToChange: first.at,
    nextPeriodHours,
    continuous: first.at === null && !first.truncated,
    windowVisibleHours,
    windowHiddenHours: counted * STEP_H - windowVisibleHours,
    lookaheadTruncated: truncated,
  }
}
