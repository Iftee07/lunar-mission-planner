// Terrain horizon on the global DEM (LOLA LDEM_16, ~1.9 km). Plain ES module, no React; runs inside
// horizon.worker.js. Same output as computeHorizon(): 720 elevation angles (deg), index i = azimuth
// i * 0.5 deg clockwise from local north.

import { enuBasis } from "./geometry.js"
import { HORIZON_AZ_STEP_DEG, HORIZON_MAX_RANGE_M, HORIZON_SAMPLES } from "./horizon.js"

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// Bilinear height (m) at (lat, lon) on the global DEM. Longitude wraps (0/360 seam); rows clamp at the
// first/last pixel centre (1/32 deg from the poles), where the grid has no row beyond.
export function sampleGlobal(dem, latDeg, lonDeg) {
  const { width, height, ppd, data } = dem
  let fr = (90 - latDeg) * ppd - 0.5
  if (fr < 0) fr = 0
  else if (fr > height - 1) fr = height - 1
  let r = Math.floor(fr)
  if (r === height - 1) r -= 1
  const wr = fr - r
  let fc = (((lonDeg % 360) + 360) % 360) * ppd - 0.5
  if (fc < 0) fc += width
  const c0 = Math.floor(fc) % width
  const c1 = (c0 + 1) % width
  const wc = fc - Math.floor(fc)
  const a = r * width
  const b = a + width
  const top = data[a + c0] + (data[a + c1] - data[a + c0]) * wc
  const bot = data[b + c0] + (data[b + c1] - data[b + c0]) * wc
  return (top + (bot - top) * wr) * dem.scale
}

// Horizon seen from an observer groundM + heightM above the sphere at (pin.lat, pin.lon): for each
// azimuth, march along the great circle in steps of one DEM pixel (dem.pixelM) out to maxRangeM and
// keep the largest elevation angle, including the curvature drop d / 2R.
export function computeHorizonGlobal(pin, groundM, heightM, dem, maxRangeM = HORIZON_MAX_RANGE_M) {
  const R = dem.radiusM
  const { up, east, north } = enuBasis(pin.lat, pin.lon)
  const h0 = groundM + heightM
  const step = dem.pixelM
  const out = new Float32Array(HORIZON_SAMPLES)
  for (let i = 0; i < HORIZON_SAMPLES; i++) {
    const az = i * HORIZON_AZ_STEP_DEG * D2R
    const ca = Math.cos(az)
    const sa = Math.sin(az)
    const dx = ca * north[0] + sa * east[0]
    const dy = ca * north[1] + sa * east[1]
    const dz = ca * north[2] + sa * east[2]
    let best = -Infinity
    for (let d = step; d <= maxRangeM; d += step) {
      const th = d / R
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const px = ct * up[0] + st * dx
      const py = ct * up[1] + st * dy
      const pz = ct * up[2] + st * dz
      const z = sampleGlobal(dem, Math.asin(Math.max(-1, Math.min(1, pz))) * R2D, Math.atan2(py, px) * R2D)
      const angle = Math.atan2(z - h0, d) - d / (2 * R)
      if (angle > best) best = angle
    }
    out[i] = best === -Infinity ? -90 : best * R2D
  }
  return out
}
