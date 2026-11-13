import { bodyDurations } from "@/engine/ratings.js"
import { earthWhy } from "@/lib/explanations.js"
import { formatDays } from "@/lib/format.js"
import { useStore } from "@/state.js"
import { Verdict } from "@/components/why/Why"
import BodyCard from "./BodyCard"
import { MetricRow } from "./MetricCard"
import RatingBadge from "./RatingBadge"

// Earth card: rated by Earth in view from the landing time, seen from the antenna height, against the
// chosen mission length.
function useEarthWhy(r) {
  const missionH = useStore((s) => s.missionH)
  const antennaM = useStore((s) => s.antennaM)
  const terrainSource = useStore((s) => s.results.terrainSource)
  const resolutionM = useStore((s) => s.results.resolutionM)
  return earthWhy(r, { missionH, antennaM, terrainSource, resolutionM })
}

function EarthBadge({ r }) {
  const why = useEarthWhy(r)
  return <RatingBadge rating={why.rating} topic="Earth" why={why} />
}

function EarthVerdict({ r }) {
  return <Verdict verdict={useEarthWhy(r).verdict} />
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
      renderVerdict={(r) => <EarthVerdict r={r} />}
      renderRows={(r) => <EarthRows r={r} />}
    />
  )
}
