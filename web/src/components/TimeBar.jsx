import { useEffect, useRef, useState } from "react"
import { Pause, Play, Repeat } from "lucide-react"
import DatePicker from "@/components/DatePicker"
import TimelineStrip from "@/components/TimelineStrip"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Toggle } from "@/components/ui/toggle"
import { formatClock, formatDays, formatPlaySpeed } from "@/lib/format.js"
import {
  PLAY_SPEEDS_H_PER_S,
  SLIDER_STEP_H,
  TIME_SLIDER_RANGE_H,
  selectEffectiveTimeMs,
  useStore,
} from "@/state.js"

// Offset and effective UTC time; its own component so Play re-renders only this text.
function TimeReadout() {
  const sliderOffsetH = useStore((s) => s.sliderOffsetH)
  const effectiveMs = useStore(selectEffectiveTimeMs)
  return (
    <span className="font-mono text-xs whitespace-nowrap tabular-nums sm:text-sm" title="Effective time = start + playhead">
      +{formatDays(sliderOffsetH, 2)} &rarr; {formatClock(effectiveMs)}
    </span>
  )
}

// Bottom bar: start date-time (UTC, calendar popover), Play, speed, loop, the effective time, and the timeline
// strip (one row group per site; its playhead is the time control).
export default function TimeBar() {
  const sliderOffsetH = useStore((s) => s.sliderOffsetH)
  const { setSliderOffset } = useStore.getState()

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(6)
  const [loop, setLoop] = useState(false)
  const [loopStartH, setLoopStartH] = useState(null) // the mission window Play replays while looping
  const speedRef = useRef(speed)
  const loopRef = useRef(loopStartH)
  useEffect(() => {
    speedRef.current = speed
    loopRef.current = loopStartH
  }, [speed, loopStartH])

  // Play: advance the playhead by `speed` hours of simulated time per real second. Looping replays
  // [loopStartH, loopStartH + mission length]; otherwise Play stops at the end of the strip.
  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      const s = useStore.getState()
      let next = s.sliderOffsetH + speedRef.current * dt
      const from = loopRef.current
      if (from !== null) {
        const end = Math.min(TIME_SLIDER_RANGE_H, from + s.missionH)
        if (next >= end || next < from) next = from
      } else if (next >= TIME_SLIDER_RANGE_H) {
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

  const play = (on) => {
    const offset = useStore.getState().sliderOffsetH
    if (on && !loop && offset >= TIME_SLIDER_RANGE_H) setSliderOffset(0)
    setLoopStartH(on && loop ? Math.min(offset, TIME_SLIDER_RANGE_H - SLIDER_STEP_H) : null)
    setPlaying(on)
  }
  const toggleLoop = (on) => {
    setLoop(on)
    setLoopStartH(on && playing ? useStore.getState().sliderOffsetH : null)
  }

  return (
    // Below the compare drawer. Phones: the controls wrap onto two rows above the strip.
    <footer aria-label="Time" className="space-y-1.5 border-t border-border bg-background px-3 pt-2 pb-2.5 text-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline">Start</span>
          <DatePicker />
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-9 sm:h-8" onClick={() => play(!playing)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause /> : <Play />} <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
          </Button>
          <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
            <SelectTrigger className="w-24" aria-label="Play speed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAY_SPEEDS_H_PER_S.map((v) => (
                <SelectItem key={v} value={String(v)}>
                  {formatPlaySpeed(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Toggle
            variant="outline"
            size="sm"
            className="h-9 sm:h-8"
            pressed={loop}
            onPressedChange={toggleLoop}
            aria-label="Loop the mission window"
            title="Loop: Play replays the mission window"
          >
            <Repeat />
          </Toggle>
        </div>

        <div className="ml-auto">
          <TimeReadout />
        </div>
      </div>

      <Slider
        aria-label="Days after start"
        min={0}
        max={TIME_SLIDER_RANGE_H}
        step={SLIDER_STEP_H}
        value={[sliderOffsetH]}
        onValueChange={([h]) => setSliderOffset(h)}
      />
      <TimelineStrip loopStartH={loopStartH} />
    </footer>
  )
}
