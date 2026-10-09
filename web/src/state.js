// App state (PRD section 4): one Zustand store plus a compute controller.
// User-editable fields are exactly those of section 4. Computed values live in `results`.
// Large arrays (ephemeris, DEMs) stay in module scope (`engineData`), never in React state.

import { create } from "zustand"
import { loadAll, sampleBilinear, siteAccessor } from "@/engine/data.js"
import { azElFromSite, makeSite } from "@/engine/geometry.js"
import { createHorizonWorker, groundAt } from "@/engine/horizon.js"
import { computeHours } from "@/engine/hours.js"
import { project, unproject } from "@/engine/projection.js"

export const HOUR_MS = 3600000
export const EPHEMERIS_START_UTC_MS = Date.UTC(2026, 0, 1, 0, 0, 0)
export const EPHEMERIS_END_UTC_MS = Date.UTC(2030, 11, 31, 23, 45, 0)
export const WINDOW_H = 156
export const LIGHT_GREEN_MIN_H = 156
export const COMM_RED_MIN_FRACTION = 0.25
export const SLOPE_GREEN_MAX_DEG = 8
export const SLOPE_RED_MIN_DEG = 10
export const SLOPE_TYPICAL_ERROR_DEG = 1.9
export const LANDING_RADIUS_M = 100
export const ANTENNA_PRESETS_M = [0, 2, 5, 10]
export const ANTENNA_MAX_M = 20
export const TIME_SLIDER_RANGE_H = 708.7
export const SLIDER_STEP_H = 0.25
export const PLAY_SPEEDS_H_PER_S = [1, 6, 24, 72]
export const MAP_LAT_LIMIT_DEG = -84

const QUARTER_H_MS = HOUR_MS / 4

function defaultBaseTime() {
  const now = Math.floor(Date.now() / QUARTER_H_MS) * QUARTER_H_MS
  return now >= EPHEMERIS_START_UTC_MS && now <= EPHEMERIS_END_UTC_MS ? now : EPHEMERIS_START_UTC_MS
}

const emptyResults = {
  status: "idle", // idle | loading-data | computing | ready | error
  error: null,
  horizon: null, // Float32Array(720) for the current pin + antenna
  horizonMs: null,
  sun: null, // computeHours result or null (out of range)
  earth: null,
  sunNow: null, // { azDeg, elDeg, distKm }
  earthNow: null,
  slope: null, // { planeDeg, maxDeg, radiusM }
}

export const useStore = create((set) => ({
  // --- user-editable state (PRD section 4) ---
  baseTimeUtcMs: defaultBaseTime(),
  utcOffsetH: 0,
  sliderOffsetH: 0,
  antennaM: 2,
  sunMode: "center",
  view: "map",
  pin: null,

  // --- computed, not user-editable ---
  dataReady: false,
  dataError: null,
  results: emptyResults,

  // --- actions ---
  setBaseTime: (ms) => set({ baseTimeUtcMs: ms, sliderOffsetH: 0 }),
  setUtcOffset: (h) => set({ utcOffsetH: Math.max(-12, Math.min(12, Math.round(h))) }),
  setSliderOffset: (h) => set({ sliderOffsetH: Math.max(0, Math.min(TIME_SLIDER_RANGE_H, h)) }),
  setAntenna: (m) => {
    if (!Number.isFinite(m)) return
    set({ antennaM: Math.max(0, Math.min(ANTENNA_MAX_M, m)) })
  },
  setView: (view) => set({ view }),
  setPin: (pin) => set({ pin }),
}))

// --- derived selectors ---
export const selectEffectiveTimeMs = (s) => s.baseTimeUtcMs + s.sliderOffsetH * HOUR_MS
export const selectOutOfRange = (s) => {
  const t = selectEffectiveTimeMs(s)
  return t < EPHEMERIS_START_UTC_MS || t > EPHEMERIS_END_UTC_MS
}

// --- engine data (outside React state) ---
let engineData = null
let worker = null
let loadPromise = null

export function getEngineData() {
  return engineData
}

// Load once, even under React StrictMode double effects.
export function initData() {
  if (loadPromise) return loadPromise
  loadPromise = loadAll()
    .then((data) => {
      engineData = data
      worker = createHorizonWorker(data.grids)
      useStore.setState({ dataReady: true })
      if (import.meta.env.DEV) installDevHooks()
      return data
    })
    .catch((err) => {
      useStore.setState({ dataError: String(err.message || err) })
      throw err
    })
  return loadPromise
}

// Build a pin from projected map coordinates; null if outside the map disc or without terrain.
export function pinFromXY(x, y) {
  if (!engineData) return null
  const { lat, lon } = unproject(x, y, engineData.manifest.moon_radius_m)
  if (lat > MAP_LAT_LIMIT_DEG) return null
  const groundM = groundAt(engineData.grids, x, y)
  if (!Number.isFinite(groundM)) return null
  return { x, y, lat, lon, groundM }
}

// Cursor readout for the map: lat, lon, ground height; null outside the map disc.
export function describeXY(x, y) {
  if (!engineData) return null
  const { lat, lon } = unproject(x, y, engineData.manifest.moon_radius_m)
  if (lat > MAP_LAT_LIMIT_DEG) return null
  return { lat, lon, groundM: groundAt(engineData.grids, x, y) }
}

// Map click / drag: set the single pin. Returns false if the point is outside the map disc.
export function pickXY(x, y) {
  const pin = pinFromXY(x, y)
  if (!pin) return false
  useStore.getState().setPin(pin)
  return true
}

// --- compute controller ---
let horizonRequest = 0
let hoursFrame = 0

function slopeAt(pin) {
  const { slope } = engineData
  return {
    planeDeg: sampleBilinear(slope.plane, pin.x, pin.y),
    maxDeg: sampleBilinear(slope.max, pin.x, pin.y),
    radiusM: slope.radiusM,
  }
}

async function recomputeHorizon() {
  const { pin, antennaM } = useStore.getState()
  const id = ++horizonRequest
  if (!pin || !worker) {
    useStore.setState({ results: emptyResults })
    return
  }
  useStore.setState((s) => ({
    results: { ...s.results, status: "computing", horizon: null, slope: slopeAt(pin) },
  }))
  try {
    const { horizon, ms } = await worker.compute({ x: pin.x, y: pin.y }, pin.groundM, antennaM)
    if (id !== horizonRequest) return // a newer pin/antenna superseded this request
    useStore.setState((s) => ({ results: { ...s.results, horizon, horizonMs: ms } }))
    recomputeHours()
  } catch (err) {
    if (id !== horizonRequest) return
    useStore.setState((s) => ({ results: { ...s.results, status: "error", error: String(err.message || err) } }))
  }
}

function recomputeHours() {
  const s = useStore.getState()
  const { pin, antennaM, sunMode } = s
  const horizon = s.results.horizon
  if (!pin || !horizon || !engineData) return
  const t = selectEffectiveTimeMs(s)
  const acc = siteAccessor(engineData.ephemeris, pin)
  const site = makeSite(pin.lat, pin.lon, pin.groundM, antennaM)
  const sunV = engineData.ephemeris.vectorAt("sun", t)
  const earthV = engineData.ephemeris.vectorAt("earth", t)
  useStore.setState((st) => ({
    results: {
      ...st.results,
      status: "ready",
      error: null,
      sun: computeHours("sun", horizon, acc, t, antennaM, sunMode),
      earth: computeHours("earth", horizon, acc, t, antennaM, "center"),
      sunNow: sunV ? azElFromSite(site, sunV) : null,
      earthNow: earthV ? azElFromSite(site, earthV) : null,
    },
  }))
}

// Coalesce rapid time changes (slider drag, Play) into one recompute per animation frame.
function scheduleHours() {
  if (hoursFrame) return
  hoursFrame = requestAnimationFrame(() => {
    hoursFrame = 0
    recomputeHours()
  })
}

useStore.subscribe((s, prev) => {
  if (s.dataReady && (s.pin !== prev.pin || s.antennaM !== prev.antennaM || s.dataReady !== prev.dataReady)) {
    recomputeHorizon()
    return
  }
  if (
    s.baseTimeUtcMs !== prev.baseTimeUtcMs ||
    s.sliderOffsetH !== prev.sliderOffsetH ||
    s.sunMode !== prev.sunMode
  ) {
    scheduleHours()
  }
})

// Dev-only console hooks for validation (e.g. placing the pin at exact reference coordinates):
//   lspb.setPinLatLon(-89.5, -45)   lspb.setTimeUtc("2026-11-01T00:00:00Z")   lspb.state()
function installDevHooks() {
  window.lspb = {
    setPinLatLon(lat, lon) {
      const { x, y } = project(lat, lon, engineData.manifest.moon_radius_m)
      const pin = pinFromXY(x, y)
      useStore.getState().setPin(pin)
      return pin
    },
    setTimeUtc(iso) {
      useStore.getState().setBaseTime(Date.parse(iso))
    },
    state: () => useStore.getState(),
  }
}
