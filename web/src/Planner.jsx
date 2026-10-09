import { useEffect } from "react"
import MapPanel from "@/components/MapPanel"
import Sidebar from "@/components/sidebar/Sidebar"
import SurfacePanel from "@/components/SurfacePanel"
import TimeBar from "@/components/TimeBar"
import ViewToggle from "@/components/ViewToggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useStore } from "@/state.js"

// The planner dashboard (map / surface view, sidebar, time bar). Loaded as its own chunk (Leaflet,
// three.js) and mounted only after the welcome flow, so the map is never sized while hidden.
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
      <div className="flex h-full min-h-[600px] flex-col">
        <div className="flex min-h-[520px] flex-1 overflow-hidden">
          <main className="relative isolate w-[70%] min-w-0">
            <MapPanel active={view === "map"} />
            <SurfacePanel active={view === "surface"} />
            <div className="absolute top-3 left-3 z-[1000]">
              <ViewToggle />
            </div>
          </main>
          <aside className="w-[30%] min-w-[320px] overflow-y-auto border-l border-border">
            <Sidebar />
          </aside>
        </div>
        <TimeBar />
      </div>
    </TooltipProvider>
  )
}
