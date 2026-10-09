import { useEffect, useRef } from "react"
import { createMap } from "@/map/map.js"
import { describeXY, getEngineData, pickXY, useStore } from "@/state.js"

// Owns the Leaflet container. createMap once per mount, destroy in cleanup (StrictMode-safe).
// Stays mounted when hidden (display: none) so zoom, centre and pin persist across toggles.
export default function MapPanel({ active }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const dataReady = useStore((s) => s.dataReady)

  useEffect(() => {
    if (!dataReady) return
    const data = getEngineData()
    const api = createMap(containerRef.current, {
      manifest: data.manifest,
      hillshadeUrl: data.hillshadeUrl,
      onPick: pickXY,
      describe: describeXY,
    })
    apiRef.current = api
    api.setPin(useStore.getState().pin)
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.pin !== prev.pin) api.setPin(s.pin)
    })
    return () => {
      unsubscribe()
      api.destroy()
      apiRef.current = null
    }
  }, [dataReady])

  // Leaflet must re-measure after its container goes from display:none to visible.
  useEffect(() => {
    if (active) apiRef.current?.invalidateSize()
  }, [active])

  return (
    <div className="absolute inset-0" style={{ display: active ? "block" : "none" }}>
      <div ref={containerRef} className="h-full w-full" data-testid="map-container" />
    </div>
  )
}
