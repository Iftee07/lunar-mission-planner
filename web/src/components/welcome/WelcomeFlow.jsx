import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarDays, Earth, SatelliteDish, Sun, SunDim } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useStore } from "@/state.js"
import Starfield from "./Starfield"
import { LanderArt, MoonArt, RocketArt } from "./WelcomeArt"

const EASE = [0.4, 0, 0.2, 1]

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
  enter: { opacity: 0, scale: 0.94 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: EASE, delay: 0.1 } },
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

function Item({ icon: Icon, children }) {
  return (
    <motion.li variants={textItem} className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-background/60">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <span>{children}</span>
    </motion.li>
  )
}

// Each slide: { art, artSide, content(next, buttonRef) }
const SLIDES = [
  {
    art: <MoonArt className="w-full max-w-md" />,
    artSide: "left",
    content: (next, buttonRef) => (
      <>
        <motion.h1 variants={textItem} className="text-5xl font-bold tracking-tight md:text-7xl">
          Hi there
        </motion.h1>
        <motion.p variants={textItem} className="text-xl text-muted-foreground md:text-2xl">
          Welcome to <span className="text-foreground">Lunar Mission Planner</span>
        </motion.p>
        <motion.div variants={textItem} className="pt-4">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Let&apos;s go
          </NextButton>
        </motion.div>
      </>
    ),
  },
  {
    art: <RocketArt className="w-full max-w-xl" />,
    artSide: "right",
    content: (next, buttonRef) => (
      <>
        <motion.h1 variants={textItem} className="text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          To land on the south pole of the Moon, we need to select a proper landing site.
        </motion.h1>
        <motion.p variants={textItem} className="text-lg text-muted-foreground">
          It is difficult to land there for two reasons:
        </motion.p>
        <motion.ul variants={textList} className="space-y-3 text-lg">
          <Item icon={SunDim}>Low sunlight</Item>
          <Item icon={SatelliteDish}>Short Earth visibility</Item>
        </motion.ul>
        <motion.div variants={textItem} className="pt-4">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Let&apos;s go
          </NextButton>
        </motion.div>
      </>
    ),
  },
  {
    art: <LanderArt className="w-full max-w-md" />,
    artSide: "right",
    content: (next, buttonRef) => (
      <>
        <motion.h1 variants={textItem} className="text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          To select a proper landing site, we need to be aware of three primary parameters.
        </motion.h1>
        <motion.ol variants={textList} className="space-y-3 text-lg">
          <Item icon={CalendarDays}>The date we land on the Moon</Item>
          <Item icon={Sun}>Available sunlight hours for solar power</Item>
          <Item icon={Earth}>Earth visibility for communication</Item>
        </motion.ol>
        <motion.p variants={textItem} className="font-heading text-xl font-semibold">
          So let&apos;s get started!
        </motion.p>
        <motion.div variants={textItem} className="pt-2">
          <NextButton onClick={next} buttonRef={buttonRef}>
            Let&apos;s get started
          </NextButton>
        </motion.div>
      </>
    ),
  },
]

// Three full-screen slides before the planner. Enter or Right goes forward, Left goes back,
// "Skip" (every slide) and the last button open the planner (screen = "app").
export default function WelcomeFlow() {
  const setScreen = useStore((s) => s.setScreen)
  const [[index, dir], setPage] = useState([0, 1])
  const buttonRef = useRef(null)

  const finish = useCallback(() => setScreen("app"), [setScreen])
  const go = useCallback(
    (to) => {
      if (to >= SLIDES.length) return finish()
      if (to < 0) return
      setPage(([cur]) => [to, to > cur ? 1 : -1])
    },
    [finish],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
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
  const art = (
    <motion.div variants={artIn} className="flex justify-center">
      {slide.art}
    </motion.div>
  )

  return (
    <div className="lspb-welcome-bg relative h-full min-h-140 overflow-hidden">
      <Starfield />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-10">
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
          className="relative z-0 mx-auto grid h-full max-w-6xl content-center items-center gap-10 px-6 py-24 md:grid-cols-2 md:gap-16 md:px-10"
        >
          {slide.artSide === "left" && art}
          <motion.div variants={textList} className="space-y-5 font-heading">
            {slide.content(() => go(index + 1), buttonRef)}
          </motion.div>
          {slide.artSide === "right" && art}
        </motion.section>
      </AnimatePresence>

      <nav aria-label="Slides" className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 pb-8">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index ? "step" : undefined}
            className="relative grid h-3 w-8 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
            {i === index && (
              <motion.span
                layoutId="lspb-welcome-dot"
                className="absolute inset-y-0.5 inset-x-0 rounded-full bg-foreground"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
