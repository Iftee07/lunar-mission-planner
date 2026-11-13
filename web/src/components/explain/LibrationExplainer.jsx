import { useEffect, useMemo, useState } from "react"
import { useReducedMotionConfig } from "motion/react"
import { Slider } from "@/components/ui/slider"
import { earthTrack } from "@/engine/explain.js"
import { formatShortDate } from "@/lib/format.js"
import { getEngineData, useStore } from "@/state.js"

// Explainer: why Earth wobbles (libration). From near the south pole Earth hangs low over the horizon and
// traces a small loop over a month, dipping in and out of view. Real positions from the app's ephemeris, for a
// smooth spot at 89.5°S, 0°E (no terrain), starting at the selected date. The day slider (or Play) moves Earth.

const SITE = { lat: -89.5, lon: 0 }
const DAYS = 27 // about one loop (the wobble repeats in roughly 27 days)
const STEP_H = 6
const W = 320
const H = 170
const SPAN = 10 // degrees each way from the chart centre
const wrap = (az) => (az > 180 ? az - 360 : az)
const x = (az, mid) => W / 2 + ((wrap(az) - mid) / SPAN) * (W / 2)
const y = (el) => H / 2 - (el / SPAN) * (H / 2)

export default function LibrationExplainer() {
  const dataReady = useStore((s) => s.dataReady)
  const startMs = useStore((s) => s.baseTimeUtcMs)
  const reduced = useReducedMotionConfig()
  const [step, setStep] = useState(0)
  const track = useMemo(() => {
    const data = dataReady ? getEngineData() : null
    return data ? earthTrack(data.ephemeris.vectorAt, SITE.lat, SITE.lon, startMs, DAYS, STEP_H) : []
  }, [dataReady, startMs])
  const last = Math.max(0, track.length - 1)

  // Earth walks along its track (6 h per tick) unless reduced motion is on; the slider always works.
  useEffect(() => {
    if (reduced || !track.length) return
    const id = setInterval(() => setStep((i) => (i + 1) % track.length), 120)
    return () => clearInterval(id)
  }, [reduced, track.length])

  const mid = track.length ? track.reduce((a, p) => a + wrap(p.azDeg), 0) / track.length : 0
  const here = track[Math.min(step, last)]
  const up = here && here.elDeg > 0
  const inView = track.filter((p) => p.elDeg > 0).length

  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Earth's path in the sky near the south pole over a month">
        <rect x={0} y={y(0)} width={W} height={H - y(0)} fill="var(--lspb-art-ground)" />
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--lspb-line)" strokeWidth={1.5} />
        <text x={4} y={y(0) - 4} className="fill-muted-foreground text-[10px]">
          horizon
        </text>
        {track.length > 1 && (
          <polyline
            points={track.map((p) => `${x(p.azDeg, mid).toFixed(1)},${y(p.elDeg).toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--lspb-earth)"
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
        {here && (
          <circle cx={x(here.azDeg, mid)} cy={y(here.elDeg)} r={7} fill={up ? "var(--lspb-earth)" : "none"} stroke="var(--lspb-earth)" strokeWidth={2} strokeDasharray={up ? undefined : "2 2"} />
        )}
        {!track.length && (
          <text x={W / 2} y={H / 2 - 20} textAnchor="middle" className="fill-muted-foreground text-xs">
            Loading the ephemeris…
          </text>
        )}
        <text x={W - 4} y={14} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
          ±{SPAN}° box
        </text>
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span id="libration-day">Day</span>
          <span className="font-mono tabular-nums">
            {here ? `${formatShortDate(here.tMs)} · Earth ${up ? "in view" : "below the horizon"}` : "–"}
          </span>
        </div>
        <Slider aria-labelledby="libration-day" min={0} max={last} step={1} value={[Math.min(step, last)]} onValueChange={([v]) => setStep(v)} disabled={!track.length} />
      </div>
      <figcaption className="text-sm leading-snug">
        The Moon wobbles slightly as it orbits, so from near the pole Earth drifts up and down by a few degrees.
        {track.length > 0 && (
          <>
            {" "}
            Here it is above the horizon <span className="font-mono tabular-nums">{Math.round((inView / track.length) * 100)}%</span> of the month: a
            ridge or a taller antenna changes that.
          </>
        )}
        <span className="text-muted-foreground"> Seen from 89.5°S, 0°E on a smooth Moon.</span>
      </figcaption>
    </figure>
  )
}
