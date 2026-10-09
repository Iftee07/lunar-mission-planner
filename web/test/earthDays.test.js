// Phase 9 tests (PRD v3): Earth-visible calendar days.
import { describe, expect, test } from "vitest"
import { siteAccessor } from "../src/engine/data.js"
import { EARTH_DAY_MIN_VISIBLE_H, earthVisibleDays, visibleHoursByDay } from "../src/engine/earthDays.js"
import { computeHorizon } from "../src/engine/horizon.js"
import { ANTENNA_PRESETS_M } from "../src/state.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

const HOUR_MS = 3600000

describe("visibleHoursByDay (synthetic visibility)", () => {
  // Visible only on 2027-03-10 from 20:00 to 23:00 UTC.
  const from = Date.UTC(2027, 2, 10, 20)
  const to = Date.UTC(2027, 2, 10, 23)
  const visible = (t) => t >= from && t < to

  test("UTC+0: 3 h on the 10th, nothing else", () => {
    const m = visibleHoursByDay(2027, 2, 0, visible)
    expect(m.size).toBe(31)
    expect(m.get(10)).toBe(3)
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(3)
  })

  test("UTC+6: the same 3 h fall on local 11th (02:00-05:00)", () => {
    const m = visibleHoursByDay(2027, 2, 6, visible)
    expect(m.get(10)).toBe(0)
    expect(m.get(11)).toBe(3)
  })

  test("a day straddling local midnight is split between the two days", () => {
    const m = visibleHoursByDay(2027, 2, 2, visible) // 22:00-01:00 local
    expect(m.get(10)).toBe(2)
    expect(m.get(11)).toBe(1)
  })

  test("days touching the end of the ephemeris are null (disabled)", () => {
    const end = Date.UTC(2030, 11, 31, 23, 45)
    const m = visibleHoursByDay(2030, 11, -6, (t) => (t > end ? null : true))
    expect(m.get(30)).toBe(24)
    expect(m.get(31)).toBeNull()
  })
})

describe.skipIf(!hasRealData())("earthVisibleDays on real data", () => {
  const data = hasRealData() ? loadRealData() : null
  const p = hasRealData() ? readFixture("horizon_reference.json").pins[0] : null // (-89.5, -45)

  test("roughly two-week runs of Earth days separated by two-week gaps; 2 -> 15 m never removes a day", () => {
    const pin = { lat: p.lat, lon: p.lon, groundM: p.groundM }
    const acc = siteAccessor(data.ephemeris, pin)
    const hz = Object.fromEntries(ANTENNA_PRESETS_M.map((m) => [m, computeHorizon({ x: p.x, y: p.y }, p.groundM, m, data.grids)]))
    const marks = { 2: [], 15: [] }
    let totalVisibleH = 0
    for (let month0 = 0; month0 < 12; month0++) {
      const t0 = performance.now()
      const byAntenna = ANTENNA_PRESETS_M.map((m) => earthVisibleDays(2027, month0, hz[m], acc, 0, m))
      if (month0 === 0) console.log(`one month: ${((performance.now() - t0) / 4).toFixed(0)} ms`)
      for (const [d, h2] of byAntenna[0]) {
        for (let k = 1; k < byAntenna.length; k++) {
          const hPrev = byAntenna[k - 1].get(d)
          const h = byAntenna[k].get(d)
          expect(h).toBeGreaterThanOrEqual(hPrev) // higher antenna: same or more visible hours
          if (hPrev >= EARTH_DAY_MIN_VISIBLE_H) expect(h).toBeGreaterThanOrEqual(EARTH_DAY_MIN_VISIBLE_H)
        }
        marks[2].push(h2 >= EARTH_DAY_MIN_VISIBLE_H ? "#" : ".")
        marks[15].push(byAntenna.at(-1).get(d) >= EARTH_DAY_MIN_VISIBLE_H ? "#" : ".")
        totalVisibleH += h2
      }
    }
    const runs = marks[2].join("").match(/#+|\.+/g)
    const onRuns = runs.filter((r) => r[0] === "#").map((r) => r.length)
    console.log(`2027 at (${p.lat}, ${p.lon}), 2 m:  ${marks[2].join("")}`)
    console.log(`2027 at (${p.lat}, ${p.lon}), 15 m: ${marks[15].join("")}`)
    console.log(`Earth-day run lengths (days): ${onRuns.join(", ")}; visible ${(totalVisibleH / 365 / 24 * 100).toFixed(0)}% of the year`)
    // lunar libration: Earth rises and sets once per ~27.3 d month, so 10-20 runs a year of ~1-3 weeks
    expect(onRuns.length).toBeGreaterThanOrEqual(10)
    expect(onRuns.length).toBeLessThanOrEqual(16)
    const median = [...onRuns].sort((a, b) => a - b)[Math.floor(onRuns.length / 2)]
    expect(median).toBeGreaterThanOrEqual(8)
    expect(median).toBeLessThanOrEqual(20)
  }, 120000)
})
