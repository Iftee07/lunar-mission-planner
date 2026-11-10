// Global terrain, terrain routing, extended ephemeris and Horizons fixtures (all sets).
import { describe, expect, test } from "vitest"
import { createGlobalDem, decodeGlobalDem, gunzip } from "../src/engine/data.js"
import { MOON_RADIUS_M, azElFromSite, makeSite } from "../src/engine/geometry.js"
import { computeHorizon, groundAt } from "../src/engine/horizon.js"
import { computeHorizonGlobal, sampleGlobal } from "../src/engine/horizonGlobal.js"
import { project } from "../src/engine/projection.js"
import { terrainSourceFor, tierForSource } from "../src/engine/terrain.js"
import { hasGlobalDem, hasRealData, loadGlobalDem, loadRealData, readFixture } from "./load.js"

const R = MOON_RADIUS_M
const R2D = 180 / Math.PI

// Synthetic LDEM_16-shaped grid (5760 x 2880, 16 px/deg) filled with fillM metres.
function syntheticGlobal(fillM = 0, ppd = 16) {
  const width = 360 * ppd
  const height = 180 * ppd
  const data = new Int16Array(width * height).fill(Math.round(fillM / 0.5))
  return createGlobalDem({ file: "synthetic", width, height, pixels_per_degree: ppd, scale: 0.5 }, data, R)
}
const set = (dem, row, col, m) => (dem.data[row * dem.width + col] = Math.round(m / 0.5))
const rowLat = (dem, r) => 90 - (r + 0.5) / dem.ppd
const colLon = (dem, c) => (c + 0.5) / dem.ppd

// JS twin of pipeline/10_build_global.py predict_encode (for the decoder round trip).
async function encode(i16, width, height) {
  const res = new Uint16Array(width * height)
  const at = (r, c) => i16[r * width + c]
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      let pred = 0
      if (r === 0 && c > 0) pred = at(0, c - 1)
      else if (r > 0 && c === 0) pred = at(r - 1, 0)
      else if (r > 0) pred = at(r, c - 1) + at(r - 1, c) - at(r - 1, c - 1)
      res[r * width + c] = (at(r, c) - pred) & 0xffff
    }
  }
  const n = width * height
  const planes = new Uint8Array(2 * n)
  for (let i = 0; i < n; i++) {
    planes[i] = res[i] >> 8
    planes[n + i] = res[i] & 0xff
  }
  const gz = new Blob([planes]).stream().pipeThrough(new CompressionStream("gzip"))
  return new Uint8Array(await new Response(gz).arrayBuffer())
}

describe("global DEM decoding", () => {
  test("gzip + byte planes + 2D predictor round trip is lossless", async () => {
    const w = 97
    const h = 41
    const src = new Int16Array(w * h)
    let s = 12345
    for (let i = 0; i < src.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0
      src[i] = (s % 40000) - 20000 // full int16-scale terrain, including big jumps
    }
    const decoded = decodeGlobalDem(await gunzip(await encode(src, w, h)), w, h)
    expect(Array.from(decoded)).toEqual(Array.from(src))
  })
})

describe("global horizon on synthetic terrain", () => {
  test("flat DEM: horizon is the curvature drop of the first step, about 0 deg", () => {
    const dem = syntheticGlobal(0)
    const hz = computeHorizonGlobal({ lat: 12.3, lon: 45.6 }, 0, 0, dem)
    const drop = (dem.pixelM / (2 * R)) * R2D
    let worst = 0
    for (const v of hz) worst = Math.max(worst, Math.abs(v + drop))
    console.log(`global flat DEM: horizon ${(-drop).toFixed(4)} deg at every azimuth (max deviation ${worst.toExponential(1)})`)
    expect(worst).toBeLessThan(1e-4)
    expect(Math.max(...hz.map(Math.abs))).toBeLessThanOrEqual(0.05)
  })

  test("single 1000 m pillar 10 pixels north: horizon[0] = atan(1000/d) - d/(2R)", () => {
    const dem = syntheticGlobal(0)
    const r0 = 1300
    const c0 = 777
    set(dem, r0 - 10, c0, 1000)
    const pin = { lat: rowLat(dem, r0), lon: colLon(dem, c0) }
    const hz = computeHorizonGlobal(pin, 0, 0, dem)
    const d = 10 * dem.pixelM
    const expected = (Math.atan(1000 / d) - d / (2 * R)) * R2D
    console.log(`global pillar: horizon[0] = ${hz[0].toFixed(4)} deg, expected ${expected.toFixed(4)} deg`)
    expect(Math.abs(hz[0] - expected)).toBeLessThanOrEqual(0.01)
    expect(hz[360]).toBeLessThan(0) // looking south sees flat ground only
  })

  test("longitude wraps at 180 / -180 E (and at the 0 / 360 seam)", () => {
    const dem = syntheticGlobal(0)
    const rEq = 1439 // centre 1/32 deg north of the equator
    // a 1 km block of terrain just east of 180 E (columns 2881.. = 180.09 E .. = -179.9 E)
    for (let r = rEq - 3; r <= rEq + 3; r++) for (let c = 2881; c <= 2884; c++) set(dem, r, c, 1000)
    const pin = { lat: rowLat(dem, rEq), lon: 179.96875 } // west of the meridian, in the last half of the grid
    const hz = computeHorizonGlobal(pin, 0, 0, dem)
    console.log(`wrap: horizon east (az 90) ${hz[180].toFixed(3)} deg, west (az 270) ${hz[540].toFixed(3)} deg`)
    expect(hz[180]).toBeGreaterThan(5) // sees the block across the meridian
    expect(hz[540]).toBeLessThan(0)
    // identical heights however the longitude is written
    expect(sampleGlobal(dem, pin.lat, 180.1)).toBe(sampleGlobal(dem, pin.lat, -179.9))
    expect(sampleGlobal(dem, 5, 359.99)).toBe(sampleGlobal(dem, 5, -0.01))
  })

  test("near the poles: finite horizon at 89.99 N and S", () => {
    const dem = syntheticGlobal(100)
    for (const lat of [89.99, -89.99]) {
      const hz = computeHorizonGlobal({ lat, lon: 10 }, 100, 0, dem)
      expect(hz.every(Number.isFinite)).toBe(true)
      expect(Math.max(...hz)).toBeLessThanOrEqual(0.05)
    }
  })
})

describe("terrain source router", () => {
  test("Polar HD at 84 S or further south, Global elsewhere (both poles, equator)", () => {
    expect(terrainSourceFor(-84)).toBe("polar-hd")
    expect(terrainSourceFor(-89.45)).toBe("polar-hd")
    expect(terrainSourceFor(-83.99)).toBe("global")
    expect(terrainSourceFor(0.674)).toBe("global")
    expect(terrainSourceFor(89.45)).toBe("global") // north pole: Global terrain
    expect(terrainSourceFor(-89.45, false)).toBe("global") // no polar grids in this build
    expect(tierForSource("polar-hd")).toBe("polar")
    expect(tierForSource("global")).toBe("global")
  })
})

describe.skipIf(!hasRealData())("extended ephemeris (2026-2035)", () => {
  test("interpolated table vs SPICE at off-grid times: error < 0.001 deg", () => {
    const { ephemeris } = loadRealData()
    const ref = readFixture("ephemeris_reference.json")
    const angle = (a, b) => {
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
      const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
      return Math.atan2(cross, dot) * R2D
    }
    let worst = { sun: 0, earth: 0 }
    for (const s of ref.samples) {
      worst.sun = Math.max(worst.sun, angle(ephemeris.vectorAt("sun", s.unix_s * 1000), s.sun_km))
      worst.earth = Math.max(worst.earth, angle(ephemeris.vectorAt("earth", s.unix_s * 1000), s.earth_km))
    }
    console.log(`ephemeris step ${ref.step_s} s, ${ref.samples.length} samples: max error Sun ${worst.sun.toExponential(2)} deg, Earth ${worst.earth.toExponential(2)} deg`)
    expect(worst.sun).toBeLessThan(ref.tolerance_deg)
    expect(worst.earth).toBeLessThan(ref.tolerance_deg)
    expect(ephemeris.endMs).toBeGreaterThanOrEqual(Date.UTC(2035, 11, 31))
  })

  test("Sun and Earth az/el vs JPL Horizons, every set (polar, non-polar, 2033-2035) < 0.1 deg", () => {
    const { ephemeris } = loadRealData()
    const fx = readFixture("horizons.json")
    const worst = {}
    for (const rec of fx.records) {
      const t = Date.parse(rec.time_ut.replace(/^(\d{4})-(\w{3})-(\d{2})/, "$2 $3 $1") + " UTC")
      const { azDeg, elDeg } = azElFromSite(makeSite(rec.lat, rec.lon, 0, 0), ephemeris.vectorAt(rec.body, t))
      const dAz = Math.abs(((azDeg - rec.az_deg + 540) % 360) - 180)
      const dEl = Math.abs(elDeg - rec.el_deg)
      worst[rec.set] = Math.max(worst[rec.set] || 0, dAz, dEl)
    }
    console.log(`Horizons, JS az/el max error by set: ${JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, +v.toExponential(2)])))}`)
    expect(Object.keys(worst).sort()).toEqual(["late", "nonpolar", "polar"])
    for (const v of Object.values(worst)) expect(v).toBeLessThan(0.1)
  })
})

describe.skipIf(!hasGlobalDem())("global DEM (real data)", () => {
  test("JS global horizon equals the Python reference (raw PDS LDEM_16) within 0.2 deg", async () => {
    const dem = await loadGlobalDem()
    for (const p of readFixture("horizon_reference.json").global_pins) {
      const ground = sampleGlobal(dem, p.lat, p.lon)
      expect(Math.abs(ground - p.groundM)).toBeLessThan(0.01)
      const t0 = performance.now()
      const hz = computeHorizonGlobal(p, ground, p.antennaM, dem)
      const ms = performance.now() - t0
      let worst = 0
      hz.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - p.horizon[i]))))
      console.log(`global pin (${p.lat}, ${p.lon}) ground ${ground.toFixed(1)} m: max |JS - Python| = ${worst.toFixed(6)} deg; ${ms.toFixed(0)} ms`)
      expect(worst).toBeLessThanOrEqual(0.2)
    }
  }, 120000)

  test("records Global vs Polar HD horizon at 86 S (why Polar HD matters; no pass/fail)", async () => {
    const dem = await loadGlobalDem()
    const { grids } = loadRealData()
    const lat = -86
    const lon = 180
    const xy = project(lat, lon)
    const groundPolar = groundAt(grids, xy.x, xy.y)
    const groundGlobal = sampleGlobal(dem, lat, lon)
    const polar = computeHorizon(xy, groundPolar, 2, grids)
    const global = computeHorizonGlobal({ lat, lon }, groundGlobal, 2, dem)
    let max = 0
    let sum = 0
    let at = 0
    polar.forEach((v, i) => {
      const d = Math.abs(v - global[i])
      sum += d
      if (d > max) [max, at] = [d, i * 0.5]
    })
    console.log(`86 S 180 E: ground Polar HD ${groundPolar.toFixed(1)} m vs Global ${groundGlobal.toFixed(1)} m; ` +
      `horizon |Polar HD - Global| mean ${(sum / polar.length).toFixed(3)} deg, max ${max.toFixed(3)} deg (az ${at})`)
    expect(Number.isFinite(max)).toBe(true)
  }, 120000)
})
