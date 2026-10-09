import { Suspense, lazy, useEffect } from "react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import WelcomeFlow from "@/components/welcome/WelcomeFlow"
import { initData, useStore } from "@/state.js"

// Code split: the welcome flow ships in the entry chunk; the planner (Leaflet, three.js) is its own
// chunk, prefetched while the user reads the slides so it opens instantly.
const loadPlanner = () => import("@/Planner.jsx")
const Planner = lazy(loadPlanner)

// Fonts the planner uses (the welcome slides already use Space Grotesk).
const PLANNER_FONTS = ['400 1em "Inter Variable"', '600 1em "Inter Variable"', '400 1em "JetBrains Mono"', '700 1em "JetBrains Mono"']

// Routes `screen` (no router library): welcome slides, then the planner.
export default function App() {
  const screen = useStore((s) => s.screen)

  // Preload during the welcome flow: data files (no Leaflet/three.js is mounted), planner chunk, fonts.
  useEffect(() => {
    initData().catch(() => {}) // the error is shown on the sidebar
    const id = setTimeout(() => {
      loadPlanner().catch(() => {})
      if (document.fonts) for (const f of PLANNER_FONTS) document.fonts.load(f).catch(() => {})
    }, 300)
    return () => clearTimeout(id)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        {screen === "welcome" ? (
          <motion.div
            key="welcome"
            className="h-full"
            exit={{ opacity: 0, scale: 1.04, filter: "blur(6px)" }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <WelcomeFlow />
          </motion.div>
        ) : (
          // Opacity only: a scale transform would skew Leaflet's pointer maths while it animates.
          <motion.div
            key="app"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          >
            <Suspense fallback={null}>
              <Planner />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  )
}
