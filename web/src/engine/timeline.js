// Timeline rows for one site: when the Sun, Earth and both are in view over the time-slider span.
// Plain ES module, no React. All durations in hours (lib/format.js converts for display).
// state.js runs this in idle time when the site, horizons, antenna, Sun mode or start time change,
// never on a scrub frame; components/TimelineStrip.jsx draws the result.

import { SUN_REFERENCE_HEIGHT_M, makeVisibility } from "./hours.js"
import { sampleVisibility } from "./series.js"

// Hours where both interval lists are in view (each sorted and non-overlapping).
export function intersectIntervals(a, b) {
  const out = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i].startH, b[j].startH)
    const hi = Math.min(a[i].endH, b[j].endH)
    if (hi > lo) {
      out.push({
        startH: lo,
        endH: hi,
        openStart: lo === 0 && a[i].openStart && b[j].openStart,
        openEnd: hi === a[i].endH && hi === b[j].endH && a[i].openEnd && b[j].openEnd,
      })
    }
    if (a[i].endH < b[j].endH) i++
    else j++
  }
  return out
}

// { startMs, spanH, coveredH, truncated, sun, earth, both }: interval lists ({ startH, endH, openStart,
// openEnd }, hours after startMs) over [startMs, startMs + spanH], with the same visibility tests and
// edge refinement (0.01 h) as the cards (engine/hours.js, engine/series.js). coveredH < spanH when the
// ephemeris ends inside the span. args: { horizonSun, horizonEarth, antennaM, tableAccessor, startMs, spanH, sunMode }
export function timelineRows({ horizonSun, horizonEarth, antennaM, tableAccessor, startMs, spanH, sunMode }) {
  const sun = sampleVisibility(makeVisibility("sun", horizonSun, tableAccessor, SUN_REFERENCE_HEIGHT_M, sunMode), startMs, spanH)
  const earth = sampleVisibility(makeVisibility("earth", horizonEarth, tableAccessor, antennaM, "center"), startMs, spanH)
  return {
    startMs,
    spanH,
    coveredH: Math.min(sun.coveredH, earth.coveredH),
    truncated: sun.truncated || earth.truncated,
    sun: sun.intervals,
    earth: earth.intervals,
    both: intersectIntervals(sun.intervals, earth.intervals),
  }
}
