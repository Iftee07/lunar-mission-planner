// The address bar mirrors the planner (lib/urlState.js), so any view can be shared: "the schedule slipped,
// here is the alternative" (challenge C4). Read once before the first render; written back 300 ms after the
// last change with history.replaceState (no history entry per change). Other query parameters (?offline=1)
// are kept.

import { URL_KEYS, decodeUrlState, encodeUrlState, urlSnapshot } from "@/lib/urlState.js"
import { goToLatLon, loadSites, setPinLatLon, useStore } from "@/state.js"

const SYNC_DELAY_MS = 300

// Apply a link's state to the store. A link with planner state skips the welcome slides. The pin is placed
// once its terrain (and, for site=, the site list) has loaded; it flies the globe there unless the link
// also has a camera. Returns the decoded place ({ siteId } | { lat, lon } | null).
export function applyUrlState(search, { restorePlace = true } = {}) {
  const { found, patch, layersOn, place } = decodeUrlState(search)
  if (!found) return null
  useStore.setState((s) => {
    const next = { ...patch, screen: "app" }
    if (layersOn) next.layers = Object.fromEntries(Object.entries(s.layers).map(([id, l]) => [id, { ...l, on: layersOn.includes(id) }]))
    return next
  })
  if (restorePlace && place) {
    const placePin = patch.camera?.globe ? setPinLatLon : goToLatLon
    const pending = place.siteId
      ? loadSites().then((pins) => {
          const p = pins.find((q) => q.site.id === place.siteId)
          return p ? placePin(p.site.lat, p.site.lon, p.site) : null
        })
      : placePin(place.lat, place.lon)
    pending.catch(() => {}) // a data error shows in <DataStatus>
  }
  return place
}

let timer = 0

function writeUrl() {
  timer = 0
  const q = new URLSearchParams(location.search)
  for (const k of URL_KEYS) q.delete(k)
  for (const [k, v] of encodeUrlState(urlSnapshot(useStore.getState()))) q.set(k, v)
  const qs = q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":")
  const url = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, "", url)
}

const SYNCED = ["pin", "baseTimeUtcMs", "sliderOffsetH", "antennaM", "missionH", "sunMode", "view", "layers", "camera", "screen"]

export function startUrlSync() {
  useStore.subscribe((s, prev) => {
    if (s.screen !== "app" || !SYNCED.some((k) => s[k] !== prev[k])) return
    clearTimeout(timer)
    timer = setTimeout(writeUrl, SYNC_DELAY_MS)
  })
}

// Write any pending change now and return the link (the "Copy link" button).
export function flushUrlState() {
  clearTimeout(timer)
  writeUrl()
  return location.href
}
