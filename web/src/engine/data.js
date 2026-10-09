// Data access for the generated files in public/data (described by manifest.json).
// The parse/create functions take plain arrays so tests can feed them from disk;
// loadAll() is the browser loader (same-origin fetch only).

const HOUR_MS = 3600000

// Ephemeris table: Float32 LE, 6 values per sample (sun xyz, earth xyz), km, MOON_ME.
export function createEphemeris(spec, f32) {
  const startMs = spec.utc_start_unix_s * 1000
  const stepMs = spec.step_s * 1000
  const count = spec.count
  if (f32.length !== count * 6) throw new Error("ephemeris size does not match manifest")
  const endMs = startMs + (count - 1) * stepMs
  const inRange = (tMs) => tMs >= startMs && tMs <= endMs
  // Linear interpolation between the two nearest samples; null outside the table.
  function vectorAt(body, tMs) {
    if (!inRange(tMs)) return null
    const f = (tMs - startMs) / stepMs
    let i = Math.floor(f)
    if (i >= count - 1) i = count - 2
    const w = f - i
    const o = body === "sun" ? 0 : 3
    const a = i * 6 + o
    const b = a + 6
    return [
      f32[a] + (f32[b] - f32[a]) * w,
      f32[a + 1] + (f32[b + 1] - f32[a + 1]) * w,
      f32[a + 2] + (f32[b + 2] - f32[a + 2]) * w,
    ]
  }
  return { startMs, endMs, stepMs, count, inRange, vectorAt, frame: spec.frame }
}

// Height grid: Int16 LE row-major, row 0 = max y. Heights in metres = value * scale.
export function createGrid(spec, i16) {
  if (i16.length !== spec.width * spec.height) throw new Error(`${spec.file}: size mismatch`)
  return {
    width: spec.width,
    height: spec.height,
    pixelM: spec.pixel_m,
    xMin: spec.x_min,
    yMax: spec.y_max,
    scale: spec.scale,
    nodata: spec.nodata,
    data: i16,
  }
}

// Bilinear sample at projected (x, y) in metres. Pixel centres are at xMin + (i + 0.5) * pixelM.
// Returns NaN outside the grid (between outermost pixel centres) or next to a nodata pixel.
export function sampleBilinear(g, x, y) {
  const fc = (x - g.xMin) / g.pixelM - 0.5
  const fr = (g.yMax - y) / g.pixelM - 0.5
  if (!(fc >= 0 && fr >= 0 && fc <= g.width - 1 && fr <= g.height - 1)) return NaN
  let c = Math.floor(fc)
  let r = Math.floor(fr)
  if (c === g.width - 1) c -= 1
  if (r === g.height - 1) r -= 1
  const wc = fc - c
  const wr = fr - r
  const d = g.data
  const i = r * g.width + c
  const v00 = d[i]
  const v01 = d[i + 1]
  const v10 = d[i + g.width]
  const v11 = d[i + g.width + 1]
  const nd = g.nodata
  if (v00 === nd || v01 === nd || v10 === nd || v11 === nd) return NaN
  const top = v00 + (v01 - v00) * wc
  const bot = v10 + (v11 - v10) * wc
  return (top + (bot - top) * wr) * g.scale
}

// Slope raster on the near grid: Uint8, degrees = value * scale, nodata value from manifest.
export function createSlope(gridSpec, slopeSpec, u8) {
  return { ...createGrid({ ...gridSpec, scale: slopeSpec.scale, nodata: slopeSpec.nodata }, u8) }
}

// Bound accessor for hours.js: vectors for a fixed pin.
export function siteAccessor(ephemeris, pin) {
  return { pin, vectorAt: ephemeris.vectorAt }
}

export function hoursToMs(h) {
  return h * HOUR_MS
}

async function fetchBuffer(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r.arrayBuffer()
}

// Browser loader: everything the app needs, from same-origin /data/.
export async function loadAll(base = "/data/") {
  const manifest = await (await fetch(base + "manifest.json")).json()
  const g = manifest.grids
  const [eph, near, far, plane, smax] = await Promise.all([
    fetchBuffer(base + manifest.ephemeris.file),
    fetchBuffer(base + g.near.file),
    fetchBuffer(base + g.far.file),
    fetchBuffer(base + manifest.slope.plane),
    fetchBuffer(base + manifest.slope.max),
  ])
  const slopeGrid = g[manifest.slope.grid || "near"]
  return {
    manifest,
    ephemeris: createEphemeris(manifest.ephemeris, new Float32Array(eph)),
    grids: {
      near: createGrid(g.near, new Int16Array(near)),
      far: createGrid(g.far, new Int16Array(far)),
      radiusM: manifest.moon_radius_m,
    },
    slope: {
      plane: createSlope(slopeGrid, manifest.slope, new Uint8Array(plane)),
      max: createSlope(slopeGrid, manifest.slope, new Uint8Array(smax)),
      radiusM: manifest.slope.radius_m,
    },
    hillshadeUrl: base + manifest.hillshade,
  }
}
