// Phase 3 engine tests (PRD section 9, phase 3). Run with `npm test`.
import proj4 from "proj4"
import { describe, expect, test } from "vitest"
import { createGrid, siteAccessor } from "../src/engine/data.js"
import { MOON_RADIUS_M, azElFromSite, makeSite } from "../src/engine/geometry.js"
import { computeHorizon, groundAt } from "../src/engine/horizon.js"
import { computeHours } from "../src/engine/hours.js"
import { project, unproject } from "../src/engine/projection.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

const R = MOON_RADIUS_M
const D2R = Math.PI / 180
const HOUR_MS = 3600000

// Synthetic square grid centred on the pole: width x width pixels of pixelM, filled with fillM.
function syntheticGrid(width, pixelM, fillM = 0) {
  const half = (width * pixelM) / 2
  const data = new Int16Array(width * width).fill(Math.round(fillM / 0.5))
  return createGrid(
    { file: "synthetic", width, height: width, pixel_m: pixelM, x_min: -half, y_max: half, scale: 0.5, nodata: -32768 },
    data,
  )
}

// Deterministic pseudo-random numbers for reproducible test points.
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

describe("horizon on synthetic terrain", () => {
  test("flat zero DEM: horizon within 0.05 deg of 0 at every azimuth", () => {
    const grids = { near: syntheticGrid(1001, 120), far: syntheticGrid(1701, 240), radiusM: R }
    const hz = computeHorizon({ x: 0, y: 0 }, 0, 0, grids)
    let worst = 0
    for (const v of hz) worst = Math.max(worst, Math.abs(v))
    console.log(`flat DEM: max |horizon| = ${worst.toFixed(5)} deg`)
    expect(worst).toBeLessThanOrEqual(0.05)
  })

  test("single 1000 m pillar 10 km north: horizon at azimuth 0 = atan(1000/10000) - 10000/(2R)", () => {
    // 100 m pixels, pixel centres on multiples of 100 m: pole at pixel (150,150), pillar at (row 50, col 150).
    const near = syntheticGrid(301, 100)
    near.data[50 * 301 + 150] = 1000 / 0.5
    const hz = computeHorizon({ x: 0, y: 0 }, 0, 0, { near, far: null, radiusM: R })
    const expected = (Math.atan(1000 / 10000) - 10000 / (2 * R)) / D2R
    console.log(`pillar: horizon[0] = ${hz[0].toFixed(4)} deg, expected ${expected.toFixed(4)} deg`)
    expect(Math.abs(hz[0] - expected)).toBeLessThanOrEqual(0.1)
    expect(hz[180]).toBeLessThan(0.01) // looking south (azimuth 90 deg) sees no pillar
  })
})

describe("hours on a synthetic sun path", () => {
  test("bisection error <= 0.01 h for a known horizon crossing", () => {
    // Observer at the pole on a flat horizon. Sun elevation is a triangle in time:
    // rises through 0 deg at T_RISE, sets at T_SET (hours after start), azimuth fixed at 100 deg.
    const T_RISE = 37.123
    const T_SET = 162.877
    const pin = { lat: -90, lon: 0, groundM: 0 }
    const site = makeSite(pin.lat, pin.lon, pin.groundM, 0)
    const startMs = Date.UTC(2027, 0, 1)
    const D = 1.5e8
    const accessor = {
      pin,
      vectorAt(body, tMs) {
        const h = (tMs - startMs) / HOUR_MS
        const el = 0.05 * Math.min(h - T_RISE, T_SET - h) * D2R
        const az = 100 * D2R
        const dir = [0, 1, 2].map(
          (k) => Math.cos(el) * (Math.cos(az) * site.north[k] + Math.sin(az) * site.east[k]) + Math.sin(el) * site.up[k],
        )
        return dir.map((c, k) => site.posKm[k] + D * c)
      },
    }
    // geometry sanity: the accessor really produces that az/el
    const chk = azElFromSite(site, accessor.vectorAt("sun", startMs + 50 * HOUR_MS))
    expect(chk.azDeg).toBeCloseTo(100, 6)

    const r = computeHours("sun", new Float32Array(720), accessor, startMs, 0, "center")
    console.log(`synthetic: change at ${r.hoursToChange.toFixed(4)} h (true ${T_RISE}), ` +
      `period ${r.nextPeriodHours.toFixed(4)} h (true ${(T_SET - T_RISE).toFixed(3)})`)
    expect(r.visibleNow).toBe(false)
    expect(Math.abs(r.hoursToChange - T_RISE)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(r.hoursToChange + r.nextPeriodHours - T_SET)).toBeLessThanOrEqual(0.01)
    expect(r.continuous).toBe(false)
  })
})

describe("projection", () => {
  test("closed form vs proj4 at 10 random points within 0.01 pixel", () => {
    const manifestProj = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
    const proj = hasRealData() ? loadRealData().manifest.proj4 : manifestProj
    const t = proj4("+proj=longlat +R=1737400 +no_defs", proj)
    const rand = rng(7)
    let worst = 0
    for (let i = 0; i < 10; i++) {
      const lat = -84 - 5.9 * rand()
      const lon = -180 + 360 * rand()
      const a = project(lat, lon)
      const [bx, by] = t.forward([lon, lat])
      const back = unproject(a.x, a.y)
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-9)
      expect(Math.abs(((back.lon - lon + 540) % 360) - 180)).toBeLessThan(1e-9)
      worst = Math.max(worst, Math.hypot(a.x - bx, a.y - by) / 120)
    }
    console.log(`projection: max closed form vs proj4 = ${worst.toExponential(2)} px (120 m)`)
    expect(worst).toBeLessThanOrEqual(0.01)
  })
})

describe.skipIf(!hasRealData())("real data (needs pipeline outputs and fixtures)", () => {
  const data = hasRealData() ? loadRealData() : null
  const horizonRef = hasRealData() ? readFixture("horizon_reference.json").pins : []
  const jsHorizons = new Map()
  const horizonFor = (p, antennaM) => {
    const key = `${p.lat},${p.lon},${antennaM}`
    if (!jsHorizons.has(key)) {
      jsHorizons.set(key, computeHorizon({ x: p.x, y: p.y }, p.groundM, antennaM, data.grids))
    }
    return jsHorizons.get(key)
  }

  test("JS horizon equals the Python reference within 0.2 deg at 3 pins", () => {
    for (const p of horizonRef) {
      const g = groundAt(data.grids, p.x, p.y)
      expect(Math.abs(g - p.groundM)).toBeLessThan(0.01)
      const t0 = performance.now()
      const hz = horizonFor(p, p.antennaM)
      const ms = performance.now() - t0
      let worst = 0
      let at = 0
      hz.forEach((v, i) => {
        const d = Math.abs(v - p.horizon[i])
        if (d > worst) [worst, at] = [d, i * 0.5]
      })
      console.log(`pin (${p.lat}, ${p.lon}) ground ${p.groundM.toFixed(1)} m: max |JS - Python| = ` +
        `${worst.toFixed(5)} deg (az ${at}); computeHorizon ${ms.toFixed(0)} ms`)
      expect(worst).toBeLessThanOrEqual(0.2)
    }
  }, 120000)

  test("JS hours equal the Python reference within 0.25 h (2 pins x 2 times x 2 bodies)", () => {
    const cases = readFixture("hours_reference.json").cases
    expect(cases.length).toBe(8)
    for (const c of cases) {
      const p = horizonRef.find((q) => q.lat === c.lat && q.lon === c.lon)
      const acc = siteAccessor(data.ephemeris, { lat: p.lat, lon: p.lon, groundM: p.groundM })
      const r = computeHours(c.body, horizonFor(p, p.antennaM), acc, Date.parse(c.timeUtc), p.antennaM, "center")
      const show = (v) => (v === null ? "-" : v.toFixed(2))
      console.log(`(${c.lat}, ${c.lon}) ${c.timeUtc} ${c.body.padEnd(5)} now ${r.visibleNow}/${c.visibleNow}  ` +
        `change ${show(r.hoursToChange)}/${show(c.hoursToChange)}  next ${show(r.nextPeriodHours)}/${show(c.nextPeriodHours)}  ` +
        `window ${r.windowVisibleHours}/${c.windowVisibleHours}  (JS/Python)`)
      expect(r.visibleNow).toBe(c.visibleNow)
      expect(r.continuous).toBe(c.continuous)
      for (const k of ["hoursToChange", "nextPeriodHours"]) {
        if (c[k] === null) expect(r[k]).toBeNull()
        else expect(Math.abs(r[k] - c[k])).toBeLessThanOrEqual(0.25)
      }
      expect(Math.abs(r.windowVisibleHours - c.windowVisibleHours)).toBeLessThanOrEqual(0.25)
    }
  }, 120000)

  test("antenna 0 -> 10 m never decreases visible hours", () => {
    const times = ["2026-11-01T00:00:00Z", "2027-02-14T12:00:00Z"].map(Date.parse)
    for (const p of horizonRef) {
      const h0 = horizonFor(p, 0)
      const h10 = horizonFor(p, 10)
      h0.forEach((v, i) => expect(h10[i]).toBeLessThanOrEqual(v + 1e-6))
      const acc = siteAccessor(data.ephemeris, { lat: p.lat, lon: p.lon, groundM: p.groundM })
      for (const t of times) {
        for (const body of ["sun", "earth"]) {
          const a = computeHours(body, h0, acc, t, 0, "center")
          const b = computeHours(body, h10, acc, t, 10, "center")
          expect(b.windowVisibleHours).toBeGreaterThanOrEqual(a.windowVisibleHours)
          if (a.visibleNow) expect(b.visibleNow).toBe(true)
        }
      }
    }
  }, 120000)
})
