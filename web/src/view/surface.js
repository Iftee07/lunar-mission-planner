// Surface view (PRD section 8): the sky as seen from the pin, as a minimal line drawing.
// Plain ES module: three.js only, no React. Colours come from theme tokens (lib/theme.js).
//
// Frame: X = east, Y = up, -Z = north. Direction for (az, el): (sin az cos el, sin el, -cos az cos el).
// Camera at (0, antennaM, 0) above the ground at the pin. Three passes per frame:
//   1. sky:     reference grid on a sphere (radius 100) centred on the camera, plus a background-coloured
//               skirt below the skyline that hides grid lines behind the terrain
//   2. terrain: polar grid draped on the DEM (fill in background colour + polygon offset, lines on top)
//   3. overlay: skyline (heaviest line); nearer ridgelines below it (the terrain horizon limited to
//               RIDGE_RANGES_M, so they show where closer terrain rises and give the ground depth);
//               Sun and Earth discs, their paths; always visible,
//               a body below the skyline is dashed in the "blocked" colour
// Antenna model (PRD v3): the drawn skyline is the Earth/antenna-height skyline (horizonEarth). The Sun
// is placed and tested from SUN_REFERENCE_HEIGHT_M against horizonSun, so the Sun's "(blocked)" label
// can occasionally disagree slightly with the drawn skyline.
// Labels and the fixed-size reticles are DOM elements positioned over the canvas.

import * as THREE from "three"
import { Line2 } from "three/addons/lines/Line2.js"
import { LineGeometry } from "three/addons/lines/LineGeometry.js"
import { LineMaterial } from "three/addons/lines/LineMaterial.js"
import { azElFromSite, angularRadiusDeg, enuBasis, makeSite } from "@/engine/geometry.js"
import { computeHorizon, groundAt, horizonAt } from "@/engine/horizon.js"
import { SUN_REFERENCE_HEIGHT_M, SUN_SEMIDIAMETER_DEG } from "@/engine/hours.js"
import { projectUnit } from "@/engine/projection.js"
import { readTheme } from "@/lib/theme.js"

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const SKY_R = 100
const EARTH_RADIUS_KM = 6371
const PATH_SPAN_H = 156
const PATH_STEP_H = 1
const HOUR_MS = 3600000
const PITCH_MIN = -20
const PITCH_MAX = 60
const FOV_MIN = 20
const FOV_MAX = 90
const SKYLINE_WIDTH_PX = 2.5
// nearer ridgelines: horizon limited to these ranges, drawn thinner and fainter than the skyline
const RIDGE_RANGES_M = [8000, 3000]
const RIDGE_WIDTH_PX = 1.5
const RIDGE_OPACITY = [0.6, 0.4]
// Ground polar grid. Rings close to the observer spread over the lower half of the view (from a 2 m
// camera: 4 m is 27 deg below the horizon, 20 m is 6 deg, 100 m is 1 deg), so the grid reads as the
// ground under the lander; far rings follow the terrain relief. Radials start 2 m from the camera.
const RING_RADII_M = [4, 6, 9, 13, 20, 30, 45, 70, 100, 150, 250, 400, 700, 1000, 2000, 3500, 5000, 10000, 20000, 35000, 50000]
const RADIAL_STEP_DEG = 15
const MESH_RADII_M = [...new Set([2, ...RING_RADII_M, ...range(100, 5000, 100), ...range(5500, 50000, 500)])].sort((a, b) => a - b)
const MESH_AZ_STEP_DEG = 1

function range(a, b, step) {
  const out = []
  for (let v = a; v <= b + 1e-9; v += step) out.push(v)
  return out
}

export function dirFromAzEl(azDeg, elDeg, r = 1) {
  const az = azDeg * D2R
  const el = elDeg * D2R
  return new THREE.Vector3(r * Math.sin(az) * Math.cos(el), r * Math.sin(el), -r * Math.cos(az) * Math.cos(el))
}

export function azElFromDir(v) {
  const el = Math.asin(v.y / v.length()) * R2D
  let az = Math.atan2(v.x, -v.z) * R2D
  if (az < 0) az += 360
  return { azDeg: az, elDeg: el }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose()
    if (o.material) [].concat(o.material).forEach((m) => m.dispose())
  })
}

// options: { engineData } (ephemeris, grids, manifest from engine/data.js loadAll)
export function createSurface(container, { engineData }) {
  const theme = readTheme()
  const R = engineData.manifest.moon_radius_m
  const col = (c) => new THREE.Color(c)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.autoClear = false
  renderer.setClearColor(col(theme.bg), 1)
  renderer.domElement.style.display = "block"
  renderer.domElement.style.touchAction = "none"
  container.appendChild(renderer.domElement)

  const labelLayer = document.createElement("div")
  labelLayer.className = "lspb-surface-labels"
  container.appendChild(labelLayer)

  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 120000)
  const view = { yaw: 0, pitch: 2, fov: 60 }

  const skyScene = new THREE.Scene()
  const terrainScene = new THREE.Scene()
  const overlayScene = new THREE.Scene()
  const skyGroup = new THREE.Group() // follows the camera position
  const overlayGroup = new THREE.Group()
  skyScene.add(skyGroup)
  overlayScene.add(overlayGroup)

  const lineMats = [] // LineMaterials needing the viewport resolution
  const mat = {
    grid: new THREE.LineBasicMaterial({ color: col(theme.lineDim), depthTest: false }),
    gridDashed: new THREE.LineDashedMaterial({ color: col(theme.lineDim), dashSize: 1.2, gapSize: 1.2, depthTest: false }),
    skirt: new THREE.MeshBasicMaterial({ color: col(theme.bg), side: THREE.DoubleSide, depthTest: false }),
    terrainFill: new THREE.MeshBasicMaterial({
      color: col(theme.bg),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    terrainLine: new THREE.LineBasicMaterial({ color: col(theme.lineDim) }),
  }

  // ---------- labels (DOM) ----------
  const labels = []
  function addLabel(text, cls, getPos) {
    const el = document.createElement("div")
    el.className = `lspb-surface-label ${cls}`
    el.textContent = text
    labelLayer.appendChild(el)
    const l = { el, getPos }
    labels.push(l)
    return l
  }
  function removeLabel(l) {
    l.el.remove()
    labels.splice(labels.indexOf(l), 1)
  }

  // ---------- 1. sky reference grid ----------
  function circleAtEl(elDeg, material, segments = 360) {
    const pts = []
    for (let i = 0; i <= segments; i++) pts.push(dirFromAzEl((i * 360) / segments, elDeg, SKY_R))
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material)
    if (material.isLineDashedMaterial) line.computeLineDistances()
    return line
  }
  skyGroup.add(circleAtEl(0, mat.grid))
  for (let el = 10; el <= 80; el += 10) skyGroup.add(circleAtEl(el, mat.gridDashed))
  {
    const pts = []
    for (let az = 0; az < 360; az += 5) {
      const len = az % 30 === 0 ? 1.5 : 0.6
      pts.push(dirFromAzEl(az, 0, SKY_R), dirFromAzEl(az, len, SKY_R))
    }
    skyGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat.grid))
  }
  const cardinal = { 0: "N", 90: "E", 180: "S", 270: "W" }
  for (let az = 0; az < 360; az += 30) {
    const p = dirFromAzEl(az, 2.2, SKY_R)
    addLabel(cardinal[az] ?? `${az}`, cardinal[az] ? "lspb-surface-label-cardinal" : "", () => p.clone().add(camera.position))
  }
  for (let el = 10; el <= 60; el += 10) {
    const p = dirFromAzEl(0, el, SKY_R)
    addLabel(`${el}°`, "lspb-surface-label-dim", () => p.clone().add(camera.position))
  }
  skyGroup.children.forEach((c) => (c.renderOrder = 0))

  // ---------- site-dependent objects ----------
  let site = null // { pin, antennaM, horizon (Earth skyline), horizonSun, geom (antenna), sunGeom (2 m) }
  let skylineObj = null
  let ridgeObjs = []
  let skirtObj = null
  let terrainObj = null

  // Fat polyline along a 720-sample horizon profile, in the overlay (always visible).
  function horizonLine(horizon, widthPx, opacity, renderOrder) {
    const n = horizon.length
    const pos = []
    for (let i = 0; i <= n; i++) {
      const p = dirFromAzEl((i % n) * (360 / n), horizon[i % n], SKY_R)
      pos.push(p.x, p.y, p.z)
    }
    const g = new LineGeometry()
    g.setPositions(pos)
    const m = new LineMaterial({ color: col(theme.line), linewidth: widthPx, depthTest: false, transparent: opacity < 1, opacity })
    m.resolution.set(container.clientWidth || 1, container.clientHeight || 1)
    lineMats.push(m)
    const line = new Line2(g, m)
    line.computeLineDistances()
    line.renderOrder = renderOrder
    overlayGroup.add(line)
    return line
  }

  function removeLine(line) {
    overlayGroup.remove(line)
    lineMats.splice(lineMats.indexOf(line.material), 1)
    disposeTree(line)
  }

  function buildSkyline(horizon, pin, antennaM) {
    if (skylineObj) removeLine(skylineObj)
    ridgeObjs.forEach(removeLine)
    if (skirtObj) {
      skyGroup.remove(skirtObj)
      disposeTree(skirtObj)
    }
    const n = horizon.length
    const step = 360 / n
    skylineObj = horizonLine(horizon, SKYLINE_WIDTH_PX, 1, 2)
    // Nearer ridgelines: same observer, terrain limited to each range (a few ms each on the main thread).
    // A subset of the terrain can never rise above the full horizon; clamp only against float noise.
    ridgeObjs = RIDGE_RANGES_M.map((rangeM, k) => {
      const ridge = computeHorizon({ x: pin.x, y: pin.y }, pin.groundM, antennaM, engineData.grids, rangeM)
      for (let i = 0; i < n; i++) ridge[i] = Math.min(ridge[i], horizon[i])
      return horizonLine(ridge, RIDGE_WIDTH_PX, RIDGE_OPACITY[k], 1)
    })

    // skirt: from the skyline down to the nadir, background colour, hides sky grid below the skyline
    const sv = []
    for (let i = 0; i <= n; i++) {
      const az = (i % n) * step
      const top = dirFromAzEl(az, horizon[i % n], SKY_R * 0.99)
      const bot = dirFromAzEl(az, -89.9, SKY_R * 0.99)
      sv.push(top.x, top.y, top.z, bot.x, bot.y, bot.z)
    }
    const idx = []
    for (let i = 0; i < n; i++) {
      const a = 2 * i
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3))
    sg.setIndex(idx)
    skirtObj = new THREE.Mesh(sg, mat.skirt)
    skirtObj.renderOrder = 1
    skyGroup.add(skirtObj)
  }

  // Terrain height (m) relative to the ground at the pin, curvature-lowered, at ground distance d, azimuth az.
  function terrainSampler(pin) {
    const { up, east, north } = enuBasis(pin.lat, pin.lon)
    return (d, azDeg) => {
      const th = d / R
      const az = azDeg * D2R
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const ca = Math.cos(az)
      const sa = Math.sin(az)
      const p = projectUnit(
        ct * up[0] + st * (ca * north[0] + sa * east[0]),
        ct * up[1] + st * (ca * north[1] + sa * east[1]),
        ct * up[2] + st * (ca * north[2] + sa * east[2]),
        R,
      )
      const z = groundAt(engineData.grids, p.x, p.y)
      return (Number.isFinite(z) ? z - pin.groundM : 0) - (d * d) / (2 * R)
    }
  }

  function buildTerrain(pin) {
    if (terrainObj) {
      terrainScene.remove(terrainObj)
      disposeTree(terrainObj)
    }
    const h = terrainSampler(pin)
    const nAz = 360 / MESH_AZ_STEP_DEG
    const nR = MESH_RADII_M.length
    const v = [0, 0, 0] // centre vertex at the ground under the observer
    const heights = new Float32Array(nR * nAz)
    for (let j = 0; j < nR; j++) {
      const d = MESH_RADII_M[j]
      for (let i = 0; i < nAz; i++) {
        const az = i * MESH_AZ_STEP_DEG
        const y = h(d, az)
        heights[j * nAz + i] = y
        v.push(d * Math.sin(az * D2R), y, -d * Math.cos(az * D2R))
      }
    }
    const vid = (j, i) => 1 + j * nAz + (i % nAz)
    const idx = []
    for (let i = 0; i < nAz; i++) idx.push(0, vid(0, i), vid(0, i + 1))
    for (let j = 0; j < nR - 1; j++) {
      for (let i = 0; i < nAz; i++) {
        idx.push(vid(j, i), vid(j + 1, i), vid(j, i + 1), vid(j, i + 1), vid(j + 1, i), vid(j + 1, i + 1))
      }
    }
    const fg = new THREE.BufferGeometry()
    fg.setAttribute("position", new THREE.Float32BufferAttribute(v, 3))
    fg.setIndex(idx)
    const group = new THREE.Group()
    group.add(new THREE.Mesh(fg, mat.terrainFill))

    // lines: rings (every MESH_AZ_STEP) and radials (every RADIAL_STEP, along all mesh radii)
    const seg = []
    const at = (j, i) => {
      const k = 3 * vid(j, i)
      return [v[k], v[k + 1], v[k + 2]]
    }
    for (const rr of RING_RADII_M) {
      const j = MESH_RADII_M.indexOf(rr)
      for (let i = 0; i < nAz; i++) seg.push(...at(j, i), ...at(j, i + 1))
    }
    for (let a = 0; a < 360; a += RADIAL_STEP_DEG) {
      const i = a / MESH_AZ_STEP_DEG
      for (let j = 0; j < nR - 1; j++) seg.push(...at(j, i), ...at(j + 1, i))
    }
    const lg = new THREE.BufferGeometry()
    lg.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3))
    group.add(new THREE.LineSegments(lg, mat.terrainLine))
    terrainObj = group
    terrainScene.add(group)
  }

  // ---------- bodies and paths ----------
  function makeBody(colorToken, name) {
    const g = new THREE.Group()
    const solid = new THREE.LineBasicMaterial({ color: col(theme[colorToken]), depthTest: false })
    const dashed = new THREE.LineDashedMaterial({ color: col(theme.blocked), dashSize: 0.05, gapSize: 0.05, depthTest: false })
    const pts = []
    for (let i = 0; i <= 64; i++) pts.push(new THREE.Vector3(Math.cos((i / 64) * 2 * Math.PI), Math.sin((i / 64) * 2 * Math.PI), 0))
    const disc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), solid)
    disc.computeLineDistances()
    g.add(disc)
    g.renderOrder = 3
    g.visible = false
    overlayGroup.add(g)
    const pathMat = new THREE.LineBasicMaterial({ color: col(theme[colorToken]), transparent: true, opacity: 0.45, depthTest: false })
    const path = new THREE.Line(new THREE.BufferGeometry(), pathMat)
    path.renderOrder = 2
    path.visible = false
    overlayGroup.add(path)

    const reticle = document.createElement("div")
    reticle.className = `lspb-reticle lspb-reticle-${name}`
    labelLayer.appendChild(reticle)
    const label = addLabel("", `lspb-surface-label-${name}`, () => g.position.clone().add(camera.position))
    return { name, g, disc, solid, dashed, path, reticle, label, azEl: null, blocked: false }
  }
  const sun = makeBody("sun", "sun")
  const earth = makeBody("earth", "earth")

  function placeBody(b, azEl, angRadiusDeg, blocked, text) {
    b.azEl = azEl
    b.blocked = blocked
    const dir = dirFromAzEl(azEl.azDeg, azEl.elDeg, SKY_R)
    b.g.position.copy(dir)
    b.g.lookAt(0, 0, 0)
    const r = SKY_R * Math.tan(angRadiusDeg * D2R)
    b.g.scale.set(r, r, r)
    b.disc.material = blocked ? b.dashed : b.solid
    b.dashed.dashSize = b.dashed.gapSize = 0.12
    b.g.visible = true
    b.label.el.textContent = text
    b.label.el.classList.toggle("lspb-surface-label-blocked", blocked)
    b.reticle.classList.toggle("lspb-reticle-blocked", blocked)
  }

  function setPath(b, pts) {
    b.path.geometry.dispose()
    b.path.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    b.path.visible = pts.length > 1
  }

  function hideBodies() {
    for (const b of [sun, earth]) {
      b.g.visible = false
      b.path.visible = false
      b.azEl = null
      b.label.el.textContent = ""
    }
  }

  // ---------- public: update from app state ----------
  // state: { pin, antennaM, timeMs, sunMode }, results: { horizonSun, horizonEarth }
  function update(state, results) {
    const { pin, antennaM, timeMs, sunMode } = state
    const horizon = results?.horizonEarth
    const horizonSun = results?.horizonSun
    if (!pin || !horizon || !horizonSun) {
      hideBodies()
      return
    }
    const pinChanged = !site || site.pin !== pin
    if (pinChanged || site.horizon !== horizon || site.antennaM !== antennaM) {
      buildSkyline(horizon, pin, antennaM)
      if (pinChanged) buildTerrain(pin)
      site = {
        pin,
        antennaM,
        horizon,
        geom: makeSite(pin.lat, pin.lon, pin.groundM, antennaM),
        sunGeom: makeSite(pin.lat, pin.lon, pin.groundM, SUN_REFERENCE_HEIGHT_M),
      }
      camera.position.set(0, antennaM, 0)
    }
    const eph = engineData.ephemeris
    const sv = eph.vectorAt("sun", timeMs)
    const ev = eph.vectorAt("earth", timeMs)
    if (!sv || !ev) {
      hideBodies()
      return
    }
    site.horizonSun = horizonSun
    const s = azElFromSite(site.sunGeom, sv)
    const e = azElFromSite(site.geom, ev)
    const extra = sunMode === "any_part" ? SUN_SEMIDIAMETER_DEG : 0
    const sBlocked = !(s.elDeg + extra > horizonAt(horizonSun, s.azDeg))
    const eBlocked = !(e.elDeg > horizonAt(horizon, e.azDeg))
    const fmt = (b, x, blocked) =>
      `${b} el ${x.elDeg >= 0 ? "+" : ""}${x.elDeg.toFixed(1)} az ${x.azDeg.toFixed(0).padStart(3, "0")}${blocked ? " (blocked)" : ""}`
    placeBody(sun, s, SUN_SEMIDIAMETER_DEG, sBlocked, fmt("SUN", s, sBlocked))
    placeBody(earth, e, angularRadiusDeg(EARTH_RADIUS_KM, e.distKm), eBlocked, fmt("EARTH", e, eBlocked))

    // paths over the next PATH_SPAN_H, every PATH_STEP_H
    const ps = []
    const pe = []
    for (let h = 0; h <= PATH_SPAN_H; h += PATH_STEP_H) {
      const t = timeMs + h * HOUR_MS
      const a = eph.vectorAt("sun", t)
      const b = eph.vectorAt("earth", t)
      if (!a || !b) break
      const x = azElFromSite(site.sunGeom, a)
      const y = azElFromSite(site.geom, b)
      ps.push(dirFromAzEl(x.azDeg, x.elDeg, SKY_R))
      pe.push(dirFromAzEl(y.azDeg, y.elDeg, SKY_R))
    }
    setPath(sun, ps)
    setPath(earth, pe)

    if (pinChanged) {
      // initial view: toward the Sun if it is above the skyline, else north
      view.yaw = sBlocked ? 0 : s.azDeg
      view.pitch = sBlocked ? 2 : Math.min(PITCH_MAX, Math.max(PITCH_MIN, s.elDeg))
    }
  }

  // ---------- camera control ----------
  let drag = null
  const el = renderer.domElement
  const onDown = (e) => {
    drag = { x: e.clientX, y: e.clientY }
    el.setPointerCapture(e.pointerId)
  }
  const onMove = (e) => {
    if (!drag) return
    const degPerPx = view.fov / (el.clientHeight || 1)
    view.yaw = (((view.yaw - (e.clientX - drag.x) * degPerPx) % 360) + 360) % 360
    view.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, view.pitch + (e.clientY - drag.y) * degPerPx))
    drag = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e) => {
    drag = null
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  }
  const onWheel = (e) => {
    e.preventDefault()
    view.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, view.fov * Math.exp(e.deltaY * 0.001)))
  }
  // Keyboard: arrows look around, + / - zoom (the canvas is focusable).
  el.tabIndex = 0
  el.setAttribute("role", "application")
  el.setAttribute("aria-label", "Surface view from the pin. Arrow keys look around, plus and minus zoom.")
  const onKey = (e) => {
    const k = e.key
    if (k === "ArrowLeft") view.yaw = (view.yaw + 355) % 360
    else if (k === "ArrowRight") view.yaw = (view.yaw + 5) % 360
    else if (k === "ArrowUp") view.pitch = Math.min(PITCH_MAX, view.pitch + 3)
    else if (k === "ArrowDown") view.pitch = Math.max(PITCH_MIN, view.pitch - 3)
    else if (k === "+" || k === "=") view.fov = Math.max(FOV_MIN, view.fov / 1.15)
    else if (k === "-" || k === "_") view.fov = Math.min(FOV_MAX, view.fov * 1.15)
    else return
    e.preventDefault()
  }
  el.addEventListener("keydown", onKey)
  el.addEventListener("pointerdown", onDown)
  el.addEventListener("pointermove", onMove)
  el.addEventListener("pointerup", onUp)
  el.addEventListener("pointercancel", onUp)
  el.addEventListener("wheel", onWheel, { passive: false })

  // ---------- size ----------
  function resize() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = `${w}px`
    renderer.domElement.style.height = `${h}px`
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    for (const m of lineMats) m.resolution.set(w, h)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  // ---------- frame ----------
  const tmp = new THREE.Vector3()
  function placeDom(node, worldPos, w, h) {
    tmp.copy(worldPos).project(camera)
    const inFront = tmp.z < 1 && tmp.z > -1
    if (!inFront || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) {
      node.style.display = "none"
      return
    }
    node.style.display = ""
    node.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`
  }

  let frames = 0
  let fpsT0 = performance.now()
  let fps = 0
  function render() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return
    if (camera.fov !== view.fov) {
      camera.fov = view.fov
      camera.updateProjectionMatrix()
    }
    skyGroup.position.copy(camera.position)
    overlayGroup.position.copy(camera.position)
    camera.lookAt(tmp.copy(dirFromAzEl(view.yaw, view.pitch)).add(camera.position))

    renderer.clear()
    renderer.render(skyScene, camera)
    renderer.clearDepth()
    renderer.render(terrainScene, camera)
    renderer.clearDepth()
    renderer.render(overlayScene, camera)

    for (const l of labels) {
      if (!l.el.textContent) {
        l.el.style.display = "none"
        continue
      }
      placeDom(l.el, l.getPos(), w, h)
    }
    for (const b of [sun, earth]) {
      if (b.g.visible) placeDom(b.reticle, b.g.position.clone().add(camera.position), w, h)
      else b.reticle.style.display = "none"
    }
    frames++
    const now = performance.now()
    if (now - fpsT0 >= 1000) {
      fps = (frames * 1000) / (now - fpsT0)
      frames = 0
      fpsT0 = now
    }
  }

  let raf = 0
  function loop() {
    render()
    raf = requestAnimationFrame(loop)
  }
  function start() {
    if (raf) return
    resize()
    frames = 0
    fpsT0 = performance.now()
    raf = requestAnimationFrame(loop)
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  }

  // Debug (validation 1, 2): skyline vertices vs horizon profile at 8 azimuths, and body directions.
  function debugCheck() {
    const rows = []
    if (site && skylineObj) {
      const pos = skylineObj.geometry.attributes.instanceStart.data.array
      for (let az = 0; az < 360; az += 45) {
        const i = Math.round(az / (360 / site.horizon.length))
        const p = new THREE.Vector3(pos[i * 6], pos[i * 6 + 1], pos[i * 6 + 2])
        const drawn = azElFromDir(p)
        rows.push({
          item: `skyline az ${az}`,
          horizonDeg: +site.horizon[i].toFixed(4),
          drawnElDeg: +drawn.elDeg.toFixed(4),
          drawnAzDeg: +drawn.azDeg.toFixed(4),
          diffDeg: +Math.abs(drawn.elDeg - site.horizon[i]).toFixed(5),
        })
      }
    }
    for (const b of [sun, earth]) {
      if (!b.azEl) continue
      const drawn = azElFromDir(b.g.position)
      rows.push({
        item: `${b.name} centre`,
        horizonDeg: +horizonAt(b === sun ? site.horizonSun : site.horizon, b.azEl.azDeg).toFixed(4),
        drawnElDeg: +drawn.elDeg.toFixed(4),
        drawnAzDeg: +drawn.azDeg.toFixed(4),
        cardElDeg: +b.azEl.elDeg.toFixed(4),
        cardAzDeg: +b.azEl.azDeg.toFixed(4),
        blocked: b.blocked,
      })
    }
    return rows
  }

  function destroy() {
    stop()
    ro.disconnect()
    el.removeEventListener("keydown", onKey)
    el.removeEventListener("pointerdown", onDown)
    el.removeEventListener("pointermove", onMove)
    el.removeEventListener("pointerup", onUp)
    el.removeEventListener("pointercancel", onUp)
    el.removeEventListener("wheel", onWheel)
    for (const s of [skyScene, terrainScene, overlayScene]) disposeTree(s)
    Object.values(mat).forEach((m) => m.dispose())
    renderer.dispose()
    renderer.forceContextLoss()
    renderer.domElement.remove()
    labelLayer.remove()
    while (labels.length) removeLabel(labels[0])
  }

  return {
    update,
    start,
    stop,
    destroy,
    debugCheck,
    getView: () => ({ ...view, cameraY: camera.position.y, running: raf !== 0, fps }),
  }
}
