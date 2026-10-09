import { useEffect, useRef, useState } from "react"
import { Bug, Map as MapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSurface } from "@/view/surface.js"
import { getEngineData, selectEffectiveTimeMs, selectOutOfRange, useStore } from "@/state.js"

const viewState = (s) => ({
  pin: s.pin,
  antennaM: s.antennaM,
  timeMs: selectEffectiveTimeMs(s),
  sunMode: s.sunMode,
})

// Owns the three.js surface view. createSurface once per mount, destroy in cleanup (StrictMode-safe).
// Stays mounted when hidden (display: none) so the camera direction persists; the render loop
// runs only while this view is active.
export default function SurfacePanel({ active }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const dataReady = useStore((s) => s.dataReady)
  const pin = useStore((s) => s.pin)
  const outOfRange = useStore(selectOutOfRange)
  const setView = useStore((s) => s.setView)
  const [debug, setDebug] = useState(null)

  useEffect(() => {
    if (!dataReady) return
    const api = createSurface(containerRef.current, { engineData: getEngineData() })
    apiRef.current = api
    const s0 = useStore.getState()
    api.update(viewState(s0), s0.results)
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (
        s.pin !== prev.pin ||
        s.antennaM !== prev.antennaM ||
        s.baseTimeUtcMs !== prev.baseTimeUtcMs ||
        s.sliderOffsetH !== prev.sliderOffsetH ||
        s.sunMode !== prev.sunMode ||
        s.results.horizonSun !== prev.results.horizonSun ||
        s.results.horizonEarth !== prev.results.horizonEarth
      ) {
        api.update(viewState(s), s.results)
      }
    })
    if (import.meta.env.DEV && window.lspb) window.lspb.surface = api
    return () => {
      unsubscribe()
      api.destroy()
      apiRef.current = null
    }
  }, [dataReady])

  // Render loop only while visible.
  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (active) api.start()
    else api.stop()
  }, [active, dataReady])

  const runDebug = () => {
    const api = apiRef.current
    if (!api) return
    const rows = api.debugCheck()
    const v = api.getView()
    console.table(rows)
    console.log(`surface view: yaw ${v.yaw.toFixed(1)} pitch ${v.pitch.toFixed(1)} fov ${v.fov.toFixed(1)} ` +
      `camera y ${v.cameraY} m, ${v.fps.toFixed(0)} fps`)
    const sky = rows.filter((r) => r.item.startsWith("skyline"))
    const worst = Math.max(...sky.map((r) => r.diffDeg))
    setDebug(`skyline vs horizon: max ${worst.toFixed(5)}° at 8 azimuths; ${v.fps.toFixed(0)} fps (table in console)`)
  }

  return (
    <div className="absolute inset-0" style={{ display: active ? "block" : "none" }} data-testid="surface-panel">
      <div ref={containerRef} className="absolute inset-0 overflow-hidden" data-testid="surface-container" />
      {!pin && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
          <p className="text-sm">Click the map to choose a point</p>
          <Button variant="outline" onClick={() => setView("map")}>
            <MapIcon /> Go to map
          </Button>
        </div>
      )}
      {pin && outOfRange && (
        <p className="absolute top-16 left-1/2 -translate-x-1/2 text-sm text-lspb-warn">Date outside ephemeris range</p>
      )}
      {pin && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {debug && <span className="text-xs text-muted-foreground">{debug}</span>}
          <Button variant="outline" size="sm" onClick={runDebug} title="Log skyline vs horizon and body positions">
            <Bug /> Check skyline
          </Button>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground">
        drag to look around &middot; wheel to zoom
      </p>
    </div>
  )
}
