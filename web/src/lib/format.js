// Text formatting shared by the card, time bar and map readout. All durations are in hours.

export const lonEast = (lon) => ((lon % 360) + 360) % 360

// "-86.1234 S, 12.3456 E" (PRD section 4)
export function formatLatLon(lat, lon) {
  return `${lat.toFixed(4)} S, ${lonEast(lon).toFixed(4)} E`
}

export const formatHours = (h) => `${h.toFixed(1)} h`

export const formatDeg = (d, digits = 1) => `${d >= 0 ? "+" : ""}${d.toFixed(digits)}°`

export const formatAz = (az) => `${az.toFixed(1).padStart(5, "0")}°`

export function formatOffset(h) {
  return `UTC${h >= 0 ? "+" : "-"}${String(Math.abs(h)).padStart(2, "0")}:00`
}

const pad = (n) => String(n).padStart(2, "0")

// UTC ms -> "YYYY-MM-DDTHH:mm" wall-clock in the given UTC offset (for datetime-local inputs).
export function toLocalInput(ms, offsetH) {
  const d = new Date(ms + offsetH * 3600000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// "YYYY-MM-DDTHH:mm" wall-clock in the given UTC offset -> UTC ms (NaN if invalid).
export function fromLocalInput(value, offsetH) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "")
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetH * 3600000
}

// UTC ms -> "YYYY-MM-DD HH:mm" in the given offset.
export function formatClock(ms, offsetH = 0) {
  return toLocalInput(ms, offsetH).replace("T", " ")
}
