import { CircleHelp, ExternalLink, Moon } from "lucide-react"
import SearchDialog from "@/components/SearchDialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  SLOPE_NASA_LIMIT_DEG,
  SLOPE_POSSIBLE_MAX_DEG,
  ratingThresholds,
} from "@/engine/ratings.js"
import { formatDays } from "@/lib/format.js"
import { useStore } from "@/state.js"

// Links open in a new tab on click only. Full citations are in the README.
const SOURCES = [
  ["NASA Moon Trek: LRO WAC global mosaic (globe imagery)", "https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon"],
  ["NASA: candidate Artemis III landing regions (6.5 day stay)", "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"],
  ["NASA briefing: slope and visibility screening (NTRS 20230005904)", "https://ntrs.nasa.gov/api/citations/20230005904/downloads/PlatteCity_Artemis.pdf"],
  ["LOLA 20 m south pole terrain (NASA GSFC PGDA)", "https://pgda.gsfc.nasa.gov/products/90"],
  ["LOLA global terrain LDEM_16 (NASA PDS)", "https://pds-geosciences.wustl.edu/missions/lro/lola.htm"],
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
  const missionH = useStore((s) => s.missionH)
  const t = ratingThresholds(missionH)
  const pct = `${Math.round(t.earthGoodMinFraction * 100)}%`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="About and help">
          <CircleHelp /> <span className="hidden sm:inline">About</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(36rem,80dvh)] w-96 max-w-[calc(100vw-2rem)] space-y-4 overflow-y-auto text-sm">
        <p className="text-xs text-muted-foreground">NASA Space Apps 2026 challenge: Lunar Landing Site Navigator.</p>
        <p>
          Spin the Moon, pick a mission site or any point, and a landing date. The cards rate the site for a{" "}
          {formatDays(missionH)} crewed-class stay. South of 84°S the numbers use 120 m terrain (Polar HD); elsewhere
          ~1.9 km terrain (Global).
        </p>
        <Section title="Ratings">
          <ul className="space-y-1">
            <li>
              <span className="font-semibold text-lspb-sun">Sun:</span> Perfect with {formatDays(t.sunPerfectMinH)}+ of continuous
              sunlight from landing, Good with {formatDays(t.sunGoodMinH)}+.
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
              <Kbd>V</Kbd> switch Globe / Polar HD / Surface
            </li>
            <li>
              <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> (<Kbd>⌘</Kbd> <Kbd>K</Kbd> on a Mac) search sites or type coordinates, e.g. 0.674N 23.473E
            </li>
            <li>
              Globe: <Kbd>←↑→↓</Kbd> rotate, <Kbd>+</Kbd> <Kbd>−</Kbd> zoom, <Kbd>Enter</Kbd> place the pin at the centre.
              Mouse: drag to rotate, wheel to zoom, right-drag to tilt
            </li>
            <li>
              Polar HD map: <Kbd>←↑→↓</Kbd> pan, <Kbd>+</Kbd> <Kbd>−</Kbd> zoom, <Kbd>Enter</Kbd> place the pin at the centre
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

// Top app bar: product name, site search (Ctrl-K / Cmd-K) and the About / Help popover.
export default function AppBar() {
  return (
    <header className="flex h-(--lspb-appbar-h) shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Moon className="size-5 shrink-0 text-lspb-sun" aria-hidden="true" />
        <h1 className="truncate font-heading text-base font-semibold">Lunar Mission Planner</h1>
        <span className="hidden truncate text-xs text-muted-foreground md:inline">Lunar Landing Site Navigator</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <SearchDialog />
        <About />
      </div>
    </header>
  )
}
