import { useEffect, useRef } from "react"
import { formatClock, formatDays, formatShortDate } from "@/lib/format.js"
import { token } from "@/lib/theme.js"
import { HOUR_MS, TIME_SLIDER_RANGE_H, jumpToTime, useStore } from "@/state.js"
import { TIMELINE_ROWS, dayTicks, hOfX, hitTest, keyStep, timelineLayout, xOfH } from "@/view/timelineModel.js"

const SWEEP_MS = 600 // bars sweep in left to right when a site's rows first appear or the site changes
const FADE_MS = 250 // and cross-fade when only the settings change (antenna, Sun mode, start time)
const DRAG_PX = 4 // a press that moves less than this is a click
const ROW_NAMES = { sun: "Sun up", earth: "Earth in view", both: "Sun and Earth" }
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const easeOut = (p) => 1 - (1 - p) ** 3

// Sites on the strip: the pin first, then each compared column ({ key, label, color, rows, startMs, shiftH }).
function groupsOf(s) {
  const name = (pin) => pin.site?.name ?? `${Math.abs(pin.lat).toFixed(1)}°${pin.lat < 0 ? "S" : "N"}`
  const groups = [{ key: "main", label: s.pin ? name(s.pin) : "No site", color: "line", rows: s.timeline.main ?? null, startMs: s.baseTimeUtcMs, shiftH: 0 }]
  s.compare.forEach((c, i) =>
    groups.push({ key: c.id, label: `${i + 1} ${name(c.pin)}`, color: `cmp-${c.color + 1}`, rows: s.timeline[c.id] ?? null, startMs: s.baseTimeUtcMs + c.shiftH * HOUR_MS, shiftH: c.shiftH }),
  )
  return groups
}

// The time control: one strip for the pin and each compared site, with Sun / Earth / Both rows over the
// 708.7 h slider span, the mission bracket and a draggable playhead bound to sliderOffsetH. Drawn on a
// canvas (DPR-aware) straight from the store, so scrubbing and Play never re-render React.
//   Drag or click the track: move the playhead.  Click a bar: jump to its start.  Hover a bar: start, end,
//   duration, and a faint Sun and Earth at that time in the surface view.  Keys: arrows 0.25 h, Shift 24 h.
// loopStartH: while Play loops, the mission window being replayed (the bracket stays there).
export default function TimelineStrip({ loopStartH = null }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const tipRef = useRef(null)
  const loopRef = useRef(loopStartH)
  const drawRef = useRef(() => {})

  useEffect(() => {
    loopRef.current = loopStartH
    drawRef.current()
  }, [loopStartH])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const tip = tipRef.current
    const ctx = canvas.getContext("2d")
    const color = (name) => token(name)
    const colors = { sun: color("sun"), earth: color("earth"), both: color("line"), line: color("line"), dim: color("text-dim"), lineDim: color("line-dim"), bg: color("bg") }
    const font = token("font-mono") || "monospace"
    const anim = new Map() // group key -> { rows, prev, site, t0, kind: "sweep" | "fade" }
    let width = 0
    let layout = null
    let groups = []
    let hover = null // { x, y }
    let frame = 0

    const requestDraw = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    drawRef.current = requestDraw

    // Animation state per group: a new row set either sweeps in (new site) or cross-fades (same site).
    function progressOf(g, now) {
      let a = anim.get(g.key)
      if (!a || a.rows !== g.rows) {
        const kind = !a?.rows || !g.rows || a.site !== g.rows.site ? "sweep" : "fade"
        a = { rows: g.rows, prev: kind === "fade" ? a.rows : null, site: g.rows?.site ?? null, t0: now, kind }
        anim.set(g.key, a)
      }
      if (reducedMotion() || !g.rows) return { a, p: 1 }
      const p = Math.min(1, (now - a.t0) / (a.kind === "sweep" ? SWEEP_MS : FADE_MS))
      return { a, p: a.kind === "sweep" ? easeOut(p) : p }
    }

    function drawRows(rows, gi, alpha, clipX) {
      if (!rows) return
      TIMELINE_ROWS.forEach((row, r) => {
        const y = layout.rowY(gi, r)
        ctx.globalAlpha = alpha * 0.92
        ctx.fillStyle = colors[row]
        for (const iv of rows[row]) {
          const x0 = xOfH(layout, iv.startH)
          const x1 = Math.min(clipX, xOfH(layout, iv.endH))
          if (x1 > x0) ctx.fillRect(x0, y, Math.max(1, x1 - x0), layout.rowH)
        }
      })
      ctx.globalAlpha = 1
    }

    function rowGlyph(row, x, y, size) {
      ctx.fillStyle = colors[row]
      ctx.strokeStyle = colors[row]
      const c = size / 2
      ctx.beginPath()
      if (row === "both") {
        ctx.moveTo(x, y)
        ctx.lineTo(x + c, y + c)
        ctx.lineTo(x, y + size)
        ctx.lineTo(x - c, y + c)
        ctx.closePath()
        ctx.fill()
      } else if (row === "sun") {
        ctx.arc(x, y + c, c, 0, 2 * Math.PI)
        ctx.fill()
      } else {
        ctx.lineWidth = 1.5
        ctx.arc(x, y + c, c - 0.75, 0, 2 * Math.PI)
        ctx.stroke()
      }
    }

    function draw(now = performance.now()) {
      frame = 0
      const s = useStore.getState()
      groups = groupsOf(s)
      layout = timelineLayout(width, groups.length, TIME_SLIDER_RANGE_H)
      const L = layout
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(L.height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(L.height * dpr)
        canvas.style.height = `${L.height}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, L.height)
      if (!width) return
      const plotW = L.plotX1 - L.plotX0
      let animating = false

      // mission bracket: the window the cards rate (or the one Play is looping over)
      const mStart = loopRef.current ?? s.sliderOffsetH
      const mx0 = xOfH(L, mStart)
      const mx1 = xOfH(L, Math.min(TIME_SLIDER_RANGE_H, mStart + s.missionH))
      ctx.fillStyle = colors.line
      ctx.globalAlpha = 0.07
      ctx.fillRect(mx0, L.plotTop - 2, mx1 - mx0, L.plotBottom - L.plotTop + 4)
      ctx.globalAlpha = 0.8
      ctx.strokeStyle = colors.line
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mx0 + 0.5, L.plotTop - 2)
      ctx.lineTo(mx0 + 0.5, L.plotTop - 7.5)
      ctx.lineTo(mx1 - 0.5, L.plotTop - 7.5)
      ctx.lineTo(mx1 - 0.5, L.plotTop - 2)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.font = `10px ${font}`
      ctx.textBaseline = "alphabetic"
      const mLabel = `${formatDays(s.missionH)} mission`
      if (mx1 - mx0 > ctx.measureText(mLabel).width + 24) {
        ctx.fillStyle = colors.bg
        const tw = ctx.measureText(mLabel).width
        const tx = (mx0 + mx1) / 2 - tw / 2
        ctx.fillRect(tx - 3, L.plotTop - 13, tw + 6, 10)
        ctx.fillStyle = colors.dim
        ctx.fillText(mLabel, tx, L.plotTop - 4)
      }

      groups.forEach((g, gi) => {
        // gutter: site label and the row glyphs
        const y0 = L.rowY(gi, 0)
        ctx.font = `10px ${font}`
        ctx.textBaseline = "top"
        ctx.fillStyle = g.color === "line" ? colors.line : color(g.color)
        let label = g.label
        const maxW = L.gutter - 18
        while (label.length > 1 && ctx.measureText(label).width > maxW) label = label.slice(0, -2) + "…"
        ctx.fillText(label, 2, y0 - 1)
        if (g.shiftH && L.groupH >= 22) {
          ctx.fillStyle = colors.dim
          ctx.fillText(`+${formatDays(g.shiftH)}`, 2, y0 + 10)
        }
        TIMELINE_ROWS.forEach((row, r) => rowGlyph(row, L.gutter - 8, L.rowY(gi, r), L.rowH))

        // track up to the end of the ephemeris
        const covered = g.rows ? g.rows.coveredH : TIME_SLIDER_RANGE_H
        ctx.fillStyle = colors.lineDim
        ctx.globalAlpha = 0.18
        TIMELINE_ROWS.forEach((_, r) => ctx.fillRect(L.plotX0, L.rowY(gi, r), xOfH(L, covered) - L.plotX0, L.rowH))
        ctx.globalAlpha = 1

        const { a, p } = progressOf(g, now)
        if (p < 1) animating = true
        if (a.kind === "sweep") drawRows(g.rows, gi, 1, L.plotX0 + p * plotW)
        else {
          drawRows(a.prev, gi, 1 - p, L.plotX1)
          drawRows(g.rows, gi, p, L.plotX1)
        }
      })
      for (const key of anim.keys()) if (!groups.some((g) => g.key === key)) anim.delete(key)

      // day ticks
      ctx.font = `10px ${font}`
      ctx.textBaseline = "top"
      ctx.strokeStyle = colors.lineDim
      ctx.lineWidth = 1
      for (const t of dayTicks(L, s.baseTimeUtcMs)) {
        const x = Math.round(xOfH(L, t.h)) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, L.plotBottom + 1)
        ctx.lineTo(x, L.axisY + 2)
        ctx.stroke()
        const text = formatShortDate(t.ms)
        const tw = ctx.measureText(text).width
        if (x + tw / 2 < L.plotX1 + 6 && x - tw / 2 > L.plotX0 - 6) {
          ctx.fillStyle = colors.dim
          ctx.fillText(text, x - tw / 2, L.axisY + 3)
        }
      }

      // hover ghost
      if (hover && hover.x >= L.plotX0 && hover.x <= L.plotX1) {
        ctx.strokeStyle = colors.line
        ctx.globalAlpha = 0.5
        ctx.setLineDash([2, 3])
        ctx.beginPath()
        ctx.moveTo(Math.round(hover.x) + 0.5, L.plotTop - 2)
        ctx.lineTo(Math.round(hover.x) + 0.5, L.plotBottom + 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      }

      // playhead
      const px = Math.round(xOfH(L, s.sliderOffsetH)) + 0.5
      ctx.strokeStyle = colors.line
      ctx.fillStyle = colors.line
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, L.plotTop - 3)
      ctx.lineTo(px, L.plotBottom + 3)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px - 5, L.plotTop - 10)
      ctx.lineTo(px + 5, L.plotTop - 10)
      ctx.lineTo(px, L.plotTop - 3)
      ctx.closePath()
      ctx.fill()

      const tMs = s.baseTimeUtcMs + s.sliderOffsetH * HOUR_MS
      canvas.setAttribute("aria-valuenow", s.sliderOffsetH.toFixed(2))
      canvas.setAttribute("aria-valuetext", `+${formatDays(s.sliderOffsetH, 2)}, ${formatClock(tMs)} UTC`)
      if (animating) requestDraw()
    }

    // ---- input ----
    const local = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const rowsOf = () => groups.map((g) => g.rows)
    const setOffset = (h) => useStore.getState().setSliderOffset(h)
    let press = null // { x, y, hit, scrubbing }

    function showTip(pt) {
      const hit = layout && hitTest(layout, rowsOf(), pt.x, pt.y)
      if (!hit) {
        tip.hidden = true
        return
      }
      const g = groups[hit.group]
      const { startH, endH, openStart, openEnd } = hit.interval
      const at = (h) => formatClock(g.startMs + h * HOUR_MS)
      tip.textContent = `${g.label} · ${ROW_NAMES[hit.row]}: ${openStart ? "before " : ""}${at(startH)} → ${openEnd ? "after " : ""}${at(endH)} UTC · ${formatDays(endH - startH, 1, openStart || openEnd)}`
      tip.hidden = false
      const w = tip.offsetWidth
      tip.style.left = `${Math.max(0, Math.min(width - w, pt.x - w / 2))}px`
      tip.style.top = `${layout.rowY(hit.group, 0) - tip.offsetHeight - 4}px`
    }

    function setHover(pt) {
      hover = pt
      const s = useStore.getState()
      const inside = pt && layout && pt.x >= layout.plotX0 && pt.x <= layout.plotX1
      s.setGhostTime(inside ? s.baseTimeUtcMs + hOfX(layout, pt.x) * HOUR_MS : null)
      if (pt && !press) showTip(pt)
      else tip.hidden = true
      requestDraw()
    }

    const onDown = (e) => {
      if (e.button !== 0 || !layout) return
      const pt = local(e)
      canvas.setPointerCapture(e.pointerId)
      const nearPlayhead = Math.abs(pt.x - xOfH(layout, useStore.getState().sliderOffsetH)) <= 8
      const hit = nearPlayhead ? null : hitTest(layout, rowsOf(), pt.x, pt.y)
      press = { ...pt, hit, scrubbing: !hit }
      tip.hidden = true
      if (!hit) setOffset(hOfX(layout, pt.x))
    }
    const onMove = (e) => {
      const pt = local(e)
      if (press) {
        if (!press.scrubbing && Math.hypot(pt.x - press.x, pt.y - press.y) >= DRAG_PX) press.scrubbing = true
        if (press.scrubbing) setOffset(hOfX(layout, pt.x))
      }
      setHover(pt)
    }
    const onUp = (e) => {
      if (!press) return
      if (!press.scrubbing && press.hit) jumpToTime(useStore.getState().baseTimeUtcMs + press.hit.interval.startH * HOUR_MS)
      press = null
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      if (e.pointerType !== "mouse") setHover(null)
    }
    const onLeave = () => {
      if (!press) setHover(null)
    }
    const onKey = (e) => {
      const next = keyStep(useStore.getState().sliderOffsetH, e, TIME_SLIDER_RANGE_H)
      if (next === null) return
      e.preventDefault()
      setOffset(next)
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("pointerleave", onLeave)
    canvas.addEventListener("keydown", onKey)

    const ro = new ResizeObserver(() => {
      width = wrap.clientWidth
      requestDraw()
    })
    ro.observe(wrap)
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (
        s.sliderOffsetH !== prev.sliderOffsetH ||
        s.baseTimeUtcMs !== prev.baseTimeUtcMs ||
        s.timeline !== prev.timeline ||
        s.compare !== prev.compare ||
        s.pin !== prev.pin ||
        s.missionH !== prev.missionH
      ) {
        requestDraw()
      }
    })
    width = wrap.clientWidth
    requestDraw()

    return () => {
      unsubscribe()
      ro.disconnect()
      cancelAnimationFrame(frame)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("keydown", onKey)
      drawRef.current = () => {}
      useStore.getState().setGhostTime(null)
    }
  }, [])

  return (
    <div ref={wrapRef} className="relative w-full" data-testid="timeline">
      <canvas
        ref={canvasRef}
        role="slider"
        tabIndex={0}
        aria-label="Time after start"
        aria-describedby="timeline-help"
        aria-valuemin={0}
        aria-valuemax={TIME_SLIDER_RANGE_H}
        aria-orientation="horizontal"
        className="block w-full cursor-pointer touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p id="timeline-help" className="sr-only">
        Bars show when the Sun is up, Earth is in view, and both, for each site. Arrow keys move 15 minutes, Shift and
        an arrow key 1 day. The Details card lists the next windows as buttons that jump to each one.
      </p>
      <div
        ref={tipRef}
        hidden
        role="tooltip"
        className="pointer-events-none absolute z-20 w-max max-w-[min(30rem,100%)] rounded-md border bg-popover px-2 py-1 font-mono text-xs text-popover-foreground shadow-md"
      />
    </div>
  )
}
