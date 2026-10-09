// Named-crater geometry for the map layer (PRD v3 Phase 9b). Plain ES module, no Leaflet.
// Craters: { name, lat, lon (deg east), diameter_km } from the IAU gazetteer (pipeline/09_build_features.py).

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

// Great-circle angular distance (deg) between two points.
export function angularDistanceDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R
  const p2 = lat2 * D2R
  const dp = p2 - p1
  const dl = (lon2 - lon1) * D2R
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * R2D
}

// Angular radius (deg) of a crater of diameterKm on a sphere of radiusKm.
export const craterRadiusDeg = (diameterKm, radiusKm) => (diameterKm / 2 / radiusKm) * R2D

// n points on the rim: the small circle at the crater's angular radius around its centre.
// Projected with the map's stereographic projection these trace the true rim outline.
export function rimPoints(crater, radiusKm, n = 72) {
  const d = craterRadiusDeg(crater.diameter_km, radiusKm) * D2R
  const lat1 = crater.lat * D2R
  const lon1 = crater.lon * D2R
  const pts = []
  for (let i = 0; i < n; i++) {
    const b = (i / n) * 2 * Math.PI
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
    pts.push({ lat: lat2 * R2D, lon: lon2 * R2D })
  }
  return pts
}

// Clip a closed ring of projected points [{x, y}] to the disc |p| <= rMax (the map edge).
// Returns the inside parts as open polylines, each ending exactly on the edge where the ring crosses it;
// [] if the ring lies fully outside, one closed ring (first point repeated) if fully inside.
export function clipRingToDisc(ring, rMax) {
  const n = ring.length
  const inside = ring.map((p) => Math.hypot(p.x, p.y) <= rMax)
  if (inside.every(Boolean)) return [[...ring, ring[0]]]
  // point where segment a -> b crosses the circle: solve |a + t (b - a)| = rMax for t in [0, 1]
  const cross = (a, b) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const A = dx * dx + dy * dy
    const B = 2 * (a.x * dx + a.y * dy)
    const C = a.x * a.x + a.y * a.y - rMax * rMax
    const disc = Math.sqrt(Math.max(0, B * B - 4 * A * C))
    const t1 = (-B - disc) / (2 * A)
    const t = t1 >= 0 && t1 <= 1 ? t1 : (-B + disc) / (2 * A)
    return { x: a.x + t * dx, y: a.y + t * dy }
  }
  // start the walk at an outside point so every inside run is entered and left once
  const s = inside.indexOf(false)
  const parts = []
  let cur = null
  for (let k = 1; k <= n; k++) {
    const i = (s + k) % n
    const prev = (s + k - 1) % n
    if (inside[i] && !inside[prev]) cur = [cross(ring[prev], ring[i]), ring[i]]
    else if (inside[i]) cur.push(ring[i])
    else if (inside[prev]) {
      cur.push(cross(ring[prev], ring[i]))
      parts.push(cur)
      cur = null
    }
  }
  return parts
}

// The smallest crater whose rim contains (lat, lon), or null (nested craters: the inner one wins).
export function craterAt(craters, lat, lon, radiusKm) {
  let best = null
  for (const c of craters) {
    if (angularDistanceDeg(lat, lon, c.lat, c.lon) <= craterRadiusDeg(c.diameter_km, radiusKm)) {
      if (!best || c.diameter_km < best.diameter_km) best = c
    }
  }
  return best
}
