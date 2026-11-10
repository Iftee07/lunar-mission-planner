// App state: one Zustand store plus a compute controller.
// User-editable fields come first. Computed values live in `results`.
// Large arrays (ephemeris, DEMs) stay in module scope (`engineData`), never in React state.

import { create } from "zustand"
import { createDataLoader, createGlobalDem, sampleBilinear, siteAccessor } from "@/engine/data.js"
import { createHorizonWorker } from "@/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, computeSiteHours } from "@/engine/hours.js"
import { siteMetrics } from "@/engine/metrics.js"
import { project, unproject } from "@/engine/projection.js"
import { MISSION_STAY_H } from "@/engine/ratings.js"
import {
  POLAR_HD_LAT_LIMIT_DEG,
  globalTerrain,
  polarTerrain,
  terrainSourceFor,
  tierForSource,
} from "@/engine/terrain.js"
import { sitePins } from "@/view/globeModel.js"
import { POLAR_LAYERS } from "@/view/polarLayerModel.js"

// UI in days, engine in hours: every duration here is in hours; only lib/format.js converts.
export const HOUR_MS = 3600000
export const LANDING_RADIUS_M = 100
export const ANTENNA_PRESETS_M = [2, 5, 10, 15] // affects Earth visibility only
const ANTENNA_DEFAULT_M = 2
const MISSION_OPTIONS_H = [MISSION_STAY_H, 336] // 6.5 d (Artemis III stay) and 14 d (one lunar day)
export const TIME_SLIDER_RANGE_H = 708.7
export const SLIDER_STEP_H = 0.25
export const PLAY_SPEEDS_H_PER_S = [6, 12, 24, 72] // shown as 0.25, 0.5, 1, 3 d/s
const SUN_MODES = ["center", "any_part"]
export const VIEWS = ["globe", "polar", "surface"] // V cycles through them in this order

const QUARTER_H_MS = HOUR_MS / 4
const nowQuarterHour = () => Math.floor(Date.now() / QUARTER_H_MS) * QUARTER_H_MS

// Dev-only test harness (stripped from production builds): ?screen=app&pin=lat,lon&t=ISO&view=surface
const devParams = () => (import.meta.env.DEV && typeof location !== "undefined" ? new URLSearchParams(location.search) : null)

const emptyResults = {
  status: "idle", // idle | loading-data | computing | ready | error
  error: null,
  terrainSource: null, // "polar-hd" | "global"
  resolutionM: null, // terrain pixel size behind these results
  horizonSun: null, // Float32Array(720) at SUN_REFERENCE_HEIGHT_M; recomputed on pin change only
  horizonEarth: null, // Float32Array(720) at antennaM; recomputed on pin or antenna change
  horizonMs: null,
  sun: null, // computeHours result or null (out of range); Sun seen from SUN_REFERENCE_HEIGHT_M
  earth: null, // Earth seen from antennaM
  sunNow: null, // { azDeg, elDeg, distKm }
  earthNow: null,
  metrics: null, // engine/metrics.js siteMetrics() over the mission window
  slope: null, // { planeDeg, maxDeg, radiusM } in Polar HD; null on Global terrain (not assessed)
}

const idleTier = { status: "idle", done: 0, total: 0, error: null } // status: idle | loading | ready | error

export const useStore = create((set) => ({
  // --- user-editable state ---
  baseTimeUtcMs: nowQuarterHour(), // clamped into the ephemeris once the manifest is loaded
  sliderOffsetH: 0,
  antennaM: ANTENNA_DEFAULT_M,
  sunMode: "center", // "center" | "any_part" (Sun counted up while any part of the disc clears the horizon)
  missionH: MISSION_OPTIONS_H[0],
  view: "globe", // globe | polar (Polar HD map) | surface
  screen: devParams()?.get("screen") === "app" ? "app" : "welcome", // welcome | app
  pin: null, // { lat, lon, groundM, terrainSource, resolutionM, x?, y?, site? } (x, y: polar stereographic, Polar HD
  // only; site: the curated site (sites.json row) when the pin was placed on one)
  focus: null, // { lat, lon, seq }: a request for the globe camera to fly there (site picked, coordinates typed)
  layers: Object.fromEntries(POLAR_LAYERS.map((l) => [l.id, { on: false, opacity: l.opacity }])), // Polar HD map layers

  // --- computed, not user-editable ---
  dataReady: false, // core tier (manifest + ephemeris) loaded
  dataError: null,
  tiers: { core: idleTier, polar: idleTier, global: idleTier }, // per-tier loading progress (bytes)
  ephemerisRange: null, // { startMs, endMs } from the manifest
  results: emptyResults,

  // --- actions ---
  setBaseTime: (ms) => set({ baseTimeUtcMs: ms, sliderOffsetH: 0 }),
  setSliderOffset: (h) => set({ sliderOffsetH: Math.max(0, Math.min(TIME_SLIDER_RANGE_H, h)) }),
  setAntenna: (m) => {
    if (ANTENNA_PRESETS_M.includes(m)) set({ antennaM: m })
  },
  setSunMode: (mode) => {
    if (SUN_MODES.includes(mode)) set({ sunMode: mode })
  },
  setMissionH: (h) => {
    if (MISSION_OPTIONS_H.includes(h)) set({ missionH: h })
  },
  setView: (view) => {
    if (VIEWS.includes(view)) set({ view })
  },
  setScreen: (screen) => set({ screen }),
  setPin: (pin) => set({ pin }),
  setLayer: (id, { on, opacity }) =>
    set((s) => {
      const cur = s.layers[id]
      if (!cur) return {}
      const next = { on: on ?? cur.on, opacity: opacity === undefined ? cur.opacity : Math.max(0, Math.min(1, opacity)) }
      return { layers: { ...s.layers, [id]: next } }
    }),
}))

// The Landing card's link: open the Polar HD map with the slope layer on.
export function showSlopeOnMap() {
  const s = useStore.getState()
  s.setLayer("slope", { on: true })
  s.setView("polar")
}

// --- derived selectors ---
export const selectEffectiveTimeMs = (s) => s.baseTimeUtcMs + s.sliderOffsetH * HOUR_MS
export const selectOutOfRange = (s) => {
  if (!s.ephemerisRange) return false
  const t = selectEffectiveTimeMs(s)
  return t < s.ephemerisRange.startMs || t > s.ephemerisRange.endMs
}

// --- engine data (outside React state) ---
// { manifest, ephemeris, polar (tier data) | null, terrains: { "polar-hd"?, global? } }
let engineData = null
let worker = null
const loader = createDataLoader({
  onProgress: (tier, done, total) => setTier(tier, { status: "loading", done, total }),
})

function setTier(tier, patch) {
  if (tier === "globe") return
  useStore.setState((s) => ({ tiers: { ...s.tiers, [tier]: { ...s.tiers[tier], ...patch } } }))
}

export function getEngineData() {
  return engineData
}

// Core tier (manifest + ephemeris), once, even under React StrictMode double effects.
let corePromise = null
export function initData() {
  if (corePromise) return corePromise
  useStore.setState({ dataError: null })
  setTier("core", { status: "loading", error: null })
  corePromise = loader
    .ensure("core")
    .then(({ manifest, ephemeris }) => {
      engineData = { manifest, ephemeris, polar: null, terrains: {} }
      worker = createHorizonWorker()
      const { startMs, endMs } = ephemeris
      const t = useStore.getState().baseTimeUtcMs
      useStore.setState({
        dataReady: true,
        ephemerisRange: { startMs, endMs },
        baseTimeUtcMs: t >= startMs && t <= endMs ? t : startMs,
      })
      setTier("core", { status: "ready" })
      if (import.meta.env.DEV) installDevHooks()
      return engineData
    })
    .catch((err) => {
      corePromise = null
      const message = String(err.message || err)
      useStore.setState({ dataError: message })
      setTier("core", { status: "error", error: message })
      throw err
    })
  return corePromise
}

export function retryData() {
  return initData().catch(() => {}) // the error is shown again if it persists
}

// Polar HD or global terrain, loaded on first use. Resolves once the terrain can be sampled.
const tierPromises = {}
export function ensureTier(tier) {
  if (!tierPromises[tier]) {
    setTier(tier, { status: "loading", error: null })
    tierPromises[tier] = initData()
      .then(() => loader.ensure(tier))
      .then(async (data) => {
        const R = engineData.manifest.moon_radius_m
        if (tier === "polar") {
          engineData.polar = data
          engineData.terrains["polar-hd"] = polarTerrain(data.grids)
          worker.setPolar(data.grids)
        } else {
          // the worker decodes the compressed DEM (off the main thread) and sends a copy back
          const { dem } = await worker.loadGlobal(data.spec, data.gz, R)
          engineData.terrains.global = globalTerrain(createGlobalDem(data.spec, dem, R))
        }
        setTier(tier, { status: "ready" })
        return engineData
      })
      .catch((err) => {
        delete tierPromises[tier]
        setTier(tier, { status: "error", error: String(err.message || err) })
        throw err
      })
  }
  return tierPromises[tier]
}

// A pin at (lat, lon) on the given terrain; null where that terrain has no data.
function makePin(latDeg, lonDeg, source, xy = null, site = null) {
  const terrain = engineData?.terrains[source]
  if (!terrain) return null
  const groundM = terrain.heightAt(latDeg, lonDeg)
  if (!Number.isFinite(groundM)) return null
  let lon = lonDeg // east longitude in (-180, 180]; wrapped only when outside it (keeps typed values exact)
  if (lon > 180 || lon <= -180) lon = ((((lon + 180) % 360) + 360) % 360) - 180 || 180
  const pin = { lat: latDeg, lon, groundM, terrainSource: source, resolutionM: terrain.resolutionM }
  if (source === "polar-hd") Object.assign(pin, xy || project(latDeg, lonDeg, engineData.manifest.moon_radius_m))
  if (site) pin.site = site
  return pin
}

// Pin anywhere on the Moon: Polar HD at 84 S or further south, Global terrain elsewhere (loads it first).
// `site` (a sites.json row) names the pin. Resolves with the pin, or null if the point has no terrain data.
// If another pin is placed while the terrain loads, the newer one wins.
let pinRequest = 0
export async function setPinLatLon(latDeg, lonDeg, site = null) {
  const request = ++pinRequest
  await initData()
  const source = terrainSourceFor(latDeg, Boolean(engineData.manifest.grids))
  await ensureTier(tierForSource(source))
  if (request !== pinRequest) return null
  const pin = makePin(latDeg, lonDeg, source, null, site)
  if (pin) useStore.getState().setPin(pin)
  return pin
}

// Fly the globe to (lat, lon) and pin it: picking a mission site, typed coordinates.
let focusSeq = 0
export function goToLatLon(latDeg, lonDeg, site = null) {
  useStore.setState({ focus: { lat: latDeg, lon: lonDeg, seq: ++focusSeq } })
  return setPinLatLon(latDeg, lonDeg, site)
}

// URLs of the globe's display assets (engine/data.js "globe" tier): no download until the globe uses them.
export function globeUrls() {
  return initData().then(() => loader.ensure("globe"))
}

// Search result or typed coordinates: fly the globe there and pin it. With the Polar HD map open the map
// pans there instead (PolarHdPanel follows `focus`); a point outside the map switches to the globe.
export function selectPlace(latDeg, lonDeg, site = null) {
  const s = useStore.getState()
  if (s.view === "polar" && latDeg > POLAR_HD_LAT_LIMIT_DEG) s.setView("globe")
  return goToLatLon(latDeg, lonDeg, site)
}

// The curated mission sites (sites.json), validated by sitePins (group and cited source, BUILD_PLAN rule 4):
// [{ site, group }]. Resolves with [] if the file is missing or invalid; the next call tries again.
let sitesPromise = null
export function loadSites() {
  if (!sitesPromise) {
    sitesPromise = globeUrls()
      .then(({ sitesUrl }) => (sitesUrl ? fetch(sitesUrl) : null))
      .then((r) => (r?.ok ? r.json() : []))
      .then(sitePins)
      .catch(() => {
        sitesPromise = null
        return []
      })
  }
  return sitesPromise
}

// Cursor readout for the Polar HD map: lat, lon, ground height; null outside the map disc.
export function describeXY(x, y) {
  const terrain = engineData?.terrains["polar-hd"]
  if (!terrain) return null
  const { lat, lon } = unproject(x, y, engineData.manifest.moon_radius_m)
  if (lat > POLAR_HD_LAT_LIMIT_DEG) return null
  return { lat, lon, groundM: terrain.heightAt(lat, lon) }
}

// Map click / drag: set the single pin. Returns false if the point is outside the map disc.
export function pickXY(x, y) {
  if (!engineData) return false
  const { lat, lon } = unproject(x, y, engineData.manifest.moon_radius_m)
  if (lat > POLAR_HD_LAT_LIMIT_DEG) return false
  const pin = makePin(lat, lon, "polar-hd", { x, y })
  if (!pin) return false
  pinRequest++ // supersedes a pin still waiting for its terrain
  useStore.getState().setPin(pin)
  return true
}

// --- compute controller ---
const latestRequest = { sun: 0, earth: 0 }
let hoursFrame = 0

// Landing slope exists only on the Polar HD grids; Global terrain is too coarse to assess it.
function slopeAt(pin) {
  if (pin.terrainSource !== "polar-hd") return null
  const { slope } = engineData.polar
  return {
    planeDeg: sampleBilinear(slope.plane, pin.x, pin.y),
    maxDeg: sampleBilinear(slope.max, pin.x, pin.y),
    radiusM: slope.radiusM,
  }
}

// Two horizons per pin: Sun at SUN_REFERENCE_HEIGHT_M (pin change only),
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
  const patch = { status: "computing", error: null, terrainSource: pin.terrainSource, resolutionM: pin.resolutionM }
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

  const job = (heightM) => worker.compute(pin.terrainSource, pin, heightM)
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
  const { pin, antennaM, sunMode, missionH } = s
  const { horizonSun, horizonEarth } = s.results
  if (!pin || !horizonSun || !horizonEarth || !engineData) return
  const args = {
    pin,
    horizonSun,
    horizonEarth,
    antennaM,
    tableAccessor: siteAccessor(engineData.ephemeris, pin),
    tMs: selectEffectiveTimeMs(s),
    sunMode,
  }
  // The ratings' window and the metrics both follow the chosen mission length.
  const computed = computeSiteHours({ ...args, windowH: missionH })
  const metrics = siteMetrics({ ...args, missionH })
  useStore.setState((st) => ({ results: { ...st.results, status: "ready", error: null, ...computed, metrics } }))
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
    s.sunMode !== prev.sunMode ||
    s.missionH !== prev.missionH
  ) {
    scheduleHours()
  }
})

// Dev-only console hooks for validation (e.g. placing the pin at exact reference coordinates):
//   await lspb.setPinLatLon(0.674, 23.473)   lspb.goTo(-89.45, 222.7)   lspb.setTimeUtc("2026-11-01T00:00:00Z")
//   lspb.state()   (lspb.globe and lspb.surface: the view APIs, once those views have mounted)
function installDevHooks() {
  window.lspb = {
    setPinLatLon,
    goTo: goToLatLon,
    setTimeUtc(iso) {
      useStore.getState().setBaseTime(Date.parse(iso))
    },
    state: () => useStore.getState(),
  }
  const q = devParams()
  if (q?.get("t")) window.lspb.setTimeUtc(q.get("t"))
  if (q?.get("pin")) window.lspb.setPinLatLon(...q.get("pin").split(",").map(Number))
  if (q?.get("view")) useStore.getState().setView(q.get("view"))
}
