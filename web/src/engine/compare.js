// Compare up to COMPARE_MAX sites (or the same site at shifted dates) side by side. Pure: the list rules,
// date shifts, one column's results and the "best value in each row". state.js keeps the list and runs the
// horizons; components/compare/CompareDrawer.jsx shows it. All durations in hours (lib/format.js converts).

import { computeSiteHours } from "./hours.js"
import { siteMetrics } from "./metrics.js"
import { bodyDurations, rateEarth, rateLanding, rateSun } from "./ratings.js"

export const COMPARE_MAX = 4
export const COMPARE_COLORS = 4 // --lspb-cmp-1 .. --lspb-cmp-4 (src/index.css), colour-blind safe
export const SYNODIC_MONTH_H = 29.530589 * 24 // one lunar day: sunrise to sunrise at a site (mean synodic month)

// Curated one-tap comparisons (sites.json ids). "IM-2: planned target vs where it ended up" is left out: no
// fetched source gives the planned target's coordinates (BUILD_PLAN rule 4; see docs/VALIDATION.md, Phase 4).
export const COMPARE_PRESETS = [
  { id: "equator-pole", label: "Equator vs pole", detail: "Apollo 11 vs Shackleton rim", siteIds: ["apollo11", "shackleton_rim"] },
  {
    id: "artemis",
    label: "Two Artemis III regions",
    detail: "Peak Near Shackleton vs de Gerlache Rim",
    siteIds: ["artemis_peak_near_shackleton", "artemis_de_gerlache_rim"],
  },
]

// --- the list ---
// entry: { id, pin, shiftH, color } (pin as state.js makes it; shiftH: hours after the main time; color 0..3)

const samePlace = (a, b) => a.lat === b.lat && a.lon === b.lon

// The list with `entry` appended, or { error } when it is full or already holds the same place and shift.
// The new entry gets the first free colour.
export function addCompareEntry(list, { pin, shiftH = 0 }, id) {
  if (list.length >= COMPARE_MAX) return { error: `Compare holds ${COMPARE_MAX} sites at most` }
  if (list.some((c) => samePlace(c.pin, pin) && c.shiftH === shiftH)) return { error: "Already in compare" }
  const used = new Set(list.map((c) => c.color))
  let color = 0
  while (used.has(color)) color++
  return { list: [...list, { id, pin, shiftH, color }] }
}

// The same calendar day and time n months later (UTC); the day is clamped to the month's length
// (31 Jan + 1 month = 28 or 29 Feb). Returns hours after `ms`.
export function monthShiftH(ms, n = 1) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + n
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const t = Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
  return (t - ms) / 3600000
}

// --- one column ---

// Hours, now-positions and mission metrics at tMs: exactly what the single-site cards use (state.js
// recomputeHours calls this too). args: { pin, horizonSun, horizonEarth, antennaM, tableAccessor, tMs, sunMode, missionH }
export function siteResults(args) {
  return { ...computeSiteHours({ ...args, windowH: args.missionH }), metrics: siteMetrics(args) }
}

const RANK = { perfect: 2, good: 1, possible: 1, bad: 0 }

// The compare rows for one column (null where there is no value: outside the ephemeris, or Landing on
// Global terrain). r = siteResults(...); slope = { planeDeg } on Polar HD, else null.
export function compareValues(r, slope, missionH) {
  const m = r?.metrics
  if (!r?.sun || !r?.earth || !m) return null
  const sunUp = bodyDurations(r.sun, missionH)
  const earthUp = bodyDurations(r.earth, missionH)
  const power = rateSun(r.sun, missionH)
  const earth = rateEarth(r.earth, missionH)
  const landing = slope ? rateLanding(slope.planeDeg) : null
  return {
    sunElevationDeg: m.sunElevationNowDeg,
    power,
    powerRank: RANK[power.level],
    earth,
    earthRank: RANK[earth.level],
    landing,
    landingRank: landing ? RANK[landing.level] : null,
    sunlitFraction: m.sunlitFraction,
    earthFraction: m.earthFraction,
    bothFraction: m.bothFraction,
    sunUpEarthDownH: m.sunUpEarthDownH,
    longestDarkH: m.longestDarkH,
    sunsetInH: sunUp.onHours, // 0 = the Sun is down now; Infinity = no sunset within the lookahead
    earthsetInH: earthUp.onHours,
  }
}

// Indices of the columns holding the best value of a row ("max" or "min" is better). Nothing glows when
// fewer than two columns have a value, or when they are all equal.
export function bestColumns(values, better) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined && !Number.isNaN(v))
  if (idx.length < 2) return []
  const nums = idx.map(([v]) => v)
  const best = better === "min" ? Math.min(...nums) : Math.max(...nums)
  const worst = better === "min" ? Math.max(...nums) : Math.min(...nums)
  if (best === worst) return []
  return idx.filter(([v]) => v === best).map(([, i]) => i)
}
