import { useId } from "react"

// Inline SVG art for the welcome slides. Colours are theme tokens (var(--lspb-*)); motion is CSS
// keyframes in index.css on transform/opacity only, switched off under prefers-reduced-motion.
const v = (name) => `var(--lspb-${name})`

// One copy of the crater pattern, 320 units wide; drawn twice so the strip can scroll seamlessly.
const CRATERS = [
  [70, 120, 22], [130, 80, 10], [150, 190, 30], [95, 260, 16], [210, 130, 12], [240, 250, 26],
  [300, 170, 14], [190, 320, 11], [280, 90, 18], [330, 300, 13], [60, 330, 9], [345, 210, 20],
]

// Slide 1: a moon whose surface turns slowly behind a fixed day/night shading, floating gently.
export function MoonArt({ className }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 400 400" className={`lspb-art ${className || ""}`} role="img" aria-label="A slowly rotating Moon">
      <defs>
        <radialGradient id={`${id}-body`} cx="38%" cy="34%" r="70%">
          <stop offset="0%" style={{ stopColor: v("art-moon") }} />
          <stop offset="100%" style={{ stopColor: v("art-moon-shade") }} />
        </radialGradient>
        <radialGradient id={`${id}-shade`} cx="34%" cy="30%" r="78%">
          <stop offset="55%" style={{ stopColor: v("bg"), stopOpacity: 0 }} />
          <stop offset="100%" style={{ stopColor: v("bg"), stopOpacity: 0.75 }} />
        </radialGradient>
        <radialGradient id={`${id}-glow`} r="50%">
          <stop offset="70%" style={{ stopColor: v("art-moon"), stopOpacity: 0.16 }} />
          <stop offset="100%" style={{ stopColor: v("art-moon"), stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={`${id}-disc`}>
          <circle cx="200" cy="200" r="160" />
        </clipPath>
      </defs>
      <g className="lspb-float">
        <circle cx="200" cy="200" r="198" fill={`url(#${id}-glow)`} />
        <circle cx="200" cy="200" r="160" fill={`url(#${id}-body)`} />
        <g clipPath={`url(#${id}-disc)`}>
          <g className="lspb-moon-spin">
            {[0, 320].map((dx) =>
              CRATERS.map(([x, y, r]) => (
                <g key={`${dx}-${x}-${y}`}>
                  <circle cx={x + dx + 40} cy={y + 2} r={r} style={{ fill: v("art-moon-shade"), opacity: 0.35 }} />
                  <circle cx={x + dx + 40} cy={y} r={r} style={{ fill: v("art-crater"), stroke: v("art-moon-shade"), strokeWidth: 1.5 }} />
                </g>
              )),
            )}
          </g>
        </g>
        <circle cx="200" cy="200" r="160" fill={`url(#${id}-shade)`} />
      </g>
    </svg>
  )
}

// Moon horizon used by slides 2 and 3: a curved ground band with a few flattened craters.
function Horizon({ cy, craters }) {
  return (
    <g>
      <circle cx="320" cy={cy} r="900" style={{ fill: v("art-ground"), stroke: v("art-ground-edge"), strokeWidth: 2 }} />
      {craters.map(([x, y, rx]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={rx} ry={rx * 0.28} style={{ fill: v("bg"), opacity: 0.45, stroke: v("art-ground-edge") }} />
      ))}
    </g>
  )
}

// Slide 2: a rocket crossing over the Moon's horizon, wobbling, flame flickering (struggling to land).
export function RocketArt({ className }) {
  return (
    <svg viewBox="0 0 640 360" className={`lspb-art ${className || ""}`} role="img" aria-label="A rocket wobbling over the lunar horizon">
      <Horizon cy={1150} craters={[[90, 300, 34], [260, 286, 20], [430, 318, 40], [570, 292, 24]]} />
      <g className="lspb-rocket-fly">
        <g className="lspb-rocket-bob">
          <g className="lspb-rocket-wobble">
            {/* flame behind the tail (points left, the rocket flies right) */}
            <g className="lspb-flame">
              <path d="M228 140 Q 190 128 160 140 Q 190 152 228 140 Z" style={{ fill: v("art-flame") }} />
              <path d="M228 140 Q 205 133 188 140 Q 205 147 228 140 Z" style={{ fill: v("art-flame-core") }} />
            </g>
            {/* fins */}
            <path d="M246 126 L 228 104 L 262 122 Z" style={{ fill: v("bad") }} />
            <path d="M246 154 L 228 176 L 262 158 Z" style={{ fill: v("bad") }} />
            {/* body and nose cone */}
            <path d="M228 128 H 330 Q 372 140 330 152 H 228 Q 220 140 228 128 Z" style={{ fill: v("art-hull"), stroke: v("art-moon-shade"), strokeWidth: 2 }} />
            <path d="M330 128 Q 372 140 330 152 Z" style={{ fill: v("bad") }} />
            {/* window */}
            <circle cx="300" cy="140" r="7" style={{ fill: v("earth"), stroke: v("art-moon-shade"), strokeWidth: 2 }} />
          </g>
        </g>
      </g>
    </svg>
  )
}

// Slide 3: a generic lander descending on its thruster and settling softly, with a dust puff.
export function LanderArt({ className }) {
  return (
    <svg viewBox="0 0 400 360" className={`lspb-art ${className || ""}`} role="img" aria-label="A lander touching down softly on the Moon">
      {/* Earth low in the sky */}
      <g className="lspb-twinkle">
        <circle cx="322" cy="62" r="20" style={{ fill: v("earth"), opacity: 0.9 }} />
        <path d="M308 56 q 10 -8 20 2 q -6 10 -18 4 Z" style={{ fill: v("ok"), opacity: 0.55 }} />
      </g>
      <g transform="translate(-120 0)">
        <Horizon cy={1170} craters={[[190, 308, 30], [450, 300, 22], [330, 332, 36]]} />
      </g>
      {/* dust at the feet (behind the lander) */}
      <g className="lspb-lander-dust">
        <ellipse cx="200" cy="282" rx="80" ry="10" style={{ fill: v("art-crater"), opacity: 0.45 }} />
      </g>
      <g className="lspb-lander-descend">
        {/* thruster plume */}
        <g className="lspb-lander-thrust">
          <g className="lspb-flame-down">
            <path d="M188 246 Q 200 300 212 246 Z" style={{ fill: v("art-flame") }} />
            <path d="M194 246 Q 200 276 206 246 Z" style={{ fill: v("art-flame-core") }} />
          </g>
        </g>
        {/* legs and foot pads */}
        <path d="M160 222 L 128 270 M240 222 L 272 270 M176 230 L 158 270 M224 230 L 242 270" style={{ stroke: v("art-hull"), strokeWidth: 4, strokeLinecap: "round" }} />
        <path d="M116 272 H 140 M260 272 H 284" style={{ stroke: v("art-hull"), strokeWidth: 5, strokeLinecap: "round" }} />
        {/* descent stage (foil) and engine bell */}
        <path d="M150 200 H 250 L 240 236 H 160 Z" style={{ fill: v("art-foil"), stroke: v("art-moon-shade"), strokeWidth: 2 }} />
        <path d="M190 236 H 210 L 214 248 H 186 Z" style={{ fill: v("art-moon-shade") }} />
        {/* crew cabin, window, antenna */}
        <path d="M164 200 V 168 Q 200 140 236 168 V 200 Z" style={{ fill: v("art-hull"), stroke: v("art-moon-shade"), strokeWidth: 2 }} />
        <circle cx="200" cy="178" r="9" style={{ fill: v("earth"), stroke: v("art-moon-shade"), strokeWidth: 2 }} />
        <path d="M222 156 L 238 132" style={{ stroke: v("art-hull"), strokeWidth: 3, strokeLinecap: "round" }} />
        <circle cx="240" cy="129" r="6" style={{ fill: v("sun") }} />
      </g>
    </svg>
  )
}
