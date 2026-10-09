import { Suspense, lazy, useEffect } from "react"
import AppBar from "@/components/AppBar"
import DataStatus from "@/components/DataStatus"
import ErrorBoundary from "@/components/ErrorBoundary"
import MapPanel from "@/components/MapPanel"
import Sidebar from "@/components/sidebar/Sidebar"
import TimeBar from "@/components/TimeBar"
import ViewToggle from "@/components/ViewToggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStore } from "@/state.js"

// three.js lives in its own chunk, fetched in parallel when the planner mounts.
const SurfacePanel = lazy(() => import("@/components/SurfacePanel"))

// The planner dashboard (map / surface view, sidebar, time bar). Loaded as its own chunk (Leaflet,
// three.js) and mounted only after the welcome flow, so the map is never sized while hidden.
// Layout: >= 1024 px (lg) the sidebar sits right of the main view and the page does not scroll;
// below that the sidebar stacks under the main view, the page scrolls and the time bar sticks to
// the bottom. DOM (and Tab) order is always: main view, sidebar, time bar.
export default function Planner() {
  const view = useStore((s) => s.view)

  // Keyboard shortcut V toggles Map | Surface (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "v" && e.key !== "V") return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const s = useStore.getState()
      s.setView(s.view === "map" ? "surface" : "map")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
        <AppBar />
        <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
          <main
            aria-label={view === "map" ? "Map" : "Surface view"}
            className="relative isolate h-(--lspb-main-h-stacked) min-h-(--lspb-main-min-h) overflow-hidden lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1"
          >
            <ErrorBoundary label="map" active={view === "map"}>
              <MapPanel active={view === "map"} />
            </ErrorBoundary>
            <ErrorBoundary label="surface view" active={view === "surface"}>
              <Suspense fallback={null}>
                <SurfacePanel active={view === "surface"} />
              </Suspense>
            </ErrorBoundary>
            <div className="absolute top-3 left-3 z-(--lspb-z-map-ui)">
              <ViewToggle />
            </div>
            <DataStatus />
          </main>
          <aside aria-label="Site ratings" className="w-full border-t lg:w-(--lspb-sidebar-w) lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <Sidebar />
          </aside>
        </div>
        <TimeBar />
      </div>
    </TooltipProvider>
  )
}
