// Countdown chips on the Sun and Earth cards: "Sunset in 42 h", "Earthrise in 3.1 d".
// Plain ES module, no React. Hours in, hours out (lib/format.js formats them).

// Colour bands for a body that is up now (time left until it sets): plenty, getting close, soon.
export const COUNTDOWN_OK_MIN_H = 48
export const COUNTDOWN_WARN_MIN_H = 12

// r: a computeHours() result (engine/hours.js) or null outside the ephemeris.
// Returns { event: "set" | "rise", inH, tone } or null:
//   inH: hours until the body sets (up now) or rises (down now); Infinity when no change was found within
//        the lookahead or before the ephemeris ends (shown as "62.5+ d").
//   tone: "ok" > 48 h, "warn" 12-48 h, "bad" < 12 h before a set; "none" while waiting for a rise.
export function countdown(r) {
  if (!r) return null
  const inH = r.hoursToChange ?? Infinity
  if (!r.visibleNow) return { event: "rise", inH, tone: "none" }
  const tone = inH > COUNTDOWN_OK_MIN_H ? "ok" : inH >= COUNTDOWN_WARN_MIN_H ? "warn" : "bad"
  return { event: "set", inH, tone }
}
