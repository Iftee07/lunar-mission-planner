// Web Worker: computes terrain horizons off the main thread, and decodes the global DEM.
// Messages in:
//   { type: "polar", grids }                         Polar HD grids (near, far, radiusM)
//   { type: "global", id, spec, gz, radiusM }        gzip-compressed global DEM -> decoded here
//   { type: "compute", id, source, pin, heightM }    pin = { lat, lon, groundM }, source "polar-hd" | "global"
// Messages out: { id, horizon: Float32Array(720), ms } | { id, dem: Int16Array, ms } | { id, error }

import { createGlobalDem, decodeGlobalDem, gunzip } from "./data.js"
import { globalTerrain, polarTerrain } from "./terrain.js"

const terrains = {}

async function handle(msg) {
  const t0 = performance.now()
  if (msg.type === "global") {
    const { spec } = msg
    const i16 = decodeGlobalDem(await gunzip(msg.gz), spec.width, spec.height)
    terrains.global = globalTerrain(createGlobalDem(spec, i16, msg.radiusM))
    // A copy for the main thread (pin height, surface view); the worker keeps its own.
    return { dem: i16.slice(), ms: performance.now() - t0 }
  }
  if (msg.type === "compute") {
    const terrain = terrains[msg.source]
    if (!terrain) throw new Error(`horizon worker: ${msg.source} terrain not loaded`)
    return { horizon: terrain.horizon(msg.pin, msg.heightM), ms: performance.now() - t0 }
  }
  throw new Error(`horizon worker: unknown message ${msg.type}`)
}

self.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === "polar") {
    terrains["polar-hd"] = polarTerrain(msg.grids)
    return
  }
  try {
    const out = await handle(msg)
    const transfer = out.horizon ? [out.horizon.buffer] : out.dem ? [out.dem.buffer] : []
    self.postMessage({ id: msg.id, ...out }, transfer)
  } catch (err) {
    self.postMessage({ id: msg.id, error: String(err && err.message ? err.message : err) })
  }
}
