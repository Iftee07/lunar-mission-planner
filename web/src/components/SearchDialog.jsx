import { useEffect, useMemo, useState } from "react"
import { Crosshair, MapPin, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { looksLikeCoordinates, parseLatLon } from "@/lib/coords.js"
import { formatLatLon } from "@/lib/format.js"
import { searchSites, statusText } from "@/lib/siteSearch.js"
import { POLAR_HD_LAT_LIMIT_DEG } from "@/engine/terrain.js"
import { loadSites, selectPlace } from "@/state.js"

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const SHORTCUT = isMac ? "⌘K" : "Ctrl K"

// One result row: a curated site, or "Go to" typed coordinates.
function Option({ id, active, onPick, onHover, children }) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()} // keep focus in the input
      onClick={onPick}
      onMouseMove={onHover}
      className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      {children}
    </li>
  )
}

// Search sites (Ctrl-K / Cmd-K, or the app-bar button): results grouped by category with their status;
// typed coordinates ("0.674N 23.473E", "-89.45, 222.7") go anywhere on the Moon. Picking flies the globe
// there, or pans the Polar HD map when that is the open view (state.js selectPlace).
export default function SearchDialog() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [sites, setSites] = useState(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (open && !sites) loadSites().then(setSites)
  }, [open, sites])

  const coords = useMemo(() => (looksLikeCoordinates(query) ? parseLatLon(query) : null), [query])
  const groups = useMemo(() => searchSites(sites || [], query), [sites, query])
  // Flat list for the arrow keys: the typed coordinates first, then the sites in group order.
  const options = useMemo(() => {
    const list = []
    if (coords?.ok) list.push({ key: "coords", lat: coords.lat, lon: coords.lon, site: null })
    for (const g of groups) for (const p of g.items) list.push({ key: p.site.id, lat: p.site.lat, lon: p.site.lon, site: p.site })
    return list
  }, [coords, groups])
  const current = Math.min(active, options.length - 1)

  const pick = (o) => {
    setOpen(false)
    setQuery("")
    setActive(0)
    selectPlace(o.lat, o.lon, o.site).catch(() => {}) // a terrain-tier error shows in <DataStatus>
  }

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      if (!options.length) return
      const step = e.key === "ArrowDown" ? 1 : -1
      setActive((current + step + options.length) % options.length)
    } else if (e.key === "Enter" && options[current]) {
      e.preventDefault()
      pick(options[current])
    }
  }

  const optionId = (o) => `search-opt-${o.key}`
  const indexOf = (key) => options.findIndex((o) => o.key === key)

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Search sites or go to coordinates" aria-keyshortcuts="Control+K Meta+K">
        <Search /> <span className="hidden sm:inline">Search sites</span>
        <kbd className="hidden rounded border px-1 font-mono text-[0.7rem] text-muted-foreground md:inline">{SHORTCUT}</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setActive(0)
        }}
      >
        <DialogContent className="flex max-h-[76dvh] flex-col overflow-hidden">
          <DialogTitle className="sr-only">Search sites or go to coordinates</DialogTitle>
          <DialogDescription className="sr-only">
            Type a site name, or a latitude and longitude such as 0.674N 23.473E. Arrow keys choose, Enter goes there.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Apollo 11, Shackleton, or 89.45S 137.3W"
              role="combobox"
              aria-expanded="true"
              aria-controls="search-results"
              aria-activedescendant={options[current] ? optionId(options[current]) : undefined}
              aria-invalid={coords && !coords.ok ? true : undefined}
              aria-describedby={coords && !coords.ok ? "search-coord-error" : undefined}
              aria-label="Site name or coordinates"
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
          {coords && !coords.ok && (
            <p id="search-coord-error" className="border-b px-3 py-2 text-xs text-lspb-warn" aria-live="polite">
              {coords.error}
            </p>
          )}
          <ul id="search-results" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {coords?.ok && (
              <Option id={optionId(options[0])} active={current === 0} onPick={() => pick(options[0])} onHover={() => setActive(0)}>
                <Crosshair className="mt-0.5 size-4 shrink-0 text-lspb-sun" aria-hidden="true" />
                <span className="flex-1">
                  Go to <span className="font-mono tabular-nums">{formatLatLon(coords.lat, coords.lon)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {coords.lat <= POLAR_HD_LAT_LIMIT_DEG ? "Polar HD terrain (120 m)" : "Global terrain (~1.9 km)"}
                  </span>
                </span>
              </Option>
            )}
            {groups.map((g) => (
              <li key={g.group.id} role="presentation">
                <p className="px-2 pt-2 pb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase" aria-hidden="true">
                  {g.group.label}
                </p>
                <ul role="group" aria-label={g.group.label}>
                  {g.items.map(({ site }) => {
                    const i = indexOf(site.id)
                    return (
                      <Option key={site.id} id={optionId(options[i])} active={current === i} onPick={() => pick(options[i])} onHover={() => setActive(i)}>
                        <MapPin className="mt-0.5 size-4 shrink-0" style={{ color: `var(--lspb-${g.group.token})` }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{site.name}</span>
                          {!site.verified && <span className="ml-2 rounded-sm border border-lspb-warn/70 px-1 text-xs text-lspb-warn">unverified</span>}
                          <span className="block text-xs text-muted-foreground">
                            {statusText(site)}
                            {site.mission_date ? ` · ${site.mission_date}` : ""}
                          </span>
                        </span>
                        <span className="hidden shrink-0 pt-0.5 font-mono text-xs sm:inline text-muted-foreground tabular-nums">{formatLatLon(site.lat, site.lon)}</span>
                      </Option>
                    )
                  })}
                </ul>
              </li>
            ))}
            {sites && !options.length && !(coords && !coords.ok) && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">No site matches. Type coordinates to go anywhere on the Moon.</li>
            )}
            {!sites && <li className="px-2 py-6 text-center text-sm text-muted-foreground">Loading sites…</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
