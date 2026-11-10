// Lat/lon <-> Cesium Cartesian3 on the Moon, screen picking, and the Moon Trek tile grid. Shared by
// view/globe.js and the tests.
// The engine's latLonToUnit (MOON_ME: x toward 0° N 0° E, z north) builds the positions, so the globe and
// the engine use one convention; test/globe.test.js checks it against Cesium's Ellipsoid.MOON.

import { Cartesian3, Credit, Ellipsoid, GeographicTilingScheme } from "cesium"
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

// NASA Moon Trek WMTS (LRO WAC global mosaic), values copied from the service's capabilities document
// (fetched 2026-11-11): https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml
// TileMatrixSet default028mm: TopLeftCorner 180 W 90 N, level 0 = 2 x 1 tiles of 256 px, levels 0..8
// (level 8: 512 x 256 tiles, ~83 m per pixel at the equator). That is Cesium's GeographicTilingScheme;
// without it Cesium assumes Web Mercator and the mosaic lands in the wrong place.
export const MOON_TREK = {
  capabilitiesUrl: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml",
  url: "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0//{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg",
  layer: "LRO_WAC_Mosaic_Global_303ppd_v02",
  style: "default",
  tileMatrixSetID: "default028mm",
  format: "image/jpeg",
  maximumLevel: 8,
  credit: "Imagery: NASA Moon Trek, LRO WAC global mosaic (NASA/GSFC/Arizona State University)",
}

// Options for Cesium's WebMapTileServiceImageryProvider. inlineCredit: show the credit on the globe (true) or
// in Cesium's "Data attribution" panel.
export function moonTrekOptions(inlineCredit = true) {
  const { capabilitiesUrl: _, credit, ...wmts } = MOON_TREK
  return { ...wmts, tilingScheme: new GeographicTilingScheme({ ellipsoid: MOON }), credit: new Credit(credit, inlineCredit) }
}
