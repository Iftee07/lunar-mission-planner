import { Timer } from "lucide-react"
import { countdown } from "@/engine/countdown.js"
import { formatCountdown } from "@/lib/format.js"
import { cn } from "@/lib/utils"
import RollingText from "./RollingText"

const TONE = {
  ok: "border-lspb-ok/60 text-lspb-ok",
  warn: "border-lspb-warn/60 text-lspb-warn",
  bad: "border-lspb-bad/60 text-lspb-bad",
  none: "text-muted-foreground",
}
const EVENT = { sun: { set: "Sunset", rise: "Sunrise" }, earth: { set: "Earthset", rise: "Earthrise" } }

// "Sunset in 42 h" / "Earthrise in 3.1 d" with rolling digits. Before a set: green above 48 h, amber
// 12-48 h, red under 12 h (engine/countdown.js); a rise is neutral. r: computeHours() result for the body.
export default function CountdownChip({ body, r, className }) {
  const c = countdown(r)
  if (!c) return null
  const label = `${EVENT[body][c.event]} in`
  const value = formatCountdown(c.inH)
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE[c.tone], className)}
      data-testid={`${body}-countdown`}
    >
      <Timer className="size-3.5" aria-hidden="true" />
      <span className="sr-only">
        {label} {value}
      </span>
      <span aria-hidden="true">{label}</span>
      <span className="font-mono tabular-nums" aria-hidden="true">
        <RollingText text={value} />
      </span>
    </span>
  )
}
