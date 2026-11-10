import fs from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import {
  COMPARE_MAX,
  COMPARE_PRESETS,
  SYNODIC_MONTH_H,
  addCompareEntry,
  bestColumns,
  compareValues,
  monthShiftH,
  siteResults,
} from "../src/engine/compare.js"
import { siteAccessor } from "../src/engine/data.js"
import { computeHorizon } from "../src/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, computeSiteHours } from "../src/engine/hours.js"
import { siteMetrics } from "../src/engine/metrics.js"
import { DATA_DIR, hasRealData, loadRealData, readFixture } from "./load.js"

const pinAt = (lat, lon) => ({ lat, lon, groundM: 0 })

describe("compare list", () => {
  test("a 5th site is rejected; colours are the first free ones", () => {
    let list = []
    for (let i = 0; i < COMPARE_MAX; i++) {
      const r = addCompareEntry(list, { pin: pinAt(-89 + i * 0.1, 10) }, `c${i}`)
      expect(r.error).toBeUndefined()
      list = r.list
    }
    expect(list.map((c) => c.color)).toEqual([0, 1, 2, 3])
    expect(addCompareEntry(list, { pin: pinAt(0, 0) }, "c5").error).toMatch(/4 sites at most/)
    // removing #2 frees its colour for the next site
    const r = addCompareEntry(list.filter((c) => c.id !== "c1"), { pin: pinAt(0, 0) }, "c5")
    expect(r.list.at(-1).color).toBe(1)
  })
  test("the same place twice only with a different date shift", () => {
    const { list } = addCompareEntry([], { pin: pinAt(-89.762, -157.0672) }, "a")
    expect(addCompareEntry(list, { pin: pinAt(-89.762, -157.0672) }, "b").error).toMatch(/Already/)
    expect(addCompareEntry(list, { pin: pinAt(-89.762, -157.0672), shiftH: SYNODIC_MONTH_H }, "b").list).toHaveLength(2)
  })
})

describe("date shifts", () => {
  test("+1 lunar day = one mean synodic month (29.53 d)", () => expect(SYNODIC_MONTH_H).toBeCloseTo(708.73, 2))
  test("+1 month keeps the day and time; clamps to the month's last day", () => {
    const t = Date.UTC(2027, 0, 15, 6, 30)
    expect(t + monthShiftH(t) * 3600000).toBe(Date.UTC(2027, 1, 15, 6, 30))
    const end = Date.UTC(2028, 0, 31, 12)
    expect(end + monthShiftH(end) * 3600000).toBe(Date.UTC(2028, 1, 29, 12)) // leap year
    const dec = Date.UTC(2030, 11, 5)
    expect(dec + monthShiftH(dec) * 3600000).toBe(Date.UTC(2031, 0, 5))
  })
})

describe("best value in each row", () => {
  test("max / min, ties all glow, nothing when all equal or fewer than two values", () => {
    expect(bestColumns([0.4, 0.9, 0.2], "max")).toEqual([1])
    expect(bestColumns([12, 3, 3, 40], "min")).toEqual([1, 2])
    expect(bestColumns([5, 5], "max")).toEqual([])
    expect(bestColumns([5, null], "max")).toEqual([])
    expect(bestColumns([null, 2, NaN, 7], "min")).toEqual([1])
    expect(bestColumns([Infinity, 30], "max")).toEqual([0]) // "no sunset within the lookahead" beats 30 h
  })
})

describe.skipIf(!hasRealData())("compared site vs the single-site path (real data)", () => {
  const data = hasRealData() ? loadRealData() : null
  const p = hasRealData() ? readFixture("horizon_reference.json").pins[0] : null // (-89.5, -45)
  const T = Date.UTC(2027, 3, 10, 12)
  const ctx = () => {
    const pin = { lat: p.lat, lon: p.lon, groundM: p.groundM }
    return {
      pin,
      horizonSun: computeHorizon({ x: p.x, y: p.y }, p.groundM, SUN_REFERENCE_HEIGHT_M, data.grids),
      horizonEarth: computeHorizon({ x: p.x, y: p.y }, p.groundM, 10, data.grids),
      antennaM: 10,
      tableAccessor: siteAccessor(data.ephemeris, pin),
      sunMode: "center",
      missionH: 156,
    }
  }
  const single = (c, tMs) => ({ ...computeSiteHours({ ...c, tMs, windowH: c.missionH }), metrics: siteMetrics({ ...c, tMs }) })
  const hoursOf = (r) => [r.sun.hoursToChange, r.earth.hoursToChange, r.sun.windowVisibleHours, r.earth.windowVisibleHours, r.metrics.longestDarkH, r.metrics.sunUpEarthDownH]

  test("same time: every duration within 0.01 h of the single-site cards", () => {
    const c = ctx()
    const a = hoursOf(siteResults({ ...c, tMs: T }))
    const b = hoursOf(single(c, T))
    a.forEach((h, i) => expect(Math.abs((h ?? 0) - (b[i] ?? 0))).toBeLessThan(0.01))
  })

  test("a date-shifted column uses its own time (main time + shift)", () => {
    const c = ctx()
    const shifted = siteResults({ ...c, tMs: T + SYNODIC_MONTH_H * 3600000 })
    const direct = single(c, T + SYNODIC_MONTH_H * 3600000)
    const same = single(c, T)
    hoursOf(shifted).forEach((h, i) => expect(Math.abs((h ?? 0) - (hoursOf(direct)[i] ?? 0))).toBeLessThan(0.01))
    expect(shifted.metrics.sunElevationNowDeg).toBeCloseTo(direct.metrics.sunElevationNowDeg, 9)
    expect(shifted.metrics.sunElevationNowDeg).not.toBeCloseTo(same.metrics.sunElevationNowDeg, 3)
  })

  test("compare rows: ratings match the cards; Landing only with a slope (Polar HD)", () => {
    const c = ctx()
    const r = siteResults({ ...c, tMs: T })
    const v = compareValues(r, { planeDeg: 3.2 }, 156)
    expect(v.sunElevationDeg).toBe(r.metrics.sunElevationNowDeg)
    expect(v.landing.label).toBe("Possible")
    expect(compareValues(r, null, 156).landing).toBe(null)
    expect(v.sunsetInH).toBe(r.sun.visibleNow ? (r.sun.hoursToChange ?? Infinity) : 0)
    expect(compareValues({ sun: null, earth: null, metrics: null }, null, 156)).toBe(null) // outside the ephemeris
  })
})

describe("presets", () => {
  const sitesFile = path.join(DATA_DIR, "sites.json")
  test.skipIf(!fs.existsSync(sitesFile))("every preset site exists and is verified", () => {
    const byId = new Map(JSON.parse(fs.readFileSync(sitesFile, "utf8")).map((s) => [s.id, s]))
    for (const p of COMPARE_PRESETS) {
      expect(p.siteIds.length).toBeGreaterThanOrEqual(2)
      for (const id of p.siteIds) expect(byId.get(id)?.verified, `${p.id}: ${id}`).toBe(true)
    }
  })
})
