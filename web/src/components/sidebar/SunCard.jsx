import { MISSION_STAY_H, SUN_GOOD_MIN_H, SUN_PERFECT_MIN_H, bodyDurations, rateSun } from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge, { TipLive, TipNote, TipRule } from "./RatingBadge"

// Sun card: rated by continuous sunlight from the landing time (PRD v3 section 3).
function SunBadge({ r }) {
  const { onHours } = bodyDurations(r)
  return (
    <RatingBadge rating={rateSun(r)} topic="Sun">
      <TipLive>
        {r.visibleNow ? `Continuous sunlight from landing: ${formatDays(onHours)}` : "Sun is down at landing: 0 d of sunlight"}
      </TipLive>
      <p>Rated by continuous sunlight from your landing time at this site.</p>
      <TipRule label="Perfect">
        {formatDays(SUN_PERFECT_MIN_H)} or more (the {formatDays(MISSION_STAY_H)} Artemis III stay plus about{" "}
        {formatDays(SUN_PERFECT_MIN_H - MISSION_STAY_H)} margin).
      </TipRule>
      <TipRule label="Good">
        {formatDays(SUN_GOOD_MIN_H)} to {formatDays(SUN_PERFECT_MIN_H)} (covers the stay, little margin).
      </TipRule>
      <TipRule label="Not recommended">
        under {formatDays(SUN_GOOD_MIN_H)}, including if the Sun is down at landing.
      </TipRule>
      <TipNote>The stay length is NASA&apos;s; the margin is a project estimate. Sun seen from a fixed 2 m lander height.</TipNote>
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
