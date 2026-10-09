// South polar stereographic, true scale at the pole, sphere radius R (PRD section 5.3).
// Matches the LOLA GeoTIFF CRS: +proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +R=1737400.
// x = rho sin(lon), y = rho cos(lon), rho = 2R tan(pi/4 + lat/2). Longitude 0 points to +y.

import { MOON_RADIUS_M } from "./geometry.js"

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export function rhoForLat(latDeg, r = MOON_RADIUS_M) {
  return 2 * r * Math.tan(Math.PI / 4 + (latDeg * D2R) / 2)
}

export function latForRho(rho, r = MOON_RADIUS_M) {
  return (2 * Math.atan(rho / (2 * r)) - Math.PI / 2) * R2D
}

export function project(latDeg, lonDeg, r = MOON_RADIUS_M) {
  const rho = rhoForLat(latDeg, r)
  const lon = lonDeg * D2R
  return { x: rho * Math.sin(lon), y: rho * Math.cos(lon) }
}

// Returns lon in (-180, 180].
export function unproject(x, y, r = MOON_RADIUS_M) {
  return { lat: latForRho(Math.hypot(x, y), r), lon: Math.atan2(x, y) * R2D }
}

// Fast path from a Moon-centred unit vector (no trig): tan(pi/4 + lat/2) = (1 + z) / c.
export function projectUnit(px, py, pz, r = MOON_RADIUS_M) {
  const c2 = px * px + py * py
  const k = (2 * r * (1 + pz)) / c2
  return { x: k * py, y: k * px }
}
