import { formatAz, formatClock, formatDeg } from "@/lib/format.js"
import { EPHEMERIS_END_UTC_MS, EPHEMERIS_START_UTC_MS, selectOutOfRange, useStore } from "@/state.js"
import HorizonStatus from "./HorizonStatus"
import { CardMessage, MetricCard, MetricRow } from "./MetricCard"

// Shared Sun / Earth card. Subscribes only to this body's slices of `results` (narrow re-renders).
//   body: "sun" | "earth";  horizonKey: "horizonSun" | "horizonEarth"
//   renderBadge(r) -> RatingBadge;  renderRows(r) -> duration rows
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
  if (outOfRange) {
    content = (
      <CardMessage tone="warn">
        Date outside ephemeris range ({formatClock(EPHEMERIS_START_UTC_MS)} to {formatClock(EPHEMERIS_END_UTC_MS)} UTC)
      </CardMessage>
    )
  } else if (error) {
    content = <CardMessage tone="bad">Horizon failed: {error}</CardMessage>
  } else if (!horizonReady || !r || !now) {
    content = <CardMessage busy>Computing horizon&hellip;</CardMessage>
  } else {
    badge = renderBadge(r)
    footer = <HorizonStatus body={name} over={r.visibleNow} />
    content = (
      <>
        <MetricRow label="Position">
          el {formatDeg(now.elDeg)} az {formatAz(now.azDeg)}
        </MetricRow>
        {renderRows(r)}
      </>
    )
  }

  return (
    <MetricCard title={title} titleClassName={titleClassName} badge={badge} footer={footer} data-testid={`${body}-card`}>
      {content}
    </MetricCard>
  )
}
