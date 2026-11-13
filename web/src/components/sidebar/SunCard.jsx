import { bodyDurations } from "@/engine/ratings.js"
import { sunWhy } from "@/lib/explanations.js"
import { formatDays } from "@/lib/format.js"
import { useStore } from "@/state.js"
import { Verdict } from "@/components/why/Why"
import ExplainerButton from "@/components/explain/ExplainerButton"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge from "./RatingBadge"

// Sun card: rated by continuous sunlight from the landing time, against the chosen mission length.
function useSunWhy(r) {
  const missionH = useStore((s) => s.missionH)
  const sunMode = useStore((s) => s.sunMode)
  const terrainSource = useStore((s) => s.results.terrainSource)
  const resolutionM = useStore((s) => s.results.resolutionM)
  return sunWhy(r, { missionH, sunMode, terrainSource, resolutionM })
}

function SunBadge({ r }) {
  const why = useSunWhy(r)
  return <RatingBadge rating={why.rating} topic="Sun" why={why} />
}

function SunVerdict({ r }) {
  return <Verdict verdict={useSunWhy(r).verdict} />
}

function SunRows({ r }) {
  const { onHours, offHours, offOpen } = bodyDurations(r)
  return (
    <>
      <MetricRow label="Light Duration">{formatDays(onHours)}</MetricRow>
      <MetricRow label="Dark Duration">{formatDays(offHours, 1, offOpen)}</MetricRow>
      <ExplainerButton which="sunPath" />
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
      renderVerdict={(r) => <SunVerdict r={r} />}
      renderRows={(r) => <SunRows r={r} />}
    />
  )
}
