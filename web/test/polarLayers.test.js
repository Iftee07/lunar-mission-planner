import { describe, expect, test } from "vitest"
import { sampleBilinear } from "../src/engine/data.js"
import { SLOPE_NASA_LIMIT_DEG, SLOPE_POSSIBLE_MAX_DEG, rateLanding } from "../src/engine/ratings.js"
import {
  LAYER_IDS,
  LAYER_NODATA,
  colorizeLayer,
  decodeLayerPixels,
  hexToRgb,
  layerReadout,
  pixelAt,
  slopeBand,
} from "../src/view/polarLayerModel.js"
import { hasRealData, loadRealData } from "./load.js"

const colors = { ok: [0, 255, 0], warn: [255, 200, 0], bad: [255, 0, 0], sunLow: [0, 0, 100], sunHigh: [250, 250, 0], psr: [0, 100, 255] }
const px = (rgba, i) => Array.from(rgba.slice(4 * i, 4 * i + 4))

describe("slope layer colours follow the Landing rating", () => {
  test("bands: green under 8°, amber 8° to 10°, red over 10°", () => {
    expect([SLOPE_POSSIBLE_MAX_DEG, SLOPE_NASA_LIMIT_DEG]).toEqual([8, 10]) // ratings.js, unchanged (rule 8)
    expect(slopeBand(0)).toBe("ok")
    expect(slopeBand(7.99)).toBe("ok")
    expect(slopeBand(8)).toBe("warn")
    expect(slopeBand(10)).toBe("warn")
    expect(slopeBand(10.01)).toBe("bad")
    expect(slopeBand(NaN)).toBe(null)
  })
  test("green exactly where the Landing card says possible (0° to 20° in 0.05° steps)", () => {
    for (let d = 0; d <= 20; d += 0.05) expect(slopeBand(d) === "ok", `${d}`).toBe(rateLanding(d).label === rateLanding(0).label)
  })
  test("raw slope bytes: degrees = value x scale; nodata transparent", () => {
    const rgba = colorizeLayer("slope", new Uint8Array([0, 32, 40, 41, 255]), { colors, scale: 0.25, nodata: 255 })
    expect(px(rgba, 0)).toEqual([0, 255, 0, 255]) // 0°
    expect(px(rgba, 1)).toEqual([255, 200, 0, 255]) // 8°
    expect(px(rgba, 2)).toEqual([255, 200, 0, 255]) // 10°
    expect(px(rgba, 3)).toEqual([255, 0, 0, 255]) // 10.25°
    expect(px(rgba, 4)).toEqual([0, 0, 0, 0])
  })
})

describe("sunlight and permanent-shadow layers", () => {
  // grey + alpha PNG as RGBA: [grey, grey, grey, alpha]
  const rgba = (pairs) => new Uint8Array(pairs.flatMap(([g, a]) => [g, g, g, a]))
  test("decoding: percent / PSR flag, no data outside the disc (alpha 0)", () => {
    expect(Array.from(decodeLayerPixels("sunlight", rgba([[0, 255], [42, 255], [90, 255], [0, 0]])))).toEqual([0, 42, 90, LAYER_NODATA])
    expect(Array.from(decodeLayerPixels("psr", rgba([[255, 255], [0, 255], [0, 0]])))).toEqual([1, 0, LAYER_NODATA])
  })
  test("colours: sunlight ramps low -> high; only PSR pixels are drawn", () => {
    const sun = colorizeLayer("sunlight", new Uint8Array([0, 50, 100, LAYER_NODATA]), { colors })
    expect(px(sun, 0)).toEqual([0, 0, 100, 255])
    expect(px(sun, 1)).toEqual([125, 125, 50, 255])
    expect(px(sun, 2)).toEqual([250, 250, 0, 255])
    expect(px(sun, 3)).toEqual([0, 0, 0, 0])
    const psr = colorizeLayer("psr", new Uint8Array([1, 0, LAYER_NODATA]), { colors })
    expect(px(psr, 0)).toEqual([0, 100, 255, 255])
    expect(px(psr, 1)).toEqual([0, 0, 0, 0])
    expect(px(psr, 2)).toEqual([0, 0, 0, 0])
  })
  test("clipped to the map disc: corner pixels of the square grid stay transparent", () => {
    // 3 x 3 grid of 100 m pixels centred on the pole; disc radius 120 m keeps the centre and the edge midpoints
    const disc = { width: 3, xMin: -150, yMax: 150, pixelM: 100, radiusM: 120 }
    const rgba = colorizeLayer("slope", new Uint8Array(9), { colors, scale: 0.25, nodata: 255, disc })
    const alpha = Array.from({ length: 9 }, (_, i) => rgba[4 * i + 3])
    expect(alpha).toEqual([0, 255, 0, 255, 255, 255, 0, 255, 0])
  })
  test("theme colours parse", () => {
    expect(hexToRgb("#60a5fa")).toEqual([96, 165, 250])
    expect(() => hexToRgb("blue")).toThrow()
  })
})

describe("value under the cursor", () => {
  const grid = { width: 3, height: 2, pixelM: 100, xMin: -150, yMax: 100, data: new Uint8Array([1, 2, 3, 4, 5, 6]) }
  test("nearest pixel, row 0 at the top (max y); null outside", () => {
    expect(pixelAt(grid, -149, 99)).toBe(1)
    expect(pixelAt(grid, 149, 99)).toBe(3)
    expect(pixelAt(grid, 0, -50)).toBe(5)
    expect(pixelAt(grid, -151, 0)).toBe(null)
    expect(pixelAt(grid, 0, 101)).toBe(null)
    expect(pixelAt(grid, 0, -100)).toBe(null)
  })
  test("readout text", () => {
    expect(layerReadout("slope", 6.34)).toBe("slope 6.3°")
    expect(layerReadout("slope", NaN)).toBe(null)
    expect(layerReadout("sunlight", 42)).toBe("sunlit 42% of the time")
    expect(layerReadout("psr", 1)).toBe("permanent shadow")
    expect(layerReadout("psr", 0)).toBe("not PSR")
    expect(layerReadout("psr", LAYER_NODATA)).toBe(null)
    expect(LAYER_IDS).toEqual(["sunlight", "psr", "slope"])
  })
  test.skipIf(!hasRealData())("slope layer at a pixel centre = the Landing card's value there", () => {
    const g = loadRealData().slopePlane
    for (const [c, r] of [[1500, 1500], [1519, 1519], [1200, 1800], [2000, 900]]) {
      const x = g.xMin + (c + 0.5) * g.pixelM
      const y = g.yMax - (r + 0.5) * g.pixelM
      const raw = pixelAt(g, x, y)
      if (raw === g.nodata) continue
      expect(sampleBilinear(g, x, y)).toBeCloseTo(raw * g.scale, 9)
      const rgba = colorizeLayer("slope", new Uint8Array([raw]), { colors, scale: g.scale, nodata: g.nodata })
      expect(px(rgba, 0).slice(0, 3)).toEqual(colors[slopeBand(raw * g.scale)])
    }
  })
})
