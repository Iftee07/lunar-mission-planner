import { useEffect, useRef, useState } from "react"
import { Link } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/button"
import { flushUrlState } from "@/urlSync.js"

const RESET_MS = 1800

// A check mark that draws itself (250 ms; shown complete under reduced motion).
function DrawnCheck({ reduce }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-lspb-ok" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, ease: "easeOut" }} />
    </svg>
  )
}

// "Copy link": puts a link to exactly this view (site, time, settings, layers, camera) on the clipboard.
export default function CopyLinkButton() {
  const reduce = useReducedMotion()
  const [state, setState] = useState("idle") // idle | copied | failed
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const href = flushUrlState()
    let next = "copied"
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      next = "failed"
    }
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), RESET_MS)
  }

  const label = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy link"
  return (
    <Button variant="ghost" size="sm" onClick={copy} aria-label="Copy a link to this view">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state === "copied" ? "check" : "link"}
          className="inline-flex"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {state === "copied" ? <DrawnCheck reduce={reduce} /> : <Link aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only" role="status">
        {state === "copied" ? "Link copied" : state === "failed" ? "Could not copy. The link is in the address bar." : ""}
      </span>
    </Button>
  )
}
