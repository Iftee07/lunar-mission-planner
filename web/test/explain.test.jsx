// The three explainers (P6b): their geometry, the Sun's declination band against the ephemeris, and that each
// renders under reduced motion.
import { MotionConfig } from "motion/react"
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import AntennaExplainer from "../src/components/explain/AntennaExplainer.jsx"
import LibrationExplainer from "../src/components/explain/LibrationExplainer.jsx"
import SunPathExplainer from "../src/components/explain/SunPathExplainer.jsx"
import { SUN_DECLINATION_MAX_DEG, earthTrack, minAntennaM, ridgeClearanceM, sunDailyPath, sunMaxElevationDeg } from "../src/engine/explain.js"
import { hasRealData, loadRealData } from "./load.js"

describe("Sun's daily path", () => {
  test("equator: the Sun passes overhead; pole: it skims the horizon", () => {
    const eq = sunDailyPath(0, 0)
    expect(Math.max(...eq.map((p) => p.elDeg))).toBeCloseTo(90, 6)
    const pole = sunDailyPath(-90, 1.5)
    for (const p of pole) expect(p.elDeg).toBeCloseTo(-1.5, 6) // the south pole sees the Sun at -declination all day
    const near = sunDailyPath(-89.5, 0)
    expect(Math.max(...near.map((p) => Math.abs(p.elDeg)))).toBeCloseTo(0.5, 6)
  })
  test("highest Sun = 90 - |lat - dec| and matches the sampled path", () => {
    for (const [lat, dec] of [[0, 0], [-45, 1.5], [-80, -1.5], [-89, 0]]) {
      const max = Math.max(...sunDailyPath(lat, dec, 721).map((p) => p.elDeg))
      expect(max).toBeCloseTo(sunMaxElevationDeg(lat, dec), 4)
    }
  })
  test("at midday (hour angle 0) a southern observer sees the Sun due north", () => {
    const mid = sunDailyPath(-60, 0).find((p) => p.hourAngleDeg === 0)
    expect(mid.azDeg).toBeCloseTo(0, 6)
  })
  test.skipIf(!hasRealData())("the Sun's declination seen from the Moon stays within the stated band (ephemeris 2026-2035)", () => {
    const { ephemeris } = loadRealData()
    let max = 0
    for (let t = ephemeris.startMs; t <= ephemeris.endMs; t += 86400000) {
      const v = ephemeris.vectorAt("sun", t)
      const dec = (Math.asin(v[2] / Math.hypot(...v)) * 180) / Math.PI
      max = Math.max(max, Math.abs(dec))
    }
    console.log(`max |Sun declination| 2026-2035: ${max.toFixed(3)} deg`)
    expect(max).toBeLessThanOrEqual(SUN_DECLINATION_MAX_DEG)
    expect(max).toBeGreaterThan(SUN_DECLINATION_MAX_DEG - 0.1)
  })
})

describe("Earth's loop (libration)", () => {
  test.skipIf(!hasRealData())("near the pole Earth stays near the horizon and wanders a few degrees over a month", () => {
    const { ephemeris } = loadRealData()
    const track = earthTrack(ephemeris.vectorAt, -89.5, 0, Date.UTC(2027, 0, 1), 30)
    expect(track.length).toBe(121)
    const el = track.map((p) => p.elDeg)
    const az = track.map((p) => (p.azDeg > 180 ? p.azDeg - 360 : p.azDeg))
    console.log(`el ${Math.min(...el).toFixed(2)}..${Math.max(...el).toFixed(2)}, az ${Math.min(...az).toFixed(2)}..${Math.max(...az).toFixed(2)}`)
    expect(Math.max(...el.map(Math.abs))).toBeLessThan(10)
    expect(Math.max(...el) - Math.min(...el)).toBeGreaterThan(5)
    expect(Math.max(...az.map(Math.abs))).toBeLessThan(20)
  })
  test("stops at the end of the ephemeris", () => {
    const vectorAt = (body, t) => (t < 48 * 3600000 ? [384400, 0, 0] : null)
    expect(earthTrack(vectorAt, -89.5, 0, 0, 30, 6)).toHaveLength(8)
  })
})

describe("antenna over a ridge", () => {
  test("clearance and the lowest antenna that clears", () => {
    expect(ridgeClearanceM(10, 10, 500, 0)).toBeCloseTo(0, 9)
    expect(ridgeClearanceM(2, 10, 500, 0.3)).toBeLessThan(0)
    expect(ridgeClearanceM(15, 10, 500, 0.3)).toBeGreaterThan(0)
    const m = minAntennaM(10, 500, 0.3)
    expect(ridgeClearanceM(m, 10, 500, 0.3)).toBeCloseTo(0, 9)
    expect(minAntennaM(1, 500, 5)).toBe(0)
  })
})

describe("explainers render under reduced motion", () => {
  for (const [name, C] of [["Sun path", SunPathExplainer], ["libration", LibrationExplainer], ["antenna", AntennaExplainer]]) {
    test(name, () => {
      const html = renderToString(
        <MotionConfig reducedMotion="always">
          <C />
        </MotionConfig>,
      )
      expect(html).toContain("<svg")
      expect(html).toMatch(/role="slider"|type="range"/)
    })
  }
})
