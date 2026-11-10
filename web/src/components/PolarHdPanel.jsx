import { useEffect, useRef, useState } from "react"
import { CircleDashed } from "lucide-react"
import { Toggle } from "@/components/ui/toggle"
import { createPolarMap } from "@/view/polarMap.js"
import DataStatus from "@/components/DataStatus"
import { describeXY, ensureTier, getEngineData, pickXY, useStore } from "@/state.js"

// The Polar HD map. Owns the Leaflet container; createPolarMap once the polar data tier has loaded, destroy in
// cleanup (StrictMode-safe). Stays mounted when hidden (display: none) so zoom, centre and pin persist.
export default function PolarHdPanel({ active }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const polarReady = useStore((s) => s.tiers.polar.status === "ready")
  // Mirrors the map module's crater visibility (the map module owns it; not part of the store).
  const [cratersOn, setCratersOn] = useState(true)

  // Opening the Polar HD map loads its data tier (once).
  useEffect(() => {
    if (active) ensureTier("polar").catch(() => {}) // the error is shown by <DataStatus tier="polar">
  }, [active])

  useEffect(() => {
    if (!polarReady) return
    const data = getEngineData()
    const api = createPolarMap(containerRef.current, {
      manifest: data.manifest,
      hillshadeUrl: data.polar.hillshadeUrl,
      onPick: pickXY,
      describe: describeXY,
    })
    apiRef.current = api
    api.setCraterLayer(data.polar.craters, true)
    setCratersOn(api.getCratersVisible())
    api.setPin(useStore.getState().pin)
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.pin !== prev.pin) api.setPin(s.pin)
    })
    return () => {
      unsubscribe()
      api.destroy()
      apiRef.current = null
    }
  }, [polarReady])

  // Leaflet must re-measure after its container goes from display:none to visible.
  useEffect(() => {
    if (active) apiRef.current?.invalidateSize()
  }, [active])

  return (
    <div className="absolute inset-0" style={{ display: active ? "block" : "none" }}>
      <div ref={containerRef} className="h-full w-full" data-testid="map-container" />
      {polarReady && (
        <div className="absolute top-2.5 right-14 z-(--lspb-z-map-ui)">
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
        </div>
      )}
      {active && <DataStatus tier="polar" />}
    </div>
  )
}
