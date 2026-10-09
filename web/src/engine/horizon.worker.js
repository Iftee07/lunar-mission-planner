// Web Worker: computes the terrain horizon off the main thread.
// Messages in:  { type: "init", grids }  then  { type: "compute", id, pinXY, groundM, antennaM }
// Messages out: { id, horizon: Float32Array(720), ms }  or  { id, error }

import { computeHorizon } from "./horizon.js"

let grids = null

self.onmessage = (e) => {
  const msg = e.data
  if (msg.type === "init") {
    grids = msg.grids
    return
  }
  if (msg.type === "compute") {
    try {
      if (!grids) throw new Error("horizon worker not initialised")
      const t0 = performance.now()
      const horizon = computeHorizon(msg.pinXY, msg.groundM, msg.antennaM, grids)
      self.postMessage({ id: msg.id, horizon, ms: performance.now() - t0 }, [horizon.buffer])
    } catch (err) {
      self.postMessage({ id: msg.id, error: String(err && err.message ? err.message : err) })
    }
  }
}
