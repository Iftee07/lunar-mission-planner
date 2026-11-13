// Layered "why" explanations (P6e): checklists agree with the rating functions, every rating, layer and badge
// has a Why popover, and the popover opens on keyboard focus.
import fs from "node:fs"
import path from "node:path"
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { Term, WhyPanel } from "../src/components/why/Why.jsx"
import AntennaCard from "../src/components/sidebar/AntennaCard.jsx"
import EarthCard from "../src/components/sidebar/EarthCard.jsx"
import LandingCard from "../src/components/sidebar/LandingCard.jsx"
import SiteLine from "../src/components/sidebar/SiteLine.jsx"
import SunCard from "../src/components/sidebar/SunCard.jsx"
import { rateEarth, rateLanding, rateSun } from "../src/engine/ratings.js"
import {
  GLOSSARY,
  SOURCES,
  antennaWhy,
  earthWhy,
  landingCoarseWhy,
  landingWhy,
  layerWhy,
  ratingRules,
  sensitivityWhy,
  sunWhy,
  terrainWhy,
} from "../src/lib/explanations.js"
import { WHY_CLOSED, whyReducer } from "../src/lib/whyState.js"
import { useStore } from "../src/state.js"
import { POLAR_LAYERS } from "../src/view/polarLayerModel.js"
import { DATA_DIR } from "./load.js"

const RANK = { bad: 0, good: 1, possible: 1, perfect: 2 }
const ctx = { terrainSource: "polar-hd", resolutionM: 120, antennaM: 10, sunMode: "center" }
const hours = (visibleNow, hoursToChange, windowVisibleHours) => ({ visibleNow, hoursToChange, nextPeriodHours: 50, windowVisibleHours })

// For every gate level used: the rating reaches the level <=> every line gated at it passes.
function expectChecksMatch(why, rating) {
  const gates = [...new Set(why.checks.map((c) => c.gate).filter(Boolean))]
  expect(gates.length).toBeGreaterThan(0)
  for (const g of gates) {
    const allPass = why.checks.filter((c) => c.gate === g).every((c) => c.pass)
    expect(allPass, `${rating.label} vs gate ${g}`).toBe(RANK[rating.level] >= RANK[g])
  }
  expect(why.rating).toEqual(rating)
}

describe("checklists match the rating functions (3 synthetic cases each)", () => {
  for (const missionH of [156, 336]) {
    test(`Sun, ${missionH} h stay`, () => {
      const cases = [hours(true, missionH + 55, missionH), hours(true, missionH + 14, missionH), hours(false, 20, 100)]
      expect(cases.map((r) => rateSun(r, missionH).level)).toEqual(["perfect", "good", "bad"])
      for (const r of cases) expectChecksMatch(sunWhy(r, { ...ctx, missionH }), rateSun(r, missionH))
    })
    test(`Earth, ${missionH} h stay`, () => {
      const cases = [hours(true, missionH + 200, missionH), hours(true, 30, missionH * 0.31), hours(false, 100, missionH * 0.1)]
      expect(cases.map((r) => rateEarth(r, missionH).level)).toEqual(["perfect", "good", "bad"])
      for (const r of cases) expectChecksMatch(earthWhy(r, { ...ctx, missionH }), rateEarth(r, missionH))
    })
  }
  test("Landing", () => {
    const cases = [{ planeDeg: 3.2, maxDeg: 5 }, { planeDeg: 9.1, maxDeg: 14 }, { planeDeg: NaN, maxDeg: NaN }]
    expect(cases.map((s) => rateLanding(s.planeDeg).level)).toEqual(["possible", "bad", "bad"])
    for (const s of cases) expectChecksMatch(landingWhy(s), rateLanding(s.planeDeg))
  })
  test("live numbers appear in the lines", () => {
    const why = sunWhy(hours(true, 211, 156), { ...ctx, missionH: 156 })
    expect(why.verdict.text).toBe("Good for power: the Sun stays up 8.8 d")
    expect(why.checks[1].text).toContain("8.8 d from landing")
    expect(earthWhy(hours(true, 30, 48), { ...ctx, missionH: 156 }).verdict.text).toContain("31%")
  })
})

describe("every explanation has sources and renders", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"))
  const all = [
    sunWhy(hours(true, 211, 156), { ...ctx, missionH: 156 }),
    earthWhy(hours(true, 30, 48), { ...ctx, missionH: 156 }),
    landingWhy({ planeDeg: 3, maxDeg: 4 }),
    landingCoarseWhy(1895),
    terrainWhy("polar-hd", 120),
    terrainWhy("global", 1895),
    antennaWhy(10),
    sensitivityWhy({ radiusM: 5000, terrainSource: "global", resolutionM: 1895, globalMinM: 5000 }),
    ...POLAR_LAYERS.map((l) => layerWhy(l.id, manifest)),
  ]
  test("every Polar HD layer has an explanation", () => {
    for (const l of POLAR_LAYERS) expect(layerWhy(l.id, manifest), l.id).not.toBeNull()
  })
  test("each has a verdict, checks, the science lines and known sources", () => {
    for (const why of all) {
      expect(why.verdict.text.length).toBeGreaterThan(0)
      expect(why.checks.length).toBeGreaterThan(0)
      for (const k of ["method", "data", "threshold", "error", "readme"]) expect(why.science[k], k).toBeTruthy()
      for (const s of why.science.sources) expect(SOURCES[s], s).toBeDefined()
      expect(renderToString(<WhyPanel why={why} title="t" />)).toContain("Show the science")
    }
  })
  test("glossary terms render with a source", () => {
    for (const id of Object.keys(GLOSSARY)) {
      const g = GLOSSARY[id]
      expect(g.source ? SOURCES[g.source] : g.readme, id).toBeTruthy()
      expect(renderToString(<Term id={id} />)).toContain('data-slot="why-trigger"')
    }
  })
  test("About rules cover the three ratings", () => {
    expect(ratingRules(156).map((r) => r.topic)).toEqual(["Sun", "Earth", "Landing"])
    expect(ratingRules(156)[0].text).toContain("8.0 d")
  })
})

describe("cards render a Why trigger", () => {
  const trigger = /data-slot="why-trigger"/g
  const pin = { lat: -89.45, lon: -137.3, groundM: 1900, terrainSource: "polar-hd", resolutionM: 120, x: 0, y: 0 }
  test("Sun, Earth and Landing ratings, the terrain badge and the antenna", () => {
    // Server rendering reads zustand's initial state object: fill it for this test, then restore it.
    const init = useStore.getInitialState()
    const saved = { pin: init.pin, results: init.results }
    Object.assign(init, {
      pin,
      results: {
        ...init.results,
        status: "ready",
        terrainSource: "polar-hd",
        resolutionM: 120,
        horizonSun: new Float32Array(720),
        horizonEarth: new Float32Array(720),
        sun: hours(true, 211, 156),
        earth: hours(true, 30, 48),
        sunNow: { azDeg: 10, elDeg: 1.2 },
        earthNow: { azDeg: 200, elDeg: 3.4 },
        slope: { planeDeg: 3.1, maxDeg: 5, radiusM: 100 },
      },
    })
    try {
      const sun = renderToString(<SunCard />)
      expect(sun.match(trigger)).toHaveLength(1)
      expect(sun).toContain("Good for power")
      expect(renderToString(<EarthCard />).match(trigger)).toHaveLength(1)
      expect(renderToString(<LandingCard />).match(trigger)).toHaveLength(1)
      expect(renderToString(<SiteLine />).match(trigger)).toHaveLength(1)
      expect(renderToString(<AntennaCard />).match(trigger).length).toBeGreaterThanOrEqual(2) // the card's ? and the DTE term
      init.pin = { ...pin, terrainSource: "global", resolutionM: 1895 }
      const coarse = renderToString(<LandingCard />)
      expect(coarse).toContain("Not assessed (coarse terrain)")
      expect(coarse.match(trigger)).toHaveLength(1)
    } finally {
      Object.assign(init, saved)
    }
  })
})

describe("Why popover state", () => {
  test("opens on keyboard focus and on hover; blur or leaving closes a peek", () => {
    expect(whyReducer(WHY_CLOSED, "focus")).toEqual({ open: true, pinned: false })
    expect(whyReducer(WHY_CLOSED, "hoverIn")).toEqual({ open: true, pinned: false })
    expect(whyReducer({ open: true, pinned: false }, "blur")).toEqual(WHY_CLOSED)
    expect(whyReducer({ open: true, pinned: false }, "hoverOut")).toEqual(WHY_CLOSED)
  })
  test("a tap or click pins it open to read; Esc and outside clicks close it; a second click closes it", () => {
    const pinned = whyReducer({ open: true, pinned: false }, "click")
    expect(pinned).toEqual({ open: true, pinned: true })
    expect(whyReducer(pinned, "blur")).toBe(pinned)
    expect(whyReducer(pinned, "hoverOut")).toBe(pinned)
    expect(whyReducer(pinned, "escape")).toEqual(WHY_CLOSED)
    expect(whyReducer(pinned, "outside")).toEqual(WHY_CLOSED)
    expect(whyReducer(pinned, "click")).toEqual(WHY_CLOSED)
    expect(whyReducer(WHY_CLOSED, "click")).toEqual({ open: true, pinned: true })
  })
})
