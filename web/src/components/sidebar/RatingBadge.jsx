import { CircleHelp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Badge colours come from rating.color (engine/ratings.js): theme tokens only.
const TONE = {
  ok: "bg-lspb-ok text-background",
  warn: "bg-lspb-warn text-background",
  bad: "bg-lspb-bad text-background",
}

// Rating badge (colour plus text) and a "?" button whose tooltip explains the rating logic.
// The button is focusable, so the tooltip also opens from the keyboard.
export default function RatingBadge({ rating, topic, children }) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge className={cn("rounded-sm font-semibold", TONE[rating.color])}>{rating.label}</Badge>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`How the ${topic} rating works`}
            className="rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" align="start" sideOffset={6} className="max-w-72 space-y-1.5 text-left leading-snug text-balance">
          {children}
        </TooltipContent>
      </Tooltip>
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
