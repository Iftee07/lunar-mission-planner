import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared shell for the four sidebar cards (PRD v3 section 4): title row with an optional badge,
// metric rows, optional centred footer (horizon status).
export function MetricCard({ title, titleClassName, badge, footer, children, ...props }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" {...props}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h2 className={cn("text-sm font-semibold tracking-wider uppercase", titleClassName)}>{title}</h2>
        {badge}
      </div>
      <div className="space-y-1 text-sm">{children}</div>
      {footer && <div className="flex justify-center pt-1">{footer}</div>}
    </section>
  )
}

// Label left, monospace value right.
export function MetricRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">{children}</span>
    </div>
  )
}

const TONE_TEXT = { warn: "text-lspb-warn", bad: "text-lspb-bad" }

// Placeholder text inside a card (computing, out of range, error).
export function CardMessage({ tone, busy, children }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm", TONE_TEXT[tone] || "text-muted-foreground")}>
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </p>
  )
}
