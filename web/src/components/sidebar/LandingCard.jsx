import { Map as MapIcon } from "lucide-react"
import { Verdict, Why, WhyPanel } from "@/components/why/Why"
import { landingCoarseWhy, landingWhy } from "@/lib/explanations.js"
import { LANDING_RADIUS_M, showSlopeOnMap, useStore } from "@/state.js"
import { MetricCard, MetricRow, SkeletonRows } from "./MetricCard"
import RatingBadge from "./RatingBadge"

const deg = (d) => `${d.toFixed(1)}°`

// Landing card: two levels from the plane-fit slope over LANDING_RADIUS_M (time independent).
// Only Polar HD terrain is fine enough for a slope; on Global terrain the landing is not assessed.
export default function LandingCard() {
  const slope = useStore((s) => s.results.slope)
  const coarse = useStore((s) => s.pin?.terrainSource === "global")
  const resolutionM = useStore((s) => s.pin?.resolutionM)
  if (coarse) {
    const why = landingCoarseWhy(resolutionM)
    return (
      <MetricCard title="LANDING" badge={<Why label="Why the landing is not assessed here" content={<WhyPanel why={why} title="Landing: not assessed" />} />} data-testid="landing-card">
        <MetricRow label="Slope">Not assessed (coarse terrain)</MetricRow>
      </MetricCard>
    )
  }

  const why = slope ? landingWhy(slope, LANDING_RADIUS_M) : null
  const known = slope && Number.isFinite(slope.planeDeg)
  return (
    <MetricCard title="LANDING" badge={why && <RatingBadge rating={why.rating} topic="Landing" why={why} />} data-testid="landing-card">
      {!slope ? (
        <SkeletonRows rows={1} />
      ) : (
        <>
          <Verdict verdict={why.verdict} />
          <MetricRow label="Slope">{known ? deg(slope.planeDeg) : "no data"}</MetricRow>
        </>
      )}
      <button
        type="button"
        onClick={showSlopeOnMap}
        className="mt-1 inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MapIcon className="size-3.5" aria-hidden="true" /> See slopes on the map
      </button>
    </MetricCard>
  )
}
