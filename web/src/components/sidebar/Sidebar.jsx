import { MousePointerClick } from "lucide-react"
import { useStore } from "@/state.js"
import AntennaCard from "./AntennaCard"
import EarthCard from "./EarthCard"
import LandingCard from "./LandingCard"
import { CardMessage } from "./MetricCard"
import SiteLine from "./SiteLine"
import SunCard from "./SunCard"

// Right sidebar (PRD v3 section 4): Site line, then Sun, Earth, Landing, Antenna cards.
export default function Sidebar() {
  const dataReady = useStore((s) => s.dataReady)
  const dataError = useStore((s) => s.dataError)
  const hasPin = useStore((s) => s.pin !== null)

  let main
  if (dataError) main = <CardMessage tone="bad">Data failed to load: {dataError}</CardMessage>
  else if (!dataReady) main = <CardMessage busy>Loading data&hellip;</CardMessage>
  else if (!hasPin)
    main = (
      <p className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm">
        <MousePointerClick className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Click the map to choose a point
      </p>
    )
  else
    main = (
      <>
        <SiteLine />
        <SunCard />
        <EarthCard />
        <LandingCard />
      </>
    )

  return (
    <div className="space-y-3 p-4" data-testid="sidebar">
      <h1 className="px-1 text-lg font-semibold">Lunar Mission Planner</h1>
      {main}
      <AntennaCard />
    </div>
  )
}
