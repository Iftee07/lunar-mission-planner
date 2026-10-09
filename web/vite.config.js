import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(here, "./src") },
  },
  // The three.js surface view is its own lazy chunk (~570 kB, mostly three.js itself); the welcome
  // and planner chunks stay well under this.
  build: { chunkSizeWarningLimit: 600 },
})
