// Mission-window metrics for one site: power (Sun), direct-to-Earth (Earth) and both together.
// Plain ES module, no React. All durations in hours; only lib/format.js converts to days.

import { azElFromSite, makeSite } from "./geometry.js"
import { horizonAt } from "./horizon.js"
import { STEP_H, SUN_REFERENCE_HEIGHT_M, makeVisibility } from "./hours.js"
import { longestGapHours, nextWindows, overlapHours, sampleVisibility, totalHours } from "./series.js"

const HOUR_MS = 3600000
const SERIES_STEP_H = 1 // elevation sparklines: one sample per hour (157 or 337 numbers, plain arrays)

// Body elevation above the terrain horizon at the body's azimuth (deg); negative = hidden.
export function clearanceDeg(azEl, horizon) {
  return azEl.elDeg - horizonAt(horizon, azEl.azDeg)
}

// Metrics over the mission window [T, T + missionH], or the part of it inside the ephemeris:
//   windowH (hours actually covered), truncated
//   sunlitFraction, earthFraction, bothFraction  (of windowH)
//   sunUpEarthDownH   power but no direct-to-Earth link
//   longestDarkH, longestNoEarthH
//   sunElevationNowDeg, sunElevationMinDeg, sunElevationMaxDeg   (Sun centre, from the Sun observer
//       height; min/max sampled every STEP_H)
//   sunElevationSeriesDeg, earthElevationSeriesDeg, seriesStepH   (elevation every seriesStepH hours from T,
//       for the cards' sparklines; Earth from the antenna height)
//   sunClearanceNowDeg, earthClearanceNowDeg   (elevation minus terrain horizon)
//   sun / earth: { intervals, next } with next = nextWindows(5) from T
// Returns null when T is outside the ephemeris.
export function siteMetrics({ pin, horizonSun, horizonEarth, antennaM, tableAccessor, tMs, sunMode, missionH }) {
  const sunVisible = makeVisibility("sun", horizonSun, tableAccessor, SUN_REFERENCE_HEIGHT_M, sunMode)
  const earthVisible = makeVisibility("earth", horizonEarth, tableAccessor, antennaM, "center")
  const sun = sampleVisibility(sunVisible, tMs, missionH)
  const earth = sampleVisibility(earthVisible, tMs, missionH)
  if (sun.coveredH === 0 && sun.truncated) return null
  const windowH = Math.min(sun.coveredH, earth.coveredH)

  const sunSite = makeSite(pin.lat, pin.lon, pin.groundM, SUN_REFERENCE_HEIGHT_M)
  const earthSite = makeSite(pin.lat, pin.lon, pin.groundM, antennaM)
  let elMin = Infinity
  let elMax = -Infinity
  const sunSeries = []
  const earthSeries = []
  const every = Math.round(SERIES_STEP_H / STEP_H)
  for (let i = 0, h = 0; h <= windowH + 1e-9; i++, h = i * STEP_H) {
    const t = tMs + h * HOUR_MS
    const v = tableAccessor.vectorAt("sun", t)
    if (!v) break
    const el = azElFromSite(sunSite, v).elDeg
    if (el < elMin) elMin = el
    if (el > elMax) elMax = el
    if (i % every === 0) {
      sunSeries.push(el)
      earthSeries.push(azElFromSite(earthSite, tableAccessor.vectorAt("earth", t)).elDeg)
    }
  }
  const sunNow = azElFromSite(sunSite, tableAccessor.vectorAt("sun", tMs))
  const earthNow = azElFromSite(earthSite, tableAccessor.vectorAt("earth", tMs))

  const sunlitH = totalHours(sun.intervals)
  const earthH = totalHours(earth.intervals)
  const bothH = overlapHours(sun.intervals, earth.intervals)
  const frac = (h) => (windowH > 0 ? h / windowH : 0)
  return {
    missionH,
    windowH,
    truncated: sun.truncated || earth.truncated,
    sunlitFraction: frac(sunlitH),
    earthFraction: frac(earthH),
    bothFraction: frac(bothH),
    sunUpEarthDownH: sunlitH - bothH,
    longestDarkH: longestGapHours(sun.intervals, windowH),
    longestNoEarthH: longestGapHours(earth.intervals, windowH),
    sunElevationNowDeg: sunNow.elDeg,
    sunElevationMinDeg: elMin,
    sunElevationMaxDeg: elMax,
    sunElevationSeriesDeg: sunSeries,
    earthElevationSeriesDeg: earthSeries,
    seriesStepH: SERIES_STEP_H,
    sunClearanceNowDeg: clearanceDeg(sunNow, horizonSun),
    earthClearanceNowDeg: clearanceDeg(earthNow, horizonEarth),
    sun: { intervals: sun.intervals, next: nextWindows(sunVisible, tMs) },
    earth: { intervals: earth.intervals, next: nextWindows(earthVisible, tMs) },
  }
}
