import { useSyncExternalStore } from "react"

// Live result of a CSS media query (false where window is unavailable, e.g. server rendering).
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// Touch-first devices (no hover): tooltips become tap-to-open popovers.
export const useNoHover = () => useMediaQuery("(hover: none)")
