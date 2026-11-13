import { AnimatePresence, motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Why, WhyPanel } from "@/components/why/Why"
import { cn } from "@/lib/utils"

// Badge colours come from rating.color (engine/ratings.js): theme tokens only.
const TONE = {
  ok: "bg-lspb-ok text-background",
  warn: "bg-lspb-warn text-background",
  bad: "bg-lspb-bad text-background",
}

// Rating badge (colour plus text) and its "?" (<Why>): the live checklist and the science behind the rating.
// why: a lib/explanations.js builder's result for this rating.
export default function RatingBadge({ rating, topic, why }) {
  return (
    <div className="flex items-center gap-1.5">
      {/* pops when the level changes */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={rating.label}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="inline-flex"
        >
          <Badge className={cn("rounded-sm font-semibold", TONE[rating.color])}>{rating.label}</Badge>
        </motion.span>
      </AnimatePresence>
      <Why label={`Why the ${topic} rating is ${rating.label}`} content={<WhyPanel why={why} title={`${topic}: ${rating.label}`} />} />
    </div>
  )
}
