// Timeline strip geometry and input rules. Pure (no DOM, no React), so the layout, hit testing, playhead keys
// and time jumps are unit-tested; components/TimelineStrip.jsx draws and wires them. Hours throughout.

export const TIMELINE_ROWS = ["sun", "earth", "both"]
const HOUR_MS = 3600000
const DAY_H = 24
export const KEY_STEP_H = 0.25 // arrow keys
export const KEY_STEP_LARGE_H = 24 // Shift + arrow, Page Up / Page Down
const TOP_H = 14 // mission bracket and the playhead's handle
const AXIS_H = 16 // day labels
const ROW_GAP = 2
const GROUP_GAP = 6
const TICK_MIN_PX = 52
const TICK_STEPS_D = [1, 2, 5, 7, 10, 15]

// Pixel layout for `groups` sites on a strip `width` px wide (CSS pixels). One group per site, each with the
// Sun, Earth and Both rows; the label gutter sits left of the plot.
export function timelineLayout(width, groups, spanH) {
  const n = Math.max(1, groups)
  const gutter = width < 480 ? 56 : 96
  const rowH = n <= 2 ? 8 : 6
  const groupH = TIMELINE_ROWS.length * rowH + (TIMELINE_ROWS.length - 1) * ROW_GAP
  const plotTop = TOP_H
  const plotBottom = plotTop + n * groupH + (n - 1) * GROUP_GAP
  return {
    width,
    height: plotBottom + 4 + AXIS_H,
    spanH,
    gutter,
    plotX0: gutter,
    plotX1: Math.max(gutter + 1, width - 8),
    plotTop,
    plotBottom,
    axisY: plotBottom + 4,
    rowH,
    groupH,
    groups: n,
    rowY: (g, r) => plotTop + g * (groupH + GROUP_GAP) + r * (rowH + ROW_GAP),
  }
}

export const xOfH = (L, h) => L.plotX0 + (h / L.spanH) * (L.plotX1 - L.plotX0)
export const hOfX = (L, x) => Math.max(0, Math.min(L.spanH, ((x - L.plotX0) / (L.plotX1 - L.plotX0)) * L.spanH))

// The bar under (x, y): { group, row, interval } or null. groups[i] = { sun, earth, both } interval lists
// (null while not computed). Bars narrower than 4 px stay clickable within 2 px either side.
export function hitTest(L, groups, x, y) {
  if (x < L.plotX0 - 2 || x > L.plotX1 + 2) return null
  const slackH = (2 / (L.plotX1 - L.plotX0)) * L.spanH
  const h = hOfX(L, x)
  for (let g = 0; g < groups.length; g++) {
    const rows = groups[g]
    if (!rows) continue
    for (let r = 0; r < TIMELINE_ROWS.length; r++) {
      const y0 = L.rowY(g, r)
      if (y < y0 - 1 || y > y0 + L.rowH + 1) continue
      const list = rows[TIMELINE_ROWS[r]] || []
      const interval = list.find((iv) => h >= iv.startH - slackH && h <= iv.endH + slackH)
      return interval ? { group: g, row: TIMELINE_ROWS[r], interval } : null
    }
  }
  return null
}

// Playhead keys: arrows step 0.25 h, Shift + arrow 24 h, Page Up / Down 24 h, Home / End the ends.
// Returns the new offset (clamped to [0, spanH]) or null for any other key.
export function keyStep(offsetH, { key, shiftKey = false }, spanH) {
  const step = shiftKey ? KEY_STEP_LARGE_H : KEY_STEP_H
  let next
  if (key === "ArrowRight" || key === "ArrowUp") next = offsetH + step
  else if (key === "ArrowLeft" || key === "ArrowDown") next = offsetH - step
  else if (key === "PageUp") next = offsetH + KEY_STEP_LARGE_H
  else if (key === "PageDown") next = offsetH - KEY_STEP_LARGE_H
  else if (key === "Home") next = 0
  else if (key === "End") next = spanH
  else return null
  return Math.max(0, Math.min(spanH, next))
}

// Jump the time to targetMs (a timeline bar's start, a Details window): inside the strip the playhead
// moves; beyond it the start time moves there (playhead back to 0), kept inside the ephemeris range.
// Returns a store patch: { sliderOffsetH } or { baseTimeUtcMs, sliderOffsetH: 0 }.
export function timeJump(baseMs, targetMs, spanH, range = null) {
  const h = (targetMs - baseMs) / HOUR_MS
  if (h >= 0 && h <= spanH) return { sliderOffsetH: h }
  let t = targetMs
  if (range) t = Math.max(range.startMs, Math.min(range.endMs, t))
  return { baseTimeUtcMs: t, sliderOffsetH: 0 }
}

// Day ticks along the axis: UTC midnights, every 1, 2, 5, 7, 10 or 15 days so labels stay >= 52 px apart.
// [{ h, ms }] with h = hours after startMs.
export function dayTicks(L, startMs) {
  const pxPerDay = ((L.plotX1 - L.plotX0) / L.spanH) * DAY_H
  const stepD = TICK_STEPS_D.find((d) => d * pxPerDay >= TICK_MIN_PX) ?? TICK_STEPS_D.at(-1)
  const dayMs = DAY_H * HOUR_MS
  const ticks = []
  for (let ms = Math.ceil(startMs / dayMs) * dayMs; ms <= startMs + L.spanH * HOUR_MS; ms += dayMs) {
    const dayIndex = Math.round(ms / dayMs)
    if (dayIndex % stepD === 0) ticks.push({ h: (ms - startMs) / HOUR_MS, ms })
  }
  return ticks
}
