import { useCallback, useState } from "react"

// A panel size in px that the user drags (components/ResizeHandle.jsx), remembered per browser in localStorage
// (a convenience only: blocked storage just means it is not remembered). null = the panel's default size.
// Returns [px, set (live, not stored), save (stored; null clears)].
export function useStoredSize(key) {
  const [px, setPx] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key))
      return v > 0 ? v : null
    } catch {
      return null
    }
  })
  const save = useCallback(
    (v) => {
      setPx(v)
      try {
        if (v === null) localStorage.removeItem(key)
        else localStorage.setItem(key, String(Math.round(v)))
      } catch {
        // storage blocked
      }
    },
    [key],
  )
  return [px, setPx, save]
}
