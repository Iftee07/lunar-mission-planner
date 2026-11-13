import { useRef } from "react"
import { cn } from "@/lib/utils"

const KEY_STEP_PX = 32

// Drag handle on the edge of a panel that sits after it: the compare drawer below its top edge ("horizontal"
// separator, dragged up and down) or the sidebar right of its left edge ("vertical", dragged left and right).
// Dragging towards the rest of the page grows the panel. Keyboard: Up / Left grow, Down / Right shrink.
// Double-click resets to the default size.
//   measure() -> the panel's size now (px);  clamp(px) -> the allowed size
//   value: the stored size or null;  onLive(px) while dragging;  onSave(px | null) when done
export default function ResizeHandle({ orientation, label, measure, clamp, value, onLive, onSave, className }) {
  const drag = useRef(null)
  const vertical = orientation === "vertical"
  const pos = (e) => (vertical ? e.clientX : e.clientY)
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value ?? undefined}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { start: pos(e), size: measure() }
        e.preventDefault()
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        drag.current.last = clamp(drag.current.size + drag.current.start - pos(e))
        onLive(drag.current.last)
      }}
      onPointerUp={(e) => {
        if (!drag.current) return
        if (drag.current.last) onSave(drag.current.last)
        drag.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onDoubleClick={() => onSave(null)}
      onKeyDown={(e) => {
        const grow = vertical ? "ArrowLeft" : "ArrowUp"
        const shrink = vertical ? "ArrowRight" : "ArrowDown"
        const dir = e.key === grow ? 1 : e.key === shrink ? -1 : 0
        if (!dir) return
        e.preventDefault()
        onSave(clamp(measure() + dir * KEY_STEP_PX))
      }}
      className={cn(
        "group z-10 flex touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring",
        vertical ? "cursor-col-resize" : "cursor-row-resize",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-full bg-muted-foreground/40 transition-colors group-hover:bg-muted-foreground group-focus-visible:bg-muted-foreground",
          vertical ? "h-12 w-1" : "h-1 w-12",
        )}
      />
    </div>
  )
}
