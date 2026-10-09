import { CircleHelp } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNoHover } from "@/lib/useMediaQuery.js"
import { cn } from "@/lib/utils"

// Badge colours come from rating.color (engine/ratings.js): theme tokens only.
const TONE = {
  ok: "bg-lspb-ok text-background",
  warn: "bg-lspb-warn text-background",
  bad: "bg-lspb-bad text-background",
}

// Rating badge (colour plus text) and a "?" button whose tooltip explains the rating logic.
// The button is focusable, so the tooltip also opens from the keyboard; on touch screens it is a
// tap-to-open popover. The hit area is padded beyond the icon for fingers.
export default function RatingBadge({ rating, topic, children }) {
  const noHover = useNoHover()
  const trigger = (
    <button
      type="button"
      aria-label={`How the ${topic} rating works`}
      className="-m-1.5 rounded-full p-1.5 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CircleHelp className="size-4" aria-hidden="true" />
    </button>
  )
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
      {noHover ? (
        // Touch screens have no hover: the explanation opens on tap instead.
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent side="bottom" align="end" className="max-w-[min(18rem,calc(100vw-2rem))] space-y-1.5 p-3 text-xs leading-snug">
            {children}
          </PopoverContent>
        </Popover>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="left" align="start" sideOffset={6} className="max-w-72 space-y-1.5 text-left leading-snug text-balance">
            {children}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

// Tooltip building blocks: a bold live-number line, then the rule lines, then a small note.
export function TipLive({ children }) {
  return <p className="font-mono font-semibold">{children}</p>
}
export function TipRule({ label, children }) {
  return (
    <p>
      <span className="font-semibold">{label}:</span> {children}
    </p>
  )
}
export function TipNote({ children }) {
  return <p className="opacity-75">{children}</p>
}
