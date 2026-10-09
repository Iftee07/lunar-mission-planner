import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"

const CALM_MS = 400 // changes faster than this (slider drag, Play) swap instantly instead of animating

const variants = {
  enter: (calm) => (calm ? { opacity: 0, y: -5 } : { opacity: 1, y: 0 }),
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } },
  exit: (calm) => (calm ? { opacity: 0, y: 5, transition: { duration: 0.12 } } : { opacity: 0, transition: { duration: 0 } }),
}

// A text value that ticks (cross-fade + small slide) when it changes. Rapid changes skip the animation
// so Play and slider drags stay cheap and readable.
export default function AnimatedValue({ text }) {
  const prev = useRef({ text, at: -Infinity })
  // Reading the clock and the ref during render is deliberate: it only picks the animation style for
  // this change (tick vs instant swap), never what is displayed, so a re-render cannot show wrong data.
  // oxlint-disable-next-line react/purity, react/refs
  const calm = performance.now() - prev.current.at > CALM_MS
  useEffect(() => {
    if (prev.current.text !== text) prev.current = { text, at: performance.now() }
  }, [text])
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false} custom={calm}>
        <motion.span key={text} custom={calm} variants={variants} initial="enter" animate="show" exit="exit">
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
