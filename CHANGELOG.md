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

### Phase 1: global data and engine (2026-11-10)

- **Dates now run 2026 to 2035.** The ephemeris is sampled every 30 minutes (same 4.2 MB file);
  interpolation error against SPICE is at most 0.000033°.
- **Any point on the Moon can be computed.** Outside 84°S the engine uses LOLA's global terrain
  (~1.9 km), and the Landing card says "Not assessed (coarse terrain)" there. Every result shows its
  terrain source ("Polar HD · 120 m" or "Global · ~1.9 km"). The globe that lets you pick such points
  arrives in Phase 2; for now it works through the dev hooks.
- **Much faster first load: 4.6 MB instead of 54 MB.** Data loads in tiers: the ephemeris at start,
  the polar terrain when the map opens (with a progress bar), the global terrain on first use.
- New mission metrics in the engine (shown in later phases): share of time with sunlight, Earth in
  view and both; hours with power but no Earth link; longest dark and no-Earth stretches; the next
  five windows; Sun elevation now, lowest and highest. Mission length 6.5 d or 14 d, and the Sun and
  Earth ratings follow it (team decision); at the default 6.5 d they are exactly NASA's values.
- New data, all from NASA: LOLA global terrain (PDS), NASA's average-sunlight and permanent-shadow
  maps of the south pole (for the Phase 3 map layers), an offline Moon texture and a South Pole HD
  overlay (for the Phase 2 globe), and 1709 IAU feature names for globe labels.
- Validation extended: JPL Horizons at Apollo 11, Chang'e-4, Apollo 15 and in 2033-2035; Python
  references for the global horizon and the metrics. 71 tests pass.

### Earlier (before 2026-11-10)

- South-pole landing site planner: Sun and Earth visibility from SPICE ephemeris and LOLA terrain
  horizons, slope-based landing rating, Earth-visible calendar, named craters, first-person surface
  view, welcome slides. Validated against JPL Horizons and independent Python references.
- Vercel deploy from git, with the generated data committed through Git LFS.

## At the hackathon

(Nothing yet.)
