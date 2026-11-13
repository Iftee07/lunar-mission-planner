import { useEffect, useId, useReducer, useRef, useState } from "react"
import { Check, ChevronDown, CircleCheck, CircleHelp, CircleX, ExternalLink, Info, TriangleAlert, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { GLOSSARY, SOURCES, readmeUrl } from "@/lib/explanations.js"
import { WHY_CLOSED, whyReducer } from "@/lib/whyState.js"
import { cn } from "@/lib/utils"

// Layered explanations (BUILD_PLAN P6e). Layer 1: <Verdict> on the card. Layer 2: <Why> opens a popover with
// the live checklist. Layer 3: "Show the science" inside it. Content comes from lib/explanations.js.
// The popover opens on mouse hover, on keyboard focus and on tap or click (which pins it open and moves focus
// inside, so its links are reachable without a mouse). Esc or a click outside closes it. Phones have no hover:
// a tap pins it.

const HOVER_CLOSE_MS = 150
const isKeyboardFocus = (el) => {
  try {
    return el.matches(":focus-visible")
  } catch {
    return true
  }
}

// variant: "icon" (a ? button), "term" (dotted-underlined text) or "wrap" (children inside the button).
export function Why({ label, content, children, variant = "icon", side = "bottom", align = "end", className }) {
  const [state, dispatch] = useReducer(whyReducer, WHY_CLOSED)
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  const closeTimer = useRef(0)
  const skipFocus = useRef(false)
  const id = useId()
  useEffect(() => () => clearTimeout(closeTimer.current), [])
  useEffect(() => {
    if (state.pinned) contentRef.current?.focus()
  }, [state.pinned])

  const hoverIn = (e) => {
    if (e.pointerType !== "mouse") return
    clearTimeout(closeTimer.current)
    dispatch("hoverIn")
  }
  const hoverOut = (e) => {
    if (e.pointerType !== "mouse") return
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => dispatch("hoverOut"), HOVER_CLOSE_MS)
  }

  return (
    <Popover open={state.open} onOpenChange={(open) => !open && dispatch("outside")}>
      <PopoverAnchor asChild>
        <button
          ref={triggerRef}
          type="button"
          data-slot="why-trigger"
          aria-label={variant === "term" ? undefined : label}
          aria-expanded={state.open}
          aria-haspopup="dialog"
          aria-controls={state.open ? id : undefined}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          onFocus={(e) => {
            if (skipFocus.current) skipFocus.current = false
            else if (isKeyboardFocus(e.currentTarget)) dispatch("focus")
          }}
          onBlur={(e) => {
            if (!contentRef.current?.contains(e.relatedTarget)) dispatch("blur")
          }}
          onClick={() => dispatch("click")}
          className={cn(
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "icon" && "-m-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground",
            variant === "term" && "cursor-help rounded-sm underline decoration-dotted decoration-1 underline-offset-4",
            variant === "wrap" && "rounded-sm",
            className,
          )}
        >
          {variant === "icon" ? <CircleHelp className="size-4" aria-hidden="true" /> : children}
        </button>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={id}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        side={side}
        align={align}
        collisionPadding={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          const active = document.activeElement
          if (!active || active === document.body || contentRef.current?.contains(active)) {
            skipFocus.current = true // focus goes back to the trigger without opening it again
            triggerRef.current?.focus()
          }
        }}
        onEscapeKeyDown={() => dispatch("escape")}
        onInteractOutside={(e) => {
          if (triggerRef.current?.contains(e.target)) e.preventDefault() // the trigger's own click toggles
        }}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        className="max-h-[min(30rem,70dvh)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto p-3 text-xs leading-snug focus-visible:outline-none"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}

const TONE_ICON = {
  ok: [CircleCheck, "text-lspb-ok"],
  warn: [TriangleAlert, "text-lspb-warn"],
  bad: [CircleX, "text-lspb-bad"],
  none: [Info, "text-muted-foreground"],
}

// Layer 1: plain words, colour and icon.
export function Verdict({ verdict, className }) {
  const [Icon, color] = TONE_ICON[verdict.tone] || TONE_ICON.none
  return (
    <p className={cn("flex items-start gap-1.5 text-sm leading-snug", className)} data-testid="verdict">
      <Icon className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden="true" />
      <span>{verdict.text}</span>
    </p>
  )
}

function SourceLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 underline-offset-4 hover:underline focus-visible:underline">
      {children} <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
    </a>
  )
}

function Science({ science }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="border-t pt-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Show the science
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.dl
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-1.5 overflow-hidden pt-2"
          >
            {[["Method", science.method], ["Data", science.data], ["Threshold", science.threshold], ["Known error", science.error]].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt className="font-semibold text-muted-foreground">Sources</dt>
              <dd>
                <ul className="space-y-0.5">
                  {science.sources.map((key) => {
                    const s = SOURCES[key]
                    return <li key={key}>{s.url ? <SourceLink href={s.url}>{s.label}</SourceLink> : s.label}</li>
                  })}
                  <li>
                    <SourceLink href={readmeUrl(science.readme)}>Method in the README</SourceLink>
                  </li>
                </ul>
              </dd>
            </div>
          </motion.dl>
        )}
      </AnimatePresence>
    </div>
  )
}

// Layer 2 (verdict and checklist with live numbers) and layer 3 (science) of one explanation.
export function WhyPanel({ why, title }) {
  return (
    <div className="space-y-2" data-testid="why-panel">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <Verdict verdict={why.verdict} className="text-xs font-semibold" />
      <ul className="space-y-1">
        {why.checks.map((c) => (
          <li key={c.text} className="flex items-start gap-1.5">
            {c.pass ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-lspb-ok" aria-label="yes" />
            ) : (
              <X className="mt-0.5 size-3.5 shrink-0 text-lspb-bad" aria-label="no" />
            )}
            <span>{c.text}</span>
          </li>
        ))}
      </ul>
      <Science science={why.science} />
    </div>
  )
}

// A glossary term: dotted underline; its short definition pops up (hover, focus or tap).
export function Term({ id, children }) {
  const g = GLOSSARY[id]
  const src = g.source ? SOURCES[g.source] : null
  return (
    <Why
      variant="term"
      label={g.term}
      align="start"
      content={
        <div className="space-y-1.5" data-testid="term-panel">
          <p className="text-sm font-semibold">{g.term}</p>
          <p>{g.text}</p>
          <p className="text-muted-foreground">
            {src?.url ? <SourceLink href={src.url}>{src.label}</SourceLink> : <SourceLink href={readmeUrl(g.readme)}>Method in the README</SourceLink>}
          </p>
        </div>
      }
    >
      {children ?? g.term}
    </Why>
  )
}
