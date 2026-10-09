// App state (PRD section 4): one Zustand store plus a compute controller.
// User-editable fields are exactly those of section 4. Computed values live in `results`.
// Large arrays (ephemeris, DEMs) stay in module scope (`engineData`), never in React state.

import { create } from "zustand"
import { loadAll, sampleBilinear, siteAccessor } from "@/engine/data.js"
import { createHorizonWorker, groundAt } from "@/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, computeSiteHours } from "@/engine/hours.js"
import { project, unproject } from "@/engine/projection.js"

// UI in days, engine in hours: every duration here is in hours; only lib/format.js converts.
export const HOUR_MS = 3600000
export const EPHEMERIS_START_UTC_MS = Date.UTC(2026, 0, 1, 0, 0, 0)
export const EPHEMERIS_END_UTC_MS = Date.UTC(2030, 11, 31, 23, 45, 0)
export const LANDING_RADIUS_M = 100
export const ANTENNA_PRESETS_M = [2, 5, 10, 15] // affects Earth visibility only
export const ANTENNA_DEFAULT_M = 2
export const TIME_SLIDER_RANGE_H = 708.7
export const SLIDER_STEP_H = 0.25
export const PLAY_SPEEDS_H_PER_S = [6, 12, 24, 72] // shown as 0.25, 0.5, 1, 3 d/s
export const MAP_LAT_LIMIT_DEG = -84

const QUARTER_H_MS = HOUR_MS / 4

function defaultBaseTime() {
  const now = Math.floor(Date.now() / QUARTER_H_MS) * QUARTER_H_MS
  return now >= EPHEMERIS_START_UTC_MS && now <= EPHEMERIS_END_UTC_MS ? now : EPHEMERIS_START_UTC_MS
}

const emptyResults = {
  status: "idle", // idle | loading-data | computing | ready | error
  error: null,
  horizonSun: null, // Float32Array(720) at SUN_REFERENCE_HEIGHT_M; recomputed on pin change only
  horizonEarth: null, // Float32Array(720) at antennaM; recomputed on pin or antenna change
  horizonMs: null,
  sun: null, // computeHours result or null (out of range); Sun seen from SUN_REFERENCE_HEIGHT_M
  earth: null, // Earth seen from antennaM
  sunNow: null, // { azDeg, elDeg, distKm }
  earthNow: null,
  slope: null, // { planeDeg, maxDeg, radiusM }
}

export const useStore = create((set) => ({
  // --- user-editable state (PRD section 4) ---
  baseTimeUtcMs: defaultBaseTime(),
  sliderOffsetH: 0,
  antennaM: ANTENNA_DEFAULT_M,
  sunMode: "center",
  view: "map",
  screen: "welcome", // welcome | app (routed from Phase 10)
  pin: null,

  // --- computed, not user-editable ---
  dataReady: false,
  dataError: null,
  results: emptyResults,

  // --- actions ---
  setBaseTime: (ms) => set({ baseTimeUtcMs: ms, sliderOffsetH: 0 }),
  setSliderOffset: (h) => set({ sliderOffsetH: Math.max(0, Math.min(TIME_SLIDER_RANGE_H, h)) }),
  setAntenna: (m) => {
    if (ANTENNA_PRESETS_M.includes(m)) set({ antennaM: m })
  },
  setView: (view) => set({ view }),
  setScreen: (screen) => set({ screen }),
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
const latestRequest = { sun: 0, earth: 0 }
let hoursFrame = 0

function slopeAt(pin) {
  const { slope } = engineData
  return {
    planeDeg: sampleBilinear(slope.plane, pin.x, pin.y),
    maxDeg: sampleBilinear(slope.max, pin.x, pin.y),
    radiusM: slope.radiusM,
  }
}

// Two horizons per pin (PRD v3 section 2): Sun at SUN_REFERENCE_HEIGHT_M (pin change only),
// Earth at antennaM (pin or antenna change). `which` = { sun, earth } selects what to recompute.
async function recomputeHorizons(which) {
  const { pin, antennaM } = useStore.getState()
  if (!pin || !worker) {
    latestRequest.sun++
    latestRequest.earth++
    useStore.setState({ results: emptyResults })
    return
  }
  const ids = {}
  const patch = { status: "computing", error: null }
  if (which.sun) {
    ids.sun = ++latestRequest.sun
    patch.horizonSun = null
    patch.slope = slopeAt(pin)
  }
  if (which.earth) {
    ids.earth = ++latestRequest.earth
    patch.horizonEarth = null
  }
  useStore.setState((s) => ({ results: { ...s.results, ...patch } }))

  const job = (heightM) => worker.compute({ x: pin.x, y: pin.y }, pin.groundM, heightM)
  const sunJob = which.sun ? job(SUN_REFERENCE_HEIGHT_M) : null
  // Same observer height: share the Sun horizon instead of computing it twice.
  const earthJob = which.earth ? (sunJob && antennaM === SUN_REFERENCE_HEIGHT_M ? sunJob : job(antennaM)) : null
  const current = () => ids.sun === latestRequest.sun || ids.earth === latestRequest.earth
  try {
    const [sunRes, earthRes] = await Promise.all([sunJob, earthJob])
    const update = {}
    if (sunRes && ids.sun === latestRequest.sun) update.horizonSun = sunRes.horizon
    if (earthRes && ids.earth === latestRequest.earth) update.horizonEarth = earthRes.horizon
    if (!Object.keys(update).length) return // a newer pin/antenna superseded this request
    update.horizonMs = (sunRes ? sunRes.ms : 0) + (earthRes && earthRes !== sunRes ? earthRes.ms : 0)
    useStore.setState((s) => ({ results: { ...s.results, ...update } }))
    recomputeHours()
  } catch (err) {
    if (!current()) return
    useStore.setState((s) => ({ results: { ...s.results, status: "error", error: String(err.message || err) } }))
  }
}

function recomputeHours() {
  const s = useStore.getState()
  const { pin, antennaM, sunMode } = s
  const { horizonSun, horizonEarth } = s.results
  if (!pin || !horizonSun || !horizonEarth || !engineData) return
  const computed = computeSiteHours({
    pin,
    horizonSun,
    horizonEarth,
    antennaM,
    tableAccessor: siteAccessor(engineData.ephemeris, pin),
    tMs: selectEffectiveTimeMs(s),
    sunMode,
  })
  useStore.setState((st) => ({ results: { ...st.results, status: "ready", error: null, ...computed } }))
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
  if (s.dataReady && (s.pin !== prev.pin || s.dataReady !== prev.dataReady)) {
    recomputeHorizons({ sun: true, earth: true })
    return
  }
  if (s.dataReady && s.antennaM !== prev.antennaM) {
    recomputeHorizons({ sun: false, earth: true })
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
