import {
  SLOPE_NASA_LIMIT_DEG,
  SLOPE_POSSIBLE_MAX_DEG,
  SLOPE_TYPICAL_ERROR_DEG,
  rateLanding,
} from "@/engine/ratings.js"
import { LANDING_RADIUS_M, useStore } from "@/state.js"
import { MetricCard, MetricRow, SkeletonRows } from "./MetricCard"
import RatingBadge, { TipLive, TipNote, TipRule } from "./RatingBadge"

const deg = (d) => `${d.toFixed(1)}°`

// Landing card: two levels from the plane-fit slope over LANDING_RADIUS_M (time independent).
// Only Polar HD terrain is fine enough for a slope; on Global terrain the landing is not assessed.
export default function LandingCard() {
  const slope = useStore((s) => s.results.slope)
  const coarse = useStore((s) => s.pin?.terrainSource === "global")
  const known = slope && Number.isFinite(slope.planeDeg)
  if (coarse) {
    return (
      <MetricCard title="LANDING" data-testid="landing-card">
        <MetricRow label="Slope">Not assessed (coarse terrain)</MetricRow>
      </MetricCard>
    )
  }

  const badge = slope && (
    <RatingBadge rating={rateLanding(slope.planeDeg)} topic="Landing">
      <TipLive>
        {known
          ? `Fitted slope within ${LANDING_RADIUS_M} m: ${deg(slope.planeDeg)} (steepest point ${deg(slope.maxDeg)})`
          : "No slope data at this point"}
      </TipLive>
      <TipRule label="Possible">
        fitted slope within {LANDING_RADIUS_M} m under {SLOPE_POSSIBLE_MAX_DEG}°.
      </TipRule>
      <TipRule label="Not possible">
        {SLOPE_POSSIBLE_MAX_DEG}° or more.
      </TipRule>
      <p>
        NASA&apos;s limit is {SLOPE_NASA_LIMIT_DEG}°; {SLOPE_POSSIBLE_MAX_DEG}° leaves room for the typical{" "}
        {SLOPE_TYPICAL_ERROR_DEG}° terrain model error (project judgement).
      </p>
      <TipNote>Slope only: boulders and small craters are not checked.</TipNote>
    </RatingBadge>
  )

  return (
    <MetricCard title="LANDING" badge={badge} data-testid="landing-card">
      {!slope ? (
        <SkeletonRows rows={1} />
      ) : (
        <MetricRow label="Slope">{known ? deg(slope.planeDeg) : "no data"}</MetricRow>
      )}
    </MetricCard>
  )
}
