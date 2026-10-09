import { useEffect, useRef } from "react"
import { token } from "@/lib/theme.js"

const FRAME_MS = 1000 / 60 // cap at 60 fps
const DRIFT_PX_PER_S = 9 // nearest layer; farther stars drift slower (parallax)
const PX_PER_STAR = 4200

// Lightweight canvas starfield: three depth layers drifting left with parallax and a soft twinkle.
// Paused while the tab is hidden; a single static frame under prefers-reduced-motion.
export default function Starfield() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext("2d")
    const color = token("line")
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let w = 0
    let h = 0
    let stars = []
    let raf = 0
    let last = 0

    function seed() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round((w * h) / PX_PER_STAR)
      stars = Array.from({ length: n }, () => {
        const z = [0.25, 0.5, 1][Math.floor(Math.random() * 3)]
        return { x: Math.random() * w, y: Math.random() * h, z, r: 0.4 + z * 0.9, phase: Math.random() * 6.28, tw: 0.6 + Math.random() * 1.4 }
      })
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      for (const s of stars) {
        ctx.globalAlpha = (0.25 + 0.6 * s.z) * (reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 0.001 * s.tw + s.phase))
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, 6.2832)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    function frame(now) {
      raf = requestAnimationFrame(frame)
      if (now - last < FRAME_MS - 1) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      for (const s of stars) {
        s.x -= DRIFT_PX_PER_S * s.z * dt
        if (s.x < -2) s.x += w + 4
      }
      draw(now)
    }

    function start() {
      if (reduce || raf) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    function stop() {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    const ro = new ResizeObserver(() => {
      seed()
      draw(performance.now())
    })
    ro.observe(canvas)
    document.addEventListener("visibilitychange", onVisibility)
    start()
    return () => {
      stop()
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
}
