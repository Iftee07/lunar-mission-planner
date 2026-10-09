// Phase 10 smoke test: the welcome flow renders (server-side, no browser APIs needed).
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import WelcomeFlow from "../src/components/welcome/WelcomeFlow.jsx"
import { useStore } from "../src/state.js"

describe("welcome flow", () => {
  test("starts on the welcome screen and renders slide 1 with Skip and three slide dots", () => {
    expect(useStore.getState().screen).toBe("welcome")
    const html = renderToString(<WelcomeFlow />)
    expect(html).toContain("Hi there")
    expect(html).toContain("Welcome to")
    expect(html).toContain("Lunar Mission Planner")
    expect(html).toContain("Let&#x27;s go")
    expect(html).toContain("Skip")
    expect(html.match(/Go to slide \d/g)).toHaveLength(3)
    expect(html).not.toMatch(/https?:\/\//) // no remote assets in the markup
  })
})
