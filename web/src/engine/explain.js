// Geometry behind the three explainers (components/explain/). Plain ES module, no React. Angles in degrees.

import { azElFromSite, makeSite } from "./geometry.js"

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// Largest declination of the Sun seen from the Moon: 1.588° in the SPICE ephemeris over 2026-2035 (measured
// in test/explain.test.jsx), rounded up. The Moon's equator is tilted that little to the Sun's path.
export const SUN_DECLINATION_MAX_DEG = 1.59

// The Sun's path over one lunar day, for an observer at latitude latDeg (negative south) on a smooth Moon, with
// the Sun at declination decDeg. Hour angle -180..180 in n steps: [{ hourAngleDeg, azDeg (from north,
// clockwise), elDeg }].
export function sunDailyPath(latDeg, decDeg = 0, n = 73) {
  const phi = latDeg * D2R
  const dec = decDeg * D2R
  return Array.from({ length: n }, (_, i) => {
    const H = (-180 + (360 * i) / (n - 1)) * D2R
    const sinEl = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)
    const el = Math.asin(Math.max(-1, Math.min(1, sinEl)))
    let az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H)) * R2D
    if (az < 0) az += 360
    return { hourAngleDeg: H * R2D, azDeg: az, elDeg: el * R2D }
  })
}

// Highest the Sun gets in a lunar day at latitude latDeg with declination decDeg.
export const sunMaxElevationDeg = (latDeg, decDeg = 0) => 90 - Math.abs(latDeg - decDeg)

// Earth's direction from a smooth-Moon site (no terrain) every stepH hours for days days from startMs:
// [{ tMs, azDeg, elDeg }]. vectorAt: the ephemeris accessor (engine/data.js); stops at the end of the table.
export function earthTrack(vectorAt, latDeg, lonDeg, startMs, days = 30, stepH = 6) {
  const site = makeSite(latDeg, lonDeg, 0, 0)
  const out = []
  for (let h = 0; h <= days * 24; h += stepH) {
    const tMs = startMs + h * 3600000
    const v = vectorAt("earth", tMs)
    if (!v) break
    const { azDeg, elDeg } = azElFromSite(site, v)
    out.push({ tMs, azDeg, elDeg })
  }
  return out
}

// Antenna over a ridge (side view, flat ground): the line from the antenna top towards Earth, elevation
// earthElDeg, passes the ridge (ridgeM high, ridgeDistM away) with this clearance in metres; > 0 means the
// line clears it.
export function ridgeClearanceM(antennaM, ridgeM, ridgeDistM, earthElDeg) {
  return antennaM + ridgeDistM * Math.tan(earthElDeg * D2R) - ridgeM
}

// The lowest antenna that clears the ridge.
export const minAntennaM = (ridgeM, ridgeDistM, earthElDeg) => Math.max(0, ridgeM - ridgeDistM * Math.tan(earthElDeg * D2R))
