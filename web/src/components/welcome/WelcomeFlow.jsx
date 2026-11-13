import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { buttonVariants } from "@/components/ui/button"
import { Term } from "@/components/why/Why"
import AntennaExplainer from "@/components/explain/AntennaExplainer"
import LibrationExplainer from "@/components/explain/LibrationExplainer"
import SunPathExplainer from "@/components/explain/SunPathExplainer"
import { cn } from "@/lib/utils"
import { goToLatLon, loadComparePreset, useStore } from "@/state.js"
import Starfield from "./Starfield"

const EASE = [0.4, 0, 0.2, 1]
const START_PRESET = "equator-pole" // engine/compare.js: Apollo 11 vs Shackleton rim

// Slide in from the travel direction, leave the other way. Under reduced motion MotionConfig
// (App.jsx) drops the x movement and keeps the fade.
const slideVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 64 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
  exit: (dir) => ({ opacity: 0, x: dir * -64, transition: { duration: 0.35, ease: EASE } }),
}
const textList = { center: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } } }
const textItem = {
  enter: { opacity: 0, y: 18 },
  center: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}
const artIn = {
  enter: { opacity: 0, scale: 0.96 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE, delay: 0.1 } },
}

function NextButton({ children, onClick, buttonRef }) {
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-full px-8 text-base font-semibold")}
    >
      {children}
    </motion.button>
  )
}

const H1 = "text-3xl leading-tight font-bold tracking-tight md:text-4xl"
const P = "text-lg text-muted-foreground"

// Each slide: { explainer, content(next, buttonRef) }. The explainers are the ones the cards open (P6b).
const SLIDES = [
  {
    explainer: <SunPathExplainer initialLat={30} compact />,
    content: (next, buttonRef) => (
      <>
        <motion.p variants={textItem} className="text-sm text-muted-foreground">
          NASA Space Apps 2026 · Lunar Landing Site Navigator challenge
        </motion.p>
        <motion.h1 variants={textItem} className="text-4xl font-bold tracking-tight md:text-6xl">
          Hi there
        </motion.h1>
        <motion.p variants={textItem} className="text-xl md:text-2xl">
          Welcome to <span className="font-semibold">Lunar Mission Planner</span>
        </motion.p>
        <motion.p variants={textItem} className={P}>
          At the Moon&apos;s south pole the Sun never climbs high: it skims the horizon, so the ground decides which spots get
          power. Drag the latitude towards 90°S.
        </motion.p>
        <motion.div variants={textItem} className="pt-2">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Next
          </NextButton>
        </motion.div>
      </>
    ),
  },
  {
    explainer: <LibrationExplainer />,
    content: (next, buttonRef) => (
      <>
        <motion.h1 variants={textItem} className={H1}>
          Earth comes and goes
        </motion.h1>
        <motion.p variants={textItem} className={P}>
          Radio contact needs Earth above the local <Term id="horizon">horizon</Term>. From the pole Earth hangs low and wobbles (
          <Term id="libration">libration</Term>), so it can dip out of view for days.
        </motion.p>
        <motion.div variants={textItem} className="pt-2">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Next
          </NextButton>
        </motion.div>
      </>
    ),
  },
  {
    explainer: <AntennaExplainer />,
    content: (next, buttonRef) => (
      <>
        <motion.h1 variants={textItem} className={H1}>
          A few metres can decide it
        </motion.h1>
        <motion.p variants={textItem} className={P}>
          A taller antenna sees over a ridge. This planner checks any spot on the Moon for sunlight, Earth in view and landing
          slope, on the date you choose, and explains every rating.
        </motion.p>
        <motion.p variants={textItem} className="text-base">
          Start with a comparison: the Apollo 11 site at the equator against Shackleton&apos;s rim at the pole.
        </motion.p>
        <motion.div variants={textItem} className="pt-2">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Start at Apollo 11 vs Shackleton
          </NextButton>
        </motion.div>
      </>
    ),
  },
]

// The last slide's button: open the planner with the "Equator vs pole" comparison and Shackleton's rim pinned.
async function openStartPreset() {
  const list = await loadComparePreset(START_PRESET)
  const pin = list.at(-1)?.pin
  if (pin) await goToLatLon(pin.lat, pin.lon, pin.site ?? null)
}

// Three full-screen slides before the planner, each with an interactive explainer. Enter or Right goes forward,
// Left goes back (not while a slider has focus). "Skip" opens the planner; the last button opens it on the
// Apollo 11 vs Shackleton comparison.
export default function WelcomeFlow() {
  const setScreen = useStore((s) => s.setScreen)
  const [[index, dir], setPage] = useState([0, 1])
  const buttonRef = useRef(null)
  const scrollRef = useRef(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 }) // block body: scrollTo may return a Promise, not a cleanup
  }, [index])

  const finish = useCallback(() => setScreen("app"), [setScreen])
  const go = useCallback(
    (to) => {
      if (to >= SLIDES.length) {
        openStartPreset().catch(() => {}) // a data error shows in the planner
        return finish()
      }
      if (to < 0) return
      setPage(([cur]) => [to, to > cur ? 1 : -1])
    },
    [finish],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return
      // sliders and popovers use the arrow keys themselves
      if (e.target instanceof HTMLElement && e.target.closest("[role=slider], input, [role=dialog]")) return
      // Enter on a focused button/link already activates it; do not advance twice.
      const onControl = e.target instanceof HTMLElement && /^(BUTTON|A)$/.test(e.target.tagName)
      if (e.key === "ArrowRight" || (e.key === "Enter" && !onControl)) go(index + 1)
      else if (e.key === "ArrowLeft") go(index - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, go])

  const slide = SLIDES[index]

  return (
    <div className="lspb-welcome-bg relative h-full overflow-hidden">
      <Starfield />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-linear-to-b from-background/90 to-transparent px-6 py-5 md:px-10">
        <span className="font-heading text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Lunar Mission Planner
        </span>
        <button
          type="button"
          onClick={finish}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Skip
        </button>
      </header>

      {/* scrolls when a slide is taller than the screen (phones), so text never slides under the header */}
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
        <AnimatePresence mode="wait" custom={dir} initial={false} onExitComplete={() => buttonRef.current?.focus()}>
          <motion.section
            key={index}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${SLIDES.length}`}
            className="relative z-0 mx-auto grid min-h-full max-w-6xl content-center items-center gap-8 px-6 pt-20 pb-24 md:grid-cols-2 md:gap-16 md:px-10 md:py-24"
          >
            <motion.div variants={textList} className="space-y-5 font-heading">
              {slide.content(() => go(index + 1), buttonRef)}
            </motion.div>
            <motion.div variants={artIn} className="w-full max-w-md justify-self-center rounded-xl border bg-background/70 p-4 backdrop-blur">
              {slide.explainer}
            </motion.div>
          </motion.section>
        </AnimatePresence>
      </div>

      <nav aria-label="Slides" className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 pb-8">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index ? "step" : undefined}
            className="relative grid h-6 w-8 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
            {i === index && (
              <motion.span
                layoutId="lspb-welcome-dot"
                className="absolute inset-x-0 top-2 bottom-2 rounded-full bg-foreground"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
