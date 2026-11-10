// 3D globe of the whole Moon (CesiumJS). Plain ES module, no React: GlobePanel.jsx creates it once and
// talks to it through the returned API. Display only: every number in the app comes from the engine.
//
// - Imagery: NASA Moon Trek LRO WAC global mosaic (WMTS, streamed; the app's only runtime network use),
//   the bundled offline texture as a fallback, and our 120 m LOLA "South Pole HD" hillshade over 84-90 S.
// - No 3D terrain (team decision): a smooth Ellipsoid.MOON sphere with sharp imagery.
// - Lighting: a directional light along the ephemeris Sun vector, so the day/night line is the real one.
// - Earth: a marker in the true Earth direction just beyond the limb, plus the sub-Earth point.
// - Crater names with level of detail (globeModel.js), mission pins by group, the user's pin.
// Frames: the globe's fixed frame is MOON_ME (x toward 0° N 0° E, z north); see test/globe.test.js.

import {
  BillboardCollection,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  CameraEventType,
  CesiumWidget,
  Color,
  Credit,
  DirectionalLight,
  EllipsoidTerrainProvider,
  Globe,
  HorizontalOrigin,
  ImageryLayer,
  Intersect,
  KeyboardEventModifier,
  LabelCollection,
  LabelStyle,
  Material,
  NearFarScalar,
  PinBuilder,
  PointPrimitiveCollection,
  PolylineCollection,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  SingleTileImageryProvider,
  SkyBox,
  VerticalOrigin,
  WebMapTileServiceImageryProvider,
  buildModuleUrl,
  Ellipsoid,
} from "cesium"
import "cesium/Build/Cesium/Widgets/CesiumWidget/CesiumWidget.css"
import { statusText } from "@/lib/siteSearch.js"
import { readTheme, token } from "@/lib/theme.js"
import { MOON, cartesianFromLatLon, latLonFromCartesian, moonTrekOptions, pickLatLon } from "./globeCoords.js"
import {
  SITE_GROUPS,
  createImageryFallback,
  earthMarkerPosition,
  labelBudgetFor,
  moonSide,
  selectLabels,
  subPoint,
  sunLightDirection,
  watchTileErrors,
} from "./globeModel.js"

// Cesium's workers and assets are served from /cesium/ (vite.config.js copies them there).
buildModuleUrl.setBaseUrl("/cesium/")
Ellipsoid.default = MOON

const FALLBACK_CREDIT = "Offline imagery: NASA SVS CGI Moon Kit (LROC: NASA/GSFC/Arizona State University)"
const POLAR_HD_CREDIT = "South Pole HD: LOLA 120 m hillshade (NASA GSFC)"

const R = MOON.maximumRadius
const MIN_ZOOM_M = 2000
const MAX_ZOOM_M = 2.0e7
const SITE_FLY_HEIGHT_M = 4.0e5
const FLY_SECONDS = 1.2
// The South Pole HD layer fades in as the camera comes down: invisible above 4,000 km, full below 1,500 km.
const POLAR_HD_FADE_M = [1.5e6, 4.0e6]
const POLAR_HD_LOAD_LAT = -55 // load the overlay once the view centre is this far south (and low enough)

const toCartesian = (p) => new Cartesian3(p[0], p[1], p[2])
const toArray = (c) => [c.x, c.y, c.z]
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const DEG = 180 / Math.PI

// Seeded random star field on the six sky-box faces: faint, sparse, fixed to the Moon's frame.
function starFaces(space, star, size = 1024, count = 900) {
  let s = 20261113
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
  const faces = {}
  for (const face of ["positiveX", "negativeX", "positiveY", "negativeY", "positiveZ", "negativeZ"]) {
    const c = document.createElement("canvas")
    c.width = c.height = size
    const g = c.getContext("2d")
    g.fillStyle = space
    g.fillRect(0, 0, size, size)
    g.fillStyle = star
    for (let i = 0; i < count; i++) {
      const m = rand()
      g.globalAlpha = 0.25 + 0.75 * m ** 3 // mostly faint, a few bright
      const r = m > 0.97 ? 1.6 : 0.9
      g.beginPath()
      g.arc(rand() * size, rand() * size, r, 0, 2 * Math.PI)
      g.fill()
    }
    faces[face] = c
  }
  return faces
}

// The user's pin: a crosshair ring in the Sun colour, like the Polar HD map's pin.
function pinCanvas(color, shadow, size = 30) {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const g = c.getContext("2d")
  const m = size / 2
  g.lineWidth = 2
  g.strokeStyle = shadow
  g.globalAlpha = 0.8
  g.beginPath()
  g.arc(m, m, m - 5, 0, 2 * Math.PI)
  g.stroke()
  g.globalAlpha = 1
  g.strokeStyle = color
  g.lineWidth = 2
  g.beginPath()
  g.arc(m, m, m - 6, 0, 2 * Math.PI)
  g.moveTo(m, 1)
  g.lineTo(m, size - 1)
  g.moveTo(1, m)
  g.lineTo(size - 1, m)
  g.stroke()
  return c
}

function ringCanvas(color, size = 64) {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const g = c.getContext("2d")
  g.strokeStyle = color
  g.lineWidth = 3
  g.beginPath()
  g.arc(size / 2, size / 2, size / 2 - 3, 0, 2 * Math.PI)
  g.stroke()
  return c
}

function discCanvas(color, highlight, shadow, size = 22) {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const g = c.getContext("2d")
  const m = size / 2
  const grad = g.createRadialGradient(m * 0.7, m * 0.7, 1, m, m, m - 2)
  grad.addColorStop(0, highlight)
  grad.addColorStop(0.35, color)
  grad.addColorStop(1, color)
  g.fillStyle = grad
  g.beginPath()
  g.arc(m, m, m - 2, 0, 2 * Math.PI)
  g.fill()
  g.strokeStyle = shadow
  g.lineWidth = 1.5
  g.stroke()
  return c
}

// Moon Trek provider that also reports each tile that loads, so a recovered network resets the fallback count.
class TrackedWmtsProvider extends WebMapTileServiceImageryProvider {
  constructor(options, onTileOk) {
    super(options)
    this.onTileOk = onTileOk
  }
  requestImage(x, y, level, request) {
    const p = super.requestImage(x, y, level, request)
    p?.then?.(this.onTileOk, () => {})
    return p
  }
}

const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

/**
 * options:
 *   manifest, ephemeris          engine data (core tier)
 *   urls                         { fallbackTextureUrl, southPoleHdUrl, featuresUrl } (globe tier)
 *   sites                        mission pins, [{ site, group }] (state.js loadSites())
 *   offline                      start with the bundled texture only (?offline=1 or the browser is offline)
 *   reducedMotion                no fly animation, pulse or bounce
 *   onPick(lat, lon)             click / Enter on the Moon
 *   onSelectSite(site)           click on a mission pin (second tap on touch)
 *   onHover(info | null)         { kind, title, detail?, note?, x, y } under the pointer (CSS px in the container)
 *   onView({ lat, lon, heightM, side })   view centre after the camera moves
 *   onImagery(state)             "online" | "partial" | "offline"
 *   onCamera(cam)                camera after each move: { lat, lon, heightM, headingDeg, pitchDeg } (shareable link)
 */
export function createGlobe(container, opts) {
  const { manifest, ephemeris, urls, offline = false, reducedMotion = false } = opts
  const noop = () => {}
  const onPick = opts.onPick || noop
  const onSelectSite = opts.onSelectSite || noop
  const onHover = opts.onHover || noop
  const onView = opts.onView || noop
  const onImagery = opts.onImagery || noop
  const onCamera = opts.onCamera || noop
  const theme = readTheme()
  const css = (name) => Color.fromCssColorString(token(name))
  const space = token("space")
  const outline = css("space")

  const widget = new CesiumWidget(container, {
    ellipsoid: MOON,
    globe: new Globe(MOON),
    baseLayer: false,
    terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: MOON }),
    skyBox: new SkyBox({ sources: starFaces(space, token("star")) }),
    skyAtmosphere: false,
    scene3DOnly: true,
    requestRenderMode: true,
    maximumRenderTimeChange: Infinity,
    shouldAnimate: false,
  })
  const { scene } = widget
  const { camera, globe } = scene
  // Cesium adds an Earth-sky Sun (positioned for Earth); our light comes from the ephemeris instead.
  if (scene.sun) scene.sun = scene.sun.destroy()
  scene.backgroundColor = outline
  scene.fog.enabled = false
  globe.baseColor = css("globe-base")
  globe.showGroundAtmosphere = false
  globe.dynamicAtmosphereLighting = false
  globe.enableLighting = true
  globe.lightingFadeOutDistance = 0 // lit and shaded at every zoom (Cesium's Earth default fades lighting out up close)
  globe.lightingFadeInDistance = 1
  scene.light = new DirectionalLight({ direction: new Cartesian3(-1, 0, 0), intensity: 2.0 })

  // Google Earth style: drag rotates, wheel / pinch zooms, right-drag / two-finger drag / Ctrl-drag tilts.
  const ctl = scene.screenSpaceCameraController
  ctl.minimumZoomDistance = MIN_ZOOM_M
  ctl.maximumZoomDistance = MAX_ZOOM_M
  // A laptop touchpad pinch arrives as Ctrl + wheel: it zooms the globe too, not the page.
  ctl.zoomEventTypes = [CameraEventType.WHEEL, CameraEventType.PINCH, { eventType: CameraEventType.WHEEL, modifier: KeyboardEventModifier.CTRL }]
  const onWheel = (e) => {
    if (e.ctrlKey) e.preventDefault() // the browser's page zoom
  }
  container.addEventListener("wheel", onWheel, { passive: false })
  ctl.tiltEventTypes = [
    CameraEventType.RIGHT_DRAG,
    CameraEventType.MIDDLE_DRAG,
    CameraEventType.PINCH,
    { eventType: CameraEventType.LEFT_DRAG, modifier: KeyboardEventModifier.CTRL },
  ]

  // Start on the near side, tilted south so the polar region shows, with the whole disc in view.
  {
    const fov = camera.frustum.fov || Math.PI / 3
    const aspect = Math.max(0.3, container.clientWidth / Math.max(1, container.clientHeight))
    // Cesium's fov spans the longer side; fit the disc to the shorter one.
    const half = Math.atan(Math.tan(fov / 2) * Math.min(aspect, 1 / aspect))
    const dist = R / Math.sin(half * 0.85)
    camera.setView({ destination: cartesianFromLatLon(-20, 10, dist - R) })
  }

  // --- imagery ---
  // Imagery credits are shown on the globe; on a phone they would cover it, so they go into Cesium's
  // "Data attribution" panel (one tap) instead.
  const inlineCredits = container.clientWidth >= 640
  const layers = scene.imageryLayers
  let trekLayer = null
  let fallbackLayer = null
  let polarLayer = null
  let polarOpacity = 0.85

  function addFallbackLayer() {
    if (fallbackLayer || !urls.fallbackTextureUrl) return
    const spec = manifest.globe?.fallback_texture
    const rect = spec ? Rectangle.fromDegrees(...spec.rectangle_deg) : Rectangle.MAX_VALUE
    fallbackLayer = ImageryLayer.fromProviderAsync(
      SingleTileImageryProvider.fromUrl(urls.fallbackTextureUrl, { rectangle: rect, credit: new Credit(FALLBACK_CREDIT, inlineCredits) }),
    )
    layers.add(fallbackLayer, 0) // under the Moon Trek tiles: fills any tile that fails
  }

  const fallback = createImageryFallback({
    offline,
    onChange(state) {
      addFallbackLayer()
      if (state === "offline" && trekLayer) trekLayer.show = false
      onImagery(state)
      scene.requestRender()
    },
  })
  // (Starting offline, onChange above has already added the offline texture.)
  if (fallback.state !== "offline") {
    const provider = new TrackedWmtsProvider(moonTrekOptions(inlineCredits), () => fallback.tileOk())
    watchTileErrors(provider, fallback)
    trekLayer = layers.addImageryProvider(provider)
  }

  function ensurePolarLayer() {
    if (polarLayer || !urls.southPoleHdUrl) return
    const spec = manifest.globe.south_pole_hd
    polarLayer = ImageryLayer.fromProviderAsync(
      SingleTileImageryProvider.fromUrl(urls.southPoleHdUrl, {
        rectangle: Rectangle.fromDegrees(...spec.rectangle_deg),
        credit: new Credit(POLAR_HD_CREDIT, inlineCredits),
      }),
    )
    polarLayer.alpha = 0
    layers.add(polarLayer)
  }

  // --- Sun, Earth, sub-points ---
  const markers = new BillboardCollection({ scene })
  const points = new PointPrimitiveCollection()
  const markerLabels = new LabelCollection({ scene })
  scene.primitives.add(points)
  scene.primitives.add(markers)
  scene.primitives.add(markerLabels)
  const labelFont = `600 12px ${theme.fontMono}`
  const earth = markers.add({ image: discCanvas(theme.earth, theme.line, space), id: { kind: "earth" }, show: false })
  const earthLabel = markerLabels.add({
    text: "Earth",
    font: labelFont,
    fillColor: css("earth"),
    outlineColor: outline,
    outlineWidth: 3,
    style: LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cartesian2(0, -18),
    horizontalOrigin: HorizontalOrigin.CENTER,
    show: false,
  })
  const subEarth = points.add({ pixelSize: 7, color: css("earth"), outlineColor: outline, outlineWidth: 1.5, id: { kind: "subEarth" }, show: false })
  const subSolar = points.add({ pixelSize: 8, color: css("sun"), outlineColor: outline, outlineWidth: 1.5, id: { kind: "subSolar" }, show: false })

  function setTime(ms) {
    const sun = ephemeris.vectorAt("sun", ms)
    const earthKm = ephemeris.vectorAt("earth", ms)
    if (!sun || !earthKm) return // outside the ephemeris: keep the last lighting
    scene.light.direction = toCartesian(sunLightDirection(sun))
    const ePos = toCartesian(earthMarkerPosition(earthKm, R))
    earth.position = ePos
    earthLabel.position = ePos
    const se = subPoint(earthKm)
    const ss = subPoint(sun)
    subEarth.position = cartesianFromLatLon(se.lat, se.lon)
    subSolar.position = cartesianFromLatLon(ss.lat, ss.lon)
    earth.show = earthLabel.show = subEarth.show = subSolar.show = true
    scene.requestRender()
  }

  // --- crater and feature names ---
  const craterLabels = new LabelCollection({ scene })
  scene.primitives.add(craterLabels)
  let features = [] // [{ feature, position: [x, y, z], sphere, label }]
  let labelsVisible = true

  fetch(urls.featuresUrl)
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => {
      if (widget.isDestroyed()) return
      const fill = css("crater-label")
      features = list.map((f) => {
        const pos = cartesianFromLatLon(f.lat, f.lon)
        const label = craterLabels.add({
          text: f.name,
          font: f.rank <= 1 ? `600 13px ${theme.fontMono}` : `11px ${theme.fontMono}`,
          fillColor: fill,
          outlineColor: outline,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.CENTER,
          scaleByDistance: new NearFarScalar(2.0e5, 1.0, 8.0e6, 0.8),
          position: pos,
          show: false,
          id: { kind: "feature", feature: f },
        })
        return { ...f, position: toArray(pos), sphere: new BoundingSphere(pos, 1), label }
      })
      scheduleViewUpdate()
    })
    .catch(() => {}) // display-only layer: the globe works without it

  function updateLabels() {
    if (!features.length) return
    if (!labelsVisible) {
      craterLabels.show = false
      return
    }
    craterLabels.show = true
    const cv = camera.frustum.computeCullingVolume(camera.positionWC, camera.directionWC, camera.upWC)
    const show = selectLabels(features, {
      cameraPos: toArray(camera.positionWC),
      heightM: camera.positionCartographic.height,
      budget: labelBudgetFor(scene.canvas.clientWidth, scene.canvas.clientHeight),
      inView: (i) => cv.computeVisibility(features[i].sphere) !== Intersect.OUTSIDE,
    })
    for (let i = 0; i < features.length; i++) features[i].label.show = show[i] === 1
  }

  // --- mission pins ---
  const sitePinsBB = new BillboardCollection({ scene })
  scene.primitives.add(sitePinsBB)
  const groupVisible = Object.fromEntries(SITE_GROUPS.map((g) => [g.id, true]))
  const pinImages = (() => {
    const builder = new PinBuilder()
    return Object.fromEntries(SITE_GROUPS.map((g) => [g.id, builder.fromColor(css(g.token), 34)]))
  })()
  // Mission pins (state.js loadSites(): validated sites.json rows, [{ site, group }]).
  const pins = (opts.sites || []).map(({ site, group }) => ({
    site,
    group,
    billboard: sitePinsBB.add({
      image: pinImages[group.id],
      position: cartesianFromLatLon(site.lat, site.lon),
      verticalOrigin: VerticalOrigin.BOTTOM,
      id: { kind: "site", site, group },
      show: groupVisible[group.id],
    }),
  }))

  // --- the user's pin ---
  const pinBB = new BillboardCollection({ scene })
  scene.primitives.add(pinBB)
  const ring = pinBB.add({ image: ringCanvas(theme.sun), show: false })
  const ringColor = css("line")
  const pin = pinBB.add({ image: pinCanvas(theme.sun, space), show: false, id: { kind: "pin" } })
  let pinAnim = 0

  function animatePin() {
    cancelAnimationFrame(pinAnim)
    if (reducedMotion) {
      ring.show = false
      pin.pixelOffset = Cartesian2.ZERO
      return
    }
    const t0 = performance.now()
    const step = (now) => {
      const t = clamp01((now - t0) / 700)
      pin.pixelOffset = new Cartesian2(0, -22 * (1 - easeOutBack(Math.min(1, t * 1.6))))
      ring.show = t < 1
      ring.scale = 0.3 + 1.7 * t
      ring.color = ringColor.withAlpha(1 - t)
      scene.requestRender()
      if (t < 1) pinAnim = requestAnimationFrame(step)
    }
    pinAnim = requestAnimationFrame(step)
  }

  function setPin(p) {
    if (!p) {
      pin.show = ring.show = false
      scene.requestRender()
      return
    }
    const pos = cartesianFromLatLon(p.lat, p.lon)
    pin.position = ring.position = pos
    pin.show = true
    animatePin()
    scene.requestRender()
  }

  // --- lat/lon grid ---
  const grid = new PolylineCollection()
  const gridLabels = new LabelCollection({ scene })
  grid.show = gridLabels.show = false
  scene.primitives.add(grid)
  scene.primitives.add(gridLabels)
  {
    const material = Material.fromType("Color", { color: css("line").withAlpha(0.35) })
    const line = (pts) => grid.add({ positions: pts, width: 1, material })
    const span = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i))
    for (let lon = -180; lon < 180; lon += 30) line(span(90, (i) => cartesianFromLatLon(-90 + 2 * i, lon)))
    for (let lat = -60; lat <= 60; lat += 30) line(span(180, (i) => cartesianFromLatLon(lat, -180 + 2 * i)))
    const gridLabel = (text, lat, lon) =>
      gridLabels.add({ text, position: cartesianFromLatLon(lat, lon), font: `11px ${theme.fontMono}`, fillColor: css("line"), outlineColor: outline, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cartesian2(4, -8), horizontalOrigin: HorizontalOrigin.LEFT })
    for (let lon = -150; lon <= 180; lon += 30) gridLabel(lon === 180 ? "180°" : `${Math.abs(lon)}°${lon < 0 ? "W" : lon > 0 ? "E" : ""}`, 0, lon)
    for (let lat = -60; lat <= 60; lat += 30) if (lat) gridLabel(`${Math.abs(lat)}°${lat < 0 ? "S" : "N"}`, lat, 0)
  }

  // --- camera-dependent updates (labels, Polar HD blend, view report), once per frame at most ---
  let viewFrame = 0
  function viewUpdate() {
    viewFrame = 0
    if (widget.isDestroyed()) return
    updateLabels()
    const canvas = scene.canvas
    const centre = pickLatLon(camera, new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)) || latLonFromCartesian(camera.positionWC)
    const heightM = camera.positionCartographic.height
    if (centre && centre.lat <= POLAR_HD_LOAD_LAT && heightM < POLAR_HD_FADE_M[1]) ensurePolarLayer()
    if (polarLayer) polarLayer.alpha = polarOpacity * clamp01((POLAR_HD_FADE_M[1] - heightM) / (POLAR_HD_FADE_M[1] - POLAR_HD_FADE_M[0]))
    if (centre) onView({ lat: centre.lat, lon: centre.lon, heightM, side: moonSide(centre.lat, centre.lon) })
    scene.requestRender()
  }
  function scheduleViewUpdate() {
    if (!viewFrame) viewFrame = requestAnimationFrame(viewUpdate)
  }
  camera.percentageChanged = 0.02
  camera.changed.addEventListener(scheduleViewUpdate)
  camera.moveEnd.addEventListener(scheduleViewUpdate)
  camera.moveEnd.addEventListener(() => onCamera(getCamera()))

  function getCamera() {
    const c = camera.positionCartographic
    return { lat: c.latitude * DEG, lon: c.longitude * DEG, heightM: c.height, headingDeg: camera.heading * DEG, pitchDeg: camera.pitch * DEG }
  }

  // Put the camera exactly where a shared link says (no flight).
  function setCamera(cam) {
    camera.cancelFlight()
    camera.setView({
      destination: cartesianFromLatLon(cam.lat, cam.lon, Math.min(MAX_ZOOM_M, Math.max(MIN_ZOOM_M, cam.heightM))),
      orientation: { heading: cam.headingDeg / DEG, pitch: Math.max(-90, Math.min(0, cam.pitchDeg)) / DEG, roll: 0 },
    })
    scheduleViewUpdate()
    scene.requestRender()
  }

  // --- pointer: hover names, click to pin or select a site, double-click a feature to fly there ---
  const handler = new ScreenSpaceEventHandler(scene.canvas)
  let pointerType = "mouse"
  let dragging = false
  let tappedSiteId = null
  let hoverPos = null
  let hoverFrame = 0
  const onPointerDown = (e) => {
    pointerType = e.pointerType
    dragging = true
  }
  const onPointerUp = () => {
    dragging = false
  }
  container.addEventListener("pointerdown", onPointerDown, true)
  window.addEventListener("pointerup", onPointerUp, true)

  function describe(id) {
    if (!id) return null
    if (id.kind === "site") {
      const s = id.site
      return {
        kind: "site",
        title: s.name,
        detail: [id.group.label, statusText(s), s.mission_date].filter(Boolean).join(" · "),
        note: s.verified ? null : "unverified",
      }
    }
    if (id.kind === "feature") {
      const f = id.feature
      return { kind: "feature", title: f.name, detail: `${f.type === "crater" ? "crater" : f.type}, ${Math.round(f.diameter_km)} km across` }
    }
    if (id.kind === "earth") return { kind: "earth", title: "Earth direction", detail: "Earth as seen from the Moon's centre" }
    if (id.kind === "subEarth") return { kind: "subEarth", title: "Sub-Earth point", detail: "Earth is straight overhead here" }
    if (id.kind === "subSolar") return { kind: "subSolar", title: "Sub-solar point", detail: "The Sun is straight overhead here" }
    return null
  }

  function hoverAt(pos) {
    const info = describe(scene.pick(pos)?.id)
    container.style.cursor = info?.kind === "site" ? "pointer" : ""
    onHover(info ? { ...info, x: pos.x, y: pos.y } : null)
  }

  handler.setInputAction((m) => {
    if (dragging || pointerType === "touch") return
    hoverPos = Cartesian2.clone(m.endPosition)
    if (!hoverFrame)
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0
        if (!widget.isDestroyed()) hoverAt(hoverPos)
      })
  }, ScreenSpaceEventType.MOUSE_MOVE)

  handler.setInputAction((c) => {
    const id = scene.pick(c.position)?.id
    if (id?.kind === "site") {
      // Touch has no hover: the first tap shows the name, a second tap on the same pin selects it.
      if (pointerType === "touch" && tappedSiteId !== id.site.id) {
        tappedSiteId = id.site.id
        onHover({ ...describe(id), x: c.position.x, y: c.position.y })
        return
      }
      tappedSiteId = null
      onHover(null)
      onSelectSite(id.site)
      return
    }
    tappedSiteId = null
    onHover(null)
    const ll = pickLatLon(camera, c.position)
    if (ll) onPick(ll.lat, ll.lon)
  }, ScreenSpaceEventType.LEFT_CLICK)

  handler.setInputAction((c) => {
    const id = scene.pick(c.position)?.id
    if (id?.kind === "feature") {
      const f = id.feature
      flyTo(f.lat, f.lon, Math.max(2.0e4, f.diameter_km * 1000 * 2.5))
    }
  }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

  // --- camera moves ---
  function flyTo(lat, lon, heightM) {
    const h = heightM ?? Math.min(camera.positionCartographic.height, SITE_FLY_HEIGHT_M)
    camera.cancelFlight()
    camera.flyTo({
      // Straight down over the point; a hair off the exact pole so the heading stays defined.
      destination: cartesianFromLatLon(Math.max(-89.95, Math.min(89.95, lat)), lon, h),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: reducedMotion ? 0 : FLY_SECONDS,
    })
    scene.requestRender()
  }

  // Keyboard (container focused): arrows rotate, + / - zoom, Enter or Space pins the screen centre.
  container.tabIndex = 0
  container.setAttribute("role", "application")
  container.setAttribute(
    "aria-label",
    "3D globe of the Moon. Arrow keys rotate, plus and minus zoom, Enter places the pin at the centre.",
  )
  // One zoom step (keyboard + / -, the on-screen buttons): in by 30% of the height, out by 40%, within limits.
  function zoomStep(dir) {
    const h = camera.positionCartographic.height
    if (dir > 0) camera.zoomIn(Math.max(0, Math.min(h * 0.3, h - MIN_ZOOM_M)))
    else camera.zoomOut(Math.max(0, Math.min(h * 0.4, MAX_ZOOM_M - h)))
    scheduleViewUpdate()
    scene.requestRender()
  }

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const h = camera.positionCartographic.height
    const angle = Math.min(0.15, Math.max(0.002, (h / R) * 0.12))
    switch (e.key) {
      case "ArrowLeft":
        camera.rotateRight(angle)
        break
      case "ArrowRight":
        camera.rotateLeft(angle)
        break
      case "ArrowUp":
        camera.rotateDown(angle)
        break
      case "ArrowDown":
        camera.rotateUp(angle)
        break
      case "+":
      case "=":
        zoomStep(1)
        break
      case "-":
      case "_":
        zoomStep(-1)
        break
      case "Enter":
      case " ": {
        if (e.target !== container) return
        const c = scene.canvas
        const ll = pickLatLon(camera, new Cartesian2(c.clientWidth / 2, c.clientHeight / 2))
        if (ll) onPick(ll.lat, ll.lon)
        break
      }
      default:
        return
    }
    e.preventDefault()
    scheduleViewUpdate()
    scene.requestRender()
  }
  container.addEventListener("keydown", onKey)

  scheduleViewUpdate()

  return {
    setTime,
    setPin,
    flyTo,
    setCamera,
    zoomIn: () => zoomStep(1),
    zoomOut: () => zoomStep(-1),
    setLabelsVisible(on) {
      labelsVisible = on
      updateLabels()
      scene.requestRender()
    },
    setGridVisible(on) {
      grid.show = gridLabels.show = on
      scene.requestRender()
    },
    setGroupVisible(groupId, on) {
      groupVisible[groupId] = on
      for (const p of pins) if (p.group.id === groupId) p.billboard.show = on
      scene.requestRender()
    },
    setPolarHdOpacity(x) {
      polarOpacity = clamp01(x)
      scheduleViewUpdate()
    },
    // Render loop only while the globe is the visible view.
    setActive(on) {
      widget.useDefaultRenderLoop = on
      if (on) scheduleViewUpdate()
    },
    // Dev aid (lspb.globe.benchmark()): spin the globe for `seconds` and count rendered frames.
    benchmark(seconds = 3) {
      return new Promise((resolve) => {
        let frames = 0
        const count = () => frames++
        scene.postRender.addEventListener(count)
        const t0 = performance.now()
        const spin = (now) => {
          camera.rotateLeft(0.004)
          scene.requestRender()
          if (now - t0 < seconds * 1000) requestAnimationFrame(spin)
          else {
            scene.postRender.removeEventListener(count)
            resolve({ fps: (frames * 1000) / (now - t0), frames, canvas: [scene.canvas.width, scene.canvas.height] })
          }
        }
        requestAnimationFrame(spin)
      })
    },
    destroy() {
      cancelAnimationFrame(pinAnim)
      cancelAnimationFrame(viewFrame)
      cancelAnimationFrame(hoverFrame)
      container.removeEventListener("keydown", onKey)
      container.removeEventListener("wheel", onWheel)
      container.removeEventListener("pointerdown", onPointerDown, true)
      window.removeEventListener("pointerup", onPointerUp, true)
      handler.destroy()
      widget.destroy()
    },
  }
}
