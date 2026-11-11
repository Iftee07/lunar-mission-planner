import { Check, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { COMPARE_MAX } from "@/engine/compare.js"
import { addCurrentPinToCompare, useStore } from "@/state.js"

// "+ Compare" for the current pin (at the main time). The compare drawer below shows the columns.
export default function CompareButton() {
  const pin = useStore((s) => s.pin)
  const inList = useStore((s) => s.pin !== null && s.compare.some((c) => c.pin.lat === s.pin.lat && c.pin.lon === s.pin.lon && c.shiftH === 0))
  const count = useStore((s) => s.compare.length)
  if (!pin) return null
  const full = count >= COMPARE_MAX
  return (
    <div className="flex items-center gap-2 px-1">
      <Button variant="outline" size="sm" disabled={inList || full} onClick={addCurrentPinToCompare}>
        {inList ? <Check /> : <Plus />} {inList ? "In compare" : "Compare"}
      </Button>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {full && !inList ? `Compare is full (${COMPARE_MAX} sites)` : count ? `${count} of ${COMPARE_MAX} in compare` : "Side by side with up to 3 more sites"}
      </span>
    </div>
  )
}
