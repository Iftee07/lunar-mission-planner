// "Move a little": how much the Sun and Earth numbers change within a short walk of the pin, and if the
// landing slips by a day. Plain ES module, no React. Distances in metres, durations in hours.
// state.js computes the ring's horizons in the worker and calls windowShares() for each point.

import { MOON_RADIUS_M } from "./geometry.js"
import { SUN_REFERENCE_HEIGHT_M, makeVisibility } from "./hours.js"
import { sampleVisibility, totalHours } from "./series.js"

export const RING_POINTS = 8 // N, NE, E, SE, S, SW, W, NW
export const DATE_SHIFT_H = 24 // the "land a day earlier / later" comparison
// Ring radii per terrain source. Global terrain (~1.9 km pixels) cannot resolve a few hundred metres, so its
// smallest ring is 5 km (labelled as the coarse-terrain minimum in the UI).
export const RING_RADII_M = { "polar-hd": [250, 500, 1000], global: [5000, 10000, 20000] }
const RING_DEFAULT_RADIUS_M = { "polar-hd": 500, global: 5000 }

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// Radius choices and the default for a terrain source.
export function ringRadii(source) {
  return RING_RADII_M[source] ?? RING_RADII_M.global
}
export function ringRadiusFor(source, wantedM) {
  const radii = ringRadii(source)
  return radii.includes(wantedM) ? wantedM : RING_DEFAULT_RADIUS_M[source] ?? radii[0]
}

// The point distM along the surface from (lat, lon) towards azimuth azDeg (clockwise from north), on a
// sphere of radiusM. Longitude east in (-180, 180].
export function destination(latDeg, lonDeg, azDeg, distM, radiusM = MOON_RADIUS_M) {
  const d = distM / radiusM
  const lat1 = latDeg * D2R
  const az = azDeg * D2R
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(az))
  const lon2 = lonDeg * D2R + Math.atan2(Math.sin(az) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  const lon = ((((lon2 * R2D + 180) % 360) + 360) % 360) - 180
  return { lat: lat2 * R2D, lon: lon === -180 ? 180 : lon }
}

// Great-circle distance (m) between two { lat, lon } points (haversine).
export function surfaceDistanceM(a, b, radiusM = MOON_RADIUS_M) {
  const dLat = (b.lat - a.lat) * D2R
  const dLon = (b.lon - a.lon) * D2R
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2
  return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// n points evenly spaced around (lat, lon) at radiusM, starting due north: [{ azDeg, lat, lon }].
export function ringPoints(latDeg, lonDeg, radiusM, n = RING_POINTS, moonRadiusM = MOON_RADIUS_M) {
  return Array.from({ length: n }, (_, i) => {
    const azDeg = (360 * i) / n
    return { azDeg, ...destination(latDeg, lonDeg, azDeg, radiusM, moonRadiusM) }
  })
}

// Share of the mission window [tMs, tMs + missionH] with the Sun up and with Earth in view: the same
// visibility test and sampling as engine/metrics.js siteMetrics (sunlitFraction, earthFraction).
// tableAccessor carries the pin (engine/data.js siteAccessor). Returns null outside the ephemeris.
export function windowShares({ horizonSun, horizonEarth, antennaM, tableAccessor, tMs, sunMode, missionH }) {
  const sun = sampleVisibility(makeVisibility("sun", horizonSun, tableAccessor, SUN_REFERENCE_HEIGHT_M, sunMode), tMs, missionH)
  if (sun.coveredH === 0 && sun.truncated) return null
  const earth = sampleVisibility(makeVisibility("earth", horizonEarth, tableAccessor, antennaM, "center"), tMs, missionH)
  const windowH = Math.min(sun.coveredH, earth.coveredH)
  if (!(windowH > 0)) return null
  return {
    sunlitFraction: Math.min(1, totalHours(sun.intervals) / windowH),
    earthFraction: Math.min(1, totalHours(earth.intervals) / windowH),
  }
}

// Smallest and largest of a share (key "sunlitFraction" or "earthFraction") over the pin and its ring;
// null entries (no data, outside the ephemeris) are skipped. null when nothing has a value.
export function shareRange(entries, key) {
  const v = entries.filter(Boolean).map((e) => e[key]).filter(Number.isFinite)
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null
}

// Colour of a share on a two-colour ramp ([r, g, b] at 0 and at 1).
export function rampColor(fraction, lo, hi) {
  const t = Math.max(0, Math.min(1, fraction))
  return lo.map((c, i) => Math.round(c + (hi[i] - c) * t))
}
