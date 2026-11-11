// App state: one Zustand store plus a compute controller.
// User-editable fields come first. Computed values live in `results`.
// Large arrays (ephemeris, DEMs) stay in module scope (`engineData`), never in React state.

import { create } from "zustand"
import { createDataLoader, createGlobalDem, sampleBilinear, siteAccessor } from "@/engine/data.js"
import { createHorizonWorker } from "@/engine/horizon.js"
import { COMPARE_PRESETS, addCompareEntry, siteResults } from "@/engine/compare.js"
import { SUN_REFERENCE_HEIGHT_M } from "@/engine/hours.js"
import { project, unproject } from "@/engine/projection.js"
import { timelineRows } from "@/engine/timeline.js"
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
import { timeJump } from "@/view/timelineModel.js"

// UI in days, engine in hours: every duration here is in hours; only lib/format.js converts.
export const HOUR_MS = 3600000
export const LANDING_RADIUS_M = 100
export const ANTENNA_PRESETS_M = [2, 5, 10, 15] // affects Earth visibility only
export const ANTENNA_DEFAULT_M = 2
export const MISSION_OPTIONS_H = [MISSION_STAY_H, 336] // 6.5 d (Artemis III stay) and 14 d (one lunar day)
export const TIME_SLIDER_RANGE_H = 708.7
export const SLIDER_STEP_H = 0.25
export const PLAY_SPEEDS_H_PER_S = [1, 6, 24, 72] // shown as 1 h/s, 6 h/s, 1 d/s, 3 d/s
const SUN_MODES = ["center", "any_part"]
export const VIEWS = ["globe", "polar", "surface"] // V cycles through them in this order

const QUARTER_H_MS = HOUR_MS / 4
const nowQuarterHour = () => Math.floor(Date.now() / QUARTER_H_MS) * QUARTER_H_MS


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
  screen: "welcome", // welcome | app (a shared link opens the app directly: urlSync.js)
  pin: null, // { lat, lon, groundM, terrainSource, resolutionM, x?, y?, site? } (x, y: polar stereographic, Polar HD
  // only; site: the curated site (sites.json row) when the pin was placed on one)
  focus: null, // { lat, lon, seq }: a request for the globe camera to fly there (site picked, coordinates typed)
  camera: { globe: null, polar: null }, // last camera of each map view (globe: lat, lon, heightM, headingDeg, pitchDeg;
  // polar: x, y, zoom), reported when a move ends; restores the view from a shared link
  layers: Object.fromEntries(POLAR_LAYERS.map((l) => [l.id, { on: false, opacity: l.opacity }])), // Polar HD map layers
  ghostTimeMs: null, // time under the pointer on the timeline (faint Sun and Earth in the surface view); not shared

  // --- computed, not user-editable ---
  dataReady: false, // core tier (manifest + ephemeris) loaded
  dataError: null,
  tiers: { core: idleTier, polar: idleTier, global: idleTier }, // per-tier loading progress (bytes)
  ephemerisRange: null, // { startMs, endMs } from the manifest
  results: emptyResults,
  // Compare (engine/compare.js): [{ id, pin, shiftH, color }], at most COMPARE_MAX. shiftH: hours after the main
  // time (a "same site, different date" column). compareResults: id -> { status, error, tMs, results, slope }.
  compare: [],
  compareResults: {},
  // Timeline rows (engine/timeline.js timelineRows + `site`, "lat,lon") over the slider span, per site:
  // "main" (the pin) and each compare id (from the main start plus its shift). Filled in idle time.
  timeline: {},

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
  setGhostTime: (ms) => set({ ghostTimeMs: ms }),
  setScreen: (screen) => set({ screen }),
  setPin: (pin) => set({ pin }),
  setCamera: (kind, cam) => set((s) => ({ camera: { ...s.camera, [kind]: cam } })),
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

// Jump to a time (a timeline bar's start, a Details window): the playhead moves there, or the start time
// does when it lies beyond the slider span (view/timelineModel.js timeJump).
export function jumpToTime(ms) {
  const s = useStore.getState()
  useStore.setState(timeJump(s.baseTimeUtcMs, ms, TIME_SLIDER_RANGE_H, s.ephemerisRange))
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
  const pin = await pinFor(latDeg, lonDeg, site)
  if (request !== pinRequest) return null
  if (pin) useStore.getState().setPin(pin)
  return pin
}

// A pin object for (lat, lon) on the right terrain, loading that terrain first; null without terrain data.
async function pinFor(latDeg, lonDeg, site = null) {
  await initData()
  const source = terrainSourceFor(latDeg, Boolean(engineData.manifest.grids))
  await ensureTier(tierForSource(source))
  return makePin(latDeg, lonDeg, source, null, site)
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

// Horizons: one worker job at a time (main pin and compared sites share the queue), cached by place and
// observer height, so a site picked again, compared, or duplicated at another date costs nothing.
const HORIZON_CACHE_MAX = 24
const horizonCache = new Map() // key -> Promise<{ horizon, ms }>
let horizonQueue = Promise.resolve()
function horizonFor(pin, heightM) {
  const key = [pin.terrainSource, pin.lat, pin.lon, heightM].join("|")
  const hit = horizonCache.get(key)
  if (hit) return hit
  const job = horizonQueue.then(() => worker.compute(pin.terrainSource, pin, heightM))
  horizonQueue = job.catch(() => {})
  horizonCache.set(key, job)
  job.catch(() => horizonCache.delete(key))
  if (horizonCache.size > HORIZON_CACHE_MAX) horizonCache.delete(horizonCache.keys().next().value)
  return job
}

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

  // Same observer height: the cache shares the Sun horizon instead of computing it twice.
  const sunJob = which.sun ? horizonFor(pin, SUN_REFERENCE_HEIGHT_M) : null
  const earthJob = which.earth ? horizonFor(pin, antennaM) : null
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
  // The ratings' window and the metrics both follow the chosen mission length (compare columns: the same call).
  const computed = siteResults({
    pin,
    horizonSun,
    horizonEarth,
    antennaM,
    tableAccessor: siteAccessor(engineData.ephemeris, pin),
    tMs: selectEffectiveTimeMs(s),
    sunMode,
    missionH,
  })
  useStore.setState((st) => ({ results: { ...st.results, status: "ready", error: null, ...computed } }))
}

// Coalesce rapid time changes (playhead drag, Play) into one recompute per animation frame. Compared columns
// take turns, one per frame, while the time keeps changing (4 columns cost about one extra site per frame);
// all of them update together once it settles. Each column shows the time its values were computed at.
const COMPARE_SETTLE_MS = 120
let compareTurn = 0
let compareSettle = 0
function scheduleHours() {
  if (hoursFrame) return
  hoursFrame = requestAnimationFrame(() => {
    hoursFrame = 0
    recomputeHours()
    const { compare } = useStore.getState()
    if (!compare.length) return
    recomputeCompareHours([compare[compareTurn++ % compare.length].id])
    clearTimeout(compareSettle)
    compareSettle = setTimeout(() => recomputeCompareHours(), COMPARE_SETTLE_MS)
  })
}

// --- compare ---
// Horizons of compared sites stay out of React state: id -> { sun, earth, antennaM, slope }.
const compareHorizons = new Map()
let compareSeq = 0

function addPinToCompare(pin, shiftH = 0) {
  const r = addCompareEntry(useStore.getState().compare, { pin, shiftH }, `c${++compareSeq}`)
  if (r.error) return { error: r.error }
  useStore.setState({ compare: r.list })
  return { id: r.list.at(-1).id }
}

// "+ Compare" on the sidebar: the current pin. Returns { id } or { error }.
export function addCurrentPinToCompare() {
  const { pin } = useStore.getState()
  return pin ? addPinToCompare(pin) : { error: "Pick a site first" }
}

// "+ Compare" on a globe pin: any place (its terrain loads first). Resolves { id } or { error }.
export async function addPlaceToCompare(latDeg, lonDeg, site = null) {
  const pin = await pinFor(latDeg, lonDeg, site)
  return pin ? addPinToCompare(pin) : { error: "No terrain data at this point" }
}

// "Same site, different date": a copy of a column with its own shift (hours after the main time).
export function duplicateCompare(id, shiftH) {
  const c = useStore.getState().compare.find((e) => e.id === id)
  return c ? addPinToCompare(c.pin, shiftH) : { error: "Not in compare" }
}

export function removeFromCompare(id) {
  useStore.setState((s) => ({ compare: s.compare.filter((c) => c.id !== id) }))
}

// Replace the whole list: presets and shared links. specs: [{ lat, lon, site?, shiftH? }]; places without
// terrain data, duplicates and anything past COMPARE_MAX are skipped.
export async function setCompareList(specs) {
  const pins = await Promise.all(specs.map((sp) => pinFor(sp.lat, sp.lon, sp.site ?? null).catch(() => null)))
  let list = []
  pins.forEach((pin, i) => {
    if (!pin) return
    const r = addCompareEntry(list, { pin, shiftH: specs[i].shiftH ?? 0 }, `c${++compareSeq}`)
    if (!r.error) list = r.list
  })
  useStore.setState({ compare: list })
  return list
}

export async function loadComparePreset(presetId) {
  const preset = COMPARE_PRESETS.find((p) => p.id === presetId)
  if (!preset) return []
  const pins = await loadSites()
  const sites = preset.siteIds.map((id) => pins.find((p) => p.site.id === id)?.site).filter(Boolean)
  return setCompareList(sites.map((site) => ({ lat: site.lat, lon: site.lon, site })))
}

// Horizons for every compared site at the current antenna height, through the shared queue; each column
// fills in as soon as its horizons arrive. Results of removed columns are dropped.
function syncCompareHorizons() {
  const { compare, compareResults, antennaM } = useStore.getState()
  const next = {}
  for (const c of compare) {
    const h = compareHorizons.get(c.id)
    if (h && h.antennaM === antennaM && compareResults[c.id]) {
      next[c.id] = compareResults[c.id]
      continue
    }
    next[c.id] = { ...compareResults[c.id], status: "computing", error: null }
    Promise.all([horizonFor(c.pin, SUN_REFERENCE_HEIGHT_M), horizonFor(c.pin, antennaM)])
      .then(([sun, earth]) => {
        const st = useStore.getState()
        if (!st.compare.some((e) => e.id === c.id) || st.antennaM !== antennaM) return // removed, or antenna changed
        compareHorizons.set(c.id, { sun: sun.horizon, earth: earth.horizon, antennaM, slope: slopeAt(c.pin) })
        recomputeCompareHours([c.id])
        scheduleTimeline()
      })
      .catch((err) => {
        useStore.setState((st) => ({ compareResults: { ...st.compareResults, [c.id]: { status: "error", error: String(err.message || err) } } }))
      })
  }
  for (const id of compareHorizons.keys()) if (!compare.some((c) => c.id === id)) compareHorizons.delete(id)
  useStore.setState({ compareResults: next })
}

// Hours and metrics for compared sites (all, or only `ids`), each at the main time plus its own shift.
function recomputeCompareHours(ids = null) {
  const s = useStore.getState()
  if (!engineData || !s.compare.length) return
  const base = selectEffectiveTimeMs(s)
  const out = { ...s.compareResults }
  for (const c of s.compare) {
    if (ids && !ids.includes(c.id)) continue
    const h = compareHorizons.get(c.id)
    if (!h || h.antennaM !== s.antennaM) continue
    const tMs = base + c.shiftH * HOUR_MS
    const results = siteResults({
      pin: c.pin,
      horizonSun: h.sun,
      horizonEarth: h.earth,
      antennaM: s.antennaM,
      tableAccessor: siteAccessor(engineData.ephemeris, c.pin),
      tMs,
      sunMode: s.sunMode,
      missionH: s.missionH,
    })
    out[c.id] = { status: "ready", error: null, tMs, results, slope: h.slope }
  }
  useStore.setState({ compareResults: out })
}

// --- timeline rows ---
// Sun / Earth / Both rows over the slider span for the main pin and each compared site. Computed in idle
// time, one site per idle slice, and only when a site's inputs change (never on a scrub frame).
const timelineInputs = new Map() // key -> the inputs its rows were computed from
let timelineIdle = 0
const onIdle = (cb) => (typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 400 }) : setTimeout(cb, 1))

function timelineJobs(s) {
  const jobs = []
  const { horizonSun, horizonEarth } = s.results
  if (s.pin && horizonSun && horizonEarth) jobs.push({ key: "main", pin: s.pin, sun: horizonSun, earth: horizonEarth, shiftH: 0 })
  for (const c of s.compare) {
    const h = compareHorizons.get(c.id)
    if (h && h.antennaM === s.antennaM) jobs.push({ key: c.id, pin: c.pin, sun: h.sun, earth: h.earth, shiftH: c.shiftH })
  }
  return jobs.map((j) => ({ ...j, startMs: s.baseTimeUtcMs + j.shiftH * HOUR_MS, antennaM: s.antennaM, sunMode: s.sunMode }))
}

const sameInputs = (a, b) =>
  a && a.pin === b.pin && a.sun === b.sun && a.earth === b.earth && a.startMs === b.startMs && a.antennaM === b.antennaM && a.sunMode === b.sunMode

function scheduleTimeline() {
  if (!timelineIdle) timelineIdle = onIdle(runTimeline)
}

function runTimeline() {
  timelineIdle = 0
  const s = useStore.getState()
  if (!engineData) return
  const jobs = timelineJobs(s)
  const keys = new Set(jobs.map((j) => j.key))
  let timeline = s.timeline
  if (Object.keys(timeline).some((k) => !keys.has(k))) {
    timeline = Object.fromEntries(Object.entries(timeline).filter(([k]) => keys.has(k)))
    for (const k of timelineInputs.keys()) if (!keys.has(k)) timelineInputs.delete(k)
  }
  const job = jobs.find((j) => !sameInputs(timelineInputs.get(j.key), j))
  if (job) {
    const rows = timelineRows({
      horizonSun: job.sun,
      horizonEarth: job.earth,
      antennaM: job.antennaM,
      tableAccessor: siteAccessor(engineData.ephemeris, job.pin),
      startMs: job.startMs,
      spanH: TIME_SLIDER_RANGE_H,
      sunMode: job.sunMode,
    })
    timelineInputs.set(job.key, job)
    timeline = { ...timeline, [job.key]: { ...rows, site: `${job.pin.lat},${job.pin.lon}` } }
    scheduleTimeline() // the next stale site in the next idle slice
  }
  if (timeline !== s.timeline) useStore.setState({ timeline })
}

useStore.subscribe((s, prev) => {
  if (
    s.results.horizonSun !== prev.results.horizonSun ||
    s.results.horizonEarth !== prev.results.horizonEarth ||
    s.compare !== prev.compare ||
    s.baseTimeUtcMs !== prev.baseTimeUtcMs ||
    s.sunMode !== prev.sunMode ||
    s.antennaM !== prev.antennaM
  ) {
    scheduleTimeline()
  }
})

useStore.subscribe((s, prev) => {
  if (s.dataReady && (s.compare !== prev.compare || s.antennaM !== prev.antennaM || s.dataReady !== prev.dataReady)) {
    syncCompareHorizons()
  }
})

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
    setCompareList, // e.g. await lspb.setCompareList([{ lat: 0.674, lon: 23.473 }, { lat: -89.45, lon: -137.3, shiftH: 708.7 }])
  }
}
