// Test helper: load public/data and data/fixtures from disk (Node), mirroring engine/data.js loadAll().
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createEphemeris, createGrid, createSlope } from "../src/engine/data.js"

const here = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.resolve(here, "../public/data")
export const FIXTURE_DIR = path.resolve(here, "../../data/fixtures")

const bytes = (file) => new Uint8Array(fs.readFileSync(path.join(DATA_DIR, file))).buffer

export const hasRealData = () =>
  ["manifest.json", "ephemeris.bin", "dem_near.bin", "dem_far.bin"].every((f) =>
    fs.existsSync(path.join(DATA_DIR, f)),
  )

export function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"))
}

let cache = null
export function loadRealData() {
  if (cache) return cache
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "manifest.json"), "utf8"))
  const g = manifest.grids
  cache = {
    manifest,
    ephemeris: createEphemeris(manifest.ephemeris, new Float32Array(bytes(manifest.ephemeris.file))),
    grids: {
      near: createGrid(g.near, new Int16Array(bytes(g.near.file))),
      far: createGrid(g.far, new Int16Array(bytes(g.far.file))),
      radiusM: manifest.moon_radius_m,
    },
    slopePlane: createSlope(g.near, manifest.slope, new Uint8Array(bytes(manifest.slope.plane))),
  }
  return cache
}
