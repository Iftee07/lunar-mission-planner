import { formatDays, formatDeg } from "@/lib/format.js"
import { cn } from "@/lib/utils"

const W = 120
const H = 34
const PAD = 2

// Tiny line of a body's elevation over the mission window (hourly samples from engine/metrics.js), with a
// dashed 0° line when the curve crosses it and a dot at "now" (the left end). Colour: currentColor.
export default function Sparkline({ values, stepH, name, className }) {
  if (!values || values.length < 2) return <span className={cn("block", className)} style={{ width: W, height: H }} />
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const x = (i) => PAD + (i / (values.length - 1)) * (W - 2 * PAD)
  const y = (v) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD)
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const hours = (values.length - 1) * stepH
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${name} elevation over the next ${formatDays(hours)}: from ${formatDeg(lo)} to ${formatDeg(hi)}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      {lo < 0 && hi > 0 && (
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="2 3" strokeWidth={1} />
      )}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(0)} cy={y(values[0])} r={2.5} fill="currentColor" />
    </svg>
  )
}
