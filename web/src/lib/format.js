// Text formatting shared by the card, time bar and map readout.
// UI in days, engine in hours: durations arrive in hours and formatDays() is the ONLY place that
// converts them to Earth days for display. Never divide by 24 anywhere else.

import { LOOKAHEAD_H } from "@/engine/hours.js"

const lonEast = (lon) => ((lon % 360) + 360) % 360

// "86.1234 S, 12.3456 E" / "0.6742 N, 23.4731 E" (longitude east, 0..360)
export function formatLatLon(lat, lon) {
  return `${Math.abs(lat).toFixed(4)} ${lat < 0 ? "S" : "N"}, ${lonEast(lon).toFixed(4)} E`
}

// Terrain source badge: "Polar HD · 120 m" / "Global · ~1.9 km" (engine/terrain.js sources).
export function formatTerrain(source, resolutionM) {
  if (source === "polar-hd") return `Polar HD · ${Math.round(resolutionM)} m`
  return `Global · ~${(resolutionM / 1000).toFixed(1)} km`
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

// Hours of simulated time per real second: under a day -> "6 h/s", else "3 d/s".
export const formatPlaySpeed = (hPerS) => (hPerS < HOURS_PER_DAY ? `${hPerS} h/s` : `${+(hPerS / HOURS_PER_DAY).toFixed(2)} d/s`)

// Countdown (hours until a set or rise): under 2 days in hours ("9.4 h", "42 h"), otherwise in days
// ("3.2 d"); Infinity or null -> "62.5+ d" (no change within the lookahead).
export const COUNTDOWN_HOURS_BELOW_H = 2 * HOURS_PER_DAY
export function formatCountdown(hours) {
  if (hours === null || hours === Infinity || hours >= COUNTDOWN_HOURS_BELOW_H) return formatDays(hours)
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// UTC ms -> "12 Apr" (timeline axis).
export function formatShortDate(ms) {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// UTC ms -> "12 Apr 06:00" (Details windows).
export function formatDayTime(ms) {
  const d = new Date(ms)
  return `${formatShortDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// Fraction 0..1 -> "42%"
export const formatPercent = (fraction) => `${Math.round(fraction * 100)}%`

export const formatDeg = (d, digits = 1) => `${d >= 0 ? "+" : ""}${d.toFixed(digits)}°`

export const formatAz = (az) => `${az.toFixed(1).padStart(5, "0")}°`

const pad = (n) => String(n).padStart(2, "0")

// UTC ms -> "YYYY-MM-DDTHH:mm" wall-clock in the given UTC offset (0 = UTC; the app shows UTC only).
function toLocalInput(ms, offsetH) {
  const d = new Date(ms + offsetH * 3600000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// UTC ms -> "YYYY-MM-DD HH:mm" in the given offset.
export function formatClock(ms, offsetH = 0) {
  return toLocalInput(ms, offsetH).replace("T", " ")
}
