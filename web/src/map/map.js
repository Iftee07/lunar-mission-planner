// 2D map of the lunar south pole (PRD section 7). Plain ES module: Leaflet only, no React.
// L.CRS.Simple with map units of 100 m: latLng = [y / 100, x / 100] in projected metres.

import L from "leaflet"
import { formatLatLon } from "@/lib/format.js"
import { readTheme } from "@/lib/theme.js"
import { project, rhoForLat } from "@/engine/projection.js"

const UNIT_M = 100
const RING_LATS = [-85, -86, -87, -88, -89]
const MERIDIAN_STEP_DEG = 30
const MAP_EDGE_LAT = -84

const toLatLng = (x, y) => L.latLng(y / UNIT_M, x / UNIT_M)
const fromLatLng = (ll) => ({ x: ll.lng * UNIT_M, y: ll.lat * UNIT_M })

function label(latlng, text, cls) {
  return L.marker(latlng, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: `lspb-map-label ${cls}`, html: text, iconSize: null }),
  })
}

// options: { manifest, hillshadeUrl, onPick(x, y) -> true if accepted, describe(x, y) -> { lat, lon, groundM } | null }
export function createMap(container, { manifest, hillshadeUrl, onPick, describe }) {
  const theme = readTheme()
  const R = manifest.moon_radius_m
  const g = manifest.grids.near
  const south = g.y_max - g.height * g.pixel_m
  const east = g.x_min + g.width * g.pixel_m
  const imageBounds = L.latLngBounds(toLatLng(g.x_min, south), toLatLng(east, g.y_max))

  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    attributionControl: false,
    zoomControl: false,
    maxBounds: imageBounds.pad(0.05),
    maxBoundsViscosity: 1,
  })
  L.control.zoom({ position: "topright" }).addTo(map)
  L.imageOverlay(hillshadeUrl, imageBounds, { interactive: false }).addTo(map)

  const lineStyle = { color: theme.lineDim, weight: 1, opacity: 0.9, interactive: false, fill: false }
  const overlay = L.layerGroup().addTo(map)
  for (const lat of [MAP_EDGE_LAT, ...RING_LATS]) {
    const rho = rhoForLat(lat, R)
    L.circle(toLatLng(0, 0), { ...lineStyle, radius: rho / UNIT_M, color: lat === MAP_EDGE_LAT ? theme.line : theme.lineDim }).addTo(overlay)
    if (lat !== MAP_EDGE_LAT) {
      const p = project(lat, 0, R)
      label(toLatLng(p.x, p.y), `${-lat}°S`, "lspb-map-label-ring").addTo(overlay)
    }
  }
  for (let lon = 0; lon < 360; lon += MERIDIAN_STEP_DEG) {
    const a = project(-90, lon, R)
    const b = project(MAP_EDGE_LAT, lon, R)
    L.polyline([toLatLng(a.x, a.y), toLatLng(b.x, b.y)], lineStyle).addTo(overlay)
    const t = project(MAP_EDGE_LAT + 0.25, lon, R)
    label(toLatLng(t.x, t.y), `${lon}°E`, "lspb-map-label-meridian").addTo(overlay)
  }

  // Cursor readout (bottom-left): lat, lon, ground height. Updated directly, no React re-render.
  const Readout = L.Control.extend({
    onAdd() {
      const div = L.DomUtil.create("div", "lspb-map-readout")
      div.textContent = "move the cursor over the map"
      return div
    },
  })
  const readout = new Readout({ position: "bottomleft" }).addTo(map)
  const readoutEl = readout.getContainer()
  map.on("mousemove", (e) => {
    const { x, y } = fromLatLng(e.latlng)
    const d = describe(x, y)
    readoutEl.textContent = d
      ? `${formatLatLon(d.lat, d.lon)}   h ${Number.isFinite(d.groundM) ? `${d.groundM.toFixed(0)} m` : "-"}`
      : "outside the map (84°S to 90°S)"
  })
  map.on("mouseout", () => {
    readoutEl.textContent = "move the cursor over the map"
  })

  map.on("click", (e) => {
    const { x, y } = fromLatLng(e.latlng)
    onPick(x, y)
  })

  // The single pin: a draggable crosshair marker; the store is the source of truth.
  let marker = null
  let pinLatLng = null
  function setPin(pin) {
    if (!pin) {
      if (marker) marker.remove()
      marker = null
      return
    }
    const ll = toLatLng(pin.x, pin.y)
    pinLatLng = ll
    if (!marker) {
      marker = L.marker(ll, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({ className: "lspb-pin", iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(map)
      marker.on("dragend", () => {
        const { x, y } = fromLatLng(marker.getLatLng())
        if (!onPick(x, y)) marker.setLatLng(pinLatLng) // dropped outside the map disc: snap back
      })
    } else {
      marker.setLatLng(ll)
    }
  }

  function setBounds() {
    map.fitBounds(imageBounds, { animate: false })
  }
  setBounds()

  return {
    setPin,
    setBounds,
    invalidateSize: () => map.invalidateSize({ animate: false }),
    destroy: () => {
      map.remove()
      marker = null
    },
  }
}
