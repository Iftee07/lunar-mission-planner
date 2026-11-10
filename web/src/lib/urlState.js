// Shareable links: the planner's state <-> URL query parameters (pure; urlSync.js does the reading and writing).
//   site=apollo11 | pin=-89.45,-137.3   the pin: a curated site's id, or lat,lon (degrees, east longitude)
//   t=2026-11-11T06:15Z                  the selected time (UTC, to the minute)
//   ant=10  mission=336  sun=any         antenna height (m), mission length (h), Sun counted while any part shows
//   view=polar|surface                   the main view (globe when absent)
//   layers=slope,psr                     Polar HD map layers that are on
//   cam=lat,lon,heightKm,heading,pitch   globe camera (degrees, km)
//   map=xKm,yKm,zoom                     Polar HD map centre (polar stereographic, km) and zoom
// Defaults are left out, so a link only says what differs. Bad values are ignored, one parameter at a time.
// The compare list (cmp) arrives with the compare drawer (Phase 4).

import { parseLatLon } from "@/lib/coords.js"
import { ANTENNA_PRESETS_M, ANTENNA_DEFAULT_M, MISSION_OPTIONS_H, VIEWS, selectEffectiveTimeMs } from "@/state.js"
import { LAYER_IDS } from "@/view/polarLayerModel.js"

export const URL_KEYS = ["site", "pin", "t", "ant", "mission", "sun", "view", "layers", "cam", "map"]

const fixed = (x, digits) => String(Number(x.toFixed(digits))) // no trailing zeros
const numbers = (text, n) => {
  const parts = String(text).split(",").map(Number)
  return parts.length === n && parts.every(Number.isFinite) ? parts : null
}

// The part of the store a link carries.
export function urlSnapshot(s) {
  return {
    pin: s.pin ? { lat: s.pin.lat, lon: s.pin.lon, siteId: s.pin.site?.id ?? null } : null,
    timeMs: selectEffectiveTimeMs(s),
    antennaM: s.antennaM,
    missionH: s.missionH,
    sunMode: s.sunMode,
    view: s.view,
    layers: LAYER_IDS.filter((id) => s.layers[id]?.on),
    camera: s.camera,
  }
}

// urlSnapshot -> URLSearchParams (only this module's keys).
export function encodeUrlState(snap) {
  const q = new URLSearchParams()
  if (snap.pin?.siteId) q.set("site", snap.pin.siteId)
  else if (snap.pin) q.set("pin", `${fixed(snap.pin.lat, 6)},${fixed(snap.pin.lon, 6)}`)
  if (Number.isFinite(snap.timeMs)) q.set("t", new Date(Math.round(snap.timeMs / 60000) * 60000).toISOString().slice(0, 16) + "Z")
  if (snap.antennaM !== ANTENNA_DEFAULT_M) q.set("ant", String(snap.antennaM))
  if (snap.missionH !== MISSION_OPTIONS_H[0]) q.set("mission", String(snap.missionH))
  if (snap.sunMode === "any_part") q.set("sun", "any")
  if (snap.view !== VIEWS[0]) q.set("view", snap.view)
  if (snap.layers.length) q.set("layers", snap.layers.join(","))
  const g = snap.camera?.globe
  if (g) q.set("cam", [fixed(g.lat, 4), fixed(g.lon, 4), fixed(g.heightM / 1000, 2), fixed(Number(fixed(g.headingDeg, 1)) % 360, 1), fixed(g.pitchDeg, 1)].join(","))
  const m = snap.camera?.polar
  if (m) q.set("map", [fixed(m.x / 1000, 2), fixed(m.y / 1000, 2), fixed(m.zoom, 2)].join(","))
  return q
}

// Query string -> { found, patch (store fields), layersOn (layer ids, or null when absent),
// place ({ siteId } | { lat, lon } | null) }.
// found: the link carries planner state, so it opens the planner instead of the welcome slides.
export function decodeUrlState(search) {
  const q = new URLSearchParams(search)
  const found = URL_KEYS.some((k) => q.has(k))
  const patch = {}
  let place = null
  let layersOn = null

  if (q.get("site")) place = { siteId: q.get("site") }
  else if (q.get("pin")) {
    const p = parseLatLon(q.get("pin"))
    if (p.ok) place = { lat: p.lat, lon: p.lon }
  }
  const t = Date.parse(q.get("t") || "")
  if (Number.isFinite(t)) Object.assign(patch, { baseTimeUtcMs: t, sliderOffsetH: 0 })
  const ant = Number(q.get("ant"))
  if (ANTENNA_PRESETS_M.includes(ant)) patch.antennaM = ant
  const mission = Number(q.get("mission"))
  if (MISSION_OPTIONS_H.includes(mission)) patch.missionH = mission
  if (q.get("sun") === "any") patch.sunMode = "any_part"
  if (q.get("sun") === "center") patch.sunMode = "center"
  if (VIEWS.includes(q.get("view"))) patch.view = q.get("view")
  if (q.has("layers")) {
    const on = new Set((q.get("layers") || "").split(","))
    layersOn = LAYER_IDS.filter((id) => on.has(id))
  }
  const camera = {}
  const c = numbers(q.get("cam"), 5)
  if (c && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 360 && c[2] > 0) {
    camera.globe = { lat: c[0], lon: c[1], heightM: c[2] * 1000, headingDeg: c[3], pitchDeg: c[4] }
  }
  const m = numbers(q.get("map"), 3)
  if (m) camera.polar = { x: m[0] * 1000, y: m[1] * 1000, zoom: m[2] }
  if (camera.globe || camera.polar) patch.camera = { globe: camera.globe ?? null, polar: camera.polar ?? null }
  return { found, patch, layersOn, place }
}
