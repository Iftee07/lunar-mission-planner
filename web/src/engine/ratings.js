// Mission ratings (PRD v3 section 3). Plain ES module, no React. Pure functions.
// All durations are in hours here; the UI converts to Earth days only in lib/format.js.
//
// Published figures: 6.5 d Artemis III stay, 25% Earth-visibility screening label, 10 deg slope limit.
// Project engineering judgement (labelled as such in the UI): the 8.0 d Sun "Perfect" margin and the
// 8 deg slope cut (10 deg minus the typical 1.9 deg LOLA slope error).

import { LOOKAHEAD_H } from "./hours.js"

export const MISSION_STAY_H = 156 // 6.5 d, NASA Artemis III surface stay
export const SUN_PERFECT_MIN_H = 192 // 8.0 d = stay + about 1.5 d operations margin
export const SUN_GOOD_MIN_H = 156 // 6.5 d = covers the full stay, thin margin
export const EARTH_PERFECT_MIN_H = 156 // continuous Earth view for the full stay
export const EARTH_GOOD_MIN_FRACTION = 0.25 // NASA screening label, over the 156 h window
export const SLOPE_POSSIBLE_MAX_DEG = 8 // NASA 10 deg limit minus typical 1.9 deg slope error
export const SLOPE_NASA_LIMIT_DEG = 10
export const SLOPE_TYPICAL_ERROR_DEG = 1.9

const LEVELS = {
  perfect: { level: "perfect", label: "Perfect", color: "ok" },
  good: { level: "good", label: "Good", color: "warn" },
  bad: { level: "bad", label: "Not recommended", color: "bad" },
  possible: { level: "possible", label: "Possible", color: "ok" },
  impossible: { level: "bad", label: "Not possible", color: "bad" },
}

// Durations from landing time T for one body, from a computeHours() result (engine/hours.js).
//   onHours:  continuous time in view from T (0 if hidden at T; Infinity if no change within LOOKAHEAD_H)
//   offHours: if in view at T, the next hidden period; if hidden at T, time until it rises
//             (Infinity if hidden from T to beyond LOOKAHEAD_H)
//   offOpen:  true if the next hidden period starts inside LOOKAHEAD_H but does not end inside it;
//             offHours is then a lower bound (LOOKAHEAD_H - start), shown as "1.1+ d"
//   windowFraction: share of the MISSION_STAY_H window starting at T with the body in view
export function bodyDurations(r) {
  const inf = (h) => (h === null ? Infinity : h)
  const offOpen = r.visibleNow && r.hoursToChange !== null && r.nextPeriodHours === null
  let offHours = r.visibleNow ? inf(r.nextPeriodHours) : inf(r.hoursToChange)
  if (offOpen) offHours = LOOKAHEAD_H - r.hoursToChange
  return {
    onHours: r.visibleNow ? inf(r.hoursToChange) : 0,
    offHours,
    offOpen,
    windowFraction: r.windowVisibleHours / MISSION_STAY_H,
  }
}

// Sun: by continuous sunlight from T.
export function rateSun(hoursInfo) {
  const { onHours } = bodyDurations(hoursInfo)
  if (onHours >= SUN_PERFECT_MIN_H) return LEVELS.perfect
  if (onHours >= SUN_GOOD_MIN_H) return LEVELS.good
  return LEVELS.bad
}

// Earth: Perfect if in view for the whole stay, Good if in view >= 25% of the stay window.
export function rateEarth(hoursInfo) {
  const { onHours, windowFraction } = bodyDurations(hoursInfo)
  if (onHours >= EARTH_PERFECT_MIN_H) return LEVELS.perfect
  if (windowFraction >= EARTH_GOOD_MIN_FRACTION) return LEVELS.good
  return LEVELS.bad
}

// Landing: plane-fit slope over the 100 m radius. Missing data is "Not possible".
export function rateLanding(slopePlaneDeg) {
  return Number.isFinite(slopePlaneDeg) && slopePlaneDeg < SLOPE_POSSIBLE_MAX_DEG ? LEVELS.possible : LEVELS.impossible
}
