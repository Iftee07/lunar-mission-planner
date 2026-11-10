// Pure logic behind the 3D globe (view/globe.js): Sun/Earth geometry, crater-label level of detail,
// mission-pin groups and the imagery fallback policy. No Cesium, no DOM, so it is unit-tested directly.
// Vectors are Moon-centred in MOON_ME, which is also the globe's fixed frame: x toward 0° N 0° E,
// z toward the north pole (proved in test/globe.test.js against Cesium's own conversions).

import { MOON_RADIUS_M } from "@/engine/geometry.js"

const R2D = 180 / Math.PI
const D2R = Math.PI / 180
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a) => Math.hypot(a[0], a[1], a[2])

// Where a body is overhead: { lat, lon } in degrees (lon east in (-180, 180]) of its Moon-centred vector.
export function subPoint(v) {
  return { lat: Math.asin(v[2] / norm(v)) * R2D, lon: Math.atan2(v[1], v[0]) * R2D }
}

// Direction the sunlight travels (from the Sun toward the Moon), as a unit vector: what a directional
// light needs. sunKm is the Sun's position from the Moon's centre (ephemeris, any length unit).
export function sunLightDirection(sunKm) {
  const r = norm(sunKm)
  return [-sunKm[0] / r, -sunKm[1] / r, -sunKm[2] / r]
}

// The Earth marker sits just beyond the limb, in the true Earth direction, so it shows which way Earth is
// from the Moon (the real Earth, 384,000 km away, would be off screen). Metres from the Moon's centre.
export const EARTH_MARKER_RADII = 1.45
export function earthMarkerPosition(earthKm, radiusM = MOON_RADIUS_M) {
  const r = norm(earthKm)
  const d = EARTH_MARKER_RADII * radiusM
  return [(earthKm[0] / r) * d, (earthKm[1] / r) * d, (earthKm[2] / r) * d]
}

// Near side: the hemisphere centred on 0° N 0° E (the mean sub-Earth point). Far side otherwise.
export function moonSide(latDeg, lonDeg) {
  return Math.cos(latDeg * D2R) * Math.cos(lonDeg * D2R) >= 0 ? "near" : "far"
}

// True if point p (metres, Moon-centred, on or just above the surface) is on the camera's side of the
// Moon, i.e. the camera is above p's tangent plane: p · c > |p|².
export function facesCamera(p, cameraPos) {
  return dot(p, cameraPos) > dot(p, p)
}

// --- Crater labels: level of detail ---
// craters_global.json gives each feature a rank from its diameter (1 = 300 km and larger ... 6 = under
// 10 km; pipeline/09_build_features.py). A rank is labelled while the camera is at most this high above the
// surface. Heights never increase with rank, so a bigger feature is never hidden while a smaller one shows.
export const LABEL_MAX_HEIGHT_M = [Infinity, 3.0e6, 1.2e6, 5.0e5, 2.0e5, 8.0e4] // ranks 1..6
export const LABEL_BUDGET = 150
export const labelMaxHeight = (rank) => LABEL_MAX_HEIGHT_M[Math.min(Math.max(rank, 1), LABEL_MAX_HEIGHT_M.length) - 1]

// Which labels to show. items: [{ diameter_km, rank, position: [x, y, z] metres }] sorted by diameter,
// largest first (as the file is). A label is a candidate when its rank is allowed at this camera height,
// it faces the camera and inView(i) (the screen frustum) says yes; the first `budget` candidates win, so
// the biggest features are kept. Returns a Uint8Array of 0/1 per item.
export function selectLabels(items, { cameraPos, heightM, budget = LABEL_BUDGET, inView = () => true }) {
  const show = new Uint8Array(items.length)
  let n = 0
  for (let i = 0; i < items.length && n < budget; i++) {
    const it = items[i]
    if (heightM > labelMaxHeight(it.rank)) continue
    if (!facesCamera(it.position, cameraPos) || !inView(i)) continue
    show[i] = 1
    n++
  }
  return show
}

// --- Mission pins ---
// Groups of the curated sites (pipeline/11_build_sites.py writes the same names). `token` is the CSS colour
// token (--lspb-<token>, src/index.css).
export const SITE_GROUPS = [
  { id: "Apollo", label: "Apollo", token: "group-apollo" },
  { id: "CLPS", label: "CLPS", token: "group-clps" },
  { id: "Artemis III candidate regions", label: "Artemis III regions", token: "group-artemis" },
  { id: "Other countries", label: "Other countries", token: "group-other" },
  { id: "South-pole reference", label: "South-pole reference", token: "group-reference" },
]
const GROUP_BY_ID = new Map(SITE_GROUPS.map((g) => [g.id, g]))

// sites.json rows -> pins. Throws on a site without a known group or a cited source (BUILD_PLAN rule 4),
// so a bad data file fails loudly instead of showing an unsourced pin.
export function sitePins(sites) {
  return sites.map((s) => {
    const group = GROUP_BY_ID.get(s.group)
    if (!group) throw new Error(`site ${s.id}: unknown group "${s.group}"`)
    if (!/^https:\/\//.test(s.source_url || "") || !s.source_note) throw new Error(`site ${s.id}: no source`)
    return { site: s, group }
  })
}

// --- Imagery fallback ---
// Decides when NASA Moon Trek tiles count as failing. Each tile gets one retry. The first tile that still
// fails puts the bundled offline texture under the tiles ("partial": it fills the holes); `maxFailures` failed
// tiles in a row with no successful tile in between mean the service is unreachable ("offline": the tiles are
// dropped and the badge shows). `offline: true` (?offline=1, or the browser is offline) starts offline.
// onChange(state) is called on every change of state: "online" -> "partial" -> "offline".
export function createImageryFallback({ offline = false, maxFailures = 6, onChange = () => {} } = {}) {
  let state = "online"
  let failures = 0
  const go = (next) => {
    if (next === state) return
    state = next
    onChange(state)
  }
  if (offline) go("offline")
  return {
    get state() {
      return state
    },
    // Cesium TileProviderError-like: { timesRetried, retry }. Sets retry for the first attempt only.
    tileError(err) {
      if (state === "offline") {
        err.retry = false
        return
      }
      if ((err.timesRetried || 0) < 1) {
        err.retry = true
        return
      }
      err.retry = false
      failures++
      go(failures >= maxFailures ? "offline" : "partial")
    },
    tileOk() {
      failures = 0
    },
  }
}

// Wire a provider ({ errorEvent: { addEventListener } }, e.g. Cesium's WebMapTileServiceImageryProvider) to the
// fallback policy. Returns the function that removes the listener.
export function watchTileErrors(provider, fallback) {
  return provider.errorEvent.addEventListener((err) => fallback.tileError(err))
}
