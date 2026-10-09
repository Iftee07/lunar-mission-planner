// Phase 6 tests (PRD v3): rating boundaries, days formatting, split Sun/Earth observer heights.
import { describe, expect, test } from "vitest"
import { siteAccessor } from "../src/engine/data.js"
import { computeHorizon } from "../src/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, computeSiteHours } from "../src/engine/hours.js"
import { bodyDurations, rateEarth, rateLanding, rateSun } from "../src/engine/ratings.js"
import { formatDays } from "../src/lib/format.js"
import { ANTENNA_PRESETS_M } from "../src/state.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

// computeHours()-shaped result: in view at T for `onH` hours (null = no change within the lookahead).
const lit = (onH, windowVisibleHours = Math.min(onH ?? 156, 156)) => ({
  visibleNow: true,
  hoursToChange: onH,
  nextPeriodHours: 300,
  continuous: onH === null,
  windowVisibleHours,
  windowHiddenHours: 156 - windowVisibleHours,
  lookaheadTruncated: false,
})
const dark = (toRiseH, windowVisibleHours) => ({
  visibleNow: false,
  hoursToChange: toRiseH,
  nextPeriodHours: 200,
  continuous: false,
  windowVisibleHours,
  windowHiddenHours: 156 - windowVisibleHours,
  lookaheadTruncated: false,
})

describe("rateSun (continuous sunlight from T)", () => {
  test.each([
    [155.99, "bad", "Not recommended"],
    [156, "good", "Good"],
    [191.99, "good", "Good"],
    [192, "perfect", "Perfect"],
    [null, "perfect", "Perfect"], // continuous beyond the lookahead
  ])("lit for %s h -> %s", (h, level, label) => {
    const r = rateSun(lit(h))
    expect(r.level).toBe(level)
    expect(r.label).toBe(label)
  })

  test("dark at T is Not recommended, whatever comes next", () => {
    expect(rateSun(dark(0.5, 155.5)).level).toBe("bad")
  })

  test("colour tokens", () => {
    expect([rateSun(lit(200)).color, rateSun(lit(170)).color, rateSun(lit(10)).color]).toEqual(["ok", "warn", "bad"])
  })
})

describe("rateEarth (visible from T, 156 h window)", () => {
  test.each([
    [0.2499, "bad"],
    [0.25, "good"],
  ])("hidden at T, window fraction %s -> %s", (frac, level) => {
    expect(rateEarth(dark(10, frac * 156)).level).toBe(level)
  })

  test.each([
    [155.99, 155.75, "good"],
    [156, 156, "perfect"],
    [null, 156, "perfect"],
  ])("continuously visible for %s h (window %s h) -> %s", (h, windowH, level) => {
    expect(rateEarth(lit(h, windowH)).level).toBe(level)
  })

  test("visible at T but under 25% of the window is Not recommended", () => {
    expect(rateEarth(lit(20, 30)).level).toBe("bad")
  })
})

describe("rateLanding (plane-fit slope)", () => {
  test.each([
    [7.99, "possible", "Possible"],
    [8.0, "bad", "Not possible"],
    [NaN, "bad", "Not possible"],
    [undefined, "bad", "Not possible"],
  ])("%s deg -> %s", (deg, level, label) => {
    const r = rateLanding(deg)
    expect(r.level).toBe(level)
    expect(r.label).toBe(label)
  })
})

describe("bodyDurations (section 3 definitions)", () => {
  test("lit at T: on = hoursToChange, off = next dark period", () => {
    expect(bodyDurations(lit(100))).toMatchObject({ onHours: 100, offHours: 300 })
  })
  test("dark at T: on = 0, off = time until it rises", () => {
    expect(bodyDurations(dark(42, 0))).toMatchObject({ onHours: 0, offHours: 42 })
  })
  test("no change within the lookahead: Infinity", () => {
    expect(bodyDurations(lit(null)).onHours).toBe(Infinity)
  })
  test("next dark period starts inside the lookahead but does not end: open lower bound", () => {
    const r = { ...lit(1474), nextPeriodHours: null }
    expect(bodyDurations(r)).toMatchObject({ onHours: 1474, offHours: 26, offOpen: true })
    expect(formatDays(26, 1, true)).toBe("1.1+ d")
  })
})

describe("formatDays (the only hours -> days conversion)", () => {
  test.each([
    [156, "6.5 d"],
    [218.4, "9.1 d"],
    [0, "0 d"],
    [null, "62.5+ d"],
    [Infinity, "62.5+ d"],
  ])("%s h -> %s", (h, text) => {
    expect(formatDays(h)).toBe(text)
  })
})

describe("antenna model", () => {
  test("presets are 2, 5, 10, 15 m and the Sun reference height is 2 m", () => {
    expect(ANTENNA_PRESETS_M).toEqual([2, 5, 10, 15])
    expect(SUN_REFERENCE_HEIGHT_M).toBe(2)
  })
})

describe.skipIf(!hasRealData())("antenna model on real data", () => {
  const data = hasRealData() ? loadRealData() : null
  const pins = hasRealData() ? readFixture("horizon_reference.json").pins : []
  const times = ["2026-11-01T00:00:00Z", "2027-02-14T12:00:00Z"].map(Date.parse)

  test("antenna never changes Sun hours; 2 -> 15 m never decreases Earth visible hours", () => {
    for (const p of pins) {
      const pin = { lat: p.lat, lon: p.lon, groundM: p.groundM }
      const hz = (m) => computeHorizon({ x: p.x, y: p.y }, p.groundM, m, data.grids)
      const horizonSun = hz(SUN_REFERENCE_HEIGHT_M)
      const tableAccessor = siteAccessor(data.ephemeris, pin)
      const horizonsEarth = ANTENNA_PRESETS_M.map(hz)
      for (const tMs of times) {
        const runs = ANTENNA_PRESETS_M.map((antennaM, i) =>
          computeSiteHours({ pin, horizonSun, horizonEarth: horizonsEarth[i], antennaM, tableAccessor, tMs, sunMode: "center" }),
        )
        for (let i = 1; i < runs.length; i++) {
          expect(runs[i].sun).toEqual(runs[0].sun)
          expect(runs[i].sunNow).toEqual(runs[0].sunNow)
          const a = runs[i - 1].earth
          const b = runs[i].earth
          expect(b.windowVisibleHours).toBeGreaterThanOrEqual(a.windowVisibleHours)
          if (a.visibleNow) expect(b.visibleNow).toBe(true)
          // continuous visible time from T, within the 0.01 h bisection tolerance
          expect(bodyDurations(b).onHours).toBeGreaterThanOrEqual(bodyDurations(a).onHours - 0.02)
        }
        const e2 = runs[0].earth
        const e15 = runs.at(-1).earth
        console.log(`(${p.lat}, ${p.lon}) ${new Date(tMs).toISOString()} Earth window visible: ` +
          `2 m ${e2.windowVisibleHours} h, 15 m ${e15.windowVisibleHours} h; Sun ${formatDays(bodyDurations(runs[0].sun).onHours)} lit`)
      }
    }
  }, 180000)
})
