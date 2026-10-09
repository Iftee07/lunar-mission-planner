// Earth-visible days for the calendar (PRD v3 Phase 9). Plain ES module, no React.
// All durations in hours. Day boundaries are local days in the selected UTC offset, never the
// browser time zone.

import { makeVisibility } from "./hours.js"

export const EARTH_DAY_STEP_H = 0.25
export const EARTH_DAY_MIN_VISIBLE_H = 1 // a day is marked if Earth is up >= 1 h (filters one-sample flicker)
const HOUR_MS = 3600000

// Core: visible hours per local day of (year, month0) for any visibility function.
// Returns Map<dayOfMonth, visibleHours | null>; null = the day is not fully inside the ephemeris.
export function visibleHoursByDay(year, month0, utcOffsetH, visible) {
  const nDays = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const out = new Map()
  for (let d = 1; d <= nDays; d++) {
    const startMs = Date.UTC(year, month0, d) - utcOffsetH * HOUR_MS
    let n = 0
    let inRange = true
    for (let h = 0; h < 24 - 1e-9; h += EARTH_DAY_STEP_H) {
      const s = visible(startMs + h * HOUR_MS)
      if (s === null) {
        inRange = false
        break
      }
      if (s) n++
    }
    out.set(d, inRange ? n * EARTH_DAY_STEP_H : null)
  }
  return out
}

// Earth seen from the antenna height against the Earth horizon (same model as the Earth card).
// tableAccessor = siteAccessor(ephemeris, pin) from engine/data.js. About 3,000 evaluations per month.
export function earthVisibleDays(year, month0, horizonEarth, tableAccessor, utcOffsetH, antennaM) {
  const visible = makeVisibility("earth", horizonEarth, tableAccessor, antennaM, "center")
  return visibleHoursByDay(year, month0, utcOffsetH, visible)
}
