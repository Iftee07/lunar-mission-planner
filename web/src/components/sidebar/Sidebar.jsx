import { ArrowLeft, ArrowUp, MousePointerClick } from "lucide-react"
import { motion } from "motion/react"
import { useStore } from "@/state.js"
import AntennaCard from "./AntennaCard"
import EarthCard from "./EarthCard"
import LandingCard from "./LandingCard"
import { CardMessage, MetricCard, SkeletonRows } from "./MetricCard"
import SiteLine from "./SiteLine"
import SunCard from "./SunCard"

// Cards enter with a small stagger when the first pin is placed (fade only under reduced motion).
const list = { show: { transition: { staggerChildren: 0.06 } } }
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
}

function EmptyState() {
  return (
    <div className="space-y-1.5 rounded-lg border border-dashed p-5 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <ArrowLeft className="hidden size-4 shrink-0 text-lspb-sun lg:block" aria-hidden="true" />
        <ArrowUp className="size-4 shrink-0 text-lspb-sun lg:hidden" aria-hidden="true" />
        Click the map to choose a point
      </p>
      <p className="flex items-start gap-2 text-muted-foreground">
        <MousePointerClick className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Sun, Earth and landing ratings for that site appear here. Keyboard: focus the map and press Enter.
      </p>
    </div>
  )
}

// Right sidebar (PRD v3 section 4): Site line, then Sun, Earth, Landing, Antenna cards.
export default function Sidebar() {
  const dataReady = useStore((s) => s.dataReady)
  const dataError = useStore((s) => s.dataError)
  const hasPin = useStore((s) => s.pin !== null)

  let main
  if (dataError) main = <CardMessage tone="bad">Data failed to load. See the message on the map.</CardMessage>
  else if (!dataReady)
    main = ["SUN", "EARTH"].map((t) => (
      <MetricCard key={t} title={t} busy>
        <SkeletonRows rows={3} />
      </MetricCard>
    ))
  else if (!hasPin) main = <EmptyState />
  else
    main = (
      <motion.div variants={list} initial="hidden" animate="show" className="space-y-3">
        {[["site", SiteLine], ["sun", SunCard], ["earth", EarthCard], ["landing", LandingCard]].map(([key, Card]) => (
          <motion.div key={key} variants={item}>
            <Card />
          </motion.div>
        ))}
      </motion.div>
    )

  return (
    <div className="space-y-3 p-4" data-testid="sidebar">
      <h2 className="sr-only">Site ratings</h2>
      {main}
      <AntennaCard />
    </div>
  )
}
