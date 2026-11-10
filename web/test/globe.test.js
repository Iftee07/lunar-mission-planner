// The 3D globe: frame convention, picking, Sun lighting, imagery fallback, label level of detail, mission pins.
import fs from "node:fs"
import path from "node:path"
import {
  Camera,
  Cartesian2,
  Cartesian3,
  GeographicProjection,
  HeadingPitchRange,
  MapMode2D,
  SceneMode,
  TweenCollection,
} from "cesium"
import { describe, expect, test } from "vitest"
import { MOON_RADIUS_M, azElFromSite, makeSite } from "../src/engine/geometry.js"
import { MOON, MOON_TREK, cartesianFromLatLon, latLonFromCartesian, moonTrekOptions, pickLatLon } from "../src/view/globeCoords.js"
import {
  LABEL_BUDGET,
  LABEL_MAX_HEIGHT_M,
  SITE_GROUPS,
  createImageryFallback,
  facesCamera,
  labelBudgetFor,
  labelMaxHeight,
  moonSide,
  selectLabels,
  sitePins,
  subPoint,
  sunLightDirection,
  watchTileErrors,
} from "../src/view/globeModel.js"
import { DATA_DIR, hasRealData, loadRealData } from "./load.js"

const R = MOON_RADIUS_M
const D2R = Math.PI / 180

// Angular distance in degrees between two lat/lon points (robust at the poles and across 180° E).
function angleDeg(a, b) {
  const ua = cartesianFromLatLon(a.lat, a.lon)
  const ub = cartesianFromLatLon(b.lat, b.lon)
  return Cartesian3.angleBetween(ua, ub) / D2R
}

// A real Cesium camera on a minimal stand-in scene (800 x 600 canvas, 3D mode, Moon ellipsoid).
function makeCamera() {
  const scene = {
    canvas: { clientWidth: 800, clientHeight: 600 },
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    pixelRatio: 1,
    mode: SceneMode.SCENE3D,
    mapMode2D: MapMode2D.INFINITE_SCROLL,
    mapProjection: new GeographicProjection(MOON),
    ellipsoid: MOON,
    tweens: new TweenCollection(),
    screenSpaceCameraController: { minimumZoomDistance: 1, maximumZoomDistance: Infinity, enableCollisionDetection: true },
  }
  const camera = new Camera(scene)
  camera.frustum.aspectRatio = 800 / 600
  return camera
}

describe("globe frame and picking", () => {
  test("the engine's lat/lon -> Cartesian matches Cesium's Moon ellipsoid (same frame, same radius)", () => {
    for (const [lat, lon, h] of [[0, 0, 0], [0.674, 23.473, 0], [-89.9, 222.9, 1500], [45, -120, -2000], [89.5, 180, 0]]) {
      const ours = cartesianFromLatLon(lat, lon, h)
      const cesium = Cartesian3.fromDegrees(lon, lat, h, MOON)
      expect(Cartesian3.distance(ours, cesium)).toBeLessThan(1e-6 * R)
    }
    expect(MOON.radii.x).toBe(R)
    expect(MOON.radii.z).toBe(R)
  })

  test("lat/lon -> Cartesian -> pick -> lat/lon round trip within 0.05°", () => {
    const camera = makeCamera()
    const centre = new Cartesian2(400, 300)
    const cases = [
      [0.674, 23.473], [0, 0], [0, 180], [0, -179.99], [-45.457, 177.589], [26.132, 3.633],
      [-89.9, 0], [-89.99, 222.9], [89.9, 45], [89.45, 137.3], [-84.79, 29.2], [60, -120],
    ]
    let worst = 0
    for (const [lat, lon] of cases) {
      for (const [headingDeg, pitchDeg, rangeM] of [[0, -90, 3.0e6], [40, -35, 4.0e5], [200, -60, 5.0e4]]) {
        camera.lookAt(cartesianFromLatLon(lat, lon), new HeadingPitchRange(headingDeg * D2R, pitchDeg * D2R, rangeM))
        const got = pickLatLon(camera, centre)
        expect(got).not.toBeNull()
        worst = Math.max(worst, angleDeg({ lat, lon }, got))
      }
    }
    expect(worst).toBeLessThan(0.05)
  })

  test("Moon Trek tiles use the capabilities' geographic grid (2 x 1 at level 0, top-left 180 W 90 N)", () => {
    const opts = moonTrekOptions()
    const ts = opts.tilingScheme
    expect([ts.getNumberOfXTilesAtLevel(0), ts.getNumberOfYTilesAtLevel(0)]).toEqual([2, 1])
    expect([ts.getNumberOfXTilesAtLevel(8), ts.getNumberOfYTilesAtLevel(8)]).toEqual([512, 256]) // MatrixWidth/Height of level 8
    const r = ts.tileXYToRectangle(0, 0, 0)
    expect([r.west / D2R, r.north / D2R, r.east / D2R, r.south / D2R]).toEqual([-180, 90, 0, -90])
    // Mare Crisium (IAU centre 17.0 N, 59.1 E) is in level-3 tile row 3, column 10, as served by Moon Trek.
    expect(ts.positionToTileXY({ longitude: 59.1 * D2R, latitude: 17.0 * D2R, height: 0 }, 3)).toMatchObject({ x: 10, y: 3 })
    expect(opts.maximumLevel).toBe(8)
    expect(opts.url).toContain(MOON_TREK.layer)
    expect(opts.url).toMatch(/\{TileMatrix\}\/\{TileRow\}\/\{TileCol\}/)
  })

  test("a ray that misses the Moon picks nothing", () => {
    const camera = makeCamera()
    camera.lookAt(cartesianFromLatLon(0, 0), new HeadingPitchRange(0, -5 * D2R, 2.0e6)) // grazing view
    expect(pickLatLon(camera, new Cartesian2(400, 2))).toBeNull() // top of the screen: space
  })
})

describe("Sun lighting on the globe", () => {
  test.skipIf(!hasRealData())("sub-solar point from the light direction matches the ephemeris at 3 times (< 0.1°)", () => {
    const { ephemeris } = loadRealData()
    for (const iso of ["2026-03-20T12:00:00Z", "2030-07-04T03:30:00Z", "2035-11-15T21:15:00Z"]) {
      const sun = ephemeris.vectorAt("sun", Date.parse(iso))
      const d = sunLightDirection(sun)
      // What Cesium lights: the surface point facing the light, i.e. against the light's travel direction.
      const lit = latLonFromCartesian(new Cartesian3(-d[0] * R, -d[1] * R, -d[2] * R))
      const expected = subPoint(sun)
      expect(angleDeg(lit, expected)).toBeLessThan(0.1)
      // Independent check through the engine's local-horizon geometry: the Sun is overhead there.
      const { elDeg } = azElFromSite(makeSite(lit.lat, lit.lon, 0, 0), sun)
      expect(elDeg).toBeGreaterThan(89.9)
    }
  })

  test("near side / far side / limb", () => {
    expect(moonSide(0.674, 23.473)).toBe("near")
    expect(moonSide(-45.457, 177.589)).toBe("far")
    expect(moonSide(0, -100)).toBe("far")
    expect(moonSide(-89.67, 129.78)).toBe("limb") // Shackleton: the south pole is on the limb seen from Earth
    expect(moonSide(0, 85)).toBe("limb")
    expect(moonSide(0, 80)).toBe("near")
  })
})

describe("imagery fallback", () => {
  // Stand-in for Cesium's provider.errorEvent (an Event with addEventListener / raiseEvent).
  function mockProvider() {
    const listeners = []
    return {
      errorEvent: {
        addEventListener(fn) {
          listeners.push(fn)
          return () => listeners.splice(listeners.indexOf(fn), 1)
        },
      },
      fail(timesRetried) {
        const err = { timesRetried, retry: false }
        for (const fn of listeners) fn(err)
        return err
      },
    }
  }

  test("activates when the tile provider errors (mock)", () => {
    const states = []
    const fallback = createImageryFallback({ maxFailures: 3, onChange: (s) => states.push(s) })
    const provider = mockProvider()
    watchTileErrors(provider, fallback)
    expect(fallback.state).toBe("online")
    expect(provider.fail(0).retry).toBe(true) // first attempt: retried, not counted
    expect(fallback.state).toBe("online")
    expect(provider.fail(1).retry).toBe(false)
    expect(fallback.state).toBe("partial") // offline texture now under the tiles
    provider.fail(1)
    provider.fail(1)
    expect(fallback.state).toBe("offline")
    expect(states).toEqual(["partial", "offline"])
    expect(provider.fail(0).retry).toBe(false) // no more retries once offline
  })

  test("a successful tile resets the failure count; ?offline=1 starts offline", () => {
    const fallback = createImageryFallback({ maxFailures: 2 })
    fallback.tileError({ timesRetried: 1 })
    fallback.tileOk()
    fallback.tileError({ timesRetried: 1 })
    expect(fallback.state).toBe("partial")
    const states = []
    const off = createImageryFallback({ offline: true, onChange: (s) => states.push(s) })
    expect(off.state).toBe("offline")
    expect(states).toEqual(["offline"])
  })
})

describe("crater labels: level of detail", () => {
  test("height limits never increase with rank (bigger features stay visible longer)", () => {
    for (let r = 1; r < LABEL_MAX_HEIGHT_M.length; r++) {
      expect(LABEL_MAX_HEIGHT_M[r]).toBeLessThanOrEqual(LABEL_MAX_HEIGHT_M[r - 1])
    }
    expect(labelMaxHeight(1)).toBe(Infinity)
    expect(labelBudgetFor(1034, 685)).toBe(LABEL_BUDGET) // desktop
    expect(labelBudgetFor(360, 460)).toBe(19) // phone
    expect(labelBudgetFor(2560, 1400)).toBe(LABEL_BUDGET) // never above the cap
    expect(labelMaxHeight(99)).toBe(LABEL_MAX_HEIGHT_M.at(-1))
  })

  const featuresFile = path.join(DATA_DIR, "craters_global.json")
  test.skipIf(!fs.existsSync(featuresFile))("never hides a bigger feature in view while a smaller one shows; at most 150", () => {
    const features = JSON.parse(fs.readFileSync(featuresFile, "utf8"))
    const items = features.map((f) => ({ ...f, position: toArray(cartesianFromLatLon(f.lat, f.lon)) }))
    for (let i = 1; i < items.length; i++) expect(items[i].diameter_km).toBeLessThanOrEqual(items[i - 1].diameter_km)
    let s = 7
    const rand = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32)
    let maxShown = 0
    for (let k = 0; k < 60; k++) {
      const lat = Math.asin(2 * rand() - 1) / D2R
      const lon = 360 * rand() - 180
      const heightM = 10 ** (4 + 3.3 * rand()) // 10 km to 20,000 km
      const cameraPos = toArray(cartesianFromLatLon(lat, lon, heightM))
      const show = selectLabels(items, { cameraPos, heightM })
      const shown = items.filter((_, i) => show[i])
      maxShown = Math.max(maxShown, shown.length)
      expect(shown.length).toBeLessThanOrEqual(LABEL_BUDGET)
      if (!shown.length) continue
      const smallestShown = Math.min(...shown.map((it) => it.diameter_km))
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (show[i] || !facesCamera(it.position, cameraPos)) continue
        expect(it.diameter_km).toBeLessThanOrEqual(smallestShown) // hidden in view => not bigger than any shown
      }
    }
    expect(maxShown).toBeGreaterThan(20) // the test actually exercised the selection
  })
})

describe("mission pins", () => {
  const sitesFile = path.join(DATA_DIR, "sites.json")
  test.skipIf(!fs.existsSync(sitesFile))("every mission pin has a group and a source; ids unique, lat/lon in range", () => {
    const sites = JSON.parse(fs.readFileSync(sitesFile, "utf8"))
    const pins = sitePins(sites)
    expect(pins.length).toBeGreaterThan(20)
    const groupIds = new Set(SITE_GROUPS.map((g) => g.id))
    for (const { site, group } of pins) {
      expect(groupIds.has(group.id)).toBe(true)
      expect(group.token).toMatch(/^group-/)
      expect(site.source_url).toMatch(/^https:\/\//)
      expect(site.source_note.length).toBeGreaterThan(20)
      expect(typeof site.verified).toBe("boolean")
      expect(Math.abs(site.lat)).toBeLessThanOrEqual(90)
      expect(site.lon).toBeGreaterThan(-180)
      expect(site.lon).toBeLessThanOrEqual(180)
    }
    expect(new Set(sites.map((s) => s.id)).size).toBe(sites.length)
    expect(pins.find((p) => p.site.id === "apollo11").group.id).toBe("Apollo")
  })

  test("a site without a source or with an unknown group is rejected", () => {
    const ok = { id: "x", group: "Apollo", source_url: "https://example.org/a", source_note: "quoted coordinates" }
    expect(() => sitePins([ok])).not.toThrow()
    expect(() => sitePins([{ ...ok, source_url: "" }])).toThrow(/no source/)
    expect(() => sitePins([{ ...ok, group: "Mars" }])).toThrow(/unknown group/)
  })
})

function toArray(c) {
  return [c.x, c.y, c.z]
}
