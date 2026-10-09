import { CircleHelp, ExternalLink, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  EARTH_GOOD_MIN_FRACTION,
  MISSION_STAY_H,
  SLOPE_NASA_LIMIT_DEG,
  SLOPE_POSSIBLE_MAX_DEG,
  SUN_PERFECT_MIN_H,
} from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"

// Links open in a new tab on click only; nothing is fetched at runtime. Full citations are in the README.
const SOURCES = [
  ["NASA: candidate Artemis III landing regions (6.5 day stay)", "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"],
  ["NASA briefing: slope and visibility screening (NTRS 20230005904)", "https://ntrs.nasa.gov/api/citations/20230005904/downloads/PlatteCity_Artemis.pdf"],
  ["LOLA 20 m south pole terrain (NASA GSFC PGDA)", "https://pgda.gsfc.nasa.gov/products/90"],
  ["NAIF SPICE kernels (Sun and Earth positions)", "https://naif.jpl.nasa.gov/naif/data.html"],
  ["IAU Gazetteer of Planetary Nomenclature (crater names)", "https://planetarynames.wr.usgs.gov"],
]

function Section({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Kbd({ children }) {
  return <kbd className="rounded border px-1 font-mono text-xs">{children}</kbd>
}

function About() {
  const pct = `${Math.round(EARTH_GOOD_MIN_FRACTION * 100)}%`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="About and help">
          <CircleHelp /> <span className="hidden sm:inline">About</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(36rem,80dvh)] w-96 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto text-sm">
        <p>
          Pick a point near the lunar south pole and a landing date. The cards rate the site for a{" "}
          {formatDays(MISSION_STAY_H)} crewed-class stay.
        </p>
        <Section title="Ratings">
          <ul className="space-y-1">
            <li>
              <span className="font-semibold text-lspb-sun">Sun:</span> Perfect with {formatDays(SUN_PERFECT_MIN_H)}+ of continuous
              sunlight from landing, Good with {formatDays(MISSION_STAY_H)}+.
            </li>
            <li>
              <span className="font-semibold text-lspb-earth">Earth:</span> Perfect if in view for the whole stay, Good if in view
              at least {pct} of it.
            </li>
            <li>
              <span className="font-semibold">Landing:</span> Possible under {SLOPE_POSSIBLE_MAX_DEG}° fitted slope within 100 m
              (NASA&apos;s limit is {SLOPE_NASA_LIMIT_DEG}°).
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">Each badge&apos;s (?) explains its rule with live numbers.</p>
        </Section>
        <Section title="Units">
          <p>Durations in Earth days (d). All times are UTC.</p>
        </Section>
        <Section title="Keyboard">
          <ul className="space-y-1">
            <li>
              <Kbd>V</Kbd> switch Map / Surface
            </li>
            <li>
              Map: <Kbd>←↑→↓</Kbd> pan, <Kbd>+</Kbd> <Kbd>−</Kbd> zoom, <Kbd>Enter</Kbd> place the pin at the centre
            </li>
            <li>
              Surface: <Kbd>←↑→↓</Kbd> look around, <Kbd>+</Kbd> <Kbd>−</Kbd> zoom
            </li>
          </ul>
        </Section>
        <Section title="Sources">
          <ul className="space-y-1">
            {SOURCES.map(([label, href]) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 underline-offset-4 hover:underline">
                  {label} <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Full citations and licences are in the README.</p>
        </Section>
      </PopoverContent>
    </Popover>
  )
}

// Top app bar: product name and the About / Help popover.
export default function AppBar() {
  return (
    <header className="flex h-(--lspb-appbar-h) shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Moon className="size-5 shrink-0 text-lspb-sun" aria-hidden="true" />
        <h1 className="truncate font-heading text-base font-semibold">Lunar Mission Planner</h1>
        <span className="hidden truncate text-xs text-muted-foreground md:inline">South pole landing sites</span>
      </div>
      <About />
    </header>
  )
}
