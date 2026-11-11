import { useState } from "react"
import { CalendarPlus, ChevronDown, ChevronUp, GitCompareArrows, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COMPARE_MAX, COMPARE_PRESETS, SYNODIC_MONTH_H, bestColumns, compareValues, monthShiftH } from "@/engine/compare.js"
import { formatClock, formatDays, formatDeg, formatLatLon, formatPercent, formatTerrain } from "@/lib/format.js"
import { cn } from "@/lib/utils"
import { HOUR_MS, duplicateCompare, loadComparePreset, removeFromCompare, selectEffectiveTimeMs, selectPlace, useStore } from "@/state.js"

const TONE = { ok: "bg-lspb-ok text-background", warn: "bg-lspb-warn text-background", bad: "bg-lspb-bad text-background" }
const rating = (r) => <Badge className={cn("rounded-sm font-semibold", TONE[r.color])}>{r.label}</Badge>
const upFor = (h, downText) => (h === 0 ? downText : formatDays(h, 1))

// The rows, top to bottom. key: compareValues() field used for the "best" glow; better: max | min.
const ROWS = [
  { key: "terrain", label: "Terrain" },
  { key: "sunElevationDeg", label: "Sun elevation now", better: "max", show: (v) => formatDeg(v.sunElevationDeg) },
  { key: "powerRank", label: "Power", better: "max", show: (v) => rating(v.power) },
  { key: "earthRank", label: "Talk to Earth", better: "max", show: (v) => rating(v.earth) },
  { key: "landingRank", label: "Landing", better: "max", show: (v) => (v.landing ? rating(v.landing) : <span className="text-xs text-muted-foreground">Not assessed (coarse)</span>) },
  { key: "sunlitFraction", label: "Sunlit", better: "max", show: (v) => formatPercent(v.sunlitFraction) },
  { key: "earthFraction", label: "Earth in view", better: "max", show: (v) => formatPercent(v.earthFraction) },
  { key: "bothFraction", label: "Sun and Earth", better: "max", show: (v) => formatPercent(v.bothFraction) },
  { key: "sunUpEarthDownH", label: "Power, no Earth", better: "min", show: (v) => formatDays(v.sunUpEarthDownH) },
  { key: "longestDarkH", label: "Longest dark", better: "min", show: (v) => formatDays(v.longestDarkH) },
  { key: "sunsetInH", label: "Sunset in", better: "max", show: (v) => upFor(v.sunsetInH, "Sun down now") },
  { key: "earthsetInH", label: "Earthset in", better: "max", show: (v) => upFor(v.earthsetInH, "Earth down now") },
]
const ROW_H = "h-8"
const HEAD_H = "h-[5.25rem]"

// "Same site, different date": a copy of the column one lunar day or one month later, or at a typed UTC time.
function DateMenu({ entry, colTimeMs }) {
  const mainMs = useStore(selectEffectiveTimeMs)
  const [custom, setCustom] = useState("")
  const [error, setError] = useState(null)
  const add = (shiftH) => {
    const r = duplicateCompare(entry.id, shiftH)
    setError(r.error ?? null)
  }
  return (
    <Popover onOpenChange={() => setError(null)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Same site, different date">
          <CalendarPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 text-sm">
        <p className="font-semibold">Same site, different date</p>
        <p className="text-xs text-muted-foreground">Adds a column for this site at another time: what if the landing slips?</p>
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" onClick={() => add(entry.shiftH + SYNODIC_MONTH_H)}>
            +1 lunar day ({formatDays(SYNODIC_MONTH_H)})
          </Button>
          <Button variant="outline" size="sm" onClick={() => add(entry.shiftH + monthShiftH(colTimeMs))}>
            +1 month (same date next month)
          </Button>
        </div>
        <form
          className="flex items-end gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const t = Date.parse(`${custom}:00Z`)
            if (!Number.isFinite(t)) return setError("Pick a date and time")
            add((t - mainMs) / HOUR_MS)
          }}
        >
          <label className="flex-1 text-xs text-muted-foreground">
            Another time (UTC)
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="mt-0.5 h-8 w-full rounded-md border bg-transparent px-2 text-sm text-foreground"
            />
          </label>
          <Button type="submit" size="sm" variant="outline">
            Add
          </Button>
        </form>
        {error && (
          <p className="text-xs text-lspb-warn" role="status">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ColumnHead({ entry, n, colTimeMs }) {
  const { pin, shiftH } = entry
  const name = pin.site?.name ?? "Site"
  return (
    <div className={cn(HEAD_H, "flex flex-col gap-0.5 border-b px-2 py-1.5")}>
      <div className="flex items-center gap-1.5">
        <span
          className="grid size-5 shrink-0 place-items-center rounded-full font-mono text-xs font-bold text-background"
          style={{ background: `var(--lspb-cmp-${entry.color + 1})` }}
          aria-hidden="true"
        >
          {n}
        </span>
        <button
          type="button"
          onClick={() => selectPlace(pin.lat, pin.lon, pin.site ?? null).catch(() => {})}
          className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          title={`Show ${name} on the map`}
        >
          {name}
        </button>
        <DateMenu entry={entry} colTimeMs={colTimeMs} />
        <Button variant="ghost" size="icon-xs" onClick={() => removeFromCompare(entry.id)} aria-label={`Remove ${name} from compare`}>
          <X />
        </Button>
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">{formatLatLon(pin.lat, pin.lon)}</p>
      <p className={cn("truncate font-mono text-xs tabular-nums", shiftH ? "text-lspb-sun" : "text-muted-foreground")}>
        {shiftH ? `${shiftH > 0 ? "+" : "−"}${formatDays(Math.abs(shiftH))} · ` : ""}
        {Number.isFinite(colTimeMs) ? `${formatClock(colTimeMs)} UTC` : ""}
      </p>
    </div>
  )
}

// One column: header, then one cell per row. `best` = set of row keys where this column glows.
function Column({ entry, n, res, values, best, colTimeMs }) {
  const busy = !res || res.status === "computing"
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      role="group"
      aria-label={`Column ${n}: ${entry.pin.site?.name ?? formatLatLon(entry.pin.lat, entry.pin.lon)}`}
      className="w-[72vw] max-w-72 shrink-0 snap-start border-l sm:w-56 lg:w-auto lg:max-w-none lg:min-w-44 lg:flex-1"
    >
      <ColumnHead entry={entry} n={n} colTimeMs={colTimeMs} />
      {ROWS.map((row) => {
        let content
        if (row.key === "terrain") content = <span className="rounded-sm border px-1.5 text-xs text-muted-foreground">{formatTerrain(entry.pin.terrainSource, entry.pin.resolutionM)}</span>
        else if (res?.status === "error") content = <span className="text-xs text-lspb-bad">Horizon failed</span>
        else if (busy && !values) content = <span className="block h-3 w-16 animate-pulse rounded bg-muted" aria-label="computing" />
        else if (!values) content = <span className="text-xs text-lspb-warn">outside the ephemeris</span>
        else content = row.show(values)
        const glow = best.has(row.key)
        return (
          <div key={row.key} className={cn(ROW_H, "flex items-center px-2 font-mono text-sm tabular-nums", busy && values && "opacity-60")}>
            <span className="sr-only">{row.label}: </span>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 transition-shadow duration-300",
                glow && "bg-lspb-ok/15 font-semibold shadow-[0_0_10px_color-mix(in_srgb,var(--lspb-ok)_55%,transparent)] ring-1 ring-lspb-ok/60",
              )}
            >
              {content}
              {glow && <span className="sr-only"> (best)</span>}
            </span>
          </div>
        )
      })}
    </motion.div>
  )
}

function Presets({ className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {COMPARE_PRESETS.map((p) => (
        <Button key={p.id} variant="outline" size="xs" onClick={() => loadComparePreset(p.id).catch(() => {})} title={p.detail}>
          {p.label}
        </Button>
      ))}
    </div>
  )
}

// The scrolling body is position: relative so the cells' absolutely positioned sr-only labels stay inside it
// (otherwise they widen the page on a phone).
// Compare drawer (below the planner, above the time bar): one column per compared site, the best value in
// each row glows. Slides up when the first site is added; collapses to its header bar. On a phone the columns
// are a horizontal swipe carousel (snap points), with the row labels pinned on the left.
export default function CompareDrawer() {
  const compare = useStore((s) => s.compare)
  const results = useStore((s) => s.compareResults)
  const missionH = useStore((s) => s.missionH)
  const mainMs = useStore(selectEffectiveTimeMs)
  const [open, setOpen] = useState(true)
  // A column added while collapsed opens the drawer again (state adjusted during render, not in an effect).
  const [seenCount, setSeenCount] = useState(compare.length)
  if (compare.length !== seenCount) {
    setSeenCount(compare.length)
    if (compare.length > seenCount) setOpen(true)
  }

  const cols = compare.map((entry) => {
    const res = results[entry.id]
    return { entry, res, values: res?.results ? compareValues(res.results, res.slope, missionH) : null, colTimeMs: res?.tMs ?? mainMs + entry.shiftH * HOUR_MS }
  })
  const best = cols.map(() => new Set())
  for (const row of ROWS) {
    if (!row.better) continue
    for (const i of bestColumns(cols.map((c) => c.values?.[row.key] ?? null), row.better)) best[i].add(row.key)
  }

  return (
    <section aria-label="Compare sites" className="shrink-0 border-t bg-background" data-testid="compare-drawer">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!compare.length}
          aria-expanded={compare.length ? open : undefined}
          aria-controls="compare-body"
          className="flex items-center gap-1.5 rounded-sm text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
        >
          <GitCompareArrows className="size-4 text-lspb-sun" aria-hidden="true" />
          Compare
          <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">
            {compare.length}/{COMPARE_MAX}
          </span>
          {compare.length > 0 && (open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronUp className="size-4" aria-hidden="true" />)}
        </button>
        {!compare.length && <span className="text-xs text-muted-foreground">Pick a site and press + Compare, or try:</span>}
        <Presets />
        {compare.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            Shares and hours over the {formatDays(missionH)} mission from each column&apos;s time
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && compare.length > 0 && (
          <motion.div
            id="compare-body"
            key="body"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="relative max-h-[min(24rem,40dvh)] overflow-auto border-t lg:max-h-[min(22rem,34dvh)]"
          >
            <div className="flex snap-x snap-mandatory">
              <div className="sticky left-0 z-10 w-28 shrink-0 bg-background sm:w-36" aria-hidden="true">
                <div className={cn(HEAD_H, "border-b")} />
                {ROWS.map((row) => (
                  <div key={row.key} className={cn(ROW_H, "flex items-center px-3 text-xs text-muted-foreground")}>
                    {row.label}
                  </div>
                ))}
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                {cols.map((c, i) => (
                  <Column key={c.entry.id} entry={c.entry} n={i + 1} res={c.res} values={c.values} best={best[i]} colTimeMs={c.colTimeMs} />
                ))}
              </AnimatePresence>
              {compare.length < 2 && (
                <p className="flex w-48 shrink-0 items-center border-l px-4 text-xs text-muted-foreground">
                  Pick another site (globe, Polar HD map or search) and press + Compare.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
