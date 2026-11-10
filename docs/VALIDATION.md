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
| 2026-11-10 | 0 | Vercel project has Git LFS enabled (needed to deploy the real data files) | confirmed by the team in the Vercel dashboard. Live `main` at https://lunar-mission-planner.vercel.app/ serves `ephemeris.bin` 4,207,104 B, `dem_near.bin` 18,458,888 B and `hillshade.png` 8,267,287 B, all byte-identical in size to the repo, binary content (not LFS pointers) | real files deployed | pass |

Not re-run in Phase 0 (no engine, data or pipeline change): `07_horizon_reference.py` and
`08_hours_reference.py`. Their fixtures are checked by `npm test` (JS vs Python horizon < 0.00001°,
hours within 0.25 h), which passed.

How first-load transfer is measured: `npm run preview`, then headless Chrome over the DevTools
Protocol with the cache disabled. It sums `encodedDataLength` of every finished request until the
network has been idle for 3 s. `vite preview` gzips JS/CSS/JSON but serves `.bin` and `.png`
uncompressed. The "planner opened" run clicks Skip and places no pin.

## Phase 1 — 2026-11-10

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-10 | 1 | SPICE kernel coverage for 2026-2035 | de440s.bsp Moon 1849-12-25 to 2150-01-21; moon_pa_de440_200625.bpc 1549-12-30 to 2650-01-24 | covers 2035-12-31 | pass |
| 2026-11-10 | 1 | Ephemeris step decision: linear interpolation of the float32 table vs SPICE every 60 s, 3 x 30 days (2026-03, 2031-07, 2035-11) | 900 s: Sun 0.000002°, Earth 0.000009°. **1800 s: Sun 0.000004°, Earth 0.000033°** → 1800 s chosen; `ephemeris.bin` stays 4,207,104 B for 2026-01-01 to 2035-12-31 23:30 | < 0.001° | pass |
| 2026-11-10 | 1 | Same check in JS (`global.test.js`, 40 off-grid SPICE vectors in `ephemeris_reference.json`) | Sun 3.8 × 10⁻⁶°, Earth 3.2 × 10⁻⁵° | < 0.001° | pass |
| 2026-11-10 | 1 | `05_validate_ephemeris.py`, Horizons set "polar" (5 sites × 3 times, records unchanged) | max 0.000022° | 0.1° | pass |
| 2026-11-10 | 1 | `05`, Horizons set "nonpolar" (Apollo 11, Chang'e-4, Apollo 15 × 3 times) | max 0.000044° | 0.1° | pass |
| 2026-11-10 | 1 | `05`, Horizons set "late" (3 sites × 2033-06-21, 2035-09-08) | max 0.000039° | 0.1° | pass |
| 2026-11-10 | 1 | Same 60 records in JS (`global.test.js`) | polar 2.2 × 10⁻⁵°, nonpolar 4.4 × 10⁻⁵°, late 3.9 × 10⁻⁵° | 0.1° | pass |
| 2026-11-10 | 1 | `06_validate_terrain.py` (re-run, `common.py` changed) | all 14 checks PASS (projection 2.43 × 10⁻¹³ px, height 0.230 m, slope 0.102°) | as Phase 0 | pass |
| 2026-11-10 | 1 | Global DEM size decision (LOLA LDEM_16, 16 ppd, 33,177,600 B raw) | plain gzip 30,011,692 B (> 20 MB); lossless 2D predictor + byte planes + gzip **19,077,347 B** → 16 ppd kept (1895 m/px) | compressed ≤ 20 MB | pass |
| 2026-11-10 | 1 | Global DEM encoding is lossless (Python decode == raw; JS round trip on random int16 grid) | identical | exact | pass |
| 2026-11-10 | 1 | Global horizon, flat synthetic DEM | -0.0313° everywhere (the curvature drop of the first 1895 m step), deviation 0 | about 0°, ≤ 0.05° | pass |
| 2026-11-10 | 1 | Global horizon, 1000 m pillar 10 px north | 2.7079° vs analytic 2.7079° | 0.01° | pass |
| 2026-11-10 | 1 | Global horizon, longitude wrap at 180°E | block east of 180°E seen at 14.7° from 179.97°E; west -0.03°; sampler identical for 180.1 / -179.9 and 359.99 / -0.01 | wraps | pass |
| 2026-11-10 | 1 | Global horizon, JS (encoded `global_dem.bin`) vs Python (raw PDS `LDEM_16.IMG`) at Apollo 11 and Chang'e-4 | max 0.000001°; ground height identical (< 0.01 m) | 0.2° | pass |
| 2026-11-10 | 1 | Global vs Polar HD horizon at 86°S 180°E (recorded, no pass/fail) | ground -2715.7 m (Polar HD) vs -2707.6 m (Global); horizon difference mean 0.276°, max 1.355° (az 9.5°) | record | recorded |
| 2026-11-10 | 1 | Horizon compute time (dev, headless Chrome, worker) | Global: 20 ms for Sun + Earth horizons; Polar HD: 184 ms for both | info | — |
| 2026-11-10 | 1 | Mission metrics, JS vs Python (SPICE float64), 2 polar + 2 non-polar sites, 156 h window | sunlit / Earth / both fractions identical to 4 decimals; longest dark identical to 0.01 h; Sun elevation now / min / max within 0.01° (test-enforced) | 0.25 h / missionH; 0.25 h; 0.01° | pass |
| 2026-11-10 | 1 | Metrics, synthetic cases (always, never, grazing double crossing, cut off at ephemeris end) | edges within 0.01 h; truncation reported | 0.01 h | pass |
| 2026-11-10 | 1 | Tiered loading (mocked fetch): start + non-polar pin | fetches manifest, ephemeris, global DEM only; no polar file | polar tier not fetched | pass |
| 2026-11-10 | 1 | Average-sunlight / PSR layers (`13_build_illumination.py`): Shackleton floor PSR with 0% sunlight; every PSR pixel 0% sunlight | all pass; PSR area inside 84°S 10,331.9 km²; `illum_avg.png` 2.84 MB, `psr.png` 0.15 MB | ≤ 5 MB each | pass |
| 2026-11-10 | 1 | `craters_global.json` | 1709 IAU features (1615 craters, 22 maria, 58 montes, 14 valles); 160,686 B (35,908 B gzipped) | ≤ 1 MB | pass |
| 2026-11-10 | 1 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-10 | 1 | `npm test` | 7 files, 69 passed / 0 skipped / 0 failed (+21) | 0 failed | pass |
| 2026-11-10 | 1 | `npm run build` (raw / gzip) | entry `index` 389.28 / 126.05 kB (Phase 0: 381.93); `Planner` 387.62 / 119.22 kB; `SurfacePanel` 566.70 / 143.26 kB; worker 4.67 kB | builds | pass |
| 2026-11-10 | 1 | **First-load transfer, welcome screen** (preview, headless Chrome, same method as Phase 0) | **4.60 MB**, 11 requests (ephemeris 4.21 MB + JS/CSS/fonts 0.39 MB) | ≤ 10 MB | **pass** (Phase 0: 54.34 MB) |
| 2026-11-10 | 1 | Transfer after opening the Polar HD map, no pin | 62.75 MB (polar tier loads with the map, as the plan allows; the globe becomes the default view in Phase 2) | info | — |
| 2026-11-10 | 1 | Manual (dev hooks): `lspb.setPinLatLon(0.674, 23.473)` with the map closed | `terrainSource: "global"`, 1895 m; ground -1922 m; Sun and Earth results and metrics; badge "Global · ~1.9 km"; Landing "Not assessed (coarse terrain)"; data fetched: manifest, ephemeris, global DEM only | global, no polar tier | pass |
| 2026-11-10 | 1 | Manual: polar pin (-89.5, -45) | Polar HD 120 m, slope 4.5° (Landing Possible), pin marker on the map; no console errors | as before | pass |
| 2026-11-10 | 1 | Manual: north pole pin (89.45, 137.3) | Global terrain, ground -67 m, metrics computed, no marker on the polar map | works | pass |
| 2026-11-10 | 1 | Manual, production preview at 1440 × 900 | welcome → Skip → Enter pins the map centre → cards fill with the terrain badge → `V` surface view; no console errors | as before | pass |

| 2026-11-10 | 1 | Ratings follow the mission length (team decision): thresholds at the default 156 h | Sun Perfect 192 h, Good 156 h; Earth Perfect 156 h, Good 25% (unchanged published values); 14 d: 372 / 336 / 336 h / 25% of 336 h | equal at default | pass |
| 2026-11-10 | 1 | Gate after that change | lint clean; 71 passed / 0 failed; build OK, entry 389.50 kB | green | pass |
| 2026-11-10 | 1 | Offline texture from NASA SVS CGI Moon Kit (`lroc_color_16bit_srgb_4k.tif`, 4096 x 2048, 3 x uint16, downloaded by the team) replaces the Moon Trek stitch | longitude alignment vs the Moon Trek LRO WAC mosaic: best correlation at 0 px shift (step 0.70°), r = 0.585; `moon_fallback_4k.jpg` 1,411,546 B (was 2,561,962 B); `global_dem.bin` and `south_pole_hd.jpg` rebuilt byte-identical | aligned to 0°E | pass |

| 2026-11-10 | 1 | Validation sites moved to official coordinates (fetched through the team's VPN): Apollo 11 and Apollo 15 lunar modules from NASA NSSDCA (Wagner et al. 2017), Chang'e-4 from LROC post 1087 (45.457°S, 177.589°E; IAU Statio Tianhe 45.45°S, 177.60°E). Sets "nonpolar" and "late" re-queried; "polar" records unchanged | Horizons max: nonpolar 0.000044°, late 0.000039° (`05` and JS); global horizon JS vs Python 0.000001°; metrics JS = Python to 4 decimals; 71 tests pass | 0.1° / 0.2° / 0.25 h | pass |
| 2026-11-10 | 1 | Site list for Phase 3 (`pipeline/data/sites_source.csv`): 25 sites, each with a fetched official source and quote | Apollo ×6 (NSSDCA), Luna 9 (NSSDCA), landers ×9 (LROC, matching the IAU Statio names), south-pole reference ×2 and Artemis III ×2 (NASA PGDA ROI points), upcoming CLPS ×5 (NASA CLPS graphic + IAU / LROC region centres) | unique ids, lat/lon in range, every row sourced | pass |
| 2026-11-10 | 1 | PGDA ROI points (projection `Stereographic_South_Pole`, R 1737.4 km, central meridian 0) checked against our separate NASA LOLA average-sunlight map | Shackleton rim 80%, connecting ridge 78%, Peak near Shackleton 75%, de Gerlache rim 74% (only 0.002% of the 84°S disc is above 70%); Shackleton crater centre 0% (PSR) | ROIs are > 70% regions | pass |

Not in the site list, with reasons: Peregrine (NASA CLPS graphic: "Did not land on the Moon"), Blue Ghost
Mission 2 ("Lunar Farside and Orbit", no site), Blue Moon MK1 ("specific location still being identified"),
and 10 of the 13 Artemis III regions (NASA's 2022 release names them but gives no coordinates, the NTRS
briefing 20230005904 has none, and PGDA publishes ROI files only for Sites 01, 04, 07 and 11).
NSSDCA's Master Catalog pages returned "An error has occurred" on 2026-11-10; Luna 9 comes from its
Soviet missions page instead.

Sources of the non-polar validation coordinates: NASA NSSDCA (Apollo) and LROC (Chang'e-4), listed in
`pipeline/03_horizons_fixtures.py`. Until this update they came from Wikipedia (Apollo 11 identical,
Apollo 15 about 20 m off, Chang'e-4 about 1 km off), because NASA hosts did not answer this machine
without the VPN. The exact spot does not
affect this check, which compares our az/el with Horizons at the same coordinates.

## Phase 2 — 2026-11-11

Globe checks ran in Chrome 157 (headless, real GPU: ANGLE / Intel Iris Xe, Direct3D 11) over the DevTools
Protocol, at 1440 × 900 (globe canvas 1034 × 685 CSS px) and at 360 × 740 (phone emulation, DPR 2).

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-11 | 2 | Spike: Moon Trek WMTS capabilities (`LRO_WAC_Mosaic_Global_303ppd_v02`) | style `default`, TileMatrixSet `default028mm`, `image/jpeg`, TopLeftCorner 180 W 90 N, level 0 = 2 × 1 tiles of 256 px, levels 0-8 (512 × 256 at level 8, ~83 m/px); URL template taken from the document | from the capabilities, not guessed | pass |
| 2026-11-11 | 2 | Spike: CORS on Moon Trek tiles | `Access-Control-Allow-Origin: *` for Origin `http://localhost:4173` and `https://lunar-mission-planner.vercel.app` (curl with an Origin header); in the browser 0 of 373 tiles failed (dev and preview on localhost). The deployed Vercel page itself was not tested (it deploys from `main` after the human's go) | tiles load | pass (no mirror needed: `12_mirror_tiles.py` not written) |
| 2026-11-11 | 2 | Spike: alignment of the Moon Trek mosaic | the first build put the mosaic in the wrong place: Cesium's WMTS provider assumes Web Mercator unless told otherwise. Fixed with the capabilities' geographic grid (`GeographicTilingScheme`), now test-enforced. After the fix: Mare Crisium, Neper and Cleomedes under their IAU labels; the IAU label "Collins" on Collins crater 19 km north of the Apollo 11 pin (278 px north, 109 px east at 60 km altitude, as expected); Shackleton, Spudis, Haynes, Sverdrup and Henson on their craters; the bundled offline texture lines up the same way | on the features | pass |
| 2026-11-11 | 2 | Globe frame: our lat/lon -> Cartesian (engine `latLonToUnit`) vs Cesium `Cartesian3.fromDegrees` on `Ellipsoid.MOON` (5 points) | max 4.8 × 10⁻¹⁰ m; `Ellipsoid.MOON` radii 1,737,400 m = the LOLA reference sphere | 10⁻⁶ R | pass |
| 2026-11-11 | 2 | lat/lon -> Cartesian -> pick (real Cesium `Camera.pickEllipsoid`) -> lat/lon, 12 points × 3 views (nadir from 3000 km, 35° pitch from 400 km, 60° pitch from 50 km; both poles, ±180°) | max 1.75 × 10⁻⁸° | 0.05° | pass |
| 2026-11-11 | 2 | Sub-solar point from the light direction vs the ephemeris at 2026-03-20, 2030-07-04, 2035-11-15 | 0° (floating point); independent check through the engine's local frame: Sun elevation 90.0000° at that point at all 3 times | 0.1° | pass |
| 2026-11-11 | 2 | Lighting on screen | 2026-03-20 (just after new Moon): near side dark; 2026-03-03 (full): near side lit; 2026-03-26 (first quarter): terminator near the central meridian, east half lit | matches the phase | pass |
| 2026-11-11 | 2 | Offline fallback (mock provider `errorEvent`) | first failure retried; first counted failure -> "partial" (offline texture under the tiles); 3rd in a row (test threshold) -> "offline"; a loaded tile resets the count; `offline: true` starts offline | activates | pass |
| 2026-11-11 | 2 | Offline fallback in the browser (preview, `trek.nasa.gov` blocked with `Network.setBlockedURLs`) | offline texture requested, "Offline imagery" badge after 2.0 s, credit switches to NASA SVS; no console errors | activates | pass |
| 2026-11-11 | 2 | `?offline=1` (preview) | no Moon Trek request; `moon_fallback_4k.jpg` 1.41 MB loaded; badge shown | fallback appears | pass |
| 2026-11-11 | 2 | Crater-label LOD monotonic: height limit per rank 1-6 = ∞, 3000, 1200, 500, 200, 80 km; 60 random cameras (10 km to 20,000 km) over the 1709 IAU features | limits never increase with rank; no hidden in-view feature is bigger than a shown one; at most 150 shown | monotonic, ≤ 150 | pass |
| 2026-11-11 | 2 | Labels shown with the camera over 20°S 10°E (no frustum cut; desktop budget 150) | 10,000 km: 24; 3000 km: 77; 1200 km: 150 of 161; 500 km: 150 of 218; 200 km: 140; 50 km: 46. Budget 150 on a 1034 × 685 globe, 19 on a 360 × 460 phone globe | about 150 at most | pass |
| 2026-11-11 | 2 | Every mission pin has a group and a source (`sites.json`, 25 sites) | 25 of 25: known group, https source, source note, `verified` boolean; ids unique; lat/lon in range. Unverified: none | all | pass |
| 2026-11-11 | 2 | `11_build_sites.py` | 25 sites (Apollo 6, CLPS 8, Artemis III regions 2, other countries 7, south-pole reference 2), 11,761 B; longitudes normalised to (-180, 180] | valid CSV | pass |
| 2026-11-11 | 2 | Frame rate while rotating (dev hook `lspb.globe.benchmark(4)`: globe spinning every frame) | whole Moon: 60.0 fps; 200 km over Apollo 11 with tiles streaming: 60.2 fps (the display refresh cap) | ≥ 50 fps desktop | pass |
| 2026-11-11 | 2 | Play at 3 d/s (72 h/s) for 4 s with a Global pin and the globe visible (time offset driven every frame, as Play does) | 57.3 fps, 95th-percentile frame 17.1 ms; 288.7 h covered; the terminator sweeps | smooth | pass |
| 2026-11-11 | 2 | Frame rate on a mid-range phone | not measured (no device here) | ≥ 30 fps | **not checked** (human) |
| 2026-11-11 | 2 | Cesium chunk (`GlobePanel`, lazy) | 3,945.49 kB raw / 1,049.18 kB gzip; plus `dist/cesium/` (workers and assets, 6.9 MB on disk, fetched on demand: 0.13 MB at first load) | info | — |
| 2026-11-11 | 2 | **First-load transfer, welcome screen** (preview, headless Chrome, cache off, same method as Phase 0) | 4.60 MB, 11 requests (unchanged: the globe chunk is not prefetched) | ≤ 10 MB | pass |
| 2026-11-11 | 2 | **First-load transfer, planner opened (globe), no pin** | **5.97 MB** in 20 requests, imagery tiles excluded (ephemeris 4.21, Cesium chunk 1.04, surface chunk 0.14, entry 0.13, planner 0.12, Cesium assets 0.13, `craters_global.json` 0.04, `sites.json` 0.01 MB, fonts and CSS); plus 24 Moon Trek tiles (1.19 MB) | ≤ 10 MB | pass |
| 2026-11-11 | 2 | First-load transfer, planner opened, `?offline=1` | 7.38 MB (adds the 1.41 MB offline texture) | ≤ 10 MB | pass |
| 2026-11-11 | 2 | Manual: hover the Apollo 11 pin | tooltip "Apollo 11 / Apollo · landed"; click: the camera flies there and the pin takes the site's exact coordinates (0.67416 N, 23.47314 E); sidebar shows "Apollo 11", terrain Global · ~1.9 km | name pops up | pass |
| 2026-11-11 | 2 | Manual: zoom from the whole Moon into Shackleton (3000, 800, 120 km) | imagery sharpens (Moon Trek levels up to 8); IAU names appear by size (maria, then Shoemaker / Haworth / Malapert, then Shackleton / Spudis / Haynes); South Pole HD fades in (full below 1500 km); "Open Polar HD map" chip appears; side label "Limb" | as planned | pass |
| 2026-11-11 | 2 | Manual: keyboard and views | globe focused + Enter pins the centre (-20.00, -30.00, Global); arrows rotate, +/- zoom; `V` cycles polar -> surface -> globe; the chip opens Polar HD; Enter on the Polar HD map pins the pole (Polar HD 120 m, slope 9.1°); surface view renders; the polar pin shows on the globe | works | pass |
| 2026-11-11 | 2 | Manual: 360 px phone | no horizontal scroll (scrollWidth 360); whole disc in view; imagery credits behind Cesium's "Data attribution" link; ratings strip, chips and "View from here" do not overlap | works | pass |
| 2026-11-11 | 2 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-11 | 2 | `npm test` | 8 files, 83 passed / 0 skipped / 0 failed (+12, `globe.test.js`) | 0 failed | pass |
| 2026-11-11 | 2 | `npm run build` (raw / gzip) | entry `index` 390.48 / 126.45 kB (Phase 1: 389.50); `Planner` 391.30 / 120.22 kB; `SurfacePanel` 566.71 / 143.27 kB; `GlobePanel` (Cesium) 3,945.49 / 1,049.18 kB; one size warning, for the lazy Cesium chunk only | builds | pass |

Not re-run in Phase 2 (no engine, ephemeris or terrain change): pipeline `05`-`08`. Their fixtures are
checked by `npm test`, which passed.
