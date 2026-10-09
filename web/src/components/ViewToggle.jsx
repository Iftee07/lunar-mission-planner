import { Map as MapIcon, Mountain } from "lucide-react"
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control"
import { useStore } from "@/state.js"

// Map | Surface toggle (single choice, cannot be deselected). Keyboard shortcut V is in App.jsx.
export default function ViewToggle() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  return (
    <SegmentedControl value={view} onValueChange={setView} aria-label="Main view" className="bg-background/90">
      <SegmentedControlItem value="map" title="Map (V)">
        <MapIcon /> Map
      </SegmentedControlItem>
      <SegmentedControlItem value="surface" title="Surface (V)">
        <Mountain /> Surface
      </SegmentedControlItem>
    </SegmentedControl>
  )
}
