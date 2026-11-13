// Polar HD view: 2D map of the lunar south pole. Plain ES module: Leaflet only, no React.
// L.CRS.Simple with map units of 100 m: latLng = [y / 100, x / 100] in projected metres.

import L from "leaflet"
import { formatLatLon } from "@/lib/format.js"
import { readTheme } from "@/lib/theme.js"
import { clipRingToDisc, craterAt, rimPoints } from "@/engine/craters.js"
import { sampleBilinear } from "@/engine/data.js"
import { project, rhoForLat } from "@/engine/projection.js"
import { statusText } from "@/lib/siteSearch.js"
import { LAYER_IDS, POLAR_LAYERS, hexToRgb, layerReadout, pixelAt } from "./polarLayerModel.js"

const UNIT_M = 100
const RING_LATS = [-85, -86, -87, -88, -89]
const MERIDIAN_STEP_DEG = 30
const MAP_EDGE_LAT = -84
const CRATER_LABEL_MIN_PX = 36 // a crater's name shows once its rim is this wide on screen
const FOCUS_MIN_ZOOM = -1 // 200 m per screen pixel

const toLatLng = (x, y) => L.latLng(y / UNIT_M, x / UNIT_M)
const fromLatLng = (ll) => ({ x: ll.lng * UNIT_M, y: ll.lat * UNIT_M })

function label(latlng, text, cls) {
  return L.marker(latlng, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({ className: `lspb-map-label ${cls}`, html: text, iconSize: null }),
  })
}

// options:
//   manifest, hillshadeUrl
//   layerData        { slope: slope grid (engine/data.js createSlope), sunlightUrl, psrUrl } for the data layers
//   onPick(x, y)     -> true if accepted;   describe(x, y) -> { lat, lon, groundM } | null
//   onLayerStatus(id, status, error?)   "loading" | "ready" | "error" while a layer renders (first use only)
//   onSelectSite(site)   click / Enter on a mission-site marker (a sites.json row)
//   onMapView({ x, y, zoom })   map centre (projected metres) and zoom after each move (shareable link)
export function createPolarMap(container, opts) {
  const { manifest, hillshadeUrl, layerData, onPick, describe } = opts
  const onLayerStatus = opts.onLayerStatus || (() => {})
  const onMapView = opts.onMapView || (() => {})
  const onSelectSite = opts.onSelectSite || (() => {})
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
  // Panes, bottom to top: hillshade, data layers, then Leaflet's overlay pane (grid, craters) and markers.
  map.createPane("lspbBase").style.zIndex = 300
  map.createPane("lspbLayers").style.zIndex = 350
  L.imageOverlay(hillshadeUrl, imageBounds, { interactive: false, pane: "lspbBase" }).addTo(map)

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
    if (!d) {
      readoutEl.textContent = "outside the map (84°S to 90°S)"
      return
    }
    const crater = cratersVisible ? craterAt(craters, d.lat, d.lon, R / 1000) : null
    const values = LAYER_IDS.filter((id) => layers[id].on && layers[id].ready).map((id) => layerReadout(id, layerValueAt(id, x, y)))
    readoutEl.textContent =
      `${formatLatLon(d.lat, d.lon)}   h ${Number.isFinite(d.groundM) ? `${d.groundM.toFixed(0)} m` : "-"}` +
      (crater ? `   ${crater.name}` : "") +
      values.map((v) => `   ${v ?? "no data"}`).join("")
  })
  map.on("mouseout", () => {
    readoutEl.textContent = "move the cursor over the map"
  })

  map.on("click", (e) => {
    const { x, y } = fromLatLng(e.latlng)
    onPick(x, y)
  })

  // Keyboard: Leaflet already pans (arrows) and zooms (+ / -) when the map has focus; Enter or Space
  // places the pin at the map centre, marked by a crosshair while focused (CSS .leaflet-container:focus-visible).
  container.setAttribute("role", "application")
  container.setAttribute("aria-label", "Map of the lunar south pole. Arrow keys pan, plus and minus zoom, Enter places the pin at the centre.")
  const onKey = (e) => {
    if (e.target !== container || (e.key !== "Enter" && e.key !== " ")) return
    e.preventDefault()
    const { x, y } = fromLatLng(map.getCenter())
    onPick(x, y)
  }
  container.addEventListener("keydown", onKey)

  // --- Compared sites, as on the globe: numbered badges in their column colours (same-place columns share one,
  // "1·3"), joined in column order by a thin line that draws in (instantly under reduced motion, index.css).
  // Only places on this map (84°S to the pole); the others are skipped. Not interactive. ---
  const cmpGroup = L.layerGroup().addTo(map)
  // items: view/globeModel.js compareMarkers()
  function setCompare(items) {
    cmpGroup.clearLayers()
    const places = []
    for (const it of items) {
      if (it.lat > MAP_EDGE_LAT) continue
      const p = places.find((q) => q.lat === it.lat && q.lon === it.lon)
      if (p) p.ns.push(it.n)
      else places.push({ lat: it.lat, lon: it.lon, color: it.color, ns: [it.n] })
    }
    const lls = places.map((p) => {
      const { x, y } = project(p.lat, p.lon, R)
      return toLatLng(x, y)
    })
    if (lls.length > 1) {
      const line = L.polyline(lls, { interactive: false, color: theme.line, opacity: 0.8, weight: 2, className: "lspb-cmp-line" }).addTo(cmpGroup)
      line.getElement()?.setAttribute("pathLength", "1") // the draw-in animates the dash offset from 1 to 0
    }
    places.forEach((p, i) => {
      L.marker(lls[i], {
        interactive: false,
        keyboard: false,
        zIndexOffset: 1000, // above the mission-site dots and the pin
        icon: L.divIcon({
          className: "lspb-cmp-anchor",
          html: `<span class="lspb-cmp-badge" style="--cmp: var(--lspb-cmp-${p.color + 1})">${p.ns.join("·")}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(cmpGroup)
    })
  }

  // "Move a little" ring: 8 dots around the pin, coloured by the chosen share (view/ringModel.js); a point with no
  // value is hollow. Drawn under the pin, not interactive.
  const ringGroup = L.layerGroup().addTo(map)
  function setRing(items) {
    ringGroup.clearLayers()
    for (const it of items) {
      const { x, y } = project(it.lat, it.lon, R)
      L.circleMarker(toLatLng(x, y), {
        interactive: false,
        radius: it.color ? 6 : 4,
        weight: 1.5,
        color: it.color ? theme.bg : theme.lineDim,
        fillColor: it.color ?? theme.bg,
        fillOpacity: it.color ? 1 : 0,
      }).addTo(ringGroup)
    }
  }

  // The single pin: a draggable crosshair marker; the store is the source of truth.
  let marker = null
  let pinLatLng = null
  function setPin(pin) {
    if (!pin || pin.x === undefined) {
      // no pin, or a pin outside Polar HD (Global terrain): nothing to mark on this map
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

  // Named craters (display only): rim outlines plus labels. Nothing here is interactive, so clicks
  // inside a crater reach the map click handler and place the pin at the clicked point.
  let craters = []
  let cratersVisible = true
  const craterGroup = L.layerGroup()
  const craterLabels = L.layerGroup()
  let labelMarkers = [] // [{ marker, diameterUnits }]

  function setCraterLayer(list, visible = cratersVisible) {
    craterGroup.clearLayers()
    craterLabels.clearLayers()
    craters = list || []
    const edgeRho = rhoForLat(MAP_EDGE_LAT, R)
    const style = { color: theme.crater, weight: 1.2, opacity: 0.9, interactive: false }
    labelMarkers = craters.flatMap((c) => {
      // Outline clipped to the map disc: only the arcs at or south of 84°S are drawn.
      const ring = rimPoints(c, R / 1000).map((p) => project(p.lat, p.lon, R))
      for (const part of clipRingToDisc(ring, edgeRho)) {
        L.polyline(part.map((q) => toLatLng(q.x, q.y)), style).addTo(craterGroup)
      }
      const centre = project(c.lat, c.lon, R)
      if (Math.hypot(centre.x, centre.y) > edgeRho) return [] // centre off the map: outline arc only, no label
      const html = document.createElement("span")
      html.textContent = c.name
      const marker = L.marker(toLatLng(centre.x, centre.y), {
        interactive: false,
        keyboard: false,
        zIndexOffset: -1000, // always under the pin
        icon: L.divIcon({ className: "lspb-crater-label", html, iconSize: null }),
      })
      return [{ marker, diameterUnits: (c.diameter_km * 1000) / UNIT_M }]
    })
    setCratersVisible(visible)
  }

  // Declutter: in L.CRS.Simple one map unit is 2^zoom px, so bigger craters get labels first.
  function updateCraterLabels() {
    const pxPerUnit = 2 ** map.getZoom()
    for (const { marker, diameterUnits } of labelMarkers) {
      const show = diameterUnits * pxPerUnit >= CRATER_LABEL_MIN_PX
      if (show && !craterLabels.hasLayer(marker)) craterLabels.addLayer(marker)
      else if (!show && craterLabels.hasLayer(marker)) craterLabels.removeLayer(marker)
    }
  }
  map.on("zoomend", updateCraterLabels)

  function setCratersVisible(visible) {
    cratersVisible = visible
    for (const layer of [craterGroup, craterLabels]) {
      if (visible) layer.addTo(map)
      else layer.remove()
    }
    if (visible) updateCraterLabels()
  }

  // Fit the map disc to the container, leaving room for the overlays: the view toggle on top and, below
  // 1024 px, the ratings strip at the bottom. After a resize (e.g. phone rotation) refit, unless the user
  // has zoomed or panned since the last fit.
  let fitted = null
  function setBounds() {
    const narrow = window.innerWidth < 1024
    map.fitBounds(imageBounds, {
      animate: false,
      paddingTopLeft: [0, narrow ? 44 : 0],
      paddingBottomRight: [0, narrow ? 64 : 0],
    })
    fitted = { zoom: map.getZoom(), center: map.getCenter() }
  }
  setBounds()
  // Reported only while visible: a map created hidden (display: none) has no real view yet.
  map.on("moveend", () => container.clientWidth && onMapView({ ...fromLatLng(map.getCenter()), zoom: map.getZoom() }))
  // Leaflet only listens to window resizes; the container also changes when the compare drawer moves.
  let sizeFrame = 0
  const sizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(sizeFrame)
    sizeFrame = requestAnimationFrame(() => container.clientWidth && map.invalidateSize({ animate: false }))
  })
  sizeObserver.observe(container)
  map.on("resize", () => {
    const untouched = fitted && map.getZoom() === fitted.zoom && map.getCenter().distanceTo(fitted.center) < 1
    if (untouched) setBounds()
  })

  // --- Mission sites on the map (state.js loadSites(): [{ site, group }]), coloured by group as on the globe ---
  // Sites at the same coordinates share one marker (e.g. two missions to one target); clicking it picks the
  // first. Markers are focusable (Tab) and Enter picks, like a click. They sit above crater labels, under the pin.
  const siteGroup = L.layerGroup()
  function setSites(pins) {
    siteGroup.clearLayers()
    const byPlace = new Map()
    for (const p of pins) {
      if (p.site.lat > MAP_EDGE_LAT) continue
      const key = `${p.site.lat},${p.site.lon}`
      if (!byPlace.has(key)) byPlace.set(key, [])
      byPlace.get(key).push(p)
    }
    for (const list of byPlace.values()) {
      const { site, group } = list[0]
      const { x, y } = project(site.lat, site.lon, R)
      const dot = document.createElement("span")
      dot.className = "lspb-site-dot"
      dot.style.background = `var(--lspb-${group.token})`
      const tip = document.createElement("div")
      for (const { site: s, group: g } of list) {
        const name = document.createElement("strong")
        name.textContent = s.name
        const detail = document.createElement("div")
        detail.textContent = [g.label, statusText(s), s.verified ? null : "unverified"].filter(Boolean).join(" · ")
        tip.append(name, detail)
      }
      const label = list.map((q) => q.site.name).join(", ")
      const marker = L.marker(toLatLng(x, y), {
        icon: L.divIcon({ className: "lspb-site-marker", html: dot, iconSize: [16, 16], iconAnchor: [8, 8] }),
        keyboard: true,
        zIndexOffset: -500,
      })
      marker.bindTooltip(tip, { direction: "top", offset: [0, -8], className: "lspb-site-tooltip" })
      marker.on("add", () => {
        const el = marker.getElement()
        el.setAttribute("role", "button")
        el.setAttribute("aria-label", `Mission site: ${label}`)
      })
      marker.on("click", () => onSelectSite(site))
      siteGroup.addLayer(marker)
    }
  }
  function setSitesVisible(on) {
    if (on) siteGroup.addTo(map)
    else siteGroup.remove()
  }

  // --- Data layers (slope, average sunlight, permanent shadow) ---
  // Each is rendered once, on first use, by a worker into a PNG over the near grid; toggling and opacity only
  // change the overlay's opacity, which CSS fades (.lspb-layer, 200 ms; none under reduced motion).
  const geom = { width: g.width, height: g.height, pixelM: g.pixel_m, xMin: g.x_min, yMax: g.y_max }
  const layers = Object.fromEntries(
    POLAR_LAYERS.map((l) => [l.id, { on: false, opacity: l.opacity, overlay: null, grid: null, ready: false, loading: false, url: null }]),
  )
  const layerColors = () => ({
    ok: hexToRgb(theme.ok),
    warn: hexToRgb(theme.warn),
    bad: hexToRgb(theme.bad),
    sunLow: hexToRgb(theme.layerSunLow),
    sunHigh: hexToRgb(theme.sun),
    psr: hexToRgb(theme.psr),
  })
  let destroyed = false

  function layerValueAt(id, x, y) {
    if (id === "slope") return sampleBilinear(layerData.slope, x, y)
    const grid = layers[id].grid
    return grid ? pixelAt(grid, x, y) : null
  }

  function renderLayer(id) {
    const st = layers[id]
    const disc = { ...geom, radiusM: rhoForLat(MAP_EDGE_LAT, R) } // clip to the map disc, like the hillshade
    const base = { kind: id, width: g.width, height: g.height, colors: layerColors(), disc }
    let msg
    if (id === "slope") {
      const sg = layerData.slope
      msg = { ...base, values: sg.data.slice(), scale: sg.scale, nodata: sg.nodata }
    } else {
      const url = id === "psr" ? layerData.psrUrl : layerData.sunlightUrl
      if (!url) {
        onLayerStatus(id, "error", "not in this data build")
        return
      }
      msg = { ...base, url: new URL(url, location.href).href }
    }
    st.loading = true
    onLayerStatus(id, "loading")
    const worker = new Worker(new URL("./polarLayers.worker.js", import.meta.url), { type: "module" })
    const done = (error) => {
      worker.terminate()
      st.loading = false
      if (!destroyed) onLayerStatus(id, error ? "error" : "ready", error)
    }
    worker.onerror = (e) => done(e.message || "layer worker failed")
    worker.onmessage = (e) => {
      if (destroyed) return done()
      if (e.data.error) return done(e.data.error)
      st.url = URL.createObjectURL(e.data.png)
      if (e.data.values) st.grid = { ...geom, data: e.data.values }
      st.overlay = L.imageOverlay(st.url, imageBounds, {
        pane: "lspbLayers",
        interactive: false,
        className: "lspb-layer",
        opacity: 0,
        zIndex: LAYER_IDS.indexOf(id) + 1,
      }).addTo(map)
      st.ready = true
      done()
      applyLayer(id)
    }
    worker.postMessage(msg, msg.values ? [msg.values.buffer] : [])
  }

  function applyLayer(id) {
    const st = layers[id]
    // next frame: an overlay just added starts at 0, so the CSS transition fades it in
    if (st.overlay) requestAnimationFrame(() => !destroyed && st.overlay.setOpacity(st.on ? st.opacity : 0))
  }

  // setLayer(id, { on?, opacity? }): mirrors the store's layer state (PolarHdPanel forwards it).
  function setLayer(id, { on, opacity }) {
    const st = layers[id]
    if (!st) return
    if (on !== undefined) st.on = on
    if (opacity !== undefined) st.opacity = opacity
    if (st.on && !st.overlay && !st.loading) renderLayer(id)
    applyLayer(id)
  }

  // Centre the map on a point (search result, typed coordinates), zooming in to at least FOCUS_MIN_ZOOM.
  function panTo(x, y, animate = true) {
    map.setView(toLatLng(x, y), Math.max(map.getZoom(), FOCUS_MIN_ZOOM), { animate })
  }

  return {
    setPin,
    panTo,
    setLayer,
    setSites,
    setSitesVisible,
    // Restore a shared link's map view (no animation).
    setMapView: ({ x, y, zoom }) => map.setView(toLatLng(x, y), zoom, { animate: false }),
    setCraterLayer,
    setCratersVisible,
    setRing,
    setCompare,
    getCratersVisible: () => cratersVisible,
    setBounds,
    invalidateSize: () => map.invalidateSize({ animate: false }),
    destroy: () => {
      destroyed = true
      for (const st of Object.values(layers)) if (st.url) URL.revokeObjectURL(st.url)
      container.removeEventListener("keydown", onKey)
      sizeObserver.disconnect()
      cancelAnimationFrame(sizeFrame)
      map.remove()
      marker = null
    },
  }
}
