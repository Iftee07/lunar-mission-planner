import AnimatedValue from "./AnimatedValue"

// Text whose characters roll one by one when they change (countdown digits). Characters are keyed from
// the right so the unit stays put when the number gains or loses a digit. Rapid changes (Play, drags)
// swap instantly, as in AnimatedValue.
export default function RollingText({ text }) {
  const chars = [...text]
  return (
    <span className="inline-flex whitespace-pre">
      {chars.map((ch, i) => (
        <AnimatedValue key={chars.length - i} text={ch} />
      ))}
    </span>
  )
}
