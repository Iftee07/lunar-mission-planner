import { useMemo, useState } from "react"
import { CalendarDays } from "lucide-react"
import { labelDayButton } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { siteAccessor } from "@/engine/data.js"
import { EARTH_DAY_MIN_VISIBLE_H, EARTH_DAY_STEP_H, earthVisibleDays } from "@/engine/earthDays.js"
import { formatClock, formatDays } from "@/lib/format.js"
import { EPHEMERIS_END_UTC_MS, EPHEMERIS_START_UTC_MS, HOUR_MS, getEngineData, useStore } from "@/state.js"

// Start date and time editor, all in UTC: calendar days are UTC days and the time is a 24-hour UTC
// clock. (The UTC offset select only changes the local time shown beside the slider.)
// Calendar dates are plain labels: a Date(y, m, d) in the browser zone stands for UTC day d of month m.
const pad = (n) => String(n).padStart(2, "0")

function utcParts(ms) {
  const d = new Date(ms)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }
}
const formatHHMM = (ms) => {
  const p = utcParts(ms)
  return `${pad(p.hh)}:${pad(p.mm)}`
}

// "21:30", "2130", "9:05" -> { hh, mm } or null.
function parseHHMM(text) {
  const m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(text)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  return hh <= 23 && mm <= 59 ? { hh, mm } : null
}

// A UTC day is selectable only if every sample of it is inside the ephemeris.
function dayInEphemeris(date) {
  const startMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return startMs >= EPHEMERIS_START_UTC_MS && startMs + (24 - EARTH_DAY_STEP_H) * HOUR_MS <= EPHEMERIS_END_UTC_MS
}

// Trigger shows the start time; the popover holds the calendar (days with Earth above the horizon for
// >= 1 h at the pin are green) and the UTC time field. Changing either resets the slider (setBaseTime).
export default function DatePicker() {
  const baseTimeUtcMs = useStore((s) => s.baseTimeUtcMs)
  const pin = useStore((s) => s.pin)
  const antennaM = useStore((s) => s.antennaM)
  const horizonEarth = useStore((s) => s.results.horizonEarth)
  const setBaseTime = useStore((s) => s.setBaseTime)

  const [open, setOpen] = useState(false)
  const sel = utcParts(baseTimeUtcMs)
  const selected = new Date(sel.y, sel.m, sel.d)
  const [month, setMonth] = useState(selected)

  // Draft text so a half-typed time does not fight the controlled value.
  // Re-sync it when the start time changes elsewhere (adjusting state during render, no effect).
  const [timeDraft, setTimeDraft] = useState(() => formatHHMM(baseTimeUtcMs))
  const [draftFor, setDraftFor] = useState(baseTimeUtcMs)
  if (draftFor !== baseTimeUtcMs) {
    setDraftFor(baseTimeUtcMs)
    setTimeDraft(formatHHMM(baseTimeUtcMs))
  }
  const timeValid = parseHHMM(timeDraft) !== null

  const start = utcParts(EPHEMERIS_START_UTC_MS)
  const end = utcParts(EPHEMERIS_END_UTC_MS)

  // Visible hours per UTC day of the displayed month; recomputed on month, pin or antenna change.
  const year = month.getFullYear()
  const month0 = month.getMonth()
  const hoursByDay = useMemo(() => {
    const data = getEngineData()
    if (!open || !pin || !horizonEarth || !data) return null
    return earthVisibleDays(year, month0, horizonEarth, siteAccessor(data.ephemeris, pin), 0, antennaM)
  }, [open, year, month0, pin, horizonEarth, antennaM])

  const visibleHoursOf = (date) =>
    hoursByDay && date.getFullYear() === year && date.getMonth() === month0 ? hoursByDay.get(date.getDate()) : null
  const isEarthDay = (date) => (visibleHoursOf(date) ?? 0) >= EARTH_DAY_MIN_VISIBLE_H

  const onOpenChange = (next) => {
    if (next) setMonth(new Date(sel.y, sel.m, 1))
    setOpen(next)
  }

  // Picking a day keeps the time of day.
  const onSelect = (date) => {
    if (date) setBaseTime(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), sel.hh, sel.mm))
  }

  // Commit a parsed time; a bad entry snaps back to the current start time.
  const commitTime = (text) => {
    const t = parseHHMM(text)
    if (t) setBaseTime(Date.UTC(sel.y, sel.m, sel.d, t.hh, t.mm))
    setTimeDraft(t ? `${pad(t.hh)}:${pad(t.mm)}` : formatHHMM(baseTimeUtcMs))
  }
  // While typing, commit only once the entry is complete ("21:30" or "2130").
  const onTimeChange = (text) => {
    setTimeDraft(text)
    if (/^\d{2}:?\d{2}$/.test(text) && parseHHMM(text)) commitTime(text)
  }

  let note = null
  if (!pin) note = "Click the map to mark Earth-visible days."
  else if (!horizonEarth) note = "Computing the Earth horizon…"

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="font-mono tabular-nums" aria-label={`Start ${formatClock(baseTimeUtcMs)} UTC. Change date and time`}>
          <CalendarDays />
          {formatClock(baseTimeUtcMs)}
          <span className="hidden sm:inline">UTC</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-auto p-3">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={onSelect}
          month={month}
          onMonthChange={setMonth}
          startMonth={new Date(start.y, start.m, 1)}
          endMonth={new Date(end.y, end.m, 1)}
          disabled={(date) => !dayInEphemeris(date)}
          modifiers={{ earthVisible: isEarthDay }}
          modifiersClassNames={{ earthVisible: "[&>button]:bg-lspb-ok/25 [&>button]:text-lspb-ok [&>button]:font-semibold" }}
          labels={{
            labelDayButton: (date, modifiers, options, dateLib) => {
              const base = labelDayButton(date, modifiers, options, dateLib)
              const h = visibleHoursOf(date)
              if (h === null || h === undefined) return base
              return modifiers.earthVisible
                ? `${base}, Earth above the horizon for ${formatDays(h, 2)}`
                : `${base}, Earth below the horizon all day`
            },
          }}
        />
        <label className="mt-2 flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span>
            Time <span className="text-muted-foreground">(UTC, 24-hour)</span>
          </span>
          <Input
            value={timeDraft}
            onChange={(e) => onTimeChange(e.target.value)}
            onBlur={(e) => commitTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              commitTime(e.currentTarget.value)
              setOpen(false)
            }}
            inputMode="numeric"
            maxLength={5}
            placeholder="HH:MM"
            aria-label="Start time, UTC, 24-hour, HH:MM"
            aria-invalid={!timeValid}
            className="h-8 w-20 text-center font-mono tabular-nums"
          />
        </label>
        <div className="mt-3 space-y-1 border-t pt-2 text-xs">
          <p className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm border border-lspb-ok bg-lspb-ok/25" aria-hidden="true" />
            Earth above the horizon (at least 1 hour that UTC day)
          </p>
          {note && <p className="text-muted-foreground">{note}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
