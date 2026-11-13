import { useState } from "react"
import { Lightbulb, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import AntennaExplainer from "./AntennaExplainer"
import LibrationExplainer from "./LibrationExplainer"
import SunPathExplainer from "./SunPathExplainer"

// The three interactive explainers (also on the welcome slides), opened from a small link on the cards.
const EXPLAINERS = {
  sunPath: { title: "Why the Sun skims the horizon at the pole", link: "Why is the Sun so low?", render: () => <SunPathExplainer initialLat={89} /> },
  libration: { title: "Why Earth wobbles (libration)", link: "Why does Earth come and go?", render: () => <LibrationExplainer /> },
  antenna: { title: "Why antenna height matters", link: "Why does height matter?", render: () => <AntennaExplainer /> },
}

export default function ExplainerButton({ which }) {
  const [open, setOpen] = useState(false)
  const e = EXPLAINERS[which]
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Lightbulb className="size-3.5" aria-hidden="true" /> {e.link}
      </button>
      <DialogContent className="max-h-[80dvh] space-y-3 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <DialogTitle className="font-heading text-lg font-semibold">{e.title}</DialogTitle>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <DialogDescription className="sr-only">An interactive diagram with a slider.</DialogDescription>
        {open && e.render()}
      </DialogContent>
    </Dialog>
  )
}
