import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// Self-hosted fonts (OFL-1.1, bundled by Vite; no CDN): Space Grotesk headings, Inter body, JetBrains Mono numbers.
import "@fontsource-variable/space-grotesk"
import "@fontsource-variable/inter"
import "@fontsource/jetbrains-mono/400.css"
import "@fontsource/jetbrains-mono/700.css"
import "leaflet/dist/leaflet.css" // before index.css, whose .leaflet-* theme overrides must win
import "./index.css"
import App from "./App.jsx"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
