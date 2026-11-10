// Web Worker: renders one Polar HD map layer off the main thread (BUILD_PLAN rule 6).
// In:  { kind: "slope", values: Uint8Array, scale, nodata, width, height, colors, disc }   (slope_plane.bin bytes)
//      { kind: "sunlight" | "psr", url, width, height, colors, disc }                 (PNG from the pipeline)
//      disc: clip to the 84 S map disc (polarLayerModel.js colorizeLayer)
// Out: { png: Blob, values: Uint8Array | null, ms }   values: decoded PNG pixels (for the cursor readout)
//      { error }

import { colorizeLayer, decodeLayerPixels } from "./polarLayerModel.js"

async function decodePng(kind, url, width, height) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" })
  if (bitmap.width !== width || bitmap.height !== height) throw new Error(`${url}: ${bitmap.width} x ${bitmap.height}, expected ${width} x ${height}`)
  const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return decodeLayerPixels(kind, ctx.getImageData(0, 0, width, height).data)
}

self.onmessage = async (e) => {
  const t0 = performance.now()
  const { kind, width, height, colors, scale, nodata, disc } = e.data
  try {
    const decoded = e.data.values ? null : await decodePng(kind, e.data.url, width, height)
    const rgba = colorizeLayer(kind, e.data.values || decoded, { colors, scale, nodata, disc })
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext("2d").putImageData(new ImageData(rgba, width, height), 0, 0)
    const png = await canvas.convertToBlob({ type: "image/png" })
    self.postMessage({ png, values: decoded, ms: performance.now() - t0 }, decoded ? [decoded.buffer] : [])
  } catch (err) {
    self.postMessage({ error: String(err.message || err) })
  }
}
