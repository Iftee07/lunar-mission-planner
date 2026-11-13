import { motion } from "motion/react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Why, WhyPanel } from "@/components/why/Why"
import { DATE_SHIFT_H, RING_RADII_M, ringRadii, ringRadiusFor, shareRange } from "@/engine/sensitivity.js"
import { sensitivityWhy } from "@/lib/explanations.js"
import { formatPercent } from "@/lib/format.js"
import { useStore } from "@/state.js"
import { RING_SHARE_KEY } from "@/view/ringModel.js"
import { MetricCard, SkeletonRows } from "./MetricCard"

// "Move a little" (BUILD_PLAN P6a): the Sun and Earth shares of the stay at 8 points around the pin, and for
// the pin landing a day earlier or later. Computed by state.js (horizons in the worker, shares in idle time).

const GLOBAL_MIN_M = RING_RADII_M.global[0]
const distLabel = (m) => (m >= 1000 ? `${m / 1000} km` : `${m} m`)
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const RAMP_END = { sun: "var(--lspb-sun)", earth: "var(--lspb-earth)" }
const METRIC_WORD = { sun: "sunlight", earth: "Earth in view" }

// Same ramp as the maps (view/ringModel.js), mixed in CSS from the theme tokens.
const fillFor = (v, metric) => `color-mix(in srgb, ${RAMP_END[metric]} ${Math.round(v * 100)}%, var(--lspb-layer-sun-low))`

function Ring({ points, centre, metric }) {
  const key = RING_SHARE_KEY[metric]
  const R = 42
  const dot = (v) => (Number.isFinite(v) ? { fill: fillFor(v, metric), stroke: "var(--lspb-bg)" } : { fill: "none", stroke: "var(--lspb-line-dim)" })
  return (
    <svg viewBox="-80 -72 160 144" className="mx-auto h-40 w-full max-w-64" role="img" aria-label={`Ring of ${points.length} nearby points coloured by ${METRIC_WORD[metric]}`}>
      <circle r={R} fill="none" stroke="var(--lspb-line-dim)" strokeDasharray="2 4" />
      {points.map((p, i) => {
        const a = (p.azDeg * Math.PI) / 180
        const x = R * Math.sin(a)
        const y = -R * Math.cos(a)
        const v = p.shares?.[key]
        const label = Number.isFinite(v) ? formatPercent(v) : p.note ? "skip" : "…"
        return (
          <g key={p.azDeg}>
            <motion.circle
              key={Number.isFinite(v) ? "v" : "n"}
              cx={x}
              cy={y}
              r={7}
              strokeWidth={1.5}
              {...dot(v)}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 22, delay: i * 0.04 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <title>{`${COMPASS[i]}: ${p.note ?? label}`}</title>
            </motion.circle>
            <text x={x * 1.55} y={y * 1.38 + 3} textAnchor="middle" className="fill-muted-foreground font-mono text-[9px]">
              {label}
            </text>
          </g>
        )
      })}
      <circle r={6} {...dot(centre?.[key])} strokeWidth={1.5} />
      <path d="M-3 0h6M0-3v6" stroke="var(--lspb-line)" strokeWidth={1} />
    </svg>
  )
}

function rangeText(entries, key) {
  const r = shareRange(entries, key)
  if (!r) return "…"
  const [lo, hi] = [formatPercent(r.min), formatPercent(r.max)]
  return lo === hi ? lo : `${lo}–${hi}`
}

export default function SensitivityCard() {
  const sens = useStore((s) => s.sensitivity)
  const metric = useStore((s) => s.ringMetric)
  const setMetric = useStore((s) => s.setRingMetric)
  const setRadius = useStore((s) => s.setRingRadius)
  const source = useStore((s) => s.pin?.terrainSource)
  const resolutionM = useStore((s) => s.pin?.resolutionM)
  if (!source) return null
  const radiusM = sens.radiusM ?? ringRadiusFor(source, null)
  const entries = [sens.centre, ...sens.points.map((p) => p.shares)]
  const key = RING_SHARE_KEY[metric]
  const busy = sens.status === "computing"
  const why = sensitivityWhy({ radiusM, terrainSource: source, resolutionM, globalMinM: GLOBAL_MIN_M })

  return (
    <MetricCard
      title="MOVE A LITTLE"
      badge={<Why label="How the move-a-little ring works" content={<WhyPanel why={why} title="Move a little" />} />}
      busy={busy}
      data-testid="sensitivity-card"
    >
      {sens.status === "idle" ? (
        <SkeletonRows rows={2} />
      ) : (
        <>
          <p className="text-sm" data-testid="sensitivity-summary">
            Within {distLabel(radiusM)}: <span className="text-lspb-sun">sunlight</span>{" "}
            <span className="font-mono tabular-nums">{rangeText(entries, "sunlitFraction")}</span>,{" "}
            <span className="text-lspb-earth">Earth</span> <span className="font-mono tabular-nums">{rangeText(entries, "earthFraction")}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {busy ? `Checking nearby points: ${sens.done} of ${sens.total}` : "Share of the stay at each point around the pin."}
            {sens.status === "error" && <span className="text-lspb-bad"> Some points failed.</span>}
          </p>
          <Ring points={sens.points} centre={sens.centre} metric={metric} />
          <p className="text-xs">
            Same spot, land {DATE_SHIFT_H} h earlier:{" "}
            <span className="font-mono tabular-nums">{sens.earlier ? formatPercent(sens.earlier[key]) : "–"}</span> · now{" "}
            <span className="font-mono tabular-nums">{sens.centre ? formatPercent(sens.centre[key]) : "…"}</span> · {DATE_SHIFT_H} h later:{" "}
            <span className="font-mono tabular-nums">{sens.later ? formatPercent(sens.later[key]) : "–"}</span>{" "}
            <span className="text-muted-foreground">({METRIC_WORD[metric]})</span>
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <ToggleGroup type="single" variant="outline" size="sm" value={metric} onValueChange={(v) => v && setMetric(v)} aria-label="Colour the ring by">
          <ToggleGroupItem value="sun" className="px-2 text-xs">Sunlight</ToggleGroupItem>
          <ToggleGroupItem value="earth" className="px-2 text-xs">Earth</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(radiusM)}
          onValueChange={(v) => v && setRadius(Number(v))}
          aria-label="Ring radius"
          className="ml-auto"
        >
          {ringRadii(source).map((m) => (
            <ToggleGroupItem key={m} value={String(m)} className="px-2 font-mono text-xs">
              {distLabel(m)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {source === "global" && <p className="text-xs text-muted-foreground">Coarse terrain: {distLabel(GLOBAL_MIN_M)} is the smallest ring.</p>}
    </MetricCard>
  )
}
