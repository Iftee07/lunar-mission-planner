import { Suspense, lazy, useCallback, useEffect, useRef } from "react"
import { LoaderCircle } from "lucide-react"
import AppBar from "@/components/AppBar"
import CompareDrawer from "@/components/compare/CompareDrawer"
import DataStatus from "@/components/DataStatus"
import DatasetGate from "@/components/DatasetGate"
import ErrorBoundary from "@/components/ErrorBoundary"
import ResizeHandle from "@/components/ResizeHandle"
import PolarHdPanel from "@/components/PolarHdPanel"
import MobileSummary from "@/components/MobileSummary"
import Sidebar from "@/components/sidebar/Sidebar"
import TimeBar from "@/components/TimeBar"
import ViewToggle from "@/components/ViewToggle"
import { VIEWS, useStore } from "@/state.js"
import { useStoredSize } from "@/lib/useStoredSize.js"

// CesiumJS (globe) and three.js (surface view) live in their own chunks, fetched in parallel when the
// main view mounts (in production, after DatasetGate has the terrain).
const GlobePanel = lazy(() => import("@/components/GlobePanel"))
const SurfacePanel = lazy(() => import("@/components/SurfacePanel"))

// Sidebar width on desktop: dragged by the handle on its left edge (components/ResizeHandle.jsx), remembered per
// browser; null = the default (--lspb-sidebar-w). The main view keeps at least MAIN_MIN_W_PX.
const SIDEBAR_KEY = "lspb.sidebarPx"
const SIDEBAR_MIN_PX = 280
const SIDEBAR_MAX_PX = 640
const MAIN_MIN_W_PX = 480
const clampSidebar = (w, sidebarPx, mainPx) => Math.max(SIDEBAR_MIN_PX, Math.min(SIDEBAR_MAX_PX, sidebarPx + mainPx - MAIN_MIN_W_PX, w))

const VIEW_LABELS = { globe: "3D globe", polar: "Polar HD map", surface: "Surface view" }

function GlobeLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-background" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading the 3D globe
      </p>
    </div>
  )
}

// The planner dashboard (globe / Polar HD map / surface view, sidebar, time bar). Loaded as its own chunk
// (Leaflet) and mounted only after the welcome flow, so no view is ever sized while hidden.
// Layout: >= 1024 px (lg) the sidebar sits right of the main view and the page does not scroll;
// below that the sidebar stacks under the main view, the page scrolls and the time bar sticks to
// the bottom. DOM (and Tab) order is always: main view, sidebar, compare drawer, time bar.
export default function Planner() {
  const view = useStore((s) => s.view)
  const [sidebarPx, setSidebarPx, saveSidebarPx] = useStoredSize(SIDEBAR_KEY)
  const mainRef = useRef(null)
  const asideRef = useRef(null)
  const width = (ref) => ref.current?.getBoundingClientRect().width ?? 0
  const measureSidebar = useCallback(() => asideRef.current?.getBoundingClientRect().width ?? 0, [])

  // Keyboard shortcut V cycles Globe -> Polar HD -> Surface (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "v" && e.key !== "V") return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target
      if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      const s = useStore.getState()
      s.setView(VIEWS[(VIEWS.indexOf(s.view) + 1) % VIEWS.length])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:min-h-0">
      <AppBar />
      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <main
          ref={mainRef}
          aria-label={VIEW_LABELS[view]}
          className="relative isolate h-(--lspb-main-h-stacked) min-h-(--lspb-main-min-h) overflow-hidden lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1"
        >
          <DatasetGate>
            <ErrorBoundary label="3D globe" active={view === "globe"}>
              <Suspense fallback={view === "globe" ? <GlobeLoading /> : null}>
                <GlobePanel active={view === "globe"} />
              </Suspense>
            </ErrorBoundary>
            <ErrorBoundary label="Polar HD map" active={view === "polar"}>
              <PolarHdPanel active={view === "polar"} />
            </ErrorBoundary>
            <ErrorBoundary label="surface view" active={view === "surface"}>
              <Suspense fallback={null}>
                <SurfacePanel active={view === "surface"} />
              </Suspense>
            </ErrorBoundary>
            <div className="absolute top-3 left-3 z-(--lspb-z-map-ui)">
              <ViewToggle />
            </div>
            <MobileSummary />
            <DataStatus />
          </DatasetGate>
        </main>
        <ResizeHandle
          orientation="vertical"
          label="Resize the sidebar (drag, or Left and Right arrows; double-click resets)"
          measure={measureSidebar}
          clamp={(w) => clampSidebar(w, width(asideRef), width(mainRef))}
          value={sidebarPx}
          onLive={setSidebarPx}
          onSave={saveSidebarPx}
          className="relative -mx-1.5 hidden w-3 shrink-0 lg:flex"
        />
        <aside
          ref={asideRef}
          style={sidebarPx ? { "--lspb-sidebar-w": `${sidebarPx}px` } : undefined}
          id="site-ratings"
          aria-label="Site ratings"
          className="w-full scroll-mt-2 border-t lg:w-(--lspb-sidebar-w) lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <Sidebar />
        </aside>
      </div>
      <CompareDrawer />
      <TimeBar />
    </div>
  )
}
