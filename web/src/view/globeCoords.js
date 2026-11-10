// Lat/lon <-> Cesium Cartesian3 on the Moon, and screen picking. Shared by view/globe.js and the tests.
// The engine's latLonToUnit (MOON_ME: x toward 0° N 0° E, z north) builds the positions, so the globe and
// the engine use one convention; test/globe.test.js checks it against Cesium's Ellipsoid.MOON.

import { Cartesian3, Ellipsoid } from "cesium"
import { MOON_RADIUS_M, latLonToUnit } from "@/engine/geometry.js"

const R2D = 180 / Math.PI

// Ellipsoid.MOON is a sphere of the IAU mean lunar radius, 1737.4 km: the LOLA reference sphere.
export const MOON = Ellipsoid.MOON

export function cartesianFromLatLon(latDeg, lonDeg, heightM = 0, result = new Cartesian3()) {
  const u = latLonToUnit(latDeg, lonDeg)
  const r = MOON_RADIUS_M + heightM
  return Cartesian3.fromElements(u[0] * r, u[1] * r, u[2] * r, result)
}

// { lat, lon (east, (-180, 180]), heightM } of a Cartesian3; null at the Moon's centre.
export function latLonFromCartesian(c) {
  const g = MOON.cartesianToCartographic(c)
  return g ? { lat: g.latitude * R2D, lon: g.longitude * R2D, heightM: g.height } : null
}

// The point of the Moon under a window position (CSS pixels), or null if the ray misses the Moon.
export function pickLatLon(camera, windowPosition) {
  const c = camera.pickEllipsoid(windowPosition, MOON)
  return c ? latLonFromCartesian(c) : null
}
