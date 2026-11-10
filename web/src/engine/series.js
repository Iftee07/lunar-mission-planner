// Visibility over time as intervals. Plain ES module, no React. Durations in hours.

import { LOOKAHEAD_H, STEP_H, bisect } from "./hours.js"

const HOUR_MS = 3600000

// Intervals where visible(t) is true over [0, spanH] hours after startMs: sampled every STEP_H, each
// edge refined by bisection to BISECT_TOLERANCE_H (0.01 h). `visible` returns true/false, or null
// outside the ephemeris; the scan then stops there.
//   { intervals: [{ startH, endH, openStart, openEnd }], coveredH, truncated }
// openStart: already visible at hour 0 (began earlier); openEnd: still visible at coveredH.
// coveredH < spanH (truncated = true) when the ephemeris ends inside the span.
// maxIntervals stops the scan once that many intervals have ended (for nextWindows).
export function sampleVisibility(visible, startMs, spanH, maxIntervals = Infinity) {
  const intervals = []
  const s0 = visible(startMs)
  if (s0 === null) return { intervals, coveredH: 0, truncated: true }
  let state = s0
  let openAt = s0 ? 0 : null
  let coveredH = 0
  let truncated = false
  for (let h = STEP_H; h <= spanH + 1e-9; h += STEP_H) {
    const s = visible(startMs + h * HOUR_MS)
    if (s === null) {
      truncated = true
      break
    }
    coveredH = h
    if (s === state) continue
    const at = bisect(visible, startMs, h - STEP_H, h, state)
    if (s) openAt = at
    else {
      intervals.push({ startH: openAt, endH: at, openStart: openAt === 0 && s0, openEnd: false })
      openAt = null
      if (intervals.length >= maxIntervals) return { intervals, coveredH: at, truncated: false }
    }
    state = s
  }
  if (openAt !== null) intervals.push({ startH: openAt, endH: coveredH, openStart: openAt === 0 && s0, openEnd: true })
  return { intervals, coveredH, truncated }
}

// The next n windows in view, starting from startMs, within LOOKAHEAD_H. The first may already be
// open at hour 0 (openStart); the last may run past the lookahead or the ephemeris (openEnd).
export function nextWindows(visible, startMs, n = 5, lookaheadH = LOOKAHEAD_H) {
  return sampleVisibility(visible, startMs, lookaheadH, n).intervals.slice(0, n)
}

// Total hours covered by a list of intervals.
export function totalHours(intervals) {
  return intervals.reduce((s, iv) => s + (iv.endH - iv.startH), 0)
}

// Hours in both a and b (each a sorted, non-overlapping interval list).
export function overlapHours(a, b) {
  let i = 0
  let j = 0
  let sum = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i].startH, b[j].startH)
    const hi = Math.min(a[i].endH, b[j].endH)
    if (hi > lo) sum += hi - lo
    if (a[i].endH < b[j].endH) i++
    else j++
  }
  return sum
}

// Longest stretch in [0, coveredH] not covered by the intervals.
export function longestGapHours(intervals, coveredH) {
  let longest = 0
  let from = 0
  for (const iv of intervals) {
    longest = Math.max(longest, iv.startH - from)
    from = iv.endH
  }
  return Math.max(longest, coveredH - from)
}
