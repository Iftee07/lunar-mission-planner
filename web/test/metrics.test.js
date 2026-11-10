// Visibility intervals, mission metrics, and tiered data loading.
import { describe, expect, test } from "vitest"
import { createDataLoader, siteAccessor } from "../src/engine/data.js"
import { computeHorizon, groundAt } from "../src/engine/horizon.js"
import { computeHorizonGlobal, sampleGlobal } from "../src/engine/horizonGlobal.js"
import { clearanceDeg, siteMetrics } from "../src/engine/metrics.js"
import { longestGapHours, nextWindows, overlapHours, sampleVisibility, totalHours } from "../src/engine/series.js"
import { terrainSourceFor, tierForSource } from "../src/engine/terrain.js"
import { hasGlobalDem, loadGlobalDem, loadRealData, readFixture } from "./load.js"

const HOUR_MS = 3600000
const T0 = Date.UTC(2027, 0, 1)
// visible(t) from a list of [startH, endH) windows; null from cutoffH on (end of the ephemeris)
const windows = (list, cutoffH = Infinity) => (tMs) => {
  const h = (tMs - T0) / HOUR_MS
  if (h > cutoffH + 1e-9) return null
  return list.some(([a, b]) => h >= a && h < b)
}

describe("sampleVisibility (synthetic)", () => {
  test("always visible: one open interval over the whole span", () => {
    const r = sampleVisibility(() => true, T0, 156)
    expect(r.intervals).toEqual([{ startH: 0, endH: 156, openStart: true, openEnd: true }])
    expect(r.coveredH).toBe(156)
    expect(r.truncated).toBe(false)
  })

  test("never visible: no intervals, longest gap = span", () => {
    const r = sampleVisibility(() => false, T0, 156)
    expect(r.intervals).toEqual([])
    expect(longestGapHours(r.intervals, r.coveredH)).toBe(156)
  })

  test("grazing double crossing: short rise-and-set and a second window, edges within 0.01 h", () => {
    const truth = [[10.123, 10.987], [40.5, 63.2]]
    const r = sampleVisibility(windows(truth), T0, 156)
    expect(r.intervals.length).toBe(2)
    r.intervals.forEach((iv, i) => {
      expect(Math.abs(iv.startH - truth[i][0])).toBeLessThanOrEqual(0.01)
      expect(Math.abs(iv.endH - truth[i][1])).toBeLessThanOrEqual(0.01)
      expect(iv.openStart || iv.openEnd).toBe(false)
    })
    expect(Math.abs(totalHours(r.intervals) - (0.864 + 22.7))).toBeLessThanOrEqual(0.04)
    expect(Math.abs(longestGapHours(r.intervals, 156) - (156 - 63.2))).toBeLessThanOrEqual(0.01)
  })

  test("cut off at the end of the ephemeris: covered hours stop there, last window stays open", () => {
    const r = sampleVisibility(windows([[90, 500]], 100), T0, 156)
    expect(r.truncated).toBe(true)
    expect(r.coveredH).toBe(100)
    expect(r.intervals.length).toBe(1)
    expect(r.intervals[0].openEnd).toBe(true)
    expect(r.intervals[0].endH).toBe(100)
  })

  test("nextWindows: the next 5 windows, the first already open at T", () => {
    const list = [[0, 3], [10, 12], [20, 21], [30, 35], [50, 51], [70, 80]]
    const next = nextWindows(windows(list), T0)
    expect(next.length).toBe(5)
    expect(next[0].openStart).toBe(true)
    expect(next.map((w) => Math.round(w.startH))).toEqual([0, 10, 20, 30, 50])
  })

  test("clearanceDeg: body elevation minus the horizon at the body's azimuth", () => {
    const horizon = new Float32Array(720).fill(2)
    horizon[180] = 5 // azimuth 90
    expect(clearanceDeg({ azDeg: 90, elDeg: 5 }, horizon)).toBe(0)
    expect(clearanceDeg({ azDeg: 270, elDeg: 1.5 }, horizon)).toBe(-0.5)
    expect(clearanceDeg({ azDeg: 90.25, elDeg: 4 }, horizon)).toBeCloseTo(0.5, 6) // interpolated horizon 3.5
  })

  test("overlapHours of two interval lists", () => {
    const a = [{ startH: 0, endH: 10 }, { startH: 20, endH: 30 }]
    const b = [{ startH: 5, endH: 25 }]
    expect(overlapHours(a, b)).toBe(10)
  })
})

describe.skipIf(!hasGlobalDem())("mission metrics: JS vs Python reference (SPICE)", () => {
  test("fractions within 0.25 h / missionH; longest gaps within 0.25 h; Sun elevation within 0.01 deg", async () => {
    const data = loadRealData()
    const dem = await loadGlobalDem()
    const cases = readFixture("metrics_reference.json").cases
    expect(cases.length).toBe(4)
    for (const c of cases) {
      const source = terrainSourceFor(c.lat)
      let pin
      let horizon
      if (source === "polar-hd") {
        const ref = readFixture("horizon_reference.json").pins.find((p) => p.lat === c.lat && p.lon === c.lon)
        pin = { lat: c.lat, lon: c.lon, groundM: groundAt(data.grids, ref.x, ref.y) }
        horizon = computeHorizon({ x: ref.x, y: ref.y }, pin.groundM, 2, data.grids)
      } else {
        pin = { lat: c.lat, lon: c.lon, groundM: sampleGlobal(dem, c.lat, c.lon) }
        horizon = computeHorizonGlobal(pin, pin.groundM, 2, dem)
      }
      const m = siteMetrics({
        pin,
        horizonSun: horizon,
        horizonEarth: horizon,
        antennaM: 2,
        tableAccessor: siteAccessor(data.ephemeris, pin),
        tMs: Date.parse(c.timeUtc),
        sunMode: "center",
        missionH: c.missionH,
      })
      const tolF = 0.25 / c.missionH
      console.log(`${source} (${c.lat}, ${c.lon}) ${c.timeUtc}: sunlit ${m.sunlitFraction.toFixed(4)}/${c.sunlitFraction.toFixed(4)} ` +
        `earth ${m.earthFraction.toFixed(4)}/${c.earthFraction.toFixed(4)} both ${m.bothFraction.toFixed(4)}/${c.bothFraction.toFixed(4)} ` +
        `dark ${m.longestDarkH.toFixed(2)}/${c.longestDarkH.toFixed(2)} h  Sun el ${m.sunElevationMinDeg.toFixed(3)}..${m.sunElevationMaxDeg.toFixed(3)} (JS/Python)`)
      expect(m.windowH).toBe(c.missionH)
      for (const k of ["sunlitFraction", "earthFraction", "bothFraction"]) expect(Math.abs(m[k] - c[k])).toBeLessThanOrEqual(tolF)
      for (const k of ["sunUpEarthDownH", "longestDarkH", "longestNoEarthH"]) expect(Math.abs(m[k] - c[k])).toBeLessThanOrEqual(0.25)
      for (const k of ["sunElevationNowDeg", "sunElevationMinDeg", "sunElevationMaxDeg"]) expect(Math.abs(m[k] - c[k])).toBeLessThanOrEqual(0.01)
    }
  }, 120000)
})

describe("tiered data loading", () => {
  // A minimal manifest with tiny files; fetch is mocked and records every URL asked for.
  const manifest = {
    moon_radius_m: 1737400,
    ephemeris: { file: "ephemeris.bin", utc_start_unix_s: 0, step_s: 1800, count: 2, frame: "MOON_ME" },
    grids: {
      near: { file: "dem_near.bin", width: 2, height: 2, pixel_m: 120, x_min: -120, y_max: 120, scale: 0.5, nodata: -32768 },
      far: { file: "dem_far.bin", width: 2, height: 2, pixel_m: 240, x_min: -240, y_max: 240, scale: 0.5, nodata: -32768 },
    },
    slope: { plane: "slope_plane.bin", max: "slope_max.bin", scale: 0.25, nodata: 255, radius_m: 100, grid: "near" },
    hillshade: "hillshade.png",
    craters: { file: "craters.json" },
    global_dem: { file: "global_dem.bin", width: 4, height: 2, pixels_per_degree: 1, scale: 0.5, bytes_file: 8 },
  }
  const sizes = { "ephemeris.bin": 48, "dem_near.bin": 8, "dem_far.bin": 8, "slope_plane.bin": 4, "slope_max.bin": 4, "global_dem.bin": 8 }
  function mockLoader() {
    const urls = []
    const fetchImpl = async (url) => {
      urls.push(url)
      const name = url.replace("/data/", "")
      if (name === "manifest.json" || name === "craters.json") {
        return new Response(JSON.stringify(name === "craters.json" ? [] : manifest), { headers: { "content-type": "application/json" } })
      }
      return new Response(new Uint8Array(sizes[name]), { headers: { "content-type": "application/octet-stream" } })
    }
    const progress = []
    const loader = createDataLoader({ fetchImpl, onProgress: (tier, done, total) => progress.push([tier, done, total]) })
    return { loader, urls, progress }
  }
  const POLAR_FILES = ["dem_near.bin", "dem_far.bin", "slope_plane.bin", "slope_max.bin"]

  test("start + a non-polar pin (Apollo 11) never fetches the polar tier", async () => {
    const { loader, urls, progress } = mockLoader()
    await loader.ensure("core")
    expect(urls).toEqual(["/data/manifest.json", "/data/ephemeris.bin"])
    await loader.ensure(tierForSource(terrainSourceFor(0.674)))
    expect(urls).toContain("/data/global_dem.bin")
    for (const f of POLAR_FILES) expect(urls).not.toContain(`/data/${f}`)
    expect(progress.at(-1)).toEqual(["global", 8, 8])
  })

  test("a polar pin loads the polar tier once, and nothing global", async () => {
    const { loader, urls } = mockLoader()
    await Promise.all([loader.ensure("polar"), loader.ensure(tierForSource(terrainSourceFor(-89.45)))])
    for (const f of POLAR_FILES) expect(urls.filter((u) => u === `/data/${f}`).length).toBe(1)
    expect(urls).not.toContain("/data/global_dem.bin")
    expect(urls.filter((u) => u === "/data/manifest.json").length).toBe(1)
  })

  test("the globe tier only hands out URLs (no fetch)", async () => {
    const { loader, urls } = mockLoader()
    await loader.ensure("core")
    const n = urls.length
    await loader.ensure("globe")
    expect(urls.length).toBe(n)
  })
})
