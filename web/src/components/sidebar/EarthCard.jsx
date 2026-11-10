import { bodyDurations, rateEarth, ratingThresholds } from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"
import { useStore } from "@/state.js"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge, { TipLive, TipNote, TipRule } from "./RatingBadge"

const pct = (f) => `${Math.round(f * 100)}%`

// Earth card: rated by Earth in view from the landing time, seen from the antenna height, against the
// chosen mission length.
function EarthBadge({ r }) {
  const missionH = useStore((s) => s.missionH)
  const t = ratingThresholds(missionH)
  const { onHours, windowFraction } = bodyDurations(r, missionH)
  return (
    <RatingBadge rating={rateEarth(r, missionH)} topic="Earth">
      <TipLive>
        {r.visibleNow ? `Earth in view from landing: ${formatDays(onHours)}` : "Earth is below the horizon at landing"}
      </TipLive>
      <TipLive>
        In view during the {formatDays(missionH)} stay: {pct(windowFraction)} ({formatDays(r.windowVisibleHours)})
      </TipLive>
      <p>Rated by Earth in view from your landing time.</p>
      <TipRule label="Perfect">
        Earth stays above the local horizon for the full {formatDays(t.earthPerfectMinH)} stay.
      </TipRule>
      <TipRule label="Good">
        Earth is visible at least {pct(t.earthGoodMinFraction)} of the {formatDays(missionH)} (NASA&apos;s screening
        level), so contact is intermittent: plan scheduled contact windows or a relay.
      </TipRule>
      <TipRule label="Not recommended">under {pct(t.earthGoodMinFraction)}.</TipRule>
      <TipNote>Earth is seen from the antenna height chosen below.</TipNote>
    </RatingBadge>
  )
}

function EarthRows({ r }) {
  const { onHours, offHours, offOpen } = bodyDurations(r)
  return (
    <>
      <MetricRow label="Visible Duration">{formatDays(onHours)}</MetricRow>
      <MetricRow label="Invisible Duration">{formatDays(offHours, 1, offOpen)}</MetricRow>
    </>
  )
}

export default function EarthCard() {
  return (
    <BodyCard
      body="earth"
      title="EARTH"
      titleClassName="text-lspb-earth"
      horizonKey="horizonEarth"
      renderBadge={(r) => <EarthBadge r={r} />}
      renderRows={(r) => <EarthRows r={r} />}
    />
  )
}
