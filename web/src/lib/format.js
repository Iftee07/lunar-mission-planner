// Text formatting shared by the card, time bar and map readout.
// UI in days, engine in hours: durations arrive in hours and formatDays() is the ONLY place that
// converts them to Earth days for display. Never divide by 24 anywhere else.

import { LOOKAHEAD_H } from "@/engine/hours.js"

export const lonEast = (lon) => ((lon % 360) + 360) % 360

// "-86.1234 S, 12.3456 E" (PRD section 4)
export function formatLatLon(lat, lon) {
  return `${lat.toFixed(4)} S, ${lonEast(lon).toFixed(4)} E`
}

const HOURS_PER_DAY = 24

// Hours -> Earth days: 156 -> "6.5 d", 0 -> "0 d".
// null or Infinity (no change within LOOKAHEAD_H) -> "62.5+ d", treated as continuous.
// atLeast: the value is a lower bound (period cut off by the lookahead) -> "1.1+ d".
export function formatDays(hours, digits = 1, atLeast = false) {
  if (hours === null || hours === Infinity) return `${(LOOKAHEAD_H / HOURS_PER_DAY).toFixed(1)}+ d`
  if (hours === 0 && !atLeast) return "0 d"
  return `${(hours / HOURS_PER_DAY).toFixed(digits)}${atLeast ? "+" : ""} d`
}

// Hours of simulated time per real second -> "0.25 d/s".
export const formatDaysPerSecond = (hPerS) => `${+(hPerS / HOURS_PER_DAY).toFixed(2)} d/s`

export const formatDeg = (d, digits = 1) => `${d >= 0 ? "+" : ""}${d.toFixed(digits)}°`

export const formatAz = (az) => `${az.toFixed(1).padStart(5, "0")}°`

const pad = (n) => String(n).padStart(2, "0")

// UTC ms -> "YYYY-MM-DDTHH:mm" wall-clock in the given UTC offset (0 = UTC; the app shows UTC only).
export function toLocalInput(ms, offsetH) {
  const d = new Date(ms + offsetH * 3600000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// UTC ms -> "YYYY-MM-DD HH:mm" in the given offset.
export function formatClock(ms, offsetH = 0) {
  return toLocalInput(ms, offsetH).replace("T", " ")
}
