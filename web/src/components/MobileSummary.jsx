import { ChevronDown, LoaderCircle, MousePointerClick } from "lucide-react"
import { countdown } from "@/engine/countdown.js"
import { rateEarth, rateLanding, rateSun } from "@/engine/ratings.js"
import { formatCountdown } from "@/lib/format.js"
import { cn } from "@/lib/utils"
import { selectOutOfRange, useStore } from "@/state.js"

const TONE = {
  ok: "bg-lspb-ok text-background",
  warn: "bg-lspb-warn text-background",
  bad: "bg-lspb-bad text-background",
  none: "border text-muted-foreground",
}
const COUNT_TONE = { ok: "text-lspb-ok", warn: "text-lspb-warn", bad: "text-lspb-bad", none: "text-muted-foreground" }
const EVENT = { set: "set", rise: "rise" }
// Global terrain (~1.9 km) is too coarse for a slope: no landing rating there (BUILD_PLAN rule 10).
const NOT_ASSESSED = { label: "Not assessed", color: "none" }

// One body or the landing: name, rating badge, and the same countdown as its card ("set 42 h").
function Chip({ name, nameClass, rating, hours }) {
  const c = hours ? countdown(hours) : null
  return (
    <span className="flex min-w-0 flex-col items-center gap-0.5">
      <span className={cn("text-xs font-semibold tracking-wider uppercase", nameClass)}>{name}</span>
      {rating ? (
        <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[rating.color])}>{rating.label}</span>
      ) : (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Computing" />
      )}
      {c && (
        <span className={cn("font-mono text-xs whitespace-nowrap tabular-nums", COUNT_TONE[c.tone])}>
          {EVENT[c.event]} {formatCountdown(c.inH)}
        </span>
      )}
    </span>
  )
}

// Phones and tablets (< 1024 px): the cards sit below the map, so this strip over the bottom of the main
// view summarises them (ratings and the set / rise countdowns); tapping it scrolls to the full cards.
export default function MobileSummary() {
  const dataReady = useStore((s) => s.dataReady)
  const hasPin = useStore((s) => s.pin !== null)
  const view = useStore((s) => s.view)
  const outOfRange = useStore(selectOutOfRange)
  const sun = useStore((s) => s.results.sun)
  const earth = useStore((s) => s.results.earth)
  const slope = useStore((s) => s.results.slope)
  const missionH = useStore((s) => s.missionH)
  const coarse = useStore((s) => s.pin?.terrainSource === "global")
  const ready = useStore((s) => s.results.horizonSun !== null && s.results.horizonEarth !== null)
  if (!dataReady) return null

  const shell = "absolute inset-x-3 bottom-3 z-(--lspb-z-map-ui) mx-auto max-w-md rounded-lg border bg-background/90 px-3 py-2 text-sm shadow-md backdrop-blur lg:hidden"

  if (!hasPin) {
    if (view === "surface") return null // the surface view shows its own hint
    return (
      <p className={cn(shell, "flex items-center justify-center gap-2")}>
        <MousePointerClick className="size-4 text-lspb-sun" aria-hidden="true" /> Tap the {view === "globe" ? "Moon" : "map"} to choose a point
      </p>
    )
  }

  const scrollToCards = () => document.getElementById("site-ratings")?.scrollIntoView({ behavior: "smooth", block: "start" })
  return (
    <button type="button" onClick={scrollToCards} className={cn(shell, "flex items-center gap-3 text-left")} aria-label="Show the full site ratings">
      {outOfRange ? (
        <span className="flex-1 text-lspb-warn">Date outside ephemeris range</span>
      ) : (
        <span className="grid flex-1 grid-cols-3 gap-2">
          <Chip name="Sun" nameClass="text-lspb-sun" rating={ready && sun ? rateSun(sun, missionH) : null} hours={ready ? sun : null} />
          <Chip name="Earth" nameClass="text-lspb-earth" rating={ready && earth ? rateEarth(earth, missionH) : null} hours={ready ? earth : null} />
          <Chip name="Landing" rating={coarse ? NOT_ASSESSED : slope ? rateLanding(slope.planeDeg) : null} />
        </span>
      )}
      <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
