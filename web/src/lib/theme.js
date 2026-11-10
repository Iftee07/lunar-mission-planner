// Reads LSPB theme tokens (CSS variables in src/index.css).
// Leaflet, three.js and CesiumJS code get every colour through here: no colour literals elsewhere.

const NAMES = ["bg", "line", "line-dim", "sun", "earth", "blocked", "ok", "warn", "bad", "crater", "crater-label", "layer-sun-low", "psr"]

export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--lspb-${name}`).trim()
}

// { bg, line, lineDim, sun, earth, blocked, ok, warn, bad, crater, craterLabel, layerSunLow, psr, fontMono }
export function readTheme() {
  const theme = {}
  for (const name of NAMES) {
    const key = name.replace(/-(\w)/g, (_, c) => c.toUpperCase())
    theme[key] = token(name)
  }
  theme.fontMono = token("font-mono")
  return theme
}
