import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import AnimatedValue from "./AnimatedValue"

// Shared shell for the four sidebar cards (PRD v3 section 4): title row with an optional badge,
// metric rows, optional centred footer (horizon status). `busy` dims the content and shows a spinner
// while it recalculates, keeping the last values in place so the layout does not jump.
export function MetricCard({ title, titleClassName, badge, footer, busy = false, children, ...props }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-busy={busy} {...props}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className={cn("flex items-center gap-2 text-sm font-semibold tracking-wider uppercase", titleClassName)}>
          {title}
          {busy && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Updating" />}
        </h3>
        {badge}
      </div>
      <div className={cn("space-y-1 text-sm transition-opacity duration-200", busy && "opacity-50")}>{children}</div>
      {footer && <div className={cn("flex justify-center pt-1 transition-opacity duration-200", busy && "opacity-50")}>{footer}</div>}
    </section>
  )
}

// Label left, monospace value right. String values tick when they change unless animate={false}.
export function MetricRow({ label, children, animate = true }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">
        {animate && typeof children === "string" ? <AnimatedValue text={children} /> : children}
      </span>
    </div>
  )
}

// Placeholder rows with the same height as real rows (first calculation for a pin).
export function SkeletonRows({ rows = 3, footer = false }) {
  return (
    <div className="space-y-1" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-5 items-center justify-between gap-3">
          <span className="h-3 w-24 animate-pulse rounded bg-muted" />
          <span className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
      {footer && (
        <div className="flex justify-center pt-4">
          <span className="h-8 w-36 animate-pulse rounded-md bg-muted" />
        </div>
      )}
    </div>
  )
}

const TONE_TEXT = { warn: "text-lspb-warn", bad: "text-lspb-bad" }

// Placeholder text inside a card (out of range, error).
export function CardMessage({ tone, busy, children }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm", TONE_TEXT[tone] || "text-muted-foreground")}>
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </p>
  )
}
