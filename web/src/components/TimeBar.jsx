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
  speedRef.current = speed

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
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Start</span>
        <DatePicker />
      </div>

      <div className="flex min-w-[16rem] flex-1 items-center gap-3">
        <Slider
          aria-label="Days after start"
          min={0}
          max={TIME_SLIDER_RANGE_H}
          step={SLIDER_STEP_H}
          value={[sliderOffsetH]}
          onValueChange={([h]) => setSliderOffset(h)}
        />
        <span className="font-mono whitespace-nowrap tabular-nums" title="Effective time = start + slider">
          +{formatDays(sliderOffsetH, 2)} &rarr; {formatClock(effectiveMs)}
        </span>
      </div>

      <Button variant="outline" size="sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
      </Button>

      <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
        <SelectTrigger className="w-[7.5rem]" aria-label="Play speed">
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
