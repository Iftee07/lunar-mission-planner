// Mission ratings. Plain ES module, no React. Pure functions.
// All durations are in hours here; the UI converts to Earth days only in lib/format.js.
//
// Published figures: 6.5 d Artemis III stay, 25% Earth-visibility screening label, 10 deg slope limit.
// Project engineering judgement (labelled as such in the UI): the ~1.5 d Sun "Perfect" margin and the
// 8 deg slope cut (10 deg minus the typical 1.9 deg LOLA slope error).
// The Sun and Earth ratings follow the chosen mission length (team decision, 2026-11-10): at the
// default 156 h stay they are exactly the published values (Sun Perfect 192 h, Good 156 h; Earth
// Perfect 156 h, Good 25% of the 156 h window).

import { LOOKAHEAD_H } from "./hours.js"

export const MISSION_STAY_H = 156 // default mission: 6.5 d, NASA Artemis III surface stay
const SUN_PERFECT_MARGIN_H = 36 // Sun "Perfect" = the stay + about 1.5 d operations margin (192 h at 156 h)
const EARTH_GOOD_MIN_FRACTION = 0.25 // NASA screening label, over the mission window

// Sun and Earth thresholds (hours) for a mission of missionH hours.
//   sunPerfectMinH: stay + margin   sunGoodMinH: the full stay   earthPerfectMinH: the full stay
export function ratingThresholds(missionH = MISSION_STAY_H) {
  return {
    missionH,
    sunPerfectMinH: missionH + SUN_PERFECT_MARGIN_H,
    sunGoodMinH: missionH,
    earthPerfectMinH: missionH,
    earthGoodMinFraction: EARTH_GOOD_MIN_FRACTION,
  }
}
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
//   windowFraction: share of the mission window (missionH from T, computeHours windowH) with the body in view
export function bodyDurations(r, missionH = MISSION_STAY_H) {
  const inf = (h) => (h === null ? Infinity : h)
  const offOpen = r.visibleNow && r.hoursToChange !== null && r.nextPeriodHours === null
  let offHours = r.visibleNow ? inf(r.nextPeriodHours) : inf(r.hoursToChange)
  if (offOpen) offHours = LOOKAHEAD_H - r.hoursToChange
  return {
    onHours: r.visibleNow ? inf(r.hoursToChange) : 0,
    offHours,
    offOpen,
    windowFraction: r.windowVisibleHours / missionH,
  }
}

// Sun: by continuous sunlight from T.
export function rateSun(hoursInfo, missionH = MISSION_STAY_H) {
  const t = ratingThresholds(missionH)
  const { onHours } = bodyDurations(hoursInfo, missionH)
  if (onHours >= t.sunPerfectMinH) return LEVELS.perfect
  if (onHours >= t.sunGoodMinH) return LEVELS.good
  return LEVELS.bad
}

// Earth: Perfect if in view for the whole stay, Good if in view >= 25% of the stay window.
// hoursInfo.windowVisibleHours must be counted over the same missionH (computeHours windowH).
export function rateEarth(hoursInfo, missionH = MISSION_STAY_H) {
  const t = ratingThresholds(missionH)
  const { onHours, windowFraction } = bodyDurations(hoursInfo, missionH)
  if (onHours >= t.earthPerfectMinH) return LEVELS.perfect
  if (windowFraction >= t.earthGoodMinFraction) return LEVELS.good
  return LEVELS.bad
}

// Landing: plane-fit slope over the 100 m radius. Missing data is "Not possible".
export function rateLanding(slopePlaneDeg) {
  return Number.isFinite(slopePlaneDeg) && slopePlaneDeg < SLOPE_POSSIBLE_MAX_DEG ? LEVELS.possible : LEVELS.impossible
}
