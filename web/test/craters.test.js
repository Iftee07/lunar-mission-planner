// Phase 9b tests (PRD v3): crater geometry and placement against the terrain model.
import fs from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { angularDistanceDeg, clipRingToDisc, craterAt, craterRadiusDeg, rimPoints } from "../src/engine/craters.js"
import { groundAt } from "../src/engine/horizon.js"
import { project } from "../src/engine/projection.js"
import { DATA_DIR, hasRealData, loadRealData } from "./load.js"

const R_KM = 1737.4

describe("crater geometry", () => {
  const c = { name: "Test", lat: -88, lon: 45, diameter_km: 40 }

  test("every rim point lies at the crater's angular radius", () => {
    const r = craterRadiusDeg(c.diameter_km, R_KM)
    for (const p of rimPoints(c, R_KM)) expect(angularDistanceDeg(c.lat, c.lon, p.lat, p.lon)).toBeCloseTo(r, 9)
  })

  test("craterAt returns the smallest containing crater, or null", () => {
    const inner = { name: "Inner", lat: -88, lon: 45, diameter_km: 5 }
    expect(craterAt([c, inner], -88, 45, R_KM).name).toBe("Inner")
    expect(craterAt([c, inner], -88.4, 45, R_KM).name).toBe("Test") // ~12 km from the centre
    expect(craterAt([c, inner], -86, 45, R_KM)).toBeNull()
  })
})

const cratersFile = path.join(DATA_DIR, "craters.json")
describe.skipIf(!hasRealData() || !fs.existsSync(cratersFile))("craters.json on real data", () => {
  const craters = fs.existsSync(cratersFile) ? JSON.parse(fs.readFileSync(cratersFile, "utf8")) : []
  const data = hasRealData() ? loadRealData() : null

  test("known south polar craters are present", () => {
    const names = craters.map((c) => c.name)
    for (const n of ["Shackleton", "de Gerlache", "Faustini", "Haworth", "Shoemaker"]) expect(names).toContain(n)
  })

  test("each crater inside the terrain grid is a depression: centre lower than its rim", () => {
    const R = data.manifest.moon_radius_m
    const rows = []
    for (const c of craters) {
      const ctr = project(c.lat, c.lon, R)
      const zc = groundAt(data.grids, ctr.x, ctr.y)
      const rim = rimPoints(c, R / 1000, 36)
        .map((p) => project(p.lat, p.lon, R))
        .map((q) => groundAt(data.grids, q.x, q.y))
      if (!Number.isFinite(zc) || rim.some((z) => !Number.isFinite(z))) continue // partly off the grid
      const rimMean = rim.reduce((a, b) => a + b, 0) / rim.length
      rows.push({ name: c.name, diameterKm: c.diameter_km, centreM: Math.round(zc), rimMeanM: Math.round(rimMean), depthM: Math.round(rimMean - zc) })
    }
    console.table(rows)
    expect(rows.length).toBeGreaterThanOrEqual(15)
    const shallow = rows.filter((r) => r.depthM <= 0)
    // Old degraded craters can be filled; require nearly all to be clear depressions.
    expect(shallow.length).toBeLessThanOrEqual(Math.floor(rows.length * 0.1))
    expect(rows.find((r) => r.name === "Shackleton").depthM).toBeGreaterThan(2000)
  })
})

describe("clipRingToDisc", () => {
  const ring = (cx, cy, r, n = 72) =>
    Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((i / n) * 2 * Math.PI), y: cy + r * Math.sin((i / n) * 2 * Math.PI) }))

  test("fully inside: one closed ring", () => {
    const parts = clipRingToDisc(ring(0, 0, 10), 100)
    expect(parts.length).toBe(1)
    expect(parts[0].length).toBe(73)
  })

  test("fully outside: nothing", () => {
    expect(clipRingToDisc(ring(500, 0, 10), 100)).toEqual([])
  })

  test("straddling the edge: every drawn point is inside, ends exactly on the edge", () => {
    const parts = clipRingToDisc(ring(100, 0, 30), 100)
    expect(parts.length).toBe(1)
    for (const p of parts[0]) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(100 + 1e-9)
    expect(Math.hypot(parts[0][0].x, parts[0][0].y)).toBeCloseTo(100, 9)
    expect(Math.hypot(parts[0].at(-1).x, parts[0].at(-1).y)).toBeCloseTo(100, 9)
  })
})
