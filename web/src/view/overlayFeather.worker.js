// Web Worker: the globe's South Pole HD overlay (view/globe.js) with its outer band faded to transparent, so it
// blends into the photo mosaic instead of ending in a hard edge at 84°S. Row 0 of the image is that edge.
// Message in: { url, featherFraction } (the band's share of the image height). Out: { blob } (PNG) | { error }.

self.onmessage = async (e) => {
  const { url, featherFraction } = e.data
  try {
    const img = await createImageBitmap(await (await fetch(url)).blob())
    const canvas = new OffscreenCanvas(img.width, img.height)
    const g = canvas.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const rows = Math.max(1, Math.round(img.height * featherFraction))
    const band = g.getImageData(0, 0, img.width, rows)
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows
      const a = Math.round(255 * t * t * (3 - 2 * t)) // smoothstep
      for (let i = r * img.width * 4 + 3, end = (r + 1) * img.width * 4; i < end; i += 4) band.data[i] = a
    }
    g.putImageData(band, 0, 0)
    self.postMessage({ blob: await canvas.convertToBlob({ type: "image/png" }) })
  } catch (err) {
    self.postMessage({ error: String(err && err.message ? err.message : err) })
  }
}
