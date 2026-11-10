// Terrain source router and one interface over both terrain models. Plain ES module, no React.
//   "polar-hd"  LOLA 120 m / 240 m south polar stereographic grids, 84 S to the pole (slope too)
//   "global"    LOLA LDEM_16, ~1.9 km per pixel, anywhere on the Moon (no landing rating)
// Both expose: { source, resolutionM, heightAt(lat, lon), heightAtUnit(x, y, z), horizon(pin, heightM, maxRangeM) }
// with heights in metres above the 1737.4 km sphere (NaN where the terrain has no data).

import { computeHorizon, groundAt } from "./horizon.js"
import { computeHorizonGlobal, sampleGlobal } from "./horizonGlobal.js"
import { project, projectUnit } from "./projection.js"

export const POLAR_HD_LAT_LIMIT_DEG = -84
const R2D = 180 / Math.PI

// Polar HD at 84 S or further south when the polar grids exist; Global everywhere else.
export function terrainSourceFor(latDeg, polarAvailable = true) {
  return polarAvailable && latDeg <= POLAR_HD_LAT_LIMIT_DEG ? "polar-hd" : "global"
}

// The data tier (engine/data.js) a terrain source needs.
export function tierForSource(source) {
  return source === "polar-hd" ? "polar" : "global"
}

export function polarTerrain(grids) {
  const R = grids.radiusM
  return {
    source: "polar-hd",
    resolutionM: grids.near.pixelM,
    heightAt(latDeg, lonDeg) {
      const p = project(latDeg, lonDeg, R)
      return groundAt(grids, p.x, p.y)
    },
    heightAtUnit(x, y, z) {
      const p = projectUnit(x, y, z, R)
      return groundAt(grids, p.x, p.y)
    },
    horizon(pin, heightM, maxRangeM) {
      return computeHorizon(project(pin.lat, pin.lon, R), pin.groundM, heightM, grids, maxRangeM)
    },
  }
}

export function globalTerrain(dem) {
  return {
    source: "global",
    resolutionM: dem.pixelM,
    heightAt: (latDeg, lonDeg) => sampleGlobal(dem, latDeg, lonDeg),
    heightAtUnit: (x, y, z) => sampleGlobal(dem, Math.asin(Math.max(-1, Math.min(1, z))) * R2D, Math.atan2(y, x) * R2D),
    horizon: (pin, heightM, maxRangeM) => computeHorizonGlobal(pin, pin.groundM, heightM, dem, maxRangeM),
  }
}
