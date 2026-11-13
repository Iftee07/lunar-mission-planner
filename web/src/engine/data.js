// Data access for the generated files in public/data (described by manifest.json).
// The parse/create functions take plain arrays so tests can feed them from disk;
// createDataLoader() is the browser loader (same-origin fetch only), one tier at a time.

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

// Global DEM (LOLA LDEM_16): Int16 heights (value * scale m above radiusM), row 0 = 90 N, column 0 = 0 E,
// pixel centres at (i + 0.5) / ppd deg. pixelM is the exact arc length of one pixel of latitude, so a
// march in pixelM steps along a meridian lands on pixel centres.
export function createGlobalDem(spec, i16, radiusM) {
  if (i16.length !== spec.width * spec.height) throw new Error(`${spec.file}: size mismatch`)
  const ppd = spec.pixels_per_degree
  return {
    width: spec.width,
    height: spec.height,
    ppd,
    pixelM: ((Math.PI / 180) * radiusM) / ppd,
    scale: spec.scale,
    radiusM,
    data: i16,
  }
}

// global_dem.bin is gzip(high-byte plane | low-byte plane) of the Int16 residuals of the predictor
// left + up - upleft (pipeline/10_build_global.py). This undoes the planes and the predictor.
export function decodeGlobalDem(planes, width, height) {
  const n = width * height
  if (planes.length !== 2 * n) throw new Error("global DEM: decoded size does not match the manifest")
  const out = new Int16Array(n)
  const res = (i) => (((planes[i] << 8) | planes[n + i]) << 16) >> 16
  let acc = 0
  for (let c = 0; c < width; c++) out[c] = acc += res(c)
  for (let r = 1; r < height; r++) {
    const row = r * width
    const up = row - width
    out[row] = out[up] + res(row)
    for (let c = 1; c < width; c++) {
      const i = row + c
      out[i] = res(i) + out[i - 1] + out[up + c] - out[up + c - 1]
    }
  }
  return out
}

// gzip bytes -> bytes, with the platform's DecompressionStream (browsers, workers, Node 18+).
export async function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// Errors name the file, so the UI can say exactly what failed.
async function fetchChecked(fetchImpl, url) {
  let r
  try {
    r = await fetchImpl(url)
  } catch {
    throw new Error(`${url}: network error (is the dev server running?)`)
  }
  // A missing file comes back as 404, or (dev servers with an SPA fallback) as the app's own HTML page.
  const missing = r.status === 404 || (r.ok && (r.headers.get("content-type") || "").includes("text/html"))
  if (missing) throw new Error(`${url} is missing`)
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return r
}

// Whole body as an ArrayBuffer, reporting bytes as they arrive (decoded size, whatever the transfer encoding).
async function fetchBytes(fetchImpl, url, onBytes) {
  const r = await fetchChecked(fetchImpl, url)
  if (!r.body) {
    const buf = await r.arrayBuffer()
    onBytes(buf.byteLength)
    return buf
  }
  const reader = r.body.getReader()
  const chunks = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    n += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(n)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out.buffer
}

// Data tiers, each loaded once and on demand (BUILD_PLAN rule 11):
//   core    manifest + ephemeris, at start
//   globe   display assets for the globe (textures, feature names, mission sites); URLs only, the globe
//           view fetches them itself when it opens
//   polar   Polar HD grids, slope, hillshade, craters, sunlight/PSR layers (first polar pin or Polar HD map)
//   global  global DEM, still gzip-compressed (first non-polar pin); the horizon worker decodes it
// onProgress(tier, doneBytes, totalBytes) reports each tier's binary files as they stream in.
export function createDataLoader({ base = "/data/", fetchImpl = (u) => fetch(u), onProgress = () => {} } = {}) {
  const pending = new Map()
  const loaded = new Map()

  // Fetch a tier's binaries in parallel with one combined progress count.
  function binaries(tier, files) {
    const total = files.reduce((s, f) => s + f.bytes, 0)
    let done = 0
    onProgress(tier, 0, total)
    return Promise.all(
      files.map((f) =>
        fetchBytes(fetchImpl, base + f.file, (n) => {
          done += n
          onProgress(tier, Math.min(done, total), total)
        }),
      ),
    )
  }

  const run = {
    async core() {
      const manifest = await (await fetchChecked(fetchImpl, base + "manifest.json")).json()
      const e = manifest.ephemeris
      const [eph] = await binaries("core", [{ file: e.file, bytes: e.count * 24 }])
      return { manifest, ephemeris: createEphemeris(e, new Float32Array(eph)) }
    },
    async globe({ manifest }) {
      const g = manifest.globe || {}
      const url = (spec) => (spec ? base + spec.file : null)
      return {
        fallbackTextureUrl: url(g.fallback_texture),
        featuresUrl: url(manifest.craters_global),
        sitesUrl: url(manifest.sites),
      }
    },
    async polar({ manifest }) {
      const g = manifest.grids
      const s = manifest.slope
      const slopeGrid = g[s.grid || "near"]
      const [near, far, plane, smax] = await binaries("polar", [
        { file: g.near.file, bytes: g.near.width * g.near.height * 2 },
        { file: g.far.file, bytes: g.far.width * g.far.height * 2 },
        { file: s.plane, bytes: slopeGrid.width * slopeGrid.height },
        { file: s.max, bytes: slopeGrid.width * slopeGrid.height },
      ])
      // Named craters are a display-only layer: if the file is missing the app still works.
      const craters = manifest.craters
        ? await fetchImpl(base + manifest.craters.file)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        : []
      const il = manifest.illumination || {}
      return {
        grids: {
          near: createGrid(g.near, new Int16Array(near)),
          far: createGrid(g.far, new Int16Array(far)),
          radiusM: manifest.moon_radius_m,
        },
        slope: {
          plane: createSlope(slopeGrid, s, new Uint8Array(plane)),
          max: createSlope(slopeGrid, s, new Uint8Array(smax)),
          radiusM: s.radius_m,
        },
        hillshadeUrl: base + manifest.hillshade,
        layerUrls: { illumAvg: il.illum_avg ? base + il.illum_avg.file : null, psr: il.psr ? base + il.psr.file : null },
        craters, // [{ name, lat, lon (deg east), diameter_km }] from the IAU gazetteer
      }
    },
    async global({ manifest }) {
      const spec = manifest.global_dem
      const [gz] = await binaries("global", [{ file: spec.file, bytes: spec.bytes_file }])
      return { spec, gz }
    },
  }

  // Resolves with the tier's data; after a failure, calling ensure again retries.
  function ensure(tier) {
    if (!run[tier]) return Promise.reject(new Error(`unknown data tier ${tier}`))
    if (!pending.has(tier)) {
      const core = tier === "core" ? Promise.resolve({}) : ensure("core")
      const p = core
        .then((c) => run[tier](c))
        .then((data) => {
          loaded.set(tier, data)
          return data
        })
        .catch((err) => {
          pending.delete(tier)
          throw err
        })
      pending.set(tier, p)
    }
    return pending.get(tier)
  }

  return { ensure, get: (tier) => loaded.get(tier) || null }
}
