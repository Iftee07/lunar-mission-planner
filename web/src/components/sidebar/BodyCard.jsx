import { formatAz, formatClock, formatDeg } from "@/lib/format.js"
import { selectOutOfRange, useStore } from "@/state.js"
import CountdownChip from "./CountdownChip"
import HorizonStatus from "./HorizonStatus"
import { CardMessage, MetricCard, SkeletonRows } from "./MetricCard"
import Sparkline from "./Sparkline"

// Shared Sun / Earth card. Subscribes only to this body's slices of `results` (narrow re-renders).
// Top: the elevation now (large), its sparkline over the mission window, and the set / rise countdown.
//   body: "sun" | "earth";  horizonKey: "horizonSun" | "horizonEarth"
//   renderBadge(r) -> RatingBadge;  renderRows(r) -> duration rows
// While the horizon recalculates (pin or antenna change) the last values stay, dimmed (no layout jump);
// the first calculation shows skeleton rows of the same height.
export default function BodyCard({ body, title, titleClassName, horizonKey, renderBadge, renderRows }) {
  const outOfRange = useStore(selectOutOfRange)
  const range = useStore((s) => s.ephemerisRange)
  const error = useStore((s) => (s.results.status === "error" ? s.results.error : null))
  const horizonReady = useStore((s) => s.results[horizonKey] !== null)
  const r = useStore((s) => s.results[body])
  const now = useStore((s) => s.results[`${body}Now`])
  const series = useStore((s) => s.results.metrics?.[`${body}ElevationSeriesDeg`] ?? null)
  const stepH = useStore((s) => s.results.metrics?.seriesStepH ?? 1)
  const name = title.charAt(0) + title.slice(1).toLowerCase()

  let content
  let badge = null
  let footer = null
  let busy = false
  if (outOfRange) {
    content = (
      <CardMessage tone="warn">
        Date outside ephemeris range ({formatClock(range.startMs)} to {formatClock(range.endMs)} UTC)
      </CardMessage>
    )
  } else if (error) {
    content = <CardMessage tone="bad">Horizon failed: {error}</CardMessage>
  } else if (!r || !now) {
    busy = true
    content = <SkeletonRows rows={3} footer />
  } else {
    busy = !horizonReady
    badge = renderBadge(r)
    footer = <HorizonStatus body={name} over={r.visibleNow} />
    content = (
      <>
        {/* continuous during Play: no tick animation */}
        <div className="flex items-end justify-between gap-3 pb-1">
          <div className="min-w-0">
            <p className="font-mono text-3xl leading-none font-semibold tabular-nums" data-testid={`${body}-elevation`}>
              {formatDeg(now.elDeg)}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              elevation · az <span className="font-mono tabular-nums">{formatAz(now.azDeg)}</span>
            </p>
          </div>
          <Sparkline values={series} stepH={stepH} name={name} className={titleClassName} />
        </div>
        <CountdownChip body={body} r={r} className="mb-1" />
        {renderRows(r)}
      </>
    )
  }

  return (
    <MetricCard title={title} titleClassName={titleClassName} badge={badge} footer={footer} busy={busy} data-testid={`${body}-card`}>
      {content}
    </MetricCard>
  )
}
