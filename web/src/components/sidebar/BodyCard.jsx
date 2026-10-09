import { formatAz, formatClock, formatDeg } from "@/lib/format.js"
import { EPHEMERIS_END_UTC_MS, EPHEMERIS_START_UTC_MS, selectOutOfRange, useStore } from "@/state.js"
import HorizonStatus from "./HorizonStatus"
import { CardMessage, MetricCard, MetricRow, SkeletonRows } from "./MetricCard"

// Shared Sun / Earth card. Subscribes only to this body's slices of `results` (narrow re-renders).
//   body: "sun" | "earth";  horizonKey: "horizonSun" | "horizonEarth"
//   renderBadge(r) -> RatingBadge;  renderRows(r) -> duration rows
// While the horizon recalculates (pin or antenna change) the last values stay, dimmed (no layout jump);
// the first calculation shows skeleton rows of the same height.
export default function BodyCard({ body, title, titleClassName, horizonKey, renderBadge, renderRows }) {
  const outOfRange = useStore(selectOutOfRange)
  const error = useStore((s) => (s.results.status === "error" ? s.results.error : null))
  const horizonReady = useStore((s) => s.results[horizonKey] !== null)
  const r = useStore((s) => s.results[body])
  const now = useStore((s) => s.results[`${body}Now`])
  const name = title.charAt(0) + title.slice(1).toLowerCase()

  let content
  let badge = null
  let footer = null
  let busy = false
  if (outOfRange) {
    content = (
      <CardMessage tone="warn">
        Date outside ephemeris range ({formatClock(EPHEMERIS_START_UTC_MS)} to {formatClock(EPHEMERIS_END_UTC_MS)} UTC)
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
        <MetricRow label="Position" animate={false}>{`el ${formatDeg(now.elDeg)} az ${formatAz(now.azDeg)}`}</MetricRow>
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
