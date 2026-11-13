import { useEffect, useState } from "react"
import { useReducedMotionConfig } from "motion/react"
import { Slider } from "@/components/ui/slider"
import { SUN_DECLINATION_MAX_DEG, sunDailyPath, sunMaxElevationDeg } from "@/engine/explain.js"

// Explainer: why the Sun skims the horizon at the pole. Drag the latitude from the equator to 90°S and the
// Sun's path over one lunar day flattens onto the horizon. Sky chart: azimuth across (north in the middle,
// where a southern observer sees the midday Sun), elevation up. Dashed: the Sun's yearly drift (about ±1.6°).

const W = 320
const H = 170
const EL_MIN = -10
const EL_MAX = 90
const x = (az) => ((((az + 180) % 360) + 360) % 360) * (W / 360) // north (0°) in the middle
const y = (el) => H - ((el - EL_MIN) / (EL_MAX - EL_MIN)) * H
const pathD = (pts) => {
  // split where the azimuth wraps from one side of the chart to the other
  let d = ""
  pts.forEach((p, i) => {
    const jump = i > 0 && Math.abs(x(p.azDeg) - x(pts[i - 1].azDeg)) > W / 2
    d += `${i === 0 || jump ? "M" : "L"}${x(p.azDeg).toFixed(1)} ${y(p.elDeg).toFixed(1)} `
  })
  return d
}
const LOOP_MS = 6000
const AXIS = [["S", 180], ["E", 90], ["N", 0], ["W", 270]]

export default function SunPathExplainer({ initialLat = 30, compact = false }) {
  const [lat, setLat] = useState(initialLat) // degrees south
  const [phase, setPhase] = useState(0) // 0..1 along one lunar day, LOOP_MS per loop
  const reduced = useReducedMotionConfig()
  useEffect(() => {
    if (reduced) return
    let frame = requestAnimationFrame(function tick(now) {
      setPhase((now % LOOP_MS) / LOOP_MS)
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [reduced])
  const path = sunDailyPath(-lat, 0)
  const hi = sunDailyPath(-lat, SUN_DECLINATION_MAX_DEG)
  const lo = sunDailyPath(-lat, -SUN_DECLINATION_MAX_DEG)
  const maxEl = sunMaxElevationDeg(-lat, 0)
  // the Sun travels east to west through the north; the ends (due south, at the chart's edges) are left out
  const visible = path.slice(1, -1).filter((p) => p.elDeg >= EL_MIN)
  const noon = path[(path.length - 1) / 2]
  // the dot: noon under reduced motion, else glides along the visible path (screen space, no glide across a wrap)
  let dot = [x(noon.azDeg), y(noon.elDeg)]
  if (!reduced && visible.length > 1) {
    const f = phase * (visible.length - 1)
    const [a, b] = [visible[Math.floor(f)], visible[Math.min(visible.length - 1, Math.floor(f) + 1)]]
    const [ax, bx] = [x(a.azDeg), x(b.azDeg)]
    const t = Math.abs(bx - ax) > W / 2 ? 0 : f - Math.floor(f)
    dot = [ax + (bx - ax) * t, y(a.elDeg) + (y(b.elDeg) - y(a.elDeg)) * t]
  }

  return (
    <figure className="space-y-3">
      <svg viewBox={`-8 -6 ${W + 16} ${H + 26}`} className="w-full" role="img" aria-label={`Sun's daily path at ${lat}° south: highest ${maxEl.toFixed(1)}° above the horizon`}>
        <rect x={0} y={y(0)} width={W} height={H - y(0)} fill="var(--lspb-art-ground)" />
        {[hi, lo].map((p, i) => (
          <path key={i} d={pathD(p)} fill="none" stroke="var(--lspb-sun)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        ))}
        <path d={pathD(path)} fill="none" stroke="var(--lspb-sun)" strokeWidth={2} />
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--lspb-line)" strokeWidth={1.5} />
        <circle cx={dot[0]} cy={dot[1]} r={6} fill="var(--lspb-sun)" stroke="var(--lspb-bg)" />
        {AXIS.map(([k, az]) => (
          <text key={k} x={x(az)} y={H + 14} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
            {k}
          </text>
        ))}
        <text x={4} y={y(0) - 4} className="fill-muted-foreground text-[10px]">
          horizon
        </text>
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span id="sunpath-lat">Latitude</span>
          <span className="font-mono tabular-nums">{lat}°S</span>
        </div>
        <Slider aria-labelledby="sunpath-lat" min={0} max={90} step={1} value={[lat]} onValueChange={([v]) => setLat(v)} />
      </div>
      <figcaption className="text-sm leading-snug">
        Highest Sun: <span className="font-mono tabular-nums">{maxEl.toFixed(1)}°</span>.{" "}
        {lat >= 85
          ? "Near the pole the Sun circles the sky just above or below the horizon, so a small hill or a crater rim decides whether a spot is lit."
          : "Away from the pole the Sun climbs high, so local hills hardly matter."}
        {!compact && (
          <span className="text-muted-foreground">
            {" "}
            The dashed lines are the Sun&apos;s ±{SUN_DECLINATION_MAX_DEG}° drift over a year, from the ephemeris. Smooth Moon, no terrain.
          </span>
        )}
      </figcaption>
    </figure>
  )
}
