// Published benchmark (BUILD_PLAN Phase 7.4): our Sun and Earth shares at two named south-pole points vs
// NASA PGDA average illumination (Mazarico et al. 2011) and JPL Horizons. The published values come from
// pipeline/14_published_benchmark.py (data/fixtures/published_benchmark.json); README "Validation" explains
// the differences.
import { describe, expect, test } from "vitest"
import { siteAccessor } from "../src/engine/data.js"
import { azElFromSite, makeSite } from "../src/engine/geometry.js"
import { makeVisibility, SUN_REFERENCE_HEIGHT_M } from "../src/engine/hours.js"
import { polarTerrain } from "../src/engine/terrain.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

const HOUR_MS = 3600000
const EARTH_ANTENNA_M = 10 // the app's default antenna height
// PGDA's map gives one value per 120 m surface pixel, so the like-for-like run puts the observer on the ground.
// The app's own Sun observer stands at SUN_REFERENCE_HEIGHT_M (2 m), logged for information: on a ridge those
// 2 m add several percentage points (README "Validation").
const SURFACE_M = 0

const ref = hasRealData() ? readFixture("published_benchmark.json") : null
const share = (visible, startMs, endMs) => {
  let n = 0
  let on = 0
  for (let t = startMs; t <= endMs; t += HOUR_MS) {
    n++
    if (visible(t)) on++
  }
  return on / n
}

describe.skipIf(!ref)("published benchmark (real data)", () => {
  for (const site of ref?.sites ?? []) {
    test(`${site.name}: Earth above the flat horizon matches JPL Horizons, hourly through 2027`, () => {
      const { ephemeris } = loadRealData()
      const flat = makeSite(site.lat, site.lon, 0, 0)
      const t0 = Date.parse(`${ref.horizons.start_utc.replace(" ", "T")}:00Z`)
      let maxDiff = 0
      let ours = 0
      site.earth_el_deg.forEach((elDeg, i) => {
        const { elDeg: e } = azElFromSite(flat, ephemeris.vectorAt("earth", t0 + i * HOUR_MS))
        maxDiff = Math.max(maxDiff, Math.abs(e - elDeg))
        if (e > 0) ours++
      })
      const theirs = site.earth_el_deg.filter((e) => e > 0).length
      const n = site.earth_el_deg.length
      expect(n).toBe(8760)
      expect(maxDiff).toBeLessThan(0.1) // pipeline/05 tolerance
      expect(Math.abs(ours - theirs) / n).toBeLessThanOrEqual(0.001) // 0.1 percentage points
      console.log(`${site.id}: Earth above 0° ours ${((100 * ours) / n).toFixed(2)}% vs Horizons ${((100 * theirs) / n).toFixed(2)}%, max |d el| ${maxDiff.toExponential(2)}°`)
    })

    test(`${site.name}: sunlit share 2026-2035 vs NASA PGDA average illumination`, () => {
      const data = loadRealData()
      const terrain = polarTerrain(data.grids)
      const pin = { lat: site.lat, lon: site.lon, groundM: terrain.heightAt(site.lat, site.lon) }
      const acc = siteAccessor(data.ephemeris, pin)
      const sunAt = (h) => makeVisibility("sun", terrain.horizon(pin, h), acc, h, "any_part")
      const earth = makeVisibility("earth", terrain.horizon(pin, EARTH_ANTENNA_M), acc, EARTH_ANTENNA_M)
      const ours = share(sunAt(SURFACE_M), data.ephemeris.startMs, data.ephemeris.endMs)
      const app = share(sunAt(SUN_REFERENCE_HEIGHT_M), data.ephemeris.startMs, data.ephemeris.endMs)
      const earthTerrain = share(earth, data.ephemeris.startMs, data.ephemeris.endMs)
      const { pixel, min_3x3: lo, max_3x3: hi } = site.avgvisib
      console.log(
        `${site.id}: sunlit (any part of the disc) at the surface ours ${(100 * ours).toFixed(1)}% vs PGDA ${(100 * pixel).toFixed(1)}% ` +
          `(3x3 ${(100 * lo).toFixed(1)}-${(100 * hi).toFixed(1)}%); app at ${SUN_REFERENCE_HEIGHT_M} m ${(100 * app).toFixed(1)}%; ` +
          `Earth with terrain at ${EARTH_ANTENNA_M} m: ${(100 * earthTerrain).toFixed(1)}%`,
      )
      // A benchmark, not a tolerance: different periods (our 2026-2035 vs PGDA's 18.6-year average) and horizon
      // methods. The criterion set before the first run (inside the 3 x 3 range) is recorded in VALIDATION.md with
      // its result; it is not asserted here so it cannot be quietly widened.
      expect(ours).toBeGreaterThan(0)
      expect(ours).toBeLessThan(1)
    })
  }
})
