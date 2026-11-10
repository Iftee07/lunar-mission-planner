import { MISSION_STAY_H, bodyDurations, rateSun, ratingThresholds } from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"
import { useStore } from "@/state.js"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge, { TipLive, TipNote, TipRule } from "./RatingBadge"

// Sun card: rated by continuous sunlight from the landing time, against the chosen mission length.
function SunBadge({ r }) {
  const missionH = useStore((s) => s.missionH)
  const t = ratingThresholds(missionH)
  const { onHours } = bodyDurations(r, missionH)
  const stay = missionH === MISSION_STAY_H ? "Artemis III stay" : "mission"
  return (
    <RatingBadge rating={rateSun(r, missionH)} topic="Sun">
      <TipLive>
        {r.visibleNow ? `Continuous sunlight from landing: ${formatDays(onHours)}` : "Sun is down at landing: 0 d of sunlight"}
      </TipLive>
      <p>Rated by continuous sunlight from your landing time at this site.</p>
      <TipRule label="Perfect">
        {formatDays(t.sunPerfectMinH)} or more (the {formatDays(missionH)} {stay} plus about{" "}
        {formatDays(t.sunPerfectMinH - missionH)} margin).
      </TipRule>
      <TipRule label="Good">
        {formatDays(t.sunGoodMinH)} to {formatDays(t.sunPerfectMinH)} (covers the stay, little margin).
      </TipRule>
      <TipRule label="Not recommended">
        under {formatDays(t.sunGoodMinH)}, including if the Sun is down at landing.
      </TipRule>
      <TipNote>The 6.5 d stay is NASA&apos;s; the margin is a project estimate. Sun seen from a fixed 2 m lander height.</TipNote>
    </RatingBadge>
  )
}

function SunRows({ r }) {
  const { onHours, offHours, offOpen } = bodyDurations(r)
  return (
    <>
      <MetricRow label="Light Duration">{formatDays(onHours)}</MetricRow>
      <MetricRow label="Dark Duration">{formatDays(offHours, 1, offOpen)}</MetricRow>
    </>
  )
}

export default function SunCard() {
  return (
    <BodyCard
      body="sun"
      title="SUN"
      titleClassName="text-lspb-sun"
      horizonKey="horizonSun"
      renderBadge={(r) => <SunBadge r={r} />}
      renderRows={(r) => <SunRows r={r} />}
    />
  )
}
