import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"
import DatePicker from "@/components/DatePicker"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { formatClock, formatDays, formatDaysPerSecond } from "@/lib/format.js"
import {
  PLAY_SPEEDS_H_PER_S,
  SLIDER_STEP_H,
  TIME_SLIDER_RANGE_H,
  selectEffectiveTimeMs,
  useStore,
} from "@/state.js"

// Bottom bar: start date-time (UTC, calendar popover), slider with the effective UTC time, Play, speed.
export default function TimeBar() {
  const sliderOffsetH = useStore((s) => s.sliderOffsetH)
  const effectiveMs = useStore(selectEffectiveTimeMs)
  const { setSliderOffset } = useStore.getState()

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const speedRef = useRef(speed)
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // Play: advance the slider by `speed` hours of simulated time per real second.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      const next = useStore.getState().sliderOffsetH + speedRef.current * dt
      if (next >= TIME_SLIDER_RANGE_H) {
        setSliderOffset(TIME_SLIDER_RANGE_H)
        setPlaying(false)
        return
      }
      setSliderOffset(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, setSliderOffset])

  const togglePlay = () => {
    if (!playing && useStore.getState().sliderOffsetH >= TIME_SLIDER_RANGE_H) setSliderOffset(0)
    setPlaying(!playing)
  }

  return (
    // Phones: two rows (start, Play, speed; then the slider). Sticky at the bottom while the page scrolls,
    // except on short landscape screens where it would cover the map.
    <footer
      aria-label="Time"
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-background px-3 py-2.5 text-sm sm:gap-x-4 sm:px-4 sm:py-3 lg:static [@media(max-height:32rem)]:static"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <span className="hidden text-muted-foreground sm:inline">Start</span>
        <DatePicker />
      </div>

      <div className="order-last flex basis-full items-center gap-3 sm:order-none sm:min-w-64 sm:flex-1 sm:basis-auto">
        <Slider
          aria-label="Days after start"
          min={0}
          max={TIME_SLIDER_RANGE_H}
          step={SLIDER_STEP_H}
          value={[sliderOffsetH]}
          onValueChange={([h]) => setSliderOffset(h)}
        />
        <span className="font-mono text-xs whitespace-nowrap tabular-nums sm:text-sm" title="Effective time = start + slider">
          +{formatDays(sliderOffsetH, 2)} &rarr; {formatClock(effectiveMs)}
        </span>
      </div>

      <Button variant="outline" size="sm" className="h-9 sm:h-8" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause /> : <Play />} <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
      </Button>

      <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
        <SelectTrigger className="w-28 sm:w-32" aria-label="Play speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAY_SPEEDS_H_PER_S.map((v) => (
            <SelectItem key={v} value={String(v)}>
              {formatDaysPerSecond(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </footer>
  )
}
