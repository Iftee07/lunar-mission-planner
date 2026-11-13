// "Move a little" sensitivity (engine/sensitivity.js): ring geometry and the window shares.
import { describe, expect, test } from "vitest"
import { siteAccessor } from "../src/engine/data.js"
import { MOON_RADIUS_M } from "../src/engine/geometry.js"
import { computeHorizon, groundAt } from "../src/engine/horizon.js"
import { siteMetrics } from "../src/engine/metrics.js"
import {
  RING_POINTS,
  destination,
  rampColor,
  ringPoints,
  ringRadiusFor,
  shareRange,
  surfaceDistanceM,
  windowShares,
} from "../src/engine/sensitivity.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

describe("ring points", () => {
  const centres = [
    { lat: -89.45, lon: -137.3 }, // Shackleton rim, near the pole
    { lat: -89.99, lon: 0 }, // a few hundred metres from the pole: the ring crosses many meridians
    { lat: 0.674, lon: 23.473 }, // Apollo 11, equator
    { lat: -45.457, lon: 179.95 }, // longitude wrap at 180 E
    { lat: 60, lon: -179.99 },
  ]
  test("each of the 8 points lies at the requested radius (within 1%)", () => {
    for (const c of centres) {
      for (const r of [250, 500, 1000, 5000, 10000, 20000]) {
        const pts = ringPoints(c.lat, c.lon, r)
        expect(pts).toHaveLength(RING_POINTS)
        for (const p of pts) {
          const d = surfaceDistanceM(c, p)
          expect(Math.abs(d - r) / r).toBeLessThan(0.01)
          expect(p.lon).toBeGreaterThan(-180)
          expect(p.lon).toBeLessThanOrEqual(180)
        }
      }
    }
  })

  test("azimuths step 45 deg from north; north is further north, east has a larger longitude", () => {
    const pts = ringPoints(-60, 10, 1000)
    expect(pts.map((p) => p.azDeg)).toEqual([0, 45, 90, 135, 180, 225, 270, 315])
    expect(pts[0].lat).toBeGreaterThan(-60)
    expect(pts[4].lat).toBeLessThan(-60)
    expect(pts[2].lon).toBeGreaterThan(10)
    expect(pts[6].lon).toBeLessThan(10)
  })

  test("destination: a quarter of the circumference north of the equator reaches the pole", () => {
    const p = destination(0, 30, 0, (Math.PI / 2) * MOON_RADIUS_M)
    expect(p.lat).toBeCloseTo(90, 9)
  })

  test("radius choice follows the terrain; Global never goes below 5 km", () => {
    expect(ringRadiusFor("polar-hd", 250)).toBe(250)
    expect(ringRadiusFor("polar-hd", 5000)).toBe(500)
    expect(ringRadiusFor("global", 500)).toBe(5000)
    expect(ringRadiusFor("global", 10000)).toBe(10000)
  })
})

describe("shares", () => {
  test("shareRange skips missing points", () => {
    const e = [{ sunlitFraction: 0.5, earthFraction: 1 }, null, { sunlitFraction: 0.18, earthFraction: 0.3 }, { sunlitFraction: 0.74, earthFraction: NaN }]
    expect(shareRange(e, "sunlitFraction")).toEqual({ min: 0.18, max: 0.74 })
    expect(shareRange(e, "earthFraction")).toEqual({ min: 0.3, max: 1 })
    expect(shareRange([null], "sunlitFraction")).toBeNull()
  })

  test("rampColor ends and middle", () => {
    expect(rampColor(0, [0, 0, 0], [200, 100, 50])).toEqual([0, 0, 0])
    expect(rampColor(1.5, [0, 0, 0], [200, 100, 50])).toEqual([200, 100, 50])
    expect(rampColor(0.5, [0, 0, 0], [200, 100, 50])).toEqual([100, 50, 25])
  })

  test.skipIf(!hasRealData())("windowShares equals the mission metrics' sunlit and Earth shares (real data)", () => {
    const data = loadRealData()
    const ref = readFixture("horizon_reference.json").pins[0]
    const pin = { lat: ref.lat, lon: ref.lon, groundM: groundAt(data.grids, ref.x, ref.y) }
    const horizonSun = computeHorizon({ x: ref.x, y: ref.y }, pin.groundM, 2, data.grids)
    const horizonEarth = computeHorizon({ x: ref.x, y: ref.y }, pin.groundM, 10, data.grids)
    for (const iso of ["2027-04-10T12:00:00Z", "2030-01-01T00:00:00Z"]) {
      const args = { pin, horizonSun, horizonEarth, antennaM: 10, tableAccessor: siteAccessor(data.ephemeris, pin), tMs: Date.parse(iso), sunMode: "center", missionH: 156 }
      const s = windowShares(args)
      const m = siteMetrics(args)
      expect(s.sunlitFraction).toBeCloseTo(m.sunlitFraction, 12)
      expect(s.earthFraction).toBeCloseTo(m.earthFraction, 12)
    }
    expect(windowShares({ pin, horizonSun, horizonEarth, antennaM: 10, tableAccessor: siteAccessor(data.ephemeris, pin), tMs: Date.UTC(2040, 0, 1), sunMode: "center", missionH: 156 })).toBeNull()
  })
})

describe("ring markers (view/ringModel.js)", () => {
  test("colour on the theme ramp, null without a value", async () => {
    const { ringMarkers } = await import("../src/view/ringModel.js")
    const theme = { layerSunLow: "#000000", sun: "#ff0000", earth: "#0000ff" }
    const pts = [
      { lat: -89, lon: 0, shares: { sunlitFraction: 1, earthFraction: 0.5 } },
      { lat: -89, lon: 1, shares: null, note: "other terrain" },
    ]
    expect(ringMarkers(pts, "sun", theme)).toEqual([
      { lat: -89, lon: 0, value: 1, color: "rgb(255, 0, 0)" },
      { lat: -89, lon: 1, value: null, color: null },
    ])
    expect(ringMarkers(pts, "earth", theme)[0].color).toBe("rgb(0, 0, 128)")
  })
})
