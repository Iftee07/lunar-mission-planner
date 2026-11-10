# Changelog

NASA Space Apps 2026 (Bangladesh, Nov 13–14). Challenge: **Lunar Landing Site Navigator**.
Product: Lunar Mission Planner. Plan: [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).
Validation history: [docs/VALIDATION.md](docs/VALIDATION.md).

## Before the hackathon

The Local Lead confirmed that building before the event is allowed.

### Phase 0: baseline and setup (2026-11-10)

- Work moves to the `feature/navigator` branch.
- The app names the challenge, "Lunar Landing Site Navigator": in the browser tab title, the app
  bar, the first welcome slide and the About popover. The product name stays "Lunar Mission Planner".
- Baseline recorded in `docs/VALIDATION.md`: 48 tests passing, build sizes, and a first-load
  transfer of 54 MB, over the 10 MB budget. Phase 1's tiered loading fixes this.
- Redundancy audit in `docs/CLEANUP.md`. Removed: the committed Vite cache (`.vite/`), two
  redundant `.gitkeep` files, unused shadcn sub-components and exports, three unused theme tokens,
  and stale PRD/phase tags in code comments. No change in behaviour.
- Added `CLAUDE.md` (working rules for Claude Code) and documented the Vercel deploy in the README.

### Earlier (before 2026-11-10)

- South-pole landing site planner: Sun and Earth visibility from SPICE ephemeris and LOLA terrain
  horizons, slope-based landing rating, Earth-visible calendar, named craters, first-person surface
  view, welcome slides. Validated against JPL Horizons and independent Python references.
- Vercel deploy from git, with the generated data committed through Git LFS.

## At the hackathon

(Nothing yet.)
