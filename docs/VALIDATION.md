# Validation log

One row per check per phase, appended at every phase gate (BUILD_PLAN.md section 6). Never loosen a
tolerance. The README's "Validation" table summarises the current state; this file is the history.

Baseline = `main` at `f9ae7ff`, before any Phase 0 change. Machine: Windows 11, Node 22.17.0,
npm 11.5.1, Python 3 venv from `pipeline/requirements.txt`, Chrome (headless) for transfer measurements.

## Phase 0 — 2026-11-10

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-10 | 0 | LFS data files are real files, not pointer stubs | 6 of 6 match their LFS sizes (`ephemeris.bin` 4,207,104 B; `dem_near.bin` 18,458,888 B; `dem_far.bin` 12,822,048 B; `slope_plane.bin` and `slope_max.bin` 9,229,444 B each; `hillshade.png` 8,267,287 B) | real files | pass |
| 2026-11-10 | 0 | `npm run lint` (oxlint), baseline | 0 warnings, 0 errors | clean | pass |
| 2026-11-10 | 0 | `npm test` (Vitest), baseline | 5 files, 48 passed / 0 skipped / 0 failed | 0 failed | pass |
| 2026-11-10 | 0 | `npm run build`, baseline chunks (raw / gzip) | entry `index` 381.77 / 123.38 kB; `Planner` 387.19 / 119.12 kB; `SurfacePanel` 566.72 / 143.30 kB; CSS 94.42 / 30.90 kB; worker 1.85 kB | builds | pass |
| 2026-11-10 | 0 | First-load transfer, welcome screen (baseline) | **54.34 MB**, 16 requests. `loadAll()` fetches all 5 binaries at start: `dem_near` 18.46 + `dem_far` 12.82 + `slope_plane` 9.23 + `slope_max` 9.23 + `ephemeris` 4.21 MB; JS/CSS/fonts 0.39 MB | ≤ 10 MB | **fail** (fixed by P1 tiered loading) |
| 2026-11-10 | 0 | First-load transfer, planner opened with no pin (baseline) | **62.75 MB**, 18 requests (adds `hillshade.png` 8.27 MB and the `SurfacePanel` chunk 0.14 MB) | ≤ 10 MB | **fail** (fixed by P1 tiered loading) |
| 2026-11-10 | 0 | Would compression meet the budget? (`gzip -9` of the data files) | 5 binaries 53.95 → 45.12 MB; with `hillshade.png` 62.21 → 53.26 MB | ≤ 10 MB | no: tiering is required |
| 2026-11-10 | 0 | `05_validate_ephemeris.py`: Sun and Earth az/el vs JPL Horizons (5 sites × 3 times) | Sun max 0.000001° (az and el); Earth max az 0.000002°, el 0.000022° | 0.1° | pass |
| 2026-11-10 | 0 | `06_validate_terrain.py`: projection closed form vs pyproj | max 2.43 × 10⁻¹³ px | 0.01 px | pass |
| 2026-11-10 | 0 | `06_validate_terrain.py`: near-grid height vs raw LOLA 6×6 mean (10 random pixels) | max 0.230 m | 0.25 m | pass |
| 2026-11-10 | 0 | `06_validate_terrain.py`: `slope_plane` vs independent least squares | max 0.102° | 0.13° | pass |
| 2026-11-10 | 0 | `06_validate_terrain.py`: hillshade alpha edge at 84°S | lit radius 182,106 m vs 182,107 m | 1 px | pass |
| 2026-11-10 | 0 | `npm run lint`, end of phase | 0 warnings, 0 errors | clean | pass |
| 2026-11-10 | 0 | `npm test`, end of phase | 5 files, 48 passed / 0 skipped / 0 failed (1 assertion added to the welcome test) | 0 failed | pass |
| 2026-11-10 | 0 | `npm run build`, end of phase (raw / gzip) | entry `index` 381.93 / 123.44 kB (+0.16 kB: the challenge-name line on welcome slide 1); `Planner` 387.33 / 119.15 kB; `SurfacePanel` 566.72 / 143.30 kB; CSS 94.25 / 30.87 kB | builds | pass |
| 2026-11-10 | 0 | Manual, `npm run preview` in headless Chrome at 1440×900 and 360×740 | Welcome shows the challenge name; Skip opens the planner; Enter on the focused map pins the centre (−89.99°); Sun / Earth / Landing cards fill; `V` opens the surface view (canvas present); no console errors; no horizontal scroll at 360 px | behaves as before | pass |

Not re-run in Phase 0 (no engine, data or pipeline change): `07_horizon_reference.py` and
`08_hours_reference.py`. Their fixtures are checked by `npm test` (JS vs Python horizon < 0.00001°,
hours within 0.25 h), which passed.

How first-load transfer is measured: `npm run preview`, then headless Chrome over the DevTools
Protocol with the cache disabled. It sums `encodedDataLength` of every finished request until the
network has been idle for 3 s. `vite preview` gzips JS/CSS/JSON but serves `.bin` and `.png`
uncompressed. The "planner opened" run clicks Skip and places no pin.
