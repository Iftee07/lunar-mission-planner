// Phase 5: timeline rows, countdowns, playhead keys, bar clicks and time jumps.
import { describe, expect, test } from "vitest"
import { COUNTDOWN_OK_MIN_H, COUNTDOWN_WARN_MIN_H, countdown } from "../src/engine/countdown.js"
import { siteAccessor } from "../src/engine/data.js"
import { computeHorizon } from "../src/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, makeVisibility } from "../src/engine/hours.js"
import { siteMetrics } from "../src/engine/metrics.js"
import { nextWindows } from "../src/engine/series.js"
import { intersectIntervals, timelineRows } from "../src/engine/timeline.js"
import { formatCountdown, formatPlaySpeed, formatShortDate } from "../src/lib/format.js"
import { dayTicks, hOfX, hitTest, keyStep, timeJump, timelineLayout, xOfH } from "../src/view/timelineModel.js"
import { hasRealData, loadRealData, readFixture } from "./load.js"

const HOUR_MS = 3600000
const SPAN_H = 708.7
const iv = (startH, endH, openStart = false, openEnd = false) => ({ startH, endH, openStart, openEnd })

describe("intersectIntervals", () => {
  test("overlaps only; open flags kept where both lists are open", () => {
    const a = [iv(0, 10, true), iv(20, 30), iv(40, 50, false, true)]
    const b = [iv(0, 5, true), iv(8, 25), iv(45, 50, false, true)]
    expect(intersectIntervals(a, b)).toEqual([iv(0, 5, true), iv(8, 10), iv(20, 25), iv(45, 50, false, true)])
    expect(intersectIntervals(a, [])).toEqual([])
  })
})

describe.skipIf(!hasRealData())("timeline rows vs nextWindows (real data)", () => {
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
    }
  }

  test("every boundary equals the cards' nextWindows within 0.01 h (also from a later playhead)", () => {
    let checked = 0
    for (const fp of readFixture("horizon_reference.json").pins) {
      const pin = { lat: fp.lat, lon: fp.lon, groundM: fp.groundM }
      const c = {
        horizonSun: computeHorizon({ x: fp.x, y: fp.y }, fp.groundM, SUN_REFERENCE_HEIGHT_M, data.grids),
        horizonEarth: computeHorizon({ x: fp.x, y: fp.y }, fp.groundM, 10, data.grids),
        antennaM: 10,
        tableAccessor: siteAccessor(data.ephemeris, pin),
        sunMode: "center",
      }
      const rows = timelineRows({ ...c, startMs: T, spanH: SPAN_H })
      expect(rows.coveredH).toBeCloseTo(SPAN_H - (SPAN_H % 0.25), 6)
      for (const body of ["sun", "earth"]) {
        const visible = makeVisibility(body, body === "sun" ? c.horizonSun : c.horizonEarth, c.tableAccessor, body === "sun" ? SUN_REFERENCE_HEIGHT_M : 10, "center")
        // playhead 37.1 h in: a different 0.25 h sampling grid than the timeline's
        for (const offsetH of [0, 37.1]) {
          const next = nextWindows(visible, T + offsetH * HOUR_MS)
          const timeline = rows[body].filter((w) => w.endH > offsetH)
          if (!timeline.length) continue
          expect(next.length).toBeGreaterThan(0)
          next.forEach((w, i) => {
            const tw = timeline[i]
            if (!tw) return // past the strip's end
            if (!w.openStart && !tw.openStart) {
              expect(Math.abs(w.startH + offsetH - tw.startH)).toBeLessThan(0.01)
              checked++
            }
            if (!w.openEnd && !tw.openEnd) {
              expect(Math.abs(w.endH + offsetH - tw.endH)).toBeLessThan(0.01)
              checked++
            }
          })
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4)
  })

  test("Both = the overlap of the Sun and Earth rows", () => {
    const rows = timelineRows({ ...ctx(), startMs: T, spanH: SPAN_H })
    expect(rows.both).toEqual(intersectIntervals(rows.sun, rows.earth))
    for (const b of rows.both) {
      expect(rows.sun.some((s) => s.startH <= b.startH && s.endH >= b.endH)).toBe(true)
      expect(rows.earth.some((e) => e.startH <= b.startH && e.endH >= b.endH)).toBe(true)
    }
  })

  test("elevation sparkline series: hourly, spans the mission, matches the now value", () => {
    const m = siteMetrics({ ...ctx(), tMs: T, missionH: 156 })
    expect(m.seriesStepH).toBe(1)
    expect(m.sunElevationSeriesDeg).toHaveLength(157)
    expect(m.earthElevationSeriesDeg).toHaveLength(157)
    expect(m.sunElevationSeriesDeg[0]).toBeCloseTo(m.sunElevationNowDeg, 9)
    expect(Math.max(...m.sunElevationSeriesDeg)).toBeLessThanOrEqual(m.sunElevationMaxDeg + 1e-9)
    expect(Math.min(...m.sunElevationSeriesDeg)).toBeGreaterThanOrEqual(m.sunElevationMinDeg - 1e-9)
  })
})

describe("countdown chips", () => {
  const up = (h) => ({ visibleNow: true, hoursToChange: h })
  test("tones: green above 48 h, amber 12 to 48 h, red under 12 h", () => {
    expect(COUNTDOWN_OK_MIN_H).toBe(48)
    expect(COUNTDOWN_WARN_MIN_H).toBe(12)
    expect(countdown(up(48.5)).tone).toBe("ok")
    expect(countdown(up(48)).tone).toBe("warn")
    expect(countdown(up(12)).tone).toBe("warn")
    expect(countdown(up(11.9)).tone).toBe("bad")
    expect(countdown(up(null))).toEqual({ event: "set", inH: Infinity, tone: "ok" })
  })
  test("a body below the horizon counts down to its rise, neutral", () => {
    expect(countdown({ visibleNow: false, hoursToChange: 5 })).toEqual({ event: "rise", inH: 5, tone: "none" })
    expect(countdown(null)).toBe(null)
  })
  test("format: hours under 2 days, days above; speeds in h/s and d/s", () => {
    expect(formatCountdown(9.43)).toBe("9.4 h")
    expect(formatCountdown(42.2)).toBe("42 h")
    expect(formatCountdown(80)).toBe("3.3 d")
    expect(formatCountdown(Infinity)).toBe("62.5+ d")
    expect([1, 6, 24, 72].map(formatPlaySpeed)).toEqual(["1 h/s", "6 h/s", "1 d/s", "3 d/s"])
    expect(formatShortDate(Date.UTC(2027, 3, 9, 23))).toBe("9 Apr")
  })
})

describe("timeline strip model", () => {
  const L = timelineLayout(800, 2, SPAN_H)

  test("x and hours are inverse; clamped to the strip", () => {
    for (const h of [0, 100.25, SPAN_H]) expect(hOfX(L, xOfH(L, h))).toBeCloseTo(h, 9)
    expect(hOfX(L, -50)).toBe(0)
    expect(hOfX(L, 5000)).toBe(SPAN_H)
  })

  test("playhead keys: arrows 0.25 h, Shift 24 h, Home / End, clamped; other keys ignored", () => {
    expect(keyStep(10, { key: "ArrowRight" }, SPAN_H)).toBe(10.25)
    expect(keyStep(10, { key: "ArrowLeft" }, SPAN_H)).toBe(9.75)
    expect(keyStep(10, { key: "ArrowRight", shiftKey: true }, SPAN_H)).toBe(34)
    expect(keyStep(10, { key: "ArrowLeft", shiftKey: true }, SPAN_H)).toBe(0)
    expect(keyStep(700, { key: "PageUp" }, SPAN_H)).toBe(SPAN_H)
    expect(keyStep(50, { key: "Home" }, SPAN_H)).toBe(0)
    expect(keyStep(50, { key: "End" }, SPAN_H)).toBe(SPAN_H)
    expect(keyStep(50, { key: "a" }, SPAN_H)).toBe(null)
  })

  test("clicking a bar finds it, and its start becomes the offset", () => {
    const groups = [
      { sun: [iv(10, 60)], earth: [iv(100, 200)], both: [] },
      { sun: [iv(300, 300.05)], earth: [], both: [] },
    ]
    const yOf = (g, r) => L.rowY(g, r) + L.rowH / 2
    const hit = hitTest(L, groups, xOfH(L, 30), yOf(0, 0))
    expect(hit).toEqual({ group: 0, row: "sun", interval: groups[0].sun[0] })
    expect(timeJump(0, hit.interval.startH * HOUR_MS, SPAN_H)).toEqual({ sliderOffsetH: 10 })
    expect(hitTest(L, groups, xOfH(L, 150), yOf(0, 1)).row).toBe("earth")
    expect(hitTest(L, groups, xOfH(L, 80), yOf(0, 0))).toBe(null) // gap between bars
    expect(hitTest(L, groups, xOfH(L, 300) + 1.5, yOf(1, 0)).interval.startH).toBe(300) // a thin bar stays clickable
    expect(hitTest(L, groups, xOfH(L, 30), L.plotTop - 6)).toBe(null)
  })

  test("a jump beyond the strip moves the start time instead, inside the ephemeris", () => {
    const base = Date.UTC(2027, 0, 1)
    expect(timeJump(base, base + 800 * HOUR_MS, SPAN_H)).toEqual({ baseTimeUtcMs: base + 800 * HOUR_MS, sliderOffsetH: 0 })
    const range = { startMs: base - 10 * HOUR_MS, endMs: base + 100 * HOUR_MS }
    expect(timeJump(base, base - 50 * HOUR_MS, SPAN_H, range)).toEqual({ baseTimeUtcMs: range.startMs, sliderOffsetH: 0 })
  })

  test("layout grows with the number of sites; day ticks stay apart", () => {
    const one = timelineLayout(800, 1, SPAN_H)
    const five = timelineLayout(800, 5, SPAN_H)
    expect(five.height).toBeGreaterThan(one.height)
    expect(five.rowY(4, 2) + five.rowH).toBeLessThanOrEqual(five.plotBottom)
    const ticks = dayTicks(L, Date.UTC(2027, 0, 1, 6))
    expect(ticks[0].ms % (24 * HOUR_MS)).toBe(0)
    for (let i = 1; i < ticks.length; i++) expect(xOfH(L, ticks[i].h) - xOfH(L, ticks[i - 1].h)).toBeGreaterThanOrEqual(52)
  })
})
