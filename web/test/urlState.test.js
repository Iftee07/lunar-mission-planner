import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { URL_KEYS, decodeUrlState, encodeUrlState, urlSnapshot } from "../src/lib/urlState.js"
import { useStore } from "../src/state.js"
import { applyUrlState } from "../src/urlSync.js"

// The store recomputes hours on time changes once per animation frame (a no-op here: no data, no pin).
beforeAll(() => vi.stubGlobal("requestAnimationFrame", (f) => setTimeout(f, 0)))
const initial = useStore.getState()
afterEach(() => useStore.setState(initial, true))

const T = Date.parse("2031-04-12T18:45:00Z")
const snapshot = (over = {}) => ({
  pin: null,
  timeMs: T,
  antennaM: 2,
  missionH: 156,
  sunMode: "center",
  view: "globe",
  layers: [],
  camera: { globe: null, polar: null },
  ...over,
})
const roundTrip = (snap) => decodeUrlState(`?${encodeUrlState(snap)}`)

describe("URL codec", () => {
  test("defaults are left out: only the time", () => {
    expect([...encodeUrlState(snapshot()).keys()]).toEqual(["t"])
    expect(encodeUrlState(snapshot()).get("t")).toBe("2031-04-12T18:45Z")
  })

  test("every field round-trips", () => {
    const snap = snapshot({
      pin: { lat: -89.4389, lon: -137.096, siteId: null },
      antennaM: 10,
      missionH: 336,
      sunMode: "any_part",
      view: "polar",
      layers: ["psr", "slope"],
      camera: { globe: { lat: -85.12345, lon: 33.3, heightM: 412345, headingDeg: 12.34, pitchDeg: -48.06 }, polar: { x: -12345.6, y: 2345.6, zoom: -1.25 } },
    })
    const { found, patch, layersOn, place } = roundTrip(snap)
    expect(found).toBe(true)
    expect(place).toEqual({ lat: -89.4389, lon: -137.096 })
    expect(patch).toMatchObject({ baseTimeUtcMs: T, sliderOffsetH: 0, antennaM: 10, missionH: 336, sunMode: "any_part", view: "polar" })
    expect(layersOn).toEqual(["psr", "slope"])
    const g = patch.camera.globe
    expect(g.lat).toBeCloseTo(-85.1235, 6) // 4 decimals: 11 m
    expect(g.lon).toBeCloseTo(33.3, 9)
    expect(g.heightM).toBeCloseTo(412350, 6) // 10 m steps
    expect(g.headingDeg).toBeCloseTo(12.3, 9)
    expect(g.pitchDeg).toBeCloseTo(-48.1, 9)
    expect(patch.camera.polar).toEqual({ x: -12350, y: 2350, zoom: -1.25 })
  })

  test("a curated site travels as its id; pins keep 6 decimals (0.03 m)", () => {
    expect(roundTrip(snapshot({ pin: { lat: 0.67416, lon: 23.47314, siteId: "apollo11" } })).place).toEqual({ siteId: "apollo11" })
    const { place } = roundTrip(snapshot({ pin: { lat: -89.123456789, lon: 179.9999999, siteId: null } }))
    expect(place.lat).toBeCloseTo(-89.123457, 9)
    expect(place.lon).toBeCloseTo(180, 9)
  })

  test("time is kept to the minute", () => {
    const { patch } = roundTrip(snapshot({ timeMs: T + 29000 }))
    expect(patch.baseTimeUtcMs).toBe(T)
  })

  test("bad values are ignored one by one", () => {
    const { found, patch, layersOn, place } = decodeUrlState("?ant=7&mission=100&view=map&layers=foo,slope&cam=1,2&map=a,b,c&t=soon&pin=200,0&sun=half")
    expect(found).toBe(true)
    expect(patch).toEqual({})
    expect(layersOn).toEqual(["slope"])
    expect(place).toBe(null)
  })

  test("no planner parameters: the welcome slides stay", () => {
    expect(decodeUrlState("").found).toBe(false)
    expect(decodeUrlState("?offline=1").found).toBe(false)
    expect(URL_KEYS).toContain("cam")
  })
})

describe("URL round trip through the store", () => {
  test("restores the settings, view, layers and camera, and opens the planner", () => {
    const s = useStore.getState()
    s.setBaseTime(T)
    s.setSliderOffset(36.5)
    s.setAntenna(15)
    s.setMissionH(336)
    s.setSunMode("any_part")
    s.setView("surface")
    s.setLayer("sunlight", { on: true })
    s.setCamera("globe", { lat: 10, lon: -20, heightM: 3.0e6, headingDeg: 0, pitchDeg: -90 })
    s.setPin({ lat: -84.7906, lon: 29.1957, site: { id: "im2" } })
    const link = encodeUrlState(urlSnapshot(useStore.getState())).toString()

    useStore.setState(initial, true)
    const place = applyUrlState(`?${link}`, { restorePlace: false })
    const r = useStore.getState()
    expect(place).toEqual({ siteId: "im2" })
    expect(r.screen).toBe("app")
    expect(r.view).toBe("surface")
    expect(r.baseTimeUtcMs + r.sliderOffsetH * 3600000).toBe(T + 36.5 * 3600000)
    expect([r.antennaM, r.missionH, r.sunMode]).toEqual([15, 336, "any_part"])
    expect(r.layers.sunlight).toEqual({ on: true, opacity: initial.layers.sunlight.opacity })
    expect(r.layers.slope.on).toBe(false)
    expect(r.camera.globe).toEqual({ lat: 10, lon: -20, heightM: 3.0e6, headingDeg: 0, pitchDeg: -90 })
    // Same link again once the pin is back (the pin itself needs terrain data; checked in the browser).
    r.setPin({ lat: -84.7906, lon: 29.1957, site: { id: "im2" } })
    expect(encodeUrlState(urlSnapshot(useStore.getState())).toString()).toBe(link)
  })

  test("a link without planner state changes nothing", () => {
    expect(applyUrlState("?offline=1")).toBe(null)
    expect(useStore.getState().screen).toBe("welcome")
  })
})
