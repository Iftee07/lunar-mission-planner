// Smoke test: the welcome flow renders (server-side, no browser APIs needed).
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import WelcomeFlow from "../src/components/welcome/WelcomeFlow.jsx"
import { useStore } from "../src/state.js"

describe("welcome flow", () => {
  test("starts on the welcome screen and renders slide 1 (with its explainer), Skip and three slide dots", () => {
    expect(useStore.getState().screen).toBe("welcome")
    const html = renderToString(<WelcomeFlow />)
    expect(html).toContain("Hi there")
    expect(html).toContain("Welcome to")
    expect(html).toContain("Lunar Mission Planner")
    expect(html).toContain("Lunar Landing Site Navigator")
    expect(html).toContain("Next")
    expect(html).toContain("<svg") // the Sun-path explainer
    expect(html).toContain("Skip")
    expect(html.match(/Go to slide \d/g)).toHaveLength(3)
    expect(html).not.toMatch(/https?:\/\//) // no remote assets in the markup
  })
})
