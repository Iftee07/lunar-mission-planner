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
| 2026-11-11 | 2 | Frame rate on a mid-range phone | not measured; the team decided not to test phone performance for now (2026-11-11). Desktop performance was checked by the team on their PC: OK | ≥ 30 fps | not checked (team decision) |
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

## Phase 3 — 2026-11-11

Browser checks ran in Chrome (headless, real GPU through ANGLE / Direct3D 11) over the DevTools Protocol against
`npm run preview`, at 1440 × 900 and at 360 × 740 (phone emulation, DPR 2).

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-11 | 3 | Every site has a source, unique id, lat/lon in range (`sites.json`, unchanged since Phase 2) | 25 of 25 verified (list in the Phase 3 report); test in `globe.test.js` | all | pass |
| 2026-11-11 | 3 | Typed-coordinate parser (`coords.test.js`) | 26 cases: signed decimals, 0-360 east, N/S/E/W after or before the numbers, either order, degree signs, unicode minus, poles and 180°; errors for empty, words, 1 or 3 numbers, latitude > 90, longitude > 360 or W > 180, two latitudes, two longitudes, sign plus letter, malformed numbers | ≥ 12 cases | pass |
| 2026-11-11 | 3 | Slope layer colours vs the Landing rating | green exactly where `rateLanding` says Possible, 0° to 20° in 0.05° steps; amber 8° to 10° inclusive, red above; the layer's pixel value equals the card's bilinear value at pixel centres (real `slope_plane.bin`) | same thresholds (rule 8) | pass |
| 2026-11-11 | 3 | URL round trip (`urlState.test.js`) | store -> URL -> store restores time (to the minute), antenna, mission, Sun mode, view, layers, globe camera (4 decimals, 10 m) and the pin (site id, or 6 decimals = 0.03 m); defaults left out; bad values ignored one by one; no planner key -> welcome stays | restores | pass |
| 2026-11-11 | 3 | Shared link in the browser: `?site=apollo11&t=2026-03-26T00:00Z&ant=10` | no welcome slides; sidebar "Apollo 11", Global · ~1.9 km, antenna 10 m pressed; the camera flies there and `cam=0.6742,23.4731,400,…` is added | restores | pass |
| 2026-11-11 | 3 | Reload and copied link reopen the same view | Polar HD pin + slope layer: URL identical after reload; "Copy link" (clipboard permission granted) copied `?site=im2&t=2027-01-05T12:00Z&mission=336&cam=…`, which reopened IM-2 Athena with the identical URL | same URL | pass |
| 2026-11-11 | 3 | Copy link feedback | "Copied" + drawn check mark, back to "Copy link" after 1.8 s; without clipboard access (unfocused headless page) it says "Copy failed … the link is in the address bar" | feedback | pass |
| 2026-11-11 | 3 | Search (`Ctrl`+`K`) | "shackleton rim" -> one result in group "South-pole reference", Enter pins it (Polar HD · 120 m) and the globe flies there; "shack" lists Peak Near Shackleton (Artemis III) then the two reference points | works | pass |
| 2026-11-11 | 3 | Typed coordinates in search | `0.674N 23.473E` -> "Go to 0.6740 N, 23.4730 E · Global terrain"; pin at 0.6740 N 23.4730 E. `-89.45, 222.7` -> pin 89.4500 S, 222.7000 E on Polar HD · 120 m, URL `pin=-89.45,-137.3`. `91, 0` -> "Latitude must be between 90°S and 90°N" | parses, clear errors | pass |
| 2026-11-11 | 3 | Search while Polar HD is open | Connecting ridge: the map pans there (map view changes, view stays polar); Apollo 15 (outside 84°S): switches to the globe | pans / flies | pass |
| 2026-11-11 | 3 | Polar HD layers render (worker), all three from a link | 3 overlays of 3038 × 3038 px within 2.2 s of opening the link, including the polar tier download (local preview); opacity 0.7 / 0.8 / 0.7; CSS transition 0.2 s; drawing order sunlight, PSR, slope | off the main thread | pass |
| 2026-11-11 | 3 | Value under the cursor | at Shackleton's floor (pole): "sunlit 0% of the time   permanent shadow   slope 9.1°"; on the rim pin: "sunlit 80% … not PSR   slope 3.3°"; on the connecting ridge: "sunlit 43% … not PSR   slope 5.6°" (Shackleton floor PSR and 0% sunlit match `13_build_illumination.py`'s own check) | plausible, matches source | pass |
| 2026-11-11 | 3 | Landing card "See slopes on the map" | opens Polar HD with only the slope layer on, centred on the pin (zoom -1) | works | pass |
| 2026-11-11 | 3 | 360 px phone | no horizontal scroll (scrollWidth 360); app bar buttons inside 360 px; Layers popover 0-320 px; search dialog 16-344 px, input focused, 6 Apollo results | works | pass |
| 2026-11-11 | 3 | Globe zoom (follow-up to the human's report "touchpad zoom does not work") | from 6000 km: mouse wheel (spaced like a real wheel) -> 1345 km; Ctrl + wheel, which is how a touchpad pinch arrives, -> 107 km with the page zoom unchanged (it zoomed nothing before the fix); new + / − buttons: 107 -> 36 -> 70 km | zooms | pass |
| 2026-11-11 | 3 | Mission-site markers on the Polar HD map (follow-up request) | 6 markers for the 7 sites south of 84°S (Griffin Mission-1 and IM-4 share Mons Mouton, -84.6, 31.0); group colours as on the globe; focusable (tabIndex 0, role button, labelled); hover tooltip "Connecting ridge … / South-pole reference · reference point"; click picks it (Polar HD · 120 m, `site=connecting_ridge`); the Layers checkbox hides them | as on the globe | pass |
| 2026-11-11 | 3 | Console errors during all browser checks | none | 0 | pass |
| 2026-11-11 | 3 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-11 | 3 | `npm test` | 12 files, 132 passed / 0 skipped / 0 failed (+49: `coords` 26, `siteSearch` 5, `polarLayers` 9, `urlState` 9) | 0 failed | pass |
| 2026-11-11 | 3 | `npm run build` (raw / gzip) | entry `index` 399.03 / 130.05 kB (Phase 2: 390.48); `Planner` 414.54 / 127.39 kB (391.30); `SurfacePanel` 566.71 / 143.27 kB; `GlobePanel` (Cesium) 3,943.84 / 1,048.43 kB; `polarLayers.worker` 1.70 kB; one size warning, for the lazy Cesium chunk only | builds | pass |
| 2026-11-11 | 3 | **First-load transfer, welcome screen** (cache off, same method as Phase 0) | 4.61 MB, 11 requests | ≤ 10 MB | pass |
| 2026-11-11 | 3 | **First-load transfer, planner opened (globe), no pin** | **5.98 MB** in 23 requests, imagery tiles excluded; plus 24 Moon Trek tiles (1.19 MB). The layers add nothing here: the PNGs load with the polar tier, the slope layer reuses `slope_plane.bin` | ≤ 10 MB | pass |
| 2026-11-11 | 3 | Copy link on the deployed (HTTPS) site, a real phone, a screen reader | not checked: Vercel deploys from `main` after the human's go; no phone or screen reader in this session | — | not checked |

Not re-run in Phase 3 (no engine, ephemeris, terrain or site-data change): pipeline `05`-`08` and `11`. Their
fixtures and `sites.json` are checked by `npm test`, which passed.

## Phase 4 — 2026-11-11

Browser checks as in Phase 3 (headless Chrome over the DevTools Protocol, real GPU), against `npm run preview`
unless marked "dev" (`npm run dev`, used where a timing needs the `lspb` console hooks; dev is unminified, so
slower than production).

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-11 | 4 | Compared site vs the single-site path (`compare.test.js`, real data, (-89.5, -45), antenna 10 m, 2027-04-10 12:00) | hours to change (Sun, Earth), window hours, longest dark and power-without-Earth identical (difference 0; both paths call `siteResults`) | 0.01 h | pass |
| 2026-11-11 | 4 | A 5th site is rejected | `addCompareEntry` returns "Compare holds 4 sites at most"; in the browser the sidebar button turns off ("Compare is full (4 sites)") | rejected | pass |
| 2026-11-11 | 4 | A date-shifted column uses its own time | +1 lunar day column = the single-site path at main time + 708.73 h (all durations identical); its Sun elevation differs from the unshifted column; in the browser the copy of Shackleton rim reads "+29.5 d · 2026-04-24 12:44 UTC", Sun -1.4° vs -0.8°, Talk to Earth "Not recommended" vs "Good" | own time | pass |
| 2026-11-11 | 4 | Date shifts | +1 lunar day = 29.530589 d (mean synodic month); +1 month keeps the day and time and clamps to the month's end (31 Jan 2028 -> 29 Feb 2028) | as defined | pass |
| 2026-11-11 | 4 | Best value per row | max or min per row; ties all glow; nothing glows with fewer than two values or all equal; "no sunset within the lookahead" beats any finite time | as defined | pass |
| 2026-11-11 | 4 | Presets point at verified sites | Equator vs pole (apollo11, shackleton_rim), Two Artemis III regions (artemis_peak_near_shackleton, artemis_de_gerlache_rim): all in `sites.json`, verified | verified | pass |
| 2026-11-11 | 4 | Preset "IM-2: planned target vs where it ended up" | not built: LROC "IM-2 Athena Seen Obliquely" (https://lroc.im-ldi.com/images/1408, fetched 2026-11-11) gives the landing point (84.7906° S, 29.1957° E) and "near the center of Mons Mouton", but no planned-target coordinates. Rule 4: no invented coordinates | both verified | not built |
| 2026-11-11 | 4 | `cmp` link parameter | encode / decode round trip in column order, `@` shift in hours, lat:lon for unnamed places, at most 4, bad items skipped (`urlState.test.js`); browser: `cmp=apollo11,shackleton_rim,change4,shackleton_rim@708.73` after the date copy | restores | pass |
| 2026-11-11 | 4 | **4 sites, terrain already loaded** (dev, `lspb.setCompareList`, new places so no cache) | 4 Polar HD: 735 ms; 4 Global: 186 ms; 2 + 2: 475 ms | < 1.5 s | pass |
| 2026-11-11 | 4 | 4 sites from a cold link (preview; includes downloading and decoding the polar and global terrain) | 1984 ms, 2055 ms | info | — |
| 2026-11-11 | 4 | Play at 0.25 d/s on a 1440 × 900 window (preview) | main pin only: 60.3 fps (worst frame 17 ms); main pin + 4 compare columns: 52.5 fps (worst frame 34 ms) | ≥ 50 fps desktop | pass |
| 2026-11-11 | 4 | Compare values, 2026-03-26 00:00 UTC (preview) | Apollo 11: Sun +23.1°, Power Perfect, Earth Perfect, sunlit 100%, glows in every row it leads; Shackleton rim: -0.8°, Not recommended / Good / Landing Possible, 62% sunlit; Peak Near Shackleton: +0.3°, 79% sunlit, power-without-Earth 0 d (glows); Chang'e 4 (far side): Earth in view 0%, "Earth down now" | plausible (far side never sees Earth) | pass |
| 2026-11-11 | 4 | Remove a column, renumbering, colours | ✕ on column 3: 3 columns remain, numbers follow the order, freed colour reused by the next site | works | pass |
| 2026-11-11 | 4 | Globe markers and arcs | numbered markers in the column colours, arcs drawn along great circles at 1.5 km height; after removing / adding columns no render error. Found and fixed: Cesium destroys a polyline's material with it, so lines sharing one material threw on the second removal (also latent in the lat/lon grid) | no errors | pass |
| 2026-11-11 | 4 | Compare palette contrast on `--lspb-bg` | cyan 7.86, orange 6.06, magenta 4.86 (lightened from Tol's #ee3377, 4.45), teal 6.03 | ≥ 4.5:1 | pass |
| 2026-11-11 | 4 | 360 px phone | swipe carousel with snap (`x mandatory`), columns 259 px, row labels pinned; page scrollWidth 360. Found and fixed: the cells' sr-only labels escaped the scroll box and widened the page to 973 px | no horizontal scroll | pass |
| 2026-11-11 | 4 | Console errors during the browser checks (after the two fixes) | none | 0 | pass |
| 2026-11-11 | 4 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-11 | 4 | `npm test` | 13 files, 143 passed / 0 skipped / 0 failed (+10: `compare` 9, `urlState` 1) | 0 failed | pass |
| 2026-11-11 | 4 | `npm run build` (raw / gzip) | entry `index` 404.19 / 131.91 kB (Phase 3: 399.03); `Planner` 426.83 / 130.91 kB (414.54); `SurfacePanel` 566.71 / 143.25 kB; `GlobePanel` 3,947.57 / 1,049.57 kB | builds | pass |
| 2026-11-11 | 4 | **First-load transfer** (cache off) | welcome 4.62 MB, 11 requests; planner with globe, no pin: 5.99 MB, 23 requests, plus Moon Trek tiles | ≤ 10 MB | pass |
| 2026-11-11 | 4 | "+ Compare" in a mission pin's globe tooltip; a real phone | not automated (needs hovering a pin at a screen position); no phone in this session | — | not checked |

Not re-run in Phase 4 (no engine, ephemeris or terrain change): pipeline `05`-`08`. Their fixtures are
checked by `npm test`, which passed.

## Phase 5 — 2026-11-11

Browser checks as in Phase 4 (headless Chrome 1440 × 900 over the DevTools Protocol, real GPU through ANGLE /
Direct3D 11), against `npm run preview` unless marked "dev" (`npm run dev`, for the `lspb` console hooks).
Test link: `?site=shackleton_rim&t=2027-01-10T00:00Z`, with `&cmp=apollo11,shackleton_rim,shackleton_rim@708.73,change4`
for the 4-column runs.

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-11 | 5 | Timeline bar edges vs `nextWindows` (`timeline.test.js`, real data, the 3 `horizon_reference` pins, antenna 10 m, 2027-04-10 12:00; playhead at 0 h and at 37.1 h, a different 0.25 h sampling grid) | every closed edge within 0.01 h | 0.01 h | pass |
| 2026-11-11 | 5 | Same, in the browser (dev, Shackleton rim) | 7 edges compared (3 Sun, 2 Earth, 2 Both bars on the strip): difference 0 | 0.01 h | pass |
| 2026-11-11 | 5 | Both row = overlap of the Sun and Earth rows | identical to `intersectIntervals`; every Both bar lies inside a Sun bar and an Earth bar | as defined | pass |
| 2026-11-11 | 5 | Playhead keys (unit test and browser) | → 0.25 h, Shift+→ 24.25 h, Home 0; clamped to [0, 708.7 h]; `aria-valuetext` "+0 d, 2027-01-10 00:00 UTC" | as specified | pass |
| 2026-11-11 | 5 | Click a bar sets the offset (unit test and browser) | hit test finds the bar (thin bars within 2 px); browser: click on the Sun bar from 2027-01-23 14:26 sets the offset to 326.44 h = its start | bar start | pass |
| 2026-11-11 | 5 | Hover a bar | tooltip "Shackleton rim · Sun up: 2027-01-23 14:26 → 2027-02-01 07:44 UTC · 8.7 d"; ghost time set; surface view shows the ghost Sun and Earth while hovering, hides them after leaving | shows | pass |
| 2026-11-11 | 5 | Drag the playhead | press at 100 h, drag to 300 h: offset 300.00 h | follows | pass |
| 2026-11-11 | 5 | Details window jump | "Jump to sun up from 23 Jan 14:26 UTC" sets the offset to 326.44 h (start time unchanged); beyond the strip the start time moves instead, clamped to the ephemeris (unit test) | window start | pass |
| 2026-11-11 | 5 | Countdown tones | > 48 h green, 12 to 48 h amber, < 12 h red before a set; a rise is neutral (unit test). Browser: "Sunset in 11.1 d" (green; 266.96 h), "Earthrise in 40 h" (neutral) | as specified | pass |
| 2026-11-11 | 5 | Countdown text contrast on `--lspb-bg` | green 9.98, amber 10.42, red 6.29, muted 6.75 | ≥ 4.5:1 | pass |
| 2026-11-11 | 5 | Elevation sparkline series | 157 hourly values over 156 h; first = Sun elevation now; inside the metrics' min / max (unit test). Browser: "+1.0°", sparkline "from +0.6° to +1.0°" | consistent | pass |
| 2026-11-11 | 5 | Timeline rows for 4 compared sites (dev, idle time, one site per idle slice) | all 5 row groups 612 ms after `setCompareList` (includes the 4 horizons) | info | — |
| 2026-11-11 | 5 | Loop | Play from 100 h with loop on (mission 156 h): offset set to 255.5 h wraps back to 101.5 h on the next frames; the bracket stays on [100, 256 h] | replays the window | pass |
| 2026-11-11 | 5 | Compared columns after Play stops (round-robin while the time moves) | every column's time = main time + its shift, difference 0 h (read 400 ms after Pause; settle delay 120 ms) | exact once settled | pass |
| 2026-11-11 | 5 | **Scrubbing the playhead with 4 compare columns and the globe** (preview, 4 s of pointer moves sweeping 0 ↔ 700 h) | first attempt 35.5 fps (p95 frame 33.5 ms). Fixed: compared columns take turns (one per frame) while the time moves and all update once it settles; rapidly changing values skip motion's layout work. After: **59.5 fps**, p95 16.9 ms, worst 33.4 ms | ≥ 50 fps desktop | pass |
| 2026-11-11 | 5 | Play at 6 h/s, same setup (preview) | first attempt 42.8 fps; after the fix **58.0 fps**, p95 16.9 ms, worst 33.6 ms | ≥ 50 fps desktop | pass |
| 2026-11-11 | 5 | Surface view render loop during the checks (dev) | 56 fps | smooth | pass |
| 2026-11-11 | 5 | 360 × 740 phone (dev, 1 compare column) | page scrollWidth 360; strip 336 × 96 px; summary strip "Sun Perfect set 11.1 d · Earth Good rise 40 h · Landing Possible" | no horizontal scroll | pass |
| 2026-11-11 | 5 | Console errors during the browser checks | none | 0 | pass |
| 2026-11-11 | 5 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-11 | 5 | `npm test` | 14 files, 155 passed / 0 skipped / 0 failed (+12: `timeline` 12) | 0 failed | pass |
| 2026-11-11 | 5 | `npm run build` (raw / gzip) | entry `index` 408.38 / 133.44 kB (Phase 4: 404.19); `Planner` 441.47 / 135.76 kB (426.83); `SurfacePanel` 568.11 / 143.65 kB; `GlobePanel` 3,947.57 / 1,049.58 kB | builds | pass |
| 2026-11-11 | 5 | **First-load transfer** (welcome, cache off) | 4.63 MB, 11 requests | ≤ 10 MB | pass |
| 2026-11-11 | 5 | Bars sweep in / cross-fade, rolling digits, reduced motion; a real phone | animations not measured headless (static screenshots only); no phone in this session | — | not checked |

Not re-run in Phase 5 (no ephemeris, terrain or horizon change; the engine only gained the timeline rows, the
countdown rule and the elevation series): pipeline `05`-`08`. Their fixtures are checked by `npm test`, which passed.

## Phase 6 — 2026-11-13

Browser checks with the same driver as Phase 5 (headless Chrome 1440 × 900 and 360 × 740 over the DevTools
Protocol), against `npm run preview` unless marked "dev" (`npm run dev`, for the `lspb` console hooks). Optional
items cut under the freeze rule (BUILD_PLAN section 7, cut order): 6c season heatmap, 6f export, 6g live shadows.

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-13 | 6 | Ring points at the requested radius (`sensitivity.test.js`: 5 centres incl. 89.99°S and the 180°E wrap × 250 m, 500 m, 1, 5, 10, 20 km; haversine) | every point within 1% | 1% | pass |
| 2026-11-13 | 6 | Ring shares vs the mission metrics (real data, horizon reference pin 1, antenna 10 m, 2 times) | sunlit and Earth shares identical (12 decimals); null outside the ephemeris | identical | pass |
| 2026-11-13 | 6 | Ring, Shackleton rim 89.45°S 137.3°W (dev, Polar HD, 500 m) | 8 points ready 1.90 s after `goTo` (16 horizons); "Within 500 m: sunlight 0%–100%, Earth 0%–48%"; the pin 100% / 38%, 24 h earlier 100% / 22%, later 100% / 53% | info | — |
| 2026-11-13 | 6 | Ring, Apollo 11 (dev, Global, smallest ring 5 km) | 8 points ready 0.54 s; sunlight 71% everywhere, Earth 100%; 24 h earlier 56%, later 86% sunlit | info | — |
| 2026-11-13 | 6 | Ring on the maps | Polar HD map: 8 coloured dots around the pin (lit side yellow, dark side blue); globe: 8 points (too close to the pin to separate at globe scale) | drawn | pass |
| 2026-11-13 | 6 | **Play at 6 h/s with the ring, 4 compare columns and the globe** (preview, `?site=shackleton_rim&t=2027-01-10T00:00Z&cmp=apollo11,shackleton_rim,shackleton_rim@708.73,change4`, 4 s) | **59.9 fps**, p95 16.9 ms, worst 33.3 ms; no long tasks (> 50 ms) | ≥ 50 fps desktop | pass |
| 2026-11-13 | 6 | Checklists vs the rating functions (`explanations.test.jsx`: Sun and Earth × 3 synthetic cases × 156 h and 336 h; Landing × 3) | for every gate, "all lines at that level pass" = the rating reaches it | exact | pass |
| 2026-11-13 | 6 | Every rating, layer and badge has a Why (unit test) | Sun, Earth, Landing, Landing not assessed, terrain badge, antenna and the 3 Polar HD layers render a trigger and a panel with method, data, threshold, known error and README link; every source key resolves to a README citation; 5 glossary terms render | all | pass |
| 2026-11-13 | 6 | Why opens on keyboard focus (unit test + browser) | reducer: focus opens, blur closes a peek, click pins, Esc and outside close. Browser (desktop and 360 px): focus-visible on the Sun `?` opens the checklist; Enter pins it and moves focus inside; Tab reaches "Show the science"; Esc closes and focus returns to the trigger without reopening | as specified | pass |
| 2026-11-13 | 6 | Sun declination band used by the Sun-path explainer (`explain.test.jsx`, ephemeris 2026-2035, daily) | max \|declination\| 1.588°; the explainer's constant is 1.59° (set from this measurement) | ≤ constant | pass |
| 2026-11-13 | 6 | Sun-path geometry (unit test) | equator: highest Sun 90°; pole: elevation = −declination all day; highest = 90° − \|lat − dec\| (4 cases, 721 samples, 4 decimals); midday due north for a southern observer | analytic | pass |
| 2026-11-13 | 6 | Earth's libration loop from 89.5°S, 0°E (real ephemeris, 30 d from 2027-01-01, every 6 h) | 121 samples; \|elevation\| < 10°, swing > 5°; \|azimuth\| < 20° | as stated | pass |
| 2026-11-13 | 6 | Explainers under reduced motion (unit test: SSR inside `MotionConfig reducedMotion="always"`; browser: `prefers-reduced-motion: reduce` emulated) | all three render an SVG and a slider; browser: Sun dot and libration Earth stay put with reduce (Sun 160 → 160, day 0 → 0) and move without it (Sun 187.9 → 148.1, day 17 → 23). Found and fixed: motion's keyframe loop never started, so the Sun dot now runs on its own rAF loop | static when reduced | pass |
| 2026-11-13 | 6 | Welcome flow (preview) | slide 1 latitude slider to 90°S: "Highest Sun: 0.0°", arrow keys on the slider do not change slide; slide 2 "above the horizon 43% of the month"; slide 3 at 10 m "Earth in view, needs 7.4 m"; "Start at Apollo 11 vs Shackleton" opens the planner with compare = Apollo 11, Shackleton rim and Shackleton rim pinned | as specified | pass |
| 2026-11-13 | 6 | 360 × 740 phone (dev) | page scrollWidth 360; Why popover inside 32-352 px; Move a little card fits | no horizontal scroll | pass |
| 2026-11-13 | 6 | Welcome, changed after the first gate (team decision): last button "Open the planner" (dev) | opens the planner with no pin and no compared sites | as decided | pass |
| 2026-11-13 | 6 | Globe South Pole HD overlay edge (dev, camera straight down over the pole at 700 km and over 85°S at 250 km) | before: a lighter disc with a hard edge at 84°S; after: no visible edge, tone close to the mosaic (screenshots compared) | blends in | pass |
| 2026-11-13 | 6 | Main thread while the overlay loads (dev, long tasks > 50 ms) | first version on the main thread: one 90 ms task (pixel read-back 51 ms + encode start 31 ms). Moved to a worker: none | no long tasks | pass |
| 2026-11-13 | 6 | Globe South Pole HD overlay removed (team decision; dev, camera over the pole at 500 km) | only the Moon Trek mosaic shows; `south_pole_hd.jpg` is not requested; the Layers menu has no overlay slider; "Open Polar HD map" still offered; no console errors | removed | pass |
| 2026-11-13 | 6 | Globe at device pixel ratio 1.5 (dev, 1280 × 760) | canvas 1416 × 804 for 944 × 536 CSS px (was rendered at 944 × 536 and stretched); labels sharp in the screenshot; pins and labels keep their size; a click at the view centre pins 10.00°N 150.00°W = the camera centre; spin benchmark 59.8 fps | sharp, same picking | pass |
| 2026-11-13 | 6 | Sidebar at 21rem (dev, 1440 × 900, polar pin, all cards) | 336 px; no element wider than the sidebar (scrollWidth = clientWidth) | no overflow | pass |
| 2026-11-13 | 6 | Sidebar resize (dev, 1440 × 900) | default 336 px; drag left 150 px: 486 (saved); drag right 400: 280 (minimum); drag left 2000: 640 (maximum; main view 800 px, above its 480 minimum); Right arrow −32 px; double-click: 336, storage cleared; width kept after a reload; the compare drawer still resizes with the shared handle (306 → 366 px) | resizes, clamps, remembered | pass |
| 2026-11-13 | 6 | Pin coordinate label (dev) | globe: "89.4500 S, 222.7000 E" below the pin, clear of its ring; Polar HD map: same text below the pin, updated to "88.7000 S, 292.0000 E" for a new pin; removed for a Global-terrain pin (Apollo 11); text = the site line's | shows the pin's lat, lon | pass |
| 2026-11-13 | 6 | Compared sites on the Polar HD map (dev; columns: Shackleton rim, Apollo 11, 88.7°S 68°W, Shackleton rim +29.5 d) | badges "1·4" (same place shares one) and "3"; Apollo 11 left off (north of 84°S); one line, drawing in; cleared when the list empties | as on the globe | pass |
| 2026-11-13 | 6 | Compare drawer resize (dev, 1440 × 900, 2 columns, Polar HD view) | default 306 px; drag up 200 px: 386 px (stops where the map keeps 240 px); drag down 400 px: 96 px (minimum); Up arrow +32 px; height saved; the Leaflet map follows (320 → 240 → 530 px) | resizes, map follows | pass |
| 2026-11-13 | 6 | Console errors during the browser checks | none | 0 | pass |
| 2026-11-13 | 6 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-13 | 6 | `npm test` | 17 files, 186 passed / 0 skipped / 0 failed (+31: `sensitivity` 8, `explanations` 13, `explain` 10) | 0 failed | pass |
| 2026-11-13 | 6 | `npm run build` (raw / gzip) | entry `index` 435.93 / 142.33 kB (Phase 5: 408.38; the welcome slides now carry the explainers, slider and popover); `Planner` 351.31 / 106.21 kB (441.47) | builds | pass |
| 2026-11-13 | 6 | **First-load transfer** (welcome, cache off) | 4.63 MB, 12 requests | ≤ 10 MB | pass |
| 2026-11-13 | 6 | Pop-in and science expand animations; a real phone; screen reader | not measured headless; no phone or screen reader in this session | — | not checked |

Not re-run in Phase 6 (no ephemeris, terrain or horizon change; the engine gained the ring, the window shares and
the explainer geometry): pipeline `05`-`08`. Their fixtures are checked by `npm test`, which passed.

## Phase 7 — 2026-11-13

Browser checks with the same headless-Chrome driver (DevTools Protocol, 1440 × 900 and 360 × 740), against the
production build (`npm run preview`) unless marked "dev" (`npm run dev`, for the `lspb` console hooks).

| Date | Phase | Check | Value | Tolerance / budget | Result |
|---|---|---|---|---|---|
| 2026-11-13 | 7 | `05_validate_ephemeris.py` (60 records vs JPL Horizons) | max \|d az\|, \|d el\|: Sun 0.000005°, Earth 0.000044° | 0.1° | pass |
| 2026-11-13 | 7 | `06_validate_terrain.py` | all 13 checks pass (e.g. closed form vs pyproj 2.4 × 10⁻¹³ px, height vs LOLA 6×6 mean 0.230 m, slope vs lstsq 0.102°) | as in the script | pass |
| 2026-11-13 | 7 | `07_horizon_reference.py`, `08_hours_reference.py` | fixtures kept (validation evidence); their comparisons run in `npm test` | — | pass |
| 2026-11-13 | 7 | `10_build_global.py`, `11_build_sites.py` re-run | outputs byte-identical to the committed data (only the manifest build date changed, restored); 25 sites, none unverified | identical | pass |
| 2026-11-13 | 7 | **Published benchmark, Earth** (`14_published_benchmark.py` + `benchmark.test.js`): Earth above the flat horizon, hourly through 2027 (8760 h), vs JPL Horizons (altitude 0, AIRLESS), PGDA Site01 connecting ridge and Site04 Shackleton rim | shares 45.18% / 46.04%, identical to Horizons; max \|d el\| 2.7 × 10⁻⁵° | 0.1° and 0.1 percentage points | pass |
| 2026-11-13 | 7 | **Published benchmark, Sun**: share of 2026-2035 (hourly) with any part of the Sun above the terrain horizon vs NASA PGDA `AVGVISIB_75S_120M_201608` (Mazarico et al. 2011; 18.6-year average, 120 m pixel) | observer on the ground: connecting ridge 78.9% vs 78.3% (3×3 pixels 50.2-78.3%); Shackleton rim 79.2% vs 80.5% (3×3 0.0-84.1%). App height 2 m: 87.2% / 82.8%. Per year at 2 m: 85-88% / 81-84% | benchmark; criterion set before the first run: inside the 3×3 range | Shackleton rim pass; connecting ridge **miss by 0.6 points** |
| 2026-11-13 | 7 | Benchmark first run (2 m observer vs the surface map) | connecting ridge 87.2% vs 78.3%: failed; cause found: observer height (0 m 78.9%, 0.5 m 81.4%, 2 m 87.2%, 10 m 94.8%); horizon range 100 vs 200 km changes it by 1.2 points | — | explained |
| 2026-11-13 | 7 | **First load** (welcome, cache off) | 4.64 MB, 12 requests; FCP 0.26 s, network idle 0.47 s | ≤ 10 MB, < 6 s | pass |
| 2026-11-13 | 7 | First load, mid-laptop proxy (CPU 4× slower, 20 Mbit/s down, 40 ms latency) | FCP 0.88 s, network idle 2.98 s | < 6 s | pass |
| 2026-11-13 | 7 | **Pin → results ready** (dev, horizons + metrics, 5 new places each, terrain loaded) | Polar HD 221-259 ms (two runs); Global 92-126 ms | < 0.3 s / < 0.5 s | pass |
| 2026-11-13 | 7 | **4-site compare** (dev, new places, until every column is ready) | Polar HD 646 ms, Global 200 ms, 2 + 2 410 ms | < 1.5 s | pass |
| 2026-11-13 | 7 | **Globe frame rate** (dev, `lspb.globe.benchmark(4)`) | whole Moon 59.8 fps; after the fly-to Apollo 11 with tiles streaming 60.2 fps | ≥ 50 fps | pass |
| 2026-11-13 | 7 | **Scrubbing** the playhead 4 s with the ring, 4 compare columns and the globe; then Play at 6 h/s | scrub 60.0 fps, p95 17.1 ms, worst 17.3 ms; Play 59.8 fps, p95 16.9 ms, worst 33.4 ms; no long tasks | ≥ 50 fps | pass |
| 2026-11-13 | 7 | **axe-core 4.10 (WCAG 2.0/2.1 A and AA)**: welcome and planner (pin + 2 compared sites), 1440 px and 360 px | first run: welcome slider thumb without a name (serious); sidebar and drawer handles without `aria-valuenow` (critical). Fixed; re-run: no violations on all 4 pages and with reduced motion | 0 violations | pass |
| 2026-11-13 | 7 | Keyboard only (60 Tab presses per page) | planner: 49 distinct stops in DOM order (search, link, about, globe, layers, zoom, views, sidebar handle, cards and their `?`, ring, details, antenna, drawer handle, presets, columns, time bar); every stop `:focus-visible` with a ring; welcome: Skip, Next, slider, slide dots | all reachable, ring visible | pass |
| 2026-11-13 | 7 | Resize handles report their size (`aria-valuenow`) | default read on focus: sidebar 336 = actual; drawer 306 (its body; section 351 incl. header); after Left / Up: 368 / 338 | = size | pass |
| 2026-11-13 | 7 | 360 × 740 | page scrollWidth 360 on welcome and planner | no horizontal scroll | pass |
| 2026-11-13 | 7 | Reduced motion emulated | welcome: no running animations; planner: only the 150 ms focus-ring colour transitions (no transform or opacity motion) | motion off | pass |
| 2026-11-13 | 7 | Dead-code sweep (import graph over `src` and `test`; knip download blocked again) | removed `COMPARE_COLORS` and `--color-lspb-psr`; unexported `EARTH_GOOD_MIN_FRACTION`, `RING_DEFAULT_RADIUS_M`; no unreachable files, unused dependencies, data files or store fields | none left | pass |
| 2026-11-13 | 7 | Console errors during the browser checks | none | 0 | pass |
| 2026-11-13 | 7 | `npm run lint` | 0 warnings, 0 errors | clean | pass |
| 2026-11-13 | 7 | `npm test` | 18 files, 190 passed / 0 skipped / 0 failed (+4: `benchmark`) | 0 failed | pass |
| 2026-11-13 | 7 | `npm run build` (raw / gzip) | entry `index` 435.67 / 142.25 kB (before the phase 435.60); `Planner` 355.63 / 107.72 kB | builds | pass |
| 2026-11-13 | 7 | Live site in a private window, real phone, screen reader | not done: merge and deploy wait for the team's go | — | not checked |
