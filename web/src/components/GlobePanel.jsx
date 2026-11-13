import { useEffect, useRef, useState } from "react"
import { Check, Eye, Layers, Map as MapIcon, Minus, Plus, TriangleAlert, WifiOff } from "lucide-react"
import CheckRow from "@/components/CheckRow"
import DataStatus from "@/components/DataStatus"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { createGlobe } from "@/view/globe.js"
import { SITE_GROUPS } from "@/view/globeModel.js"
import { ringMarkers } from "@/view/ringModel.js"
import { readTheme } from "@/lib/theme.js"
import { COMPARE_MAX } from "@/engine/compare.js"
import { addPlaceToCompare, getEngineData, globeUrls, goToLatLon, loadSites, selectEffectiveTimeMs, setPinLatLon, useStore } from "@/state.js"

const SIDE_TEXT = { near: "Near side (faces Earth)", far: "Far side (never faces Earth)", limb: "Limb (edge-on from Earth)" }

// "Open Polar HD map" shows once the view centre is this far south (the Polar HD map covers 84-90 S).
const POLAR_CHIP_LAT = -80

// Starts on the bundled texture without trying Moon Trek: ?offline=1, or the browser says it is offline.
const startOffline = () => new URLSearchParams(location.search).get("offline") === "1" || navigator.onLine === false
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

// Layers and legend (one popover): mission groups, crater names, lat/lon grid, South Pole HD opacity.
function LayersMenu({ apiRef, sites }) {
  const [groups, setGroups] = useState(() => Object.fromEntries(SITE_GROUPS.map((g) => [g.id, true])))
  const [labels, setLabels] = useState(true)
  const [grid, setGrid] = useState(false)
  const [polarHd, setPolarHd] = useState(85)
  const count = (id) => sites.filter((p) => p.group.id === id).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="bg-background/90" aria-label="Layers and legend">
          <Layers /> <span className="hidden sm:inline">Layers</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-3 text-sm">
        <section className="space-y-1" aria-labelledby="globe-legend-title">
          <h3 id="globe-legend-title" className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Mission sites
          </h3>
          {SITE_GROUPS.map((g) => (
            <CheckRow
              key={g.id}
              checked={groups[g.id]}
              onChange={(on) => {
                setGroups((s) => ({ ...s, [g.id]: on }))
                apiRef.current?.setGroupVisible(g.id, on)
              }}
            >
              <span className="size-3 shrink-0 rounded-full border border-background" style={{ background: `var(--lspb-${g.token})` }} aria-hidden="true" />
              <span className="flex-1">{g.label}</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{count(g.id)}</span>
            </CheckRow>
          ))}
          <p className="text-xs text-muted-foreground">Hover a pin for its name; click to fly there.</p>
        </section>
        <section className="space-y-1 border-t pt-3">
          <CheckRow
            checked={labels}
            onChange={(on) => {
              setLabels(on)
              apiRef.current?.setLabelsVisible(on)
            }}
          >
            Crater and feature names (IAU)
          </CheckRow>
          <CheckRow
            checked={grid}
            onChange={(on) => {
              setGrid(on)
              apiRef.current?.setGridVisible(on)
            }}
          >
            Latitude / longitude grid
          </CheckRow>
        </section>
        <section className="space-y-2 border-t pt-3">
          <div className="flex items-baseline justify-between">
            <span id="polar-hd-label">South Pole HD overlay</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{polarHd}%</span>
          </div>
          <Slider
            aria-labelledby="polar-hd-label"
            min={0}
            max={100}
            step={5}
            value={[polarHd]}
            onValueChange={([v]) => {
              setPolarHd(v)
              apiRef.current?.setPolarHdOpacity(v / 100)
            }}
          />
          <p className="text-xs text-muted-foreground">120 m LOLA terrain shading, 84°S to the pole. Fades in as you zoom in.</p>
        </section>
      </PopoverContent>
    </Popover>
  )
}

// "+ Compare" in a mission pin's tooltip.
function TooltipCompare({ site }) {
  const inList = useStore((s) => s.compare.some((c) => c.pin.lat === site.lat && c.pin.lon === site.lon && c.shiftH === 0))
  const full = useStore((s) => s.compare.length >= COMPARE_MAX)
  return (
    <Button
      variant="outline"
      size="xs"
      className="mt-1.5"
      disabled={inList || full}
      onClick={() => addPlaceToCompare(site.lat, site.lon, site).catch(() => {})}
    >
      {inList ? <Check /> : <Plus />} {inList ? "In compare" : full ? `Compare is full (${COMPARE_MAX})` : "Compare"}
    </Button>
  )
}

// The 3D globe view (lazy chunk with CesiumJS). Owns the Cesium container: createGlobe once the core data is
// ready, destroy in cleanup (StrictMode-safe). Stays mounted when hidden so the camera persists; it renders
// only while active.
export default function GlobePanel({ active }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const dataReady = useStore((s) => s.dataReady)
  const hasPin = useStore((s) => s.pin !== null)
  const setView = useStore((s) => s.setView)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState(null)
  // A site's tooltip stays a moment after the pointer leaves the pin, and while the pointer is on it, so its
  // "+ Compare" button can be reached.
  const overTipRef = useRef(false)
  const hideRef = useRef(0)
  const onHover = (info) => {
    clearTimeout(hideRef.current)
    if (info) setHover(info)
    else hideRef.current = setTimeout(() => !overTipRef.current && setHover(null), 350)
  }
  const [view, setViewInfo] = useState({ side: "near", nearPole: false })
  const [imagery, setImagery] = useState("online")
  const [sites, setSites] = useState([])

  useEffect(() => {
    if (!dataReady) return
    let cancelled = false
    let api = null
    let unsubscribe = () => {}
    Promise.all([globeUrls(), loadSites()])
      .then(([urls, sitePins]) => {
        if (cancelled) return
        setSites(sitePins)
        const data = getEngineData()
        const offline = startOffline()
        if (offline) setImagery("offline")
        api = createGlobe(containerRef.current, {
          manifest: data.manifest,
          ephemeris: data.ephemeris,
          urls,
          sites: sitePins,
          offline,
          reducedMotion: prefersReducedMotion(),
          onPick: (lat, lon) => setPinLatLon(lat, lon).catch(() => {}), // a tier error shows in <DataStatus>
          onSelectSite: (site) => goToLatLon(site.lat, site.lon, site).catch(() => {}),
          onHover,
          onView: ({ lat, side }) =>
            setViewInfo((v) => {
              const nearPole = lat <= POLAR_CHIP_LAT
              return v.side === side && v.nearPole === nearPole ? v : { side, nearPole }
            }),
          onImagery: setImagery,
          onCamera: (cam) => useStore.getState().setCamera("globe", cam),
        })
        apiRef.current = api
        const s0 = useStore.getState()
        api.setTime(selectEffectiveTimeMs(s0))
        api.setPin(s0.pin)
        const compareItems = (list) => list.map((c, i) => ({ lat: c.pin.lat, lon: c.pin.lon, color: c.color, n: i + 1 }))
        api.setCompare(compareItems(s0.compare))
        const theme = readTheme()
        const ringItems = (s) => ringMarkers(s.sensitivity.points, s.ringMetric, theme)
        api.setRing(ringItems(s0))
        // a shared link's camera, else a site picked before the globe had loaded
        if (s0.camera.globe) api.setCamera(s0.camera.globe)
        else if (s0.focus) api.flyTo(s0.focus.lat, s0.focus.lon)
        api.setActive(useStore.getState().view === "globe")
        unsubscribe = useStore.subscribe((s, prev) => {
          if (s.pin !== prev.pin) api.setPin(s.pin)
          if (s.compare !== prev.compare) api.setCompare(compareItems(s.compare))
          if (s.sensitivity.points !== prev.sensitivity.points || s.ringMetric !== prev.ringMetric) api.setRing(ringItems(s))
          if (s.focus !== prev.focus && s.focus) api.flyTo(s.focus.lat, s.focus.lon)
          if (s.baseTimeUtcMs !== prev.baseTimeUtcMs || s.sliderOffsetH !== prev.sliderOffsetH) api.setTime(selectEffectiveTimeMs(s))
        })
        if (import.meta.env.DEV && window.lspb) window.lspb.globe = api
      })
      .catch((err) => {
        if (!cancelled) setError(String(err.message || err))
      })
    return () => {
      cancelled = true
      unsubscribe()
      api?.destroy()
      apiRef.current = null
    }
  }, [dataReady])

  useEffect(() => {
    apiRef.current?.setActive(active)
  }, [active])

  if (error) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-background p-6" style={{ display: active ? "grid" : "none" }}>
        <div role="alert" className="max-w-sm space-y-3 rounded-lg border p-5 text-sm">
          <p className="flex items-center gap-2 font-heading font-semibold text-lspb-bad">
            <TriangleAlert className="size-4" aria-hidden="true" /> The 3D globe could not start
          </p>
          <p className="font-mono text-xs break-words text-muted-foreground">{error}</p>
          <p className="text-muted-foreground">It needs WebGL. The Polar HD map and the surface view still work.</p>
          <Button variant="outline" size="sm" onClick={() => setView("polar")}>
            <MapIcon /> Open Polar HD map
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0" style={{ display: active ? "block" : "none" }} data-testid="globe-panel">
      <div ref={containerRef} className="lspb-globe absolute inset-0 overflow-hidden" data-testid="globe-container" />

      <div className="absolute top-3 right-3 z-(--lspb-z-map-ui) flex flex-col items-end gap-2">
        <LayersMenu apiRef={apiRef} sites={sites} />
        <div className="flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-xs" role="group" aria-label="Zoom">
          <Button variant="ghost" size="icon-sm" className="rounded-none" onClick={() => apiRef.current?.zoomIn()} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-none border-t" onClick={() => apiRef.current?.zoomOut()} aria-label="Zoom out">
            <Minus />
          </Button>
        </div>
      </div>

      {view.nearPole && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView("polar")}
          className="absolute top-14 left-1/2 z-(--lspb-z-map-ui) -translate-x-1/2 border-lspb-sun/70 bg-background/90"
        >
          <MapIcon /> Open Polar HD map
        </Button>
      )}

      <div className="pointer-events-none absolute bottom-24 left-3 z-(--lspb-z-map-ui) flex flex-col items-start gap-1.5 lg:bottom-8">
        {imagery === "offline" && (
          <span className="flex items-center gap-1.5 rounded-sm border border-lspb-warn/70 bg-background/90 px-2 py-0.5 text-xs text-lspb-warn" role="status">
            <WifiOff className="size-3.5" aria-hidden="true" /> Offline imagery
          </span>
        )}
        <span className="rounded-sm bg-background/80 px-2 py-0.5 text-xs text-muted-foreground" data-testid="moon-side">
          {SIDE_TEXT[view.side]}
        </span>
      </div>

      {hasPin && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView("surface")}
          className="absolute right-3 bottom-24 z-(--lspb-z-map-ui) bg-background/90 lg:bottom-8"
        >
          <Eye /> View from here
        </Button>
      )}

      {active && hover && (
        <div
          role="tooltip"
          className={`absolute z-(--lspb-z-map-ui) max-w-64 rounded-md border bg-background/95 px-2.5 py-1.5 text-sm shadow-md ${hover.site ? "" : "pointer-events-none"}`}
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          onPointerEnter={() => (overTipRef.current = true)}
          onPointerLeave={() => {
            overTipRef.current = false
            setHover(null)
          }}
        >
          <p className="font-semibold">{hover.title}</p>
          {hover.detail && <p className="text-xs text-muted-foreground">{hover.detail}</p>}
          {hover.note && <p className="text-xs text-lspb-warn">{hover.note}</p>}
          {hover.site && <TooltipCompare site={hover.site} />}
        </div>
      )}

      {active && (
        <div className="absolute inset-x-3 top-14 z-(--lspb-z-map-ui) mx-auto flex max-w-xs flex-col gap-2">
          <DataStatus tier="global" compact />
          <DataStatus tier="polar" compact />
        </div>
      )}
    </div>
  )
}
