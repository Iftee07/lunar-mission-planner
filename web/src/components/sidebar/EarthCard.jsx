import { EARTH_GOOD_MIN_FRACTION, EARTH_PERFECT_MIN_H, MISSION_STAY_H, bodyDurations, rateEarth } from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge, { TipLive, TipNote, TipRule } from "./RatingBadge"

const pct = (f) => `${Math.round(f * 100)}%`

// Earth card: rated by Earth in view from the landing time, seen from the antenna height.
function EarthBadge({ r }) {
  const { onHours, windowFraction } = bodyDurations(r)
  return (
    <RatingBadge rating={rateEarth(r)} topic="Earth">
      <TipLive>
        {r.visibleNow ? `Earth in view from landing: ${formatDays(onHours)}` : "Earth is below the horizon at landing"}
      </TipLive>
      <TipLive>
        In view during the {formatDays(MISSION_STAY_H)} stay: {pct(windowFraction)} ({formatDays(r.windowVisibleHours)})
      </TipLive>
      <p>Rated by Earth in view from your landing time.</p>
      <TipRule label="Perfect">
        Earth stays above the local horizon for the full {formatDays(EARTH_PERFECT_MIN_H)} stay.
      </TipRule>
      <TipRule label="Good">
        Earth is visible at least {pct(EARTH_GOOD_MIN_FRACTION)} of the {formatDays(MISSION_STAY_H)} (NASA&apos;s screening
        level), so contact is intermittent: plan scheduled contact windows or a relay.
      </TipRule>
      <TipRule label="Not recommended">under {pct(EARTH_GOOD_MIN_FRACTION)}.</TipRule>
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
