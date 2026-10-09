import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { Separator } from "@/components/ui/separator"
import { formatAz, formatClock, formatDeg, formatHours, formatLatLon } from "@/lib/format.js"
import { cn } from "@/lib/utils"
import {
  ANTENNA_MAX_M,
  ANTENNA_PRESETS_M,
  COMM_RED_MIN_FRACTION,
  EPHEMERIS_END_UTC_MS,
  EPHEMERIS_START_UTC_MS,
  LANDING_RADIUS_M,
  LIGHT_GREEN_MIN_H,
  SLOPE_GREEN_MAX_DEG,
  SLOPE_RED_MIN_DEG,
  SLOPE_TYPICAL_ERROR_DEG,
  WINDOW_H,
  selectOutOfRange,
  useStore,
} from "@/state.js"

const TONE = {
  ok: "bg-lspb-ok text-background",
  warn: "bg-lspb-warn text-background",
  bad: "bg-lspb-bad text-background",
}

function Status({ tone, children }) {
  return <Badge className={cn("rounded-sm font-bold", TONE[tone])}>{children}</Badge>
}

function Section({ title, badge, children }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs tracking-wider text-muted-foreground uppercase">{title}</h3>
        {badge}
      </div>
      <div className="space-y-0.5 text-sm">{children}</div>
    </section>
  )
}

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-3">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right tabular-nums">{children}</span>
  </div>
)

// Status sentence for one body (PRD 5.5 card text). words = { on, off, onShort, offShort }.
function periodText(r, w) {
  const limit = r.lookaheadTruncated ? "through the end of the ephemeris (2030)" : "for more than 1500 h"
  if (r.visibleNow) {
    if (r.hoursToChange === null) return `${w.on}, continuously ${limit}`
    const then = r.nextPeriodHours === null ? `then ${w.offShort} ${limit}` : `then ${formatHours(r.nextPeriodHours)} ${w.offShort}`
    return `${w.on}, ${formatHours(r.hoursToChange)} ${w.left}, ${then}`
  }
  if (r.hoursToChange === null) return `${w.off} ${limit}`
  const then = r.nextPeriodHours === null ? `then ${w.onShort} ${limit}` : `then ${formatHours(r.nextPeriodHours)} ${w.onShort}`
  return `${w.off}, ${formatHours(r.hoursToChange)} until ${w.until}, ${then}`
}

const LIGHT_WORDS = { on: "Lit", off: "Dark", left: "of light left", until: "light", onShort: "of light", offShort: "dark" }
const EARTH_WORDS = {
  on: "Earth in view",
  off: "Earth below horizon",
  left: "left",
  until: "in view",
  onShort: "in view",
  offShort: "below horizon",
}

function lightTone(r) {
  if (!r.visibleNow) return ["bad", "Dark"]
  if (r.continuous || (r.hoursToChange !== null && r.hoursToChange >= LIGHT_GREEN_MIN_H)) return ["ok", `Lit ≥ ${LIGHT_GREEN_MIN_H} h`]
  return ["warn", `Lit < ${LIGHT_GREEN_MIN_H} h`]
}

function commTone(r) {
  const total = r.windowVisibleHours + r.windowHiddenHours
  const frac = total > 0 ? r.windowVisibleHours / total : 0
  const pct = `${Math.round(COMM_RED_MIN_FRACTION * 100)}%`
  return frac < COMM_RED_MIN_FRACTION ? ["bad", `Earth < ${pct} of ${WINDOW_H} h`] : ["ok", `Earth ≥ ${pct} of ${WINDOW_H} h`]
}

function landingVerdict(planeDeg) {
  if (!Number.isFinite(planeDeg)) return ["bad", "No slope data"]
  if (planeDeg < SLOPE_GREEN_MAX_DEG) return ["ok", "Landing possible"]
  if (planeDeg < SLOPE_RED_MIN_DEG) return ["warn", "Marginal (within slope error)"]
  return ["bad", "Not ideal"]
}

function BodyBlock({ title, r, words, tone }) {
  if (!r) return null
  const [t, label] = tone(r)
  return (
    <Section title={title} badge={<Status tone={t}>{label}</Status>}>
      <p>{periodText(r, words)}</p>
      <Row label={`Next ${WINDOW_H} h`}>
        {formatHours(r.windowVisibleHours)} {words === LIGHT_WORDS ? "lit" : "in view"} / {formatHours(r.windowHiddenHours)}{" "}
        {words === LIGHT_WORDS ? "dark" : "hidden"}
      </Row>
    </Section>
  )
}

function AntennaControl() {
  const antennaM = useStore((s) => s.antennaM)
  const setAntenna = useStore((s) => s.setAntenna)
  const [draft, setDraft] = useState(String(antennaM))
  useEffect(() => setDraft(String(antennaM)), [antennaM])
  const preset = ANTENNA_PRESETS_M.includes(antennaM) ? String(antennaM) : null

  return (
    <div className="flex items-center gap-2">
      <SegmentedControl size="sm" value={preset} onValueChange={(v) => setAntenna(Number(v))} aria-label="Antenna height presets">
        {ANTENNA_PRESETS_M.map((m) => (
          <SegmentedControlItem key={m} value={String(m)}>
            {m} m
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <Input
        type="number"
        min={0}
        max={ANTENNA_MAX_M}
        step={0.5}
        className="h-8 w-20"
        aria-label="Antenna height (m)"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== "" && v >= 0 && v <= ANTENNA_MAX_M) setAntenna(v)
        }}
      />
    </div>
  )
}

export default function InfoCard() {
  const dataReady = useStore((s) => s.dataReady)
  const dataError = useStore((s) => s.dataError)
  const pin = useStore((s) => s.pin)
  const outOfRange = useStore(selectOutOfRange)
  const results = useStore((s) => s.results)

  let body
  if (dataError) body = <p className="text-sm text-lspb-bad">Data failed to load: {dataError}</p>
  else if (!dataReady) body = <p className="text-sm text-muted-foreground">Loading data&hellip;</p>
  else if (!pin) body = <p className="text-sm">Click the map to choose a point</p>
  else if (outOfRange)
    body = (
      <p className="text-sm text-lspb-warn">
        Date outside ephemeris range ({formatClock(EPHEMERIS_START_UTC_MS)} to {formatClock(EPHEMERIS_END_UTC_MS)} UTC)
      </p>
    )
  else {
    const [landTone, landLabel] = landingVerdict(results.slope?.planeDeg)
    const busy = results.status === "computing" || !results.horizon
    body = (
      <>
        <Section title="Position">
          <p className="tabular-nums">{formatLatLon(pin.lat, pin.lon)}</p>
          <Row label="Ground elevation">{pin.groundM.toFixed(1)} m</Row>
        </Section>
        <Separator />
        {results.status === "error" ? (
          <p className="text-sm text-lspb-bad">Horizon failed: {results.error}</p>
        ) : busy ? (
          <p className="text-sm text-muted-foreground">Computing horizon&hellip;</p>
        ) : (
          <>
            <BodyBlock title="Light" r={results.sun} words={LIGHT_WORDS} tone={lightTone} />
            <Separator />
            <BodyBlock title="Communication" r={results.earth} words={EARTH_WORDS} tone={commTone} />
          </>
        )}
        <Separator />
        {results.slope && (
          <Section title="Slope">
            <Row label={`Plane fit (${LANDING_RADIUS_M} m radius)`}>{results.slope.planeDeg.toFixed(2)}&deg;</Row>
            <Row label={`Steepest inside ${LANDING_RADIUS_M} m`}>{results.slope.maxDeg.toFixed(2)}&deg;</Row>
          </Section>
        )}
        <Section title="Landing" badge={<Status tone={landTone}>{landLabel}</Status>}>
          <p className="text-xs text-muted-foreground">
            Radius {LANDING_RADIUS_M} m. Slope only: boulders and small craters not covered; typical slope error about{" "}
            {SLOPE_TYPICAL_ERROR_DEG} deg.
          </p>
        </Section>
        <Separator />
        {!busy && results.sunNow && results.earthNow && (
          <Section title="Sun, Earth now">
            <Row label={<span className="text-lspb-sun">Sun</span>}>
              el {formatDeg(results.sunNow.elDeg, 2)} az {formatAz(results.sunNow.azDeg)}
            </Row>
            <Row label={<span className="text-lspb-earth">Earth</span>}>
              el {formatDeg(results.earthNow.elDeg, 2)} az {formatAz(results.earthNow.azDeg)}
            </Row>
          </Section>
        )}
      </>
    )
  }

  return (
    <Card className="gap-4 rounded-none border-0 shadow-none" data-testid="info-card">
      <CardHeader>
        <CardTitle>Lunar South Pole Browser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {body}
        <Separator />
        <Section title="Antenna height">
          <AntennaControl />
        </Section>
      </CardContent>
    </Card>
  )
}
