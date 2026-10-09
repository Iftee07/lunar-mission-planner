// Site geometry (PRD section 5.2). Plain ES module, no React.
// Vectors are Moon-centred, MOON_ME frame. Body vectors in km, heights in metres.

export const MOON_RADIUS_M = 1737400
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export function latLonToUnit(latDeg, lonDeg) {
  const lat = latDeg * D2R
  const lon = lonDeg * D2R
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
}

// Local east / north / up unit vectors at (lat, lon).
export function enuBasis(latDeg, lonDeg) {
  const lat = latDeg * D2R
  const lon = lonDeg * D2R
  return {
    up: latLonToUnit(latDeg, lonDeg),
    east: [-Math.sin(lon), Math.cos(lon), 0],
    north: [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)],
  }
}

// Observer at (lat, lon), groundM above the sphere, antenna on top.
export function makeSite(latDeg, lonDeg, groundM, antennaM, radiusM = MOON_RADIUS_M) {
  const basis = enuBasis(latDeg, lonDeg)
  const rKm = (radiusM + groundM + antennaM) / 1000
  return { ...basis, posKm: basis.up.map((c) => c * rKm) }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// { azDeg in [0,360) clockwise from local north, elDeg, distKm } of a body seen from the site.
export function azElFromSite(site, bodyKm) {
  const v = [bodyKm[0] - site.posKm[0], bodyKm[1] - site.posKm[1], bodyKm[2] - site.posKm[2]]
  const dist = Math.hypot(v[0], v[1], v[2])
  const e = dot(v, site.east)
  const n = dot(v, site.north)
  const u = dot(v, site.up)
  let az = Math.atan2(e, n) * R2D
  if (az < 0) az += 360
  return { azDeg: az, elDeg: Math.asin(u / dist) * R2D, distKm: dist }
}

// Angular radius (deg) of a sphere of radiusKm at distKm.
export function angularRadiusDeg(radiusKm, distKm) {
  return Math.asin(Math.min(1, radiusKm / distKm)) * R2D
}
