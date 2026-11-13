import { useEffect, useRef, useState } from "react"
import { CircleDashed, Layers, LoaderCircle } from "lucide-react"
import CheckRow from "@/components/CheckRow"
import DataStatus from "@/components/DataStatus"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { Why, WhyPanel } from "@/components/why/Why"
import { layerWhy } from "@/lib/explanations.js"
import { SLOPE_NASA_LIMIT_DEG, SLOPE_POSSIBLE_MAX_DEG } from "@/engine/ratings.js"
import { POLAR_HD_LAT_LIMIT_DEG } from "@/engine/terrain.js"
import { project } from "@/engine/projection.js"
import { createPolarMap } from "@/view/polarMap.js"
import { LAYER_IDS, POLAR_LAYERS } from "@/view/polarLayerModel.js"
import { ringMarkers } from "@/view/ringModel.js"
import { compareMarkers } from "@/view/globeModel.js"
import { readTheme } from "@/lib/theme.js"
import { describeXY, ensureTier, getEngineData, loadSites, pickXY, selectPlace, useStore } from "@/state.js"

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

function Swatch({ token, children }) {
  return (
    <li className="flex items-center gap-2">
      <span className="size-3 shrink-0 rounded-sm" style={{ background: `var(--lspb-${token})` }} aria-hidden="true" />
      {children}
    </li>
  )
}

// Legend per layer (the "?" text is lib/explanations.js layerWhy). The shadowed area comes from the manifest.
function layerLegend(id, manifest) {
  if (id === "slope") {
    return (
      <ul className="space-y-0.5">
        <Swatch token="ok">under {SLOPE_POSSIBLE_MAX_DEG}°: landing possible</Swatch>
        <Swatch token="warn">
          {SLOPE_POSSIBLE_MAX_DEG}° to {SLOPE_NASA_LIMIT_DEG}°: within NASA&apos;s limit, inside the error margin
        </Swatch>
        <Swatch token="bad">over {SLOPE_NASA_LIMIT_DEG}°: beyond NASA&apos;s limit</Swatch>
      </ul>
    )
  }
  const psr = manifest.illumination?.psr
  if (id === "psr") {
    return psr ? (
      <ul>
        <Swatch token="psr">never sunlit ({Math.round(psr.area_km2_inside_84S).toLocaleString("en-US")} km² inside 84°S)</Swatch>
      </ul>
    ) : null
  }
  return (
    <div>
      <div className="h-2.5 rounded-sm" style={{ background: "linear-gradient(to right, var(--lspb-layer-sun-low), var(--lspb-sun))" }} aria-hidden="true" />
      <div className="flex justify-between font-mono text-xs text-muted-foreground">
        <span>0%</span>
        <span>50%</span>
        <span>100% of the time sunlit</span>
      </div>
    </div>
  )
}

function LayerRow({ layer, state, status, legend, why }) {
  const setLayer = useStore((s) => s.setLayer)
  const labelId = `layer-${layer.id}-opacity`
  return (
    <section className="space-y-1.5 border-t pt-2.5 first:border-t-0 first:pt-0" aria-label={layer.label}>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <CheckRow checked={state.on} onChange={(on) => setLayer(layer.id, { on })}>
            <span className="font-medium">{layer.label}</span>
            {status?.status === "loading" && <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="rendering" />}
          </CheckRow>
        </div>
        {why ? (
          <Why label={`About the ${layer.label} layer`} side="left" align="start" content={<WhyPanel why={why} title={layer.label} />} />
        ) : (
          <span className="text-xs text-muted-foreground">Not in this data build</span>
        )}
      </div>
      {status?.status === "error" && <p className="text-xs text-lspb-bad">Could not draw this layer: {status.error}</p>}
      {state.on && (
        <>
          {legend && <div className="text-xs">{legend}</div>}
          <div className="flex items-center gap-2">
            <span id={labelId} className="text-xs text-muted-foreground">
              Opacity
            </span>
            <Slider
              aria-labelledby={labelId}
              min={10}
              max={100}
              step={5}
              value={[Math.round(state.opacity * 100)]}
              onValueChange={([v]) => setLayer(layer.id, { opacity: v / 100 })}
              className="flex-1"
            />
            <span className="w-9 text-right font-mono text-xs text-muted-foreground tabular-nums">{Math.round(state.opacity * 100)}%</span>
          </div>
        </>
      )}
    </section>
  )
}

// Layers popover of the Polar HD map: toggle, opacity, legend and "?" for each data layer.
function LayersMenu({ manifest, statuses, sites }) {
  const layers = useStore((s) => s.layers)
  const count = LAYER_IDS.filter((id) => layers[id].on).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="bg-background/90" aria-label="Map layers">
          <Layers /> <span className="hidden sm:inline">Layers</span>
          {count > 0 && <span className="font-mono text-xs text-muted-foreground tabular-nums">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(34rem,70dvh)] w-80 max-w-[calc(100vw-2rem)] space-y-2.5 overflow-y-auto text-sm">
        <section className="space-y-1" aria-label="Mission sites">
          <CheckRow checked={sites.on} onChange={sites.setOn}>
            <span className="font-medium">Mission sites</span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{sites.count}</span>
          </CheckRow>
          <p className="text-xs text-muted-foreground">Sites south of 84°S, coloured by group as on the globe. Hover for the name; click to pick it.</p>
        </section>
        {[...POLAR_LAYERS].reverse().map((layer) => (
          <LayerRow key={layer.id} layer={layer} state={layers[layer.id]} status={statuses[layer.id]} legend={layerLegend(layer.id, manifest)} why={layerWhy(layer.id, manifest)} />
        ))}
        <p className="border-t pt-2 text-xs text-muted-foreground">Move the cursor over the map to read the values.</p>
      </PopoverContent>
    </Popover>
  )
}

// The Polar HD map. Owns the Leaflet container; createPolarMap once the polar data tier has loaded, destroy in
// cleanup (StrictMode-safe). Stays mounted when hidden (display: none) so zoom, centre and pin persist.
export default function PolarHdPanel({ active }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const sitesOnRef = useRef(true) // read when the sites arrive (async)
  const shownRef = useRef(false) // the current map has been visible at least once
  const polarReady = useStore((s) => s.tiers.polar.status === "ready")
  // Mirrors the map module's crater visibility (the map module owns it; not part of the store).
  const [cratersOn, setCratersOn] = useState(true)
  const [layerStatus, setLayerStatus] = useState({}) // id -> { status, error }
  // Mission-site markers: visibility mirrors the map module (not part of the store); count = sites on the map
  const [sitesOn, setSitesOn] = useState(true)
  const [siteCount, setSiteCount] = useState(0)

  // Opening the Polar HD map loads its data tier (once).
  useEffect(() => {
    if (active) ensureTier("polar").catch(() => {}) // the error is shown by <DataStatus tier="polar">
  }, [active])

  useEffect(() => {
    if (!polarReady) return
    const data = getEngineData()
    const R = data.manifest.moon_radius_m
    const api = createPolarMap(containerRef.current, {
      manifest: data.manifest,
      hillshadeUrl: data.polar.hillshadeUrl,
      layerData: { slope: data.polar.slope.plane, sunlightUrl: data.polar.layerUrls.illumAvg, psrUrl: data.polar.layerUrls.psr },
      onPick: pickXY,
      describe: describeXY,
      onLayerStatus: (id, status, error) => setLayerStatus((s) => ({ ...s, [id]: { status, error } })),
      onMapView: (v) => useStore.getState().setCamera("polar", v),
      onSelectSite: (site) => selectPlace(site.lat, site.lon, site).catch(() => {}), // errors show in <DataStatus>
    })
    apiRef.current = api
    shownRef.current = false
    api.setCraterLayer(data.polar.craters, true)
    loadSites().then((pins) => {
      if (apiRef.current !== api) return
      api.setSites(pins)
      api.setSitesVisible(sitesOnRef.current)
      setSiteCount(pins.filter((p) => p.site.lat <= POLAR_HD_LAT_LIMIT_DEG).length)
    })
    setCratersOn(api.getCratersVisible())
    const s0 = useStore.getState()
    api.setPin(s0.pin)
    const theme = readTheme()
    const ringItems = (s) => (s.pin?.terrainSource === "polar-hd" ? ringMarkers(s.sensitivity.points, s.ringMetric, theme) : [])
    api.setRing(ringItems(s0))
    api.setCompare(compareMarkers(s0.compare))
    for (const id of LAYER_IDS) api.setLayer(id, s0.layers[id])
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.pin !== prev.pin) api.setPin(s.pin)
      if (s.sensitivity.points !== prev.sensitivity.points || s.ringMetric !== prev.ringMetric) api.setRing(ringItems(s))
      if (s.compare !== prev.compare) api.setCompare(compareMarkers(s.compare))
      if (s.layers !== prev.layers) for (const id of LAYER_IDS) if (s.layers[id] !== prev.layers[id]) api.setLayer(id, s.layers[id])
      // A search result or typed coordinates inside the map while it is open: pan there.
      if (s.focus !== prev.focus && s.focus && s.view === "polar" && s.focus.lat <= POLAR_HD_LAT_LIMIT_DEG) {
        const { x, y } = project(s.focus.lat, s.focus.lon, R)
        api.panTo(x, y, !reducedMotion())
      }
    })
    return () => {
      unsubscribe()
      api.destroy()
      apiRef.current = null
    }
  }, [polarReady])

  // Leaflet must re-measure after its container goes from display:none to visible. The first time a map is
  // shown it gets its real view: a shared link's map view, else the whole disc, then the place last picked
  // (a link's site or pin, a search result) if it is on the map.
  useEffect(() => {
    const api = apiRef.current
    if (!active || !api) return
    const s = useStore.getState() // before invalidateSize, whose moveend reports the hidden map's placeholder view
    api.invalidateSize()
    if (shownRef.current) return
    shownRef.current = true
    if (s.camera.polar) return api.setMapView(s.camera.polar)
    api.setBounds()
    if (s.focus && s.focus.lat <= POLAR_HD_LAT_LIMIT_DEG) {
      const { x, y } = project(s.focus.lat, s.focus.lon, getEngineData().manifest.moon_radius_m)
      api.panTo(x, y, false)
    }
  }, [active, polarReady])

  return (
    <div className="absolute inset-0" style={{ display: active ? "block" : "none" }}>
      <div ref={containerRef} className="h-full w-full" data-testid="map-container" />
      {polarReady && (
        <div className="absolute top-2.5 right-14 z-(--lspb-z-map-ui) flex gap-1.5">
          <Toggle
            variant="outline"
            size="sm"
            pressed={cratersOn}
            onPressedChange={(on) => {
              apiRef.current?.setCratersVisible(on)
              setCratersOn(on)
            }}
            aria-label="Show named craters"
            className="bg-background/90 data-[state=on]:text-lspb-crater"
          >
            <CircleDashed /> <span className="hidden sm:inline">Craters</span>
          </Toggle>
          <LayersMenu
            manifest={getEngineData().manifest}
            statuses={layerStatus}
            sites={{
              on: sitesOn,
              count: siteCount,
              setOn: (on) => {
                sitesOnRef.current = on
                setSitesOn(on)
                apiRef.current?.setSitesVisible(on)
              },
            }}
          />
        </div>
      )}
      {active && <DataStatus tier="polar" />}
    </div>
  )
}
