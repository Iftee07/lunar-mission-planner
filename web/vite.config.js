import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const here = path.dirname(fileURLToPath(import.meta.url))

// CesiumJS loads its web workers, WASM and small assets (e.g. the credit logo) at run time from
// CESIUM_BASE_URL (<base>/cesium/, set in src/view/globe.js). This plugin serves them from the installed package
// in dev and copies them into dist/cesium/ on build. Only fetched when the globe needs them.
const CESIUM_DIR = path.resolve(here, "node_modules/cesium/Build/Cesium")
const CESIUM_STATIC = ["Workers", "ThirdParty", "Assets"]
const MIME = { ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "application/xml", ".css": "text/css" }

function cesiumStatic() {
  let outDir = "dist"
  return {
    name: "lspb-cesium-static",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use("/cesium", (req, res, next) => {
        const rel = decodeURIComponent((req.url || "").split("?")[0]).replace(/^\/+/, "")
        const file = path.resolve(CESIUM_DIR, rel)
        const allowed = CESIUM_STATIC.some((d) => file.startsWith(path.join(CESIUM_DIR, d) + path.sep))
        if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream")
        fs.createReadStream(file).pipe(res)
      })
    },
    writeBundle() {
      for (const d of CESIUM_STATIC) fs.cpSync(path.join(CESIUM_DIR, d), path.join(outDir, "cesium", d), { recursive: true })
    },
  }
}

export default defineConfig({
  // Site path: "/" (Vercel, dev). The GitHub Pages workflow builds with BASE_PATH=/lunar-mission-planner/.
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss(), cesiumStatic()],
  resolve: {
    alias: { "@": path.resolve(here, "./src") },
  },
  // Lazy chunks: the three.js surface view (~570 kB, mostly three.js) and the CesiumJS globe (see
  // docs/VALIDATION.md for its size). The welcome and planner chunks stay well under this limit.
  build: { chunkSizeWarningLimit: 600 },
})
