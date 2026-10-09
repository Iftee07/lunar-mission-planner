import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"

// "Over Horizon" (green) / "Below Horizon" (red) at the effective time. Colour, icon and text,
// so the state never relies on colour alone. A status indicator, not a control.
export default function HorizonStatus({ body, over }) {
  const Icon = over ? ArrowUp : ArrowDown
  return (
    <div
      role="status"
      aria-live="off"
      aria-label={`${body} ${over ? "over" : "below"} the horizon`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-semibold",
        over ? "border-lspb-ok text-lspb-ok" : "border-lspb-bad text-lspb-bad",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {over ? "Over Horizon" : "Below Horizon"}
    </div>
  )
}
