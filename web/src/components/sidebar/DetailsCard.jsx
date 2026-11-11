import CheckRow from "@/components/CheckRow"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { formatDayTime, formatDays } from "@/lib/format.js"
import { HOUR_MS, MISSION_OPTIONS_H, jumpToTime, selectEffectiveTimeMs, useStore } from "@/state.js"
import { MetricCard } from "./MetricCard"

const BODIES = [
  { body: "sun", title: "Sun up", className: "text-lspb-sun" },
  { body: "earth", title: "Earth in view", className: "text-lspb-earth" },
]

// The next 5 windows of one body from the current time (engine/metrics.js nextWindows). Each is a button
// that moves the time to its start; a window already open now cannot be jumped to.
function WindowList({ body, title, className }) {
  const next = useStore((s) => s.results.metrics?.[body]?.next ?? null)
  const tMs = useStore(selectEffectiveTimeMs)
  if (!next) return null
  const at = (h) => tMs + h * HOUR_MS
  return (
    <section className="space-y-1">
      <h4 className={`text-xs font-semibold tracking-wider uppercase ${className}`}>{title}: next windows</h4>
      {next.length === 0 ? (
        <p className="text-xs text-muted-foreground">None within {formatDays(null)}</p>
      ) : (
        <ol className="space-y-0.5">
          {next.map((w) => {
            const text = (
              <>
                <span>
                  {w.openStart ? "now" : formatDayTime(at(w.startH))} → {w.openEnd ? "later" : formatDayTime(at(w.endH))}
                </span>
                <span className="text-muted-foreground">{formatDays(w.endH - w.startH, 1, w.openStart || w.openEnd)}</span>
              </>
            )
            const row = "flex w-full items-baseline justify-between gap-3 rounded-sm px-1 py-0.5 font-mono text-xs tabular-nums"
            return (
              <li key={`${w.startH}`}>
                {w.openStart ? (
                  <span className={row}>{text}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => jumpToTime(at(w.startH))}
                    className={`${row} text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring`}
                    aria-label={`Jump to ${title.toLowerCase()} from ${formatDayTime(at(w.startH))} UTC`}
                  >
                    {text}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

// Details: the mission length the ratings and metrics use, the "count partial Sun" rule, and the next
// windows of the Sun and Earth (UTC).
export default function DetailsCard() {
  const missionH = useStore((s) => s.missionH)
  const setMissionH = useStore((s) => s.setMissionH)
  const sunMode = useStore((s) => s.sunMode)
  const setSunMode = useStore((s) => s.setSunMode)
  return (
    <MetricCard title="DETAILS" data-testid="details-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Mission length</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(missionH)}
          onValueChange={(v) => v && setMissionH(Number(v))}
          aria-label="Mission length"
        >
          {MISSION_OPTIONS_H.map((h) => (
            <ToggleGroupItem key={h} value={String(h)} className="px-3 font-mono" aria-label={`${formatDays(h)} mission`}>
              {formatDays(h)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <CheckRow checked={sunMode === "any_part"} onChange={(on) => setSunMode(on ? "any_part" : "center")}>
        <span>
          Count partial Sun <span className="text-xs text-muted-foreground">(any part of the disc above the skyline)</span>
        </span>
      </CheckRow>
      <div className="space-y-3 pt-2">
        {BODIES.map((b) => (
          <WindowList key={b.body} {...b} />
        ))}
      </div>
    </MetricCard>
  )
}
