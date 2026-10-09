// Terrain horizon (PRD section 5.4). Plain ES module, no React; runs inside horizon.worker.js.

import { sampleBilinear } from "./data.js"
import { MOON_RADIUS_M } from "./geometry.js"
import { projectUnit, unproject } from "./projection.js"

export const HORIZON_SAMPLES = 720 // 0.5 deg azimuth step
export const HORIZON_AZ_STEP_DEG = 0.5
export const HORIZON_MAX_RANGE_M = 200000
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// Height at projected (x, y): near grid if inside it, else far grid.
// Returns { z, stepM } or null at the far-grid edge or nodata.
function terrainAt(grids, x, y) {
  let z = sampleBilinear(grids.near, x, y)
  if (z === z) return { z, stepM: grids.near.pixelM }
  if (!grids.far) return null
  z = sampleBilinear(grids.far, x, y)
  if (z === z) return { z, stepM: grids.far.pixelM }
  return null
}

// Terrain height (m above the sphere) at a projected point, NaN if none.
export function groundAt(grids, x, y) {
  const t = terrainAt(grids, x, y)
  return t ? t.z : NaN
}

// Horizon elevation angle (deg) for 720 azimuths (index i = azimuth i * 0.5 deg, clockwise
// from local north) seen from an observer groundM + antennaM above the sphere at pinXY.
// For each azimuth, march along the great circle in steps of the sampled grid's pixel size up to
// HORIZON_MAX_RANGE_M (or the far-grid edge / nodata) and keep the largest elevation angle,
// including the curvature drop d / 2R.
export function computeHorizon(pinXY, groundM, antennaM, grids, maxRangeM = HORIZON_MAX_RANGE_M) {
  const R = grids.radiusM || MOON_RADIUS_M
  const { lat, lon } = unproject(pinXY.x, pinXY.y, R)
  const la = lat * D2R
  const lo = lon * D2R
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const east = [-Math.sin(lo), Math.cos(lo), 0]
  const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)]
  const h0 = groundM + antennaM
  const out = new Float32Array(HORIZON_SAMPLES)
  const start = terrainAt(grids, pinXY.x, pinXY.y)
  const firstStep = start ? start.stepM : grids.near.pixelM

  for (let i = 0; i < HORIZON_SAMPLES; i++) {
    const az = i * HORIZON_AZ_STEP_DEG * D2R
    const ca = Math.cos(az)
    const sa = Math.sin(az)
    const dx = ca * north[0] + sa * east[0]
    const dy = ca * north[1] + sa * east[1]
    const dz = ca * north[2] + sa * east[2]
    let best = -Infinity
    let step = firstStep
    let d = step
    while (d <= maxRangeM) {
      const th = d / R
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const p = projectUnit(ct * up[0] + st * dx, ct * up[1] + st * dy, ct * up[2] + st * dz, R)
      const t = terrainAt(grids, p.x, p.y)
      if (!t) break
      const angle = Math.atan2(t.z - h0, d) - d / (2 * R)
      if (angle > best) best = angle
      step = t.stepM
      d += step
    }
    out[i] = best === -Infinity ? -90 : best * R2D
  }
  return out
}

// Linear interpolation of the 720 samples at any azimuth (deg), wrapping at 360.
export function horizonAt(horizon, azDeg) {
  const n = horizon.length
  let f = ((azDeg % 360) + 360) % 360 / (360 / n)
  const i = Math.floor(f) % n
  const w = f - Math.floor(f)
  return horizon[i] + (horizon[(i + 1) % n] - horizon[i]) * w
}

// Main-thread client for horizon.worker.js. Grids are sent once; compute() returns a Promise.
export function createHorizonWorker(grids) {
  const worker = new Worker(new URL("./horizon.worker.js", import.meta.url), { type: "module" })
  let nextId = 1
  const pending = new Map()
  worker.onmessage = (e) => {
    const { id, horizon, error, ms } = e.data
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    if (error) p.reject(new Error(error))
    else p.resolve({ horizon, ms })
  }
  worker.postMessage({ type: "init", grids })
  return {
    compute(pinXY, groundM, antennaM) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ type: "compute", id, pinXY, groundM, antennaM })
      })
    },
    terminate() {
      worker.terminate()
      for (const p of pending.values()) p.reject(new Error("horizon worker terminated"))
      pending.clear()
    },
  }
}
