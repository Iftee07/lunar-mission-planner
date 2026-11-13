import { useState } from "react"
import { motion } from "motion/react"
import { Slider } from "@/components/ui/slider"
import { minAntennaM, ridgeClearanceM } from "@/engine/explain.js"

// Explainer: why antenna height matters. Side view of a lander, a ridge and the line to Earth just above the
// horizon. Drag the mast from 2 m to 15 m: once it is tall enough the line clears the ridge. An illustration
// with round numbers (not a real site); the Earth card uses the real skyline at the chosen antenna height.

const RIDGE_M = 10
const RIDGE_DIST_M = 500
const EARTH_EL_DEG = 0.3
const W = 320
const H = 150
const GROUND = 120 // y of the ground line
const LANDER_X = 40
const RIDGE_X = 240
const PX_PER_M_V = 6 // heights drawn 6 px per metre ...
const PX_PER_M_H = (RIDGE_X - LANDER_X) / RIDGE_DIST_M // ... distances 0.4 px per metre: heights exaggerated 15x

export default function AntennaExplainer({ initialM = 2 }) {
  const [mast, setMast] = useState(initialM)
  const clear = ridgeClearanceM(mast, RIDGE_M, RIDGE_DIST_M, EARTH_EL_DEG) > 0
  const need = minAntennaM(RIDGE_M, RIDGE_DIST_M, EARTH_EL_DEG)
  const top = GROUND - mast * PX_PER_M_V
  // the line to Earth rises tan(el) metres per metre; drawn with the same exaggeration as the heights
  const slope = (Math.tan((EARTH_EL_DEG * Math.PI) / 180) * PX_PER_M_V) / PX_PER_M_H
  const endX = W - 6
  const endY = top - (endX - LANDER_X) * slope
  const ridgeTop = GROUND - RIDGE_M * PX_PER_M_V
  const color = clear ? "var(--lspb-ok)" : "var(--lspb-bad)"

  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Antenna ${mast} metres: the line to Earth ${clear ? "clears" : "is blocked by"} the ridge`}>
        <path
          d={`M0 ${GROUND} L${RIDGE_X - 60} ${GROUND} Q${RIDGE_X - 20} ${ridgeTop} ${RIDGE_X} ${ridgeTop} Q${RIDGE_X + 20} ${ridgeTop} ${RIDGE_X + 60} ${GROUND} L${W} ${GROUND} L${W} ${H} L0 ${H} Z`}
          fill="var(--lspb-art-ground)"
          stroke="var(--lspb-art-ground-edge)"
        />
        <rect x={LANDER_X - 14} y={GROUND - 10} width={28} height={10} rx={2} fill="var(--lspb-art-hull)" />
        <motion.line x1={LANDER_X} x2={LANDER_X} y1={GROUND - 10} animate={{ y2: top }} stroke="var(--lspb-line)" strokeWidth={2} initial={false} />
        <motion.circle cx={LANDER_X} r={4} fill="var(--lspb-earth)" animate={{ cy: top }} initial={false} />
        <motion.line
          x1={LANDER_X}
          x2={endX}
          animate={{ y1: top, y2: endY, stroke: color }}
          initial={false}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
        <circle cx={endX} cy={endY} r={5} fill="var(--lspb-earth)" />
        <text x={endX - 8} y={endY - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">
          to Earth, {EARTH_EL_DEG}° up
        </text>
        <text x={RIDGE_X} y={ridgeTop + 22} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {RIDGE_M} m ridge, {RIDGE_DIST_M} m away
        </text>
      </svg>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span id="antenna-mast">Antenna height</span>
          <span className="font-mono tabular-nums">{mast} m</span>
        </div>
        <Slider aria-labelledby="antenna-mast" min={2} max={15} step={1} value={[mast]} onValueChange={([v]) => setMast(v)} />
      </div>
      <figcaption className="text-sm leading-snug">
        <span className={clear ? "text-lspb-ok" : "text-lspb-bad"}>{clear ? "Earth in view." : "Blocked by the ridge."}</span> Here the
        antenna needs <span className="font-mono tabular-nums">{need.toFixed(1)} m</span>. Earth sits so low near the pole that a few metres
        of mast can see over a ridge.
        <span className="text-muted-foreground"> Illustration with round numbers, heights exaggerated 15×.</span>
      </figcaption>
    </figure>
  )
}
