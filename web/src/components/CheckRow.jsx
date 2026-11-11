// A labelled checkbox row (the map Layers popovers, the Details card).
export default function CheckRow({ checked, onChange, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-(--lspb-focus)" />
      {children}
    </label>
  )
}
