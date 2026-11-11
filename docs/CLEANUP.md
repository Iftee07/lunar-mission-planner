# Cleanup register

Redundancy audit for ground rule 15 of [BUILD_PLAN.md](BUILD_PLAN.md). Written in Phase 0 (2026-11-10).
Every item is either done, scheduled for the phase that replaces it, or kept with a reason. Tick items
off in the phase that does them.

How the audit was done: a grep-based import graph over `web/src` and `web/test`, starting from
`src/main.jsx`, every test file and the worker (`new URL(..., import.meta.url)`). It reports
unreachable files, exports with no importer, and `package.json` dependencies that nothing imports.
Every hit was then checked by hand with `grep -w` across `src/` and `test/`. A second script checked
`src/index.css` for unused classes and custom properties. A one-off `npx knip` was **not** run: the
session's permission policy blocked downloading it. Run it in Phase 7 (see below).

Result of the scan: **no unreachable files and no unused npm dependencies.** All 11 shadcn component
files in `src/components/ui/` are imported, all 15 dependencies and 7 dev dependencies are used
(the three font packages are imported in `main.jsx`; `proj4` is used by the projection test).

## Remove now (Phase 0, done)

- [x] `.vite/deps/` committed at the repo root (a Vite dependency cache). Removed from git and added
      `.vite/` to `.gitignore`. Nothing referenced it.
- [x] `data/fixtures/.gitkeep` and `web/public/data/.gitkeep`. Both folders contain real files, and
      the pipeline creates its own output folders (`mkdir(parents=True, exist_ok=True)`).
- [x] Unused shadcn sub-components with no importer: `PopoverAnchor`, `PopoverHeader`,
      `PopoverTitle`, `PopoverDescription`, `SelectGroup`, `SelectLabel`, `SelectSeparator`, plus the
      unused default export of `segmented-control.jsx`.
- [x] Dead engine helper `hoursToMs` (and its private `HOUR_MS`) in `engine/data.js`.
- [x] `export` dropped from symbols used only inside their own module: `useMediaQuery`, `lonEast`,
      `toLocalInput`, `pinFromXY`, `ANTENNA_DEFAULT_M`, `dirFromAzEl`, `azElFromDir`, `latForRho`,
      `badgeVariants`, `SelectScrollUpButton`, `SelectScrollDownButton`.
- [x] Unused theme tokens in `index.css`: `--card-foreground`, `--color-card-foreground`,
      `--color-lspb-dim` (no `*-card-foreground` or `*-lspb-dim` utility anywhere).
- [x] Stale "(PRD section N)" / "(Phase 9b)" tags in `web/src` and `web/test` comments. That PRD is
      not in the repo, and its phase numbers clash with this build plan. Comment-only change.

## Remove when replaced

| Phase | Item | What replaces it |
|---|---|---|
| P1 | [x] `loadAll()` in `engine/data.js` loads every file at start (54 MB, see VALIDATION.md) | Done: `createDataLoader()` with `core` / `globe` / `polar` / `global` tiers; `DataStatus` shows per-tier byte progress; first load 4.6 MB |
| P1 | [x] Hard-coded `EPHEMERIS_START_UTC_MS` / `EPHEMERIS_END_UTC_MS` in `state.js` (used by `DatePicker`, `BodyCard`) | Done: `ephemerisRange` in the store, from the manifest |
| P1 | [x] `MISSION_STAY_H` used as a fixed constant (`ratings.js`; used by `AppBar`, `SunCard`, `EarthCard`) **and** the duplicate `WINDOW_H = 156` in `hours.js` | Done: `WINDOW_H` deleted; `missionH` (156 / 336 h) in the store drives the metrics window. Ratings follow `missionH` too (team decision, 2026-11-10): `ratingThresholds(missionH)` in `ratings.js`; `MISSION_STAY_H` is now only the default (156 h), where the thresholds equal the published values |
| P1 | [x] `HORIZON_SAMPLES`, `HORIZON_AZ_STEP_DEG`, `HORIZON_MAX_RANGE_M` exported from `horizon.js` with no importer | Done: `horizonGlobal.js` imports them |
| P1 | [x] `STEP_H`, `BISECT_TOLERANCE_H` exported from `hours.js` with no importer | Done: `series.js` / `metrics.js` import `STEP_H` and the shared `bisect()`; `BISECT_TOLERANCE_H` unexported |
| P1 | [x] `MAP_LAT_LIMIT_DEG` exported from `state.js` with no importer | Done: replaced by `POLAR_HD_LAT_LIMIT_DEG` in `engine/terrain.js` (the router) |
| P1 | [x] "Phase N" / "PRD section N" tags in pipeline docstrings (`00`–`09`, `common.py`) | Done (all of them, comment-only for `05`–`08`) |
| P1/P2 | [x] "2026 to 2030" and "south pole only" wording: `index.html` meta description, README intro and "Region" line, About popover first line | Done: P1 dates and Region line; P2 About popover, meta description and README intro describe the whole-Moon globe |
| P2 | [x] README "The app makes no network requests at runtime" | Done: reworded, Moon Trek imagery tiles are the only runtime network use (rule 3), with the offline fallback |
| P2 | [x] `latLonToUnit` exported from `geometry.js` with no importer | Done: `view/globeCoords.js` builds every globe position with it |
| P2 | [x] `MapPanel.jsx` + `map/map.js` | Done: renamed (git mv) to `PolarHdPanel.jsx` and `view/polarMap.js` (`createPolarMap`), view id `polar`; `src/map/` is gone |
| P2 | [x] `setPinLatLon` in `state.js` (dev hook only for now) | Done: exported; the globe calls it on click, and `goToLatLon` (pins + fly-to) on mission pins (P3 typed coordinates will too) |
| P2 | [x] `globe` data tier (`engine/data.js`) returns URLs nobody reads yet | Done: `globe.js` uses `fallbackTextureUrl`, `southPoleHdUrl`, `featuresUrl` and the new `sitesUrl` |
| P3 | [x] `polar` tier `layerUrls` (`illum_avg.png`, `psr.png`) not shown yet | Done: Polar HD map layers (P3.4) read them through `PolarHdPanel` -> `createPolarMap` `layerData` |
| P3 | [x] `pipeline/data/sites_source.csv` (25 verified official sites, written early) has no builder yet | Done early in P2 (the mission pins need it): `11_build_sites.py` writes `sites.json`. P3 adds search on top |
| P5 | [ ] `results.metrics` (mission metrics, next windows) not shown yet | Cards, countdowns, timeline and Details list |
| P2 | [x] `ViewToggle` `Map \| Surface` | Done: same component, `Globe \| Polar HD \| Surface`; `V` cycles (Planner) |
| P3 | [x] Dev-only URL parsing: `devParams` in `state.js` (`?screen&pin&t&view`) and `devStartSlide` (`?slide=`) in `WelcomeFlow.jsx` | Done: both deleted (`chore: remove the dev-only URL parsers`); `urlSync.js` + `lib/urlState.js` handle `pin`, `t`, `view` and the rest in every build |
| P3 | [x] `globe.js` fetched `sites.json` itself (search needs the same list) | Done: `loadSites()` in `state.js` loads and validates once; the globe receives the pins; `onSites` callback deleted |
| P3 | [x] `Check` checkbox row local to `GlobePanel.jsx` (the Polar HD Layers popover needs the same) | Done: shared `components/CheckRow.jsx` |
| P5 | [ ] `TimeBar.jsx` slider and Play | `TimelineStrip` playhead: **one** time control. `PLAY_SPEEDS_H_PER_S` changes from `[6, 12, 24, 72]` to `[1, 6, 24, 72]` |
| P5 | [ ] `MobileSummary.jsx` (phone ratings strip) | Merged into the new card summaries, or removed |
| P5 | [ ] Sun/Earth card logic | Countdowns and metrics go into the shared `BodyCard`, not into `SunCard`/`EarthCard` separately |
| P6c | [ ] `engine/earthDays.js` calendar (green days in `DatePicker`) vs the season heatmap | One computation shared by both. If P6c is cut, the calendar stays |
| P6e | [ ] `RatingBadge` explanation text and its `ui/tooltip.jsx` use (also `TooltipProvider` in `Planner.jsx`) | The shared `<Why>` popover and `explanations.js`. Delete `tooltip.jsx` if nothing else uses it |
| P6e | [ ] About popover "Ratings" section (repeats the badge rules) | Text comes from `explanations.js` |
| P7 | [ ] `ATTRIBUTIONS.md` wording ("PRD rule 11", "PRD v3", "Phase 7") | Reword only; the file itself stays |
| P7 | [ ] One-off `npx knip` (blocked in Phase 0) | Run it and fix everything it finds. Needs the human to allow the download |
| P7 | [ ] `lspb.globe.benchmark()`, `lspb.surface.debugCheck()` and `lspb.setCompareList()` (dev-only validation aids, reached through the dev hooks; the last times the compare budget) | Keep while performance is still being recorded; decide in the final sweep |

## Keep (why)

| Item | Why |
|---|---|
| `pipeline/05`–`08`, `data/fixtures/*` | Validation evidence cited by the README (rule 15) |
| `LICENSE`, `web/src/components/ATTRIBUTIONS.md` | Licence and attribution |
| `web/public/data/*` (incl. `slope_max.bin`) | Listed in `manifest.json` and loaded by `data.js`; `slope_max` feeds the Landing card's "steepest point". In Git LFS so Vercel can build. Moves to the lazy polar tier in P1 |
| `web/public/data/craters.json` | The plan keeps the polar crater file unchanged next to `craters_global.json` |
| `vercel.json` (root) and `web/vercel.json` | Both are part of the Vercel deploy (see README "Deploy"); Phase 0 rule: don't change |
| `proj4` (dev dependency) | The projection test checks the closed form against it |
| `sunMode: "any_part"` in `hours.js` / `state.js` (no UI yet) | P5 adds the "Count partial Sun" toggle |
| three.js surface view, Leaflet map | Kept by the plan (surface view; Polar HD view) |
| `components/ui/segmented-control.jsx` (21st.dev) | Used by `ViewToggle` |
| `vite.config.js` plugin `lspb-cesium-static` and `dist/cesium/` | CesiumJS loads its workers and assets from `/cesium/` at run time (BUILD_PLAN rule 7: "static assets copied by the Vite build") |
| `web/vercel.json`, `vercel.json` unchanged in P2 | The Cesium assets are written into `dist/` by the build, so the deploy needs no change |
| `pipeline/out/` previews | Local, gitignored outputs of `04` and `06` |
