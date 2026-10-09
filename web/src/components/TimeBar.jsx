import { useEffect, useRef, useState } from "react"
import { Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { formatClock, formatOffset, fromLocalInput, toLocalInput } from "@/lib/format.js"
import {
  PLAY_SPEEDS_H_PER_S,
  SLIDER_STEP_H,
  TIME_SLIDER_RANGE_H,
  selectEffectiveTimeMs,
  useStore,
} from "@/state.js"

const OFFSETS = Array.from({ length: 25 }, (_, i) => i - 12)

// Bottom bar: base date-time (in the chosen UTC offset), UTC offset, hours slider, Play, speed.
export default function TimeBar() {
  const baseTimeUtcMs = useStore((s) => s.baseTimeUtcMs)
  const utcOffsetH = useStore((s) => s.utcOffsetH)
  const sliderOffsetH = useStore((s) => s.sliderOffsetH)
  const effectiveMs = useStore(selectEffectiveTimeMs)
  const { setBaseTime, setUtcOffset, setSliderOffset } = useStore.getState()

  // Draft text so partially typed dates don't fight the controlled value.
  const [draft, setDraft] = useState(() => toLocalInput(baseTimeUtcMs, utcOffsetH))
  useEffect(() => setDraft(toLocalInput(baseTimeUtcMs, utcOffsetH)), [baseTimeUtcMs, utcOffsetH])

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
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Start</span>
        <Input
          type="datetime-local"
          step={900}
          className="w-[13.5rem]"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            const ms = fromLocalInput(e.target.value, utcOffsetH)
            if (Number.isFinite(ms)) setBaseTime(ms)
          }}
        />
        <span className="text-muted-foreground" title="UTC equivalent of the start time">
          = {formatClock(baseTimeUtcMs)} UTC
        </span>
      </label>

      <Select value={String(utcOffsetH)} onValueChange={(v) => setUtcOffset(Number(v))}>
        <SelectTrigger className="w-[8.5rem]" aria-label="UTC offset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OFFSETS.map((h) => (
            <SelectItem key={h} value={String(h)}>
              {formatOffset(h)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex min-w-[16rem] flex-1 items-center gap-3">
        <Slider
          aria-label="Hours after start"
          min={0}
          max={TIME_SLIDER_RANGE_H}
          step={SLIDER_STEP_H}
          value={[sliderOffsetH]}
          onValueChange={([h]) => setSliderOffset(h)}
        />
        <span className="whitespace-nowrap tabular-nums" title="Effective time = start + slider">
          +{sliderOffsetH.toFixed(2)} h &rarr; {formatClock(effectiveMs, utcOffsetH)} {formatOffset(utcOffsetH)}
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
              {v} h/s
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </footer>
  )
}
