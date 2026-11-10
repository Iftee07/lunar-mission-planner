import { Globe, Map as MapIcon, Mountain } from "lucide-react"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { useStore } from "@/state.js"

// Globe | Polar HD | Surface (single choice, cannot be deselected). Keyboard shortcut V (Planner.jsx) cycles.
// Phones show the icons only.
export default function ViewToggle() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  return (
    <SegmentedControl value={view} onValueChange={setView} aria-label="Main view" className="bg-background/90">
      <SegmentedControlItem value="globe" title="Globe (V)" aria-label="Globe">
        <Globe /> <span className="hidden sm:inline">Globe</span>
      </SegmentedControlItem>
      <SegmentedControlItem value="polar" title="Polar HD map (V)" aria-label="Polar HD map">
        <MapIcon /> <span className="hidden sm:inline">Polar HD</span>
      </SegmentedControlItem>
      <SegmentedControlItem value="surface" title="Surface view (V)" aria-label="Surface view">
        <Mountain /> <span className="hidden sm:inline">Surface</span>
      </SegmentedControlItem>
    </SegmentedControl>
  )
}
