import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Term, Why, WhyPanel } from "@/components/why/Why"
import { antennaWhy } from "@/lib/explanations.js"
import ExplainerButton from "@/components/explain/ExplainerButton"
import { ANTENNA_PRESETS_M, useStore } from "@/state.js"
import { MetricCard } from "./MetricCard"

// Antenna height presets. Changes the Earth horizon only (the Sun uses a fixed 2 m reference).
export default function AntennaCard() {
  const antennaM = useStore((s) => s.antennaM)
  const setAntenna = useStore((s) => s.setAntenna)
  return (
    <MetricCard
      title="ANTENNA"
      badge={<Why label="How the antenna height is used" content={<WhyPanel why={antennaWhy(antennaM)} title="Antenna height" />} />}
      data-testid="antenna-card"
    >
      <ToggleGroup
        type="single"
        variant="outline"
        className="w-full"
        value={String(antennaM)}
        onValueChange={(v) => v && setAntenna(Number(v))}
        aria-label="Antenna height"
      >
        {ANTENNA_PRESETS_M.map((m) => (
          <ToggleGroupItem key={m} value={String(m)} className="flex-1 font-mono" aria-label={`${m} metres`}>
            {m} m
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="pt-1 text-xs text-muted-foreground">
        Affects Earth visibility (<Term id="dte">direct-to-Earth</Term> contact) only.
      </p>
      <ExplainerButton which="antenna" />
    </MetricCard>
  )
}
