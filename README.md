# Lunar Mission Planner

A local web app for choosing a landing site near the lunar south pole. Pick a point on the map and a
landing date; the planner tells you how long the site stays in sunlight, how long Earth stays above the
local horizon for direct communication, and whether the ground is flat enough to land. It also shows the
sky from the site as a line drawing, a calendar of days with Earth in view, and the named craters.

Everything runs on your machine. The app makes no network requests at runtime: all data is generated
once by a Python pipeline and served from `web/public/data/`. Data loads in tiers: only the Sun/Earth
ephemeris at start (about 4.6 MB in total), the 120 m polar terrain when the map opens, and the global
terrain the first time a point outside the polar region is used.

- Built for the NASA Space Apps 2026 challenge **Lunar Landing Site Navigator**. Changes are listed
  in [CHANGELOG.md](CHANGELOG.md).
- Region: the map covers 84°S to the pole at 120 m ("Polar HD"); the engine also computes any other
  point on the Moon from LOLA's global terrain at ~1.9 km ("Global", no landing rating). Dates:
  2026-01-01 to 2035-12-31 (UTC).
- Ratings are tuned for a 6.5-day crewed-class surface stay (NASA Artemis III).
- Licence: Apache-2.0 (see [LICENSE](LICENSE)).

## Contents

- [Quick start](#quick-start)
- [Deploy](#deploy)
- [Using the app](#using-the-app)
- [Method](#method)
- [Ratings](#ratings)
- [Validation](#validation)
- [Known limits](#known-limits)
- [Data sources and citations](#data-sources-and-citations)
- [Licences](#licences)

## Quick start

Requirements: Windows, macOS or Linux; Python 3.11+ (tested 3.13.5); Node.js 22 (tested 22.17.0);
about 10 GB of free disk space for the raw downloads. Commands below are for Windows (PowerShell or Git
Bash); on macOS/Linux use `venv/bin/python` instead of `venv\Scripts\python`.

```
python -m venv venv
venv\Scripts\python -m pip install -r pipeline\requirements.txt
venv\Scripts\python pipeline\00_check_env.py         # versions, imports, free disk space
venv\Scripts\python pipeline\01_download.py          # SPICE kernels + LOLA DEM, ~2.7 GB, resumable: re-run if interrupted
venv\Scripts\python pipeline\02_build_ephemeris.py   # ephemeris.bin (Sun and Earth, 2026-2035, every 30 min)
venv\Scripts\python pipeline\03_horizons_fixtures.py # JPL Horizons reference values (network, cached)
venv\Scripts\python pipeline\04_build_terrain.py     # terrain grids, slope maps, hillshade (~2 min)
venv\Scripts\python pipeline\05_validate_ephemeris.py
venv\Scripts\python pipeline\06_validate_terrain.py
venv\Scripts\python pipeline\07_horizon_reference.py # slow Python reference horizons (test fixtures)
venv\Scripts\python pipeline\08_hours_reference.py   # Python reference light/Earth hours (test fixtures)
venv\Scripts\python pipeline\09_build_features.py    # named craters (IAU gazetteer, ~24 MB download)
venv\Scripts\python pipeline\10_build_global.py      # global DEM, offline globe texture, South Pole HD overlay (~33 MB download)
venv\Scripts\python pipeline\13_build_illumination.py # NASA average-sunlight and PSR layers (~84 MB download)

cd web
npm ci
npm run dev        # http://localhost:5173
```

Other web commands (run in `web/`):

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest). Tests that need the generated data are skipped if it is missing. |
| `npm run lint` | oxlint over `src/` and `test/`. |
| `npm run build` | Production build into `web/dist/`. |
| `npm run preview` | Serve the production build locally (works offline). |

Only steps 01, 03, 09, 10 and 13 use the network, and each caches what it downloads in `data/raw/` or
`data/fixtures/`. Step 07 reads the raw global DEM that step 10 downloads, so run 10 before 07.

## Deploy

Live site: https://lunar-mission-planner.vercel.app/ (deployed from `main`).

The site is deployed on Vercel straight from git, as a static Vite build:

- `vercel.json` (repo root) declares one service, `web`, with root `web/` and framework `vite`, and
  rewrites every path (`/(.*)`) to that service.
- `web/vercel.json` gives the build: `npm ci`, then `npm run build`, serving `web/dist/`.
- The generated data in `web/public/data/` (`*.bin`, `*.png`) is committed through **Git LFS**
  (`.gitattributes`), because the pipeline needs about 10 GB of raw downloads and can't run on
  Vercel. The Vercel project must have Git LFS enabled, or the build ships ~130-byte pointer files
  instead of the data. After re-running the pipeline, commit the new data files to deploy them.

## Using the app

1. **Welcome.** Three short slides explain the problem: low sunlight and short Earth visibility at the
   south pole. "Skip" goes straight to the planner.
2. **Pick a date and time.** The start button in the bottom bar opens a calendar. Green days have Earth
   above the horizon for at least 1 hour at the selected site. Below the calendar, type the time as a
   24-hour UTC clock (`HH:MM`). All times in the app are UTC.
3. **Pick a site.** Click the map (or focus the map and press Enter to use its centre). Drag the pin to
   move it. Named craters are outlined; hover to see a name, or hide them with the Craters button.
   On a phone, tap the map; a strip at the bottom of the map shows the three ratings, and tapping it
   scrolls to the full cards.
4. **Read the cards.** Sun, Earth and Landing each have a rating badge; the `?` next to a badge explains
   the rule with the live numbers. Antenna height (2, 5, 10 or 15 m) changes the Earth results only.
5. **Move through time.** The slider covers 29.5 days (one synodic month) after the start time; Play runs
   it at 0.25 to 3 days per second.
6. **Surface view.** Press `V` (or use the Map / Surface toggle) to see the sky from the pin: the terrain
   skyline, the Sun and Earth and their paths over the next 6.5 days. Drag or use the arrow keys to look
   around, wheel or `+`/`-` to zoom (pinch on a touch screen).

The layout adapts from phones (360 px wide, portrait or landscape) to large desktops; on touch screens
the `?` rating explanations open with a tap.

Durations are shown in Earth days (`d`), for example `6.5 d`. The engine works in hours; only
`web/src/lib/format.js` converts.

## Method

### Sun and Earth positions

`02_build_ephemeris.py` uses SPICE (spiceypy) to compute the apparent position of the Sun and Earth
from the Moon's centre (aberration correction `LT+S`) in the `MOON_ME` frame (DE421 mean-Earth axes, the
same frame as the LOLA maps), every 1800 s from 2026-01-01 to 2035-12-31 UTC. The browser interpolates
linearly between samples; against SPICE sampled every 60 s, that interpolation (with float32 storage) is
off by at most 0.000004° for the Sun and 0.000033° for Earth (checked by `02` on every build).

Kernels: `naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`,
`moon_de440_250416.tf` (exact names are picked by `01_download.py` from the NAIF server).

For an observer at latitude/longitude on a 1737.4 km sphere, raised by the local terrain height plus the
observer height, the azimuth (clockwise from local north) and elevation of a body come from its vector in
the local east/north/up frame. No refraction (the Moon has no atmosphere).

### Terrain

Source: LOLA 20 m/pixel south pole DEM `LDEM_80S_20MPP_ADJ.TIF` (heights relative to the 1737.4 km
sphere). `04_build_terrain.py` resamples it on a south polar stereographic grid:

| File | Content |
|---|---|
| `dem_near.bin` | 120 m pixels (6×6 mean), 84°S to the pole |
| `dem_far.bin` | 240 m pixels (12×12 mean), 80°S to the pole, for distant horizons |
| `slope_plane.bin` | slope of a least-squares plane fitted to the 20 m data over a 100 m radius disc |
| `slope_max.bin` | steepest 20 m slope inside that disc |
| `hillshade.png` | the map image |

Slopes are corrected for the stereographic scale factor.

Outside the polar grids the engine uses the **global** LOLA GDR `LDEM_16` (PDS, 16 pixels per degree,
1895 m per pixel, same reference sphere and frame). `10_build_global.py` keeps it at full resolution and
stores it losslessly as `global_dem.bin` (a 2D predictor, byte planes and gzip: 19.1 MB instead of
33.2 MB raw or 30.0 MB plain gzip); the horizon worker decodes it in the browser.

| Terrain source | Where | Resolution | Landing (slope) rating |
|---|---|---|---|
| Polar HD | 84°S to the pole | 120 m (240 m out to 80°S for distant horizons) | yes |
| Global | everywhere else, including the north pole | ~1.9 km | no: "Not assessed (coarse terrain)" |

Every result names its source and resolution on the site line ("Polar HD · 120 m" or "Global · ~1.9 km").

Prepared for the Polar HD map layers (`13_build_illumination.py`): NASA's LOLA average-illumination map
(percent of time sunlit) and its permanently shadowed regions (Mazarico et al. 2011), resampled onto the
120 m grid as `illum_avg.png` and `psr.png`.

### Horizon

For each of 720 azimuths (0.5° steps) the engine marches outward along the great circle from the observer,
in steps of the grid pixel size, up to 200 km (or the edge of the data), and keeps the largest elevation
angle of the terrain, including the drop due to the Moon's curvature (`d / 2R`). On Global terrain the
step is one LDEM_16 pixel (1895 m) and longitudes wrap across 180°E. This runs in a Web Worker (about
0.1 s per Polar HD horizon, about 0.02 s per Global one).

### Visibility and durations

A body is "in view" when its centre is above the terrain horizon at its azimuth. From the selected time T
the engine steps forward 0.25 h at a time, up to 1500 h (62.5 d), to find the next change, then bisects
to 0.01 h. It also counts the visible hours in the 156 h (6.5 d) window starting at T.

| Card row | Body in view at T | Body hidden at T |
|---|---|---|
| Light / Visible Duration | time until it sets | 0 d |
| Dark / Invisible Duration | length of the next hidden period | time until it rises |

"62.5+ d" means no change within the 62.5-day lookahead. A value like "1.1+ d" means the next hidden
period starts inside the lookahead but does not end inside it (a lower bound).

Mission metrics (`engine/metrics.js`) cover a mission window from T (6.5 d by default, or 14 d):
the share of time with the Sun up, with Earth in view and with both, the hours with power but no
direct-to-Earth link, the longest dark and no-Earth stretches, the next five windows of each body, and
the Sun's elevation now and its minimum and maximum over the window. Window edges are refined to
0.01 h. The ratings below keep NASA's 6.5-day window whatever the mission length.

### Antenna model

Earth visibility is computed for an antenna on the lander at the selected height (2, 5, 10 or 15 m); a
higher antenna sees over more terrain, so Earth is in view the same time or longer. The Sun is always
computed for a fixed 2 m reference height (lander deck and solar array), so the antenna control never
changes the Sun results. The surface view's camera sits at the antenna height and draws the Earth skyline.

### Calendar

For the displayed month, each UTC day is sampled every 0.25 h with the same Earth model as the Earth card
(antenna height included). A day is marked green if Earth is in view for at least 1 hour that day.

### Named craters

`09_build_features.py` reads the IAU Gazetteer of Planetary Nomenclature and keeps the 34 IAU-approved
craters whose rim reaches 84°S or further south. Outlines are drawn at their real diameter and clipped to
the map. They are display only: clicking inside a crater places the pin exactly where you click.

## Ratings

Thresholds are constants in `web/src/engine/ratings.js`.

| Card | Perfect (green) | Good (yellow) | Not recommended / Not possible (red) |
|---|---|---|---|
| Sun | continuous sunlight from T ≥ 8.0 d (192 h) | 6.5 d ≤ sunlight < 8.0 d | < 6.5 d, including Sun down at T |
| Earth | Earth continuously in view from T ≥ 6.5 d | in view ≥ 25% of the 6.5 d window | < 25% of the window |
| Landing | Possible: plane-fit slope within 100 m < 8° | (none) | Not possible: ≥ 8° |

Where the numbers come from:

- **6.5 days, continuous sunlight.** NASA's Artemis III surface stay is 6.5 days, and NASA requires
  continuous sunlight for the whole stay (NASA candidate landing regions release).
- **25% Earth visibility, 10° slope at 100 m.** Screening levels in NASA's Artemis landing site briefing
  (NTRS 20230005904). Direct-to-Earth communication favours more Earth visibility (NTRS 20250011660).
  ESA and commercial lander studies use the same family of criteria (sunlight, Earth visibility, slope
  ≤ 10°).
- **Project judgement, not NASA figures:** the 8.0-day "Perfect" Sun level (the stay plus about 1.5 days of
  operations margin) and the 8° slope cut (NASA's 10° minus the typical 1.9° LOLA slope error, Barker et
  al.). The UI tooltips say so.

What the ratings do not cover: boulders and small craters (slope only), shorter robotic missions (the
6.5-day stay is a constant, `MISSION_STAY_H`), and communication relays. "Good" Earth means contact is
intermittent: plan scheduled contact windows or a relay.

## Validation

All numbers below were measured on this repository's generated data.

| Check | Result |
|---|---|
| Sun and Earth azimuth/elevation vs JPL Horizons (60 records: 5 polar sites × 3 times; Apollo 11, Chang'e-4, Apollo 15 × 3 times; 3 sites × 2 dates in 2033-2035; `05_validate_ephemeris.py`) | max error 0.000044° (tolerance 0.1°) |
| Ephemeris interpolation at the 1800 s step vs SPICE every 60 s (`02_build_ephemeris.py`) | Sun 0.000004°, Earth 0.000033° (tolerance 0.001°) |
| Horizon, JS engine vs independent Python reference (3 sites, `07_horizon_reference.py`) | max difference < 0.00001° (tolerance 0.2°) |
| Global horizon, JS (our encoded DEM) vs Python (raw PDS LDEM_16) at Apollo 11 and Chang'e-4 | max difference 0.000001° (tolerance 0.2°) |
| Mission metrics, JS vs Python with float64 SPICE vectors (2 polar + 2 non-polar sites) | fractions identical to 4 decimals (tolerance 0.25 h / 156 h) |
| Light/Earth hours, JS vs Python reference with float64 SPICE vectors (2 sites × 2 times × 2 bodies, `08_hours_reference.py`) | all within 0.25 h; visible-now state identical |
| Horizon on a flat synthetic DEM | max \|horizon\| 0.002° |
| 1000 m pillar 10 km away | 5.5441° vs analytic 5.5457° |
| Bisection on a synthetic Sun path | change time within 0.01 h |
| Projection closed form vs proj4 | 1.9 × 10⁻¹² pixel |
| Antenna 2 → 5 → 10 → 15 m | Sun results identical; Earth visible hours never decrease |
| Calendar, one year at (-89.5°, -45°) | runs of 12-14 Earth days alternating with 13-15-day gaps; Earth in view 45% of the year |
| Craters vs terrain | all 34 crater centres lie below their rim average (e.g. Shackleton 4.0 km deep) |

Run them yourself: `npm test` in `web/` (68 tests) and the `05` to `08` pipeline scripts. The full
history, with dates and tolerances, is in [docs/VALIDATION.md](docs/VALIDATION.md).

## Known limits

- **Terrain resolution.** Horizons use 120 m and 240 m grids, so features smaller than a few hundred metres
  are not in the skyline. Near the pin (first ~100 m) the surface view's ground is a flat plane.
- **Sun as a point.** The Sun counts as up when its centre clears the horizon; the first and last ~0.27°
  of a partly hidden Sun are not modelled as partial light.
- **Sun "(blocked)" label in the surface view.** The drawn skyline is the Earth skyline at the selected
  antenna height. The Sun is always evaluated from a fixed 2 m lander height against its own horizon, so
  the Sun's "(blocked)" label can occasionally differ slightly from what the drawn skyline suggests.
- **Lookahead.** Durations beyond 62.5 days are shown as "62.5+ d"; near the end of 2035 they are cut off
  by the end of the ephemeris.
- **Slope only.** The landing rating ignores boulders, small craters and surface roughness below the 20 m
  data.
- **Fixed mission length.** Ratings assume a 6.5-day stay.
- **Global terrain is coarse.** Outside 84°S horizons come from ~1.9 km terrain: hills smaller than a few
  kilometres are not in the skyline, and the landing rating is not given.

## Data sources and citations

| Data | Source | Terms |
|---|---|---|
| Terrain: LOLA 20 m south pole DEM `LDEM_80S_20MPP_ADJ.TIF` | NASA GSFC Planetary Geodesy Data Archive, "A New View of the Lunar South Pole from LOLA", https://pgda.gsfc.nasa.gov/products/90 | NASA data, U.S. Government work, freely available |
| Sun/Earth/Moon ephemeris and orientation (SPICE kernels) | NASA JPL NAIF, https://naif.jpl.nasa.gov/naif/data.html | NASA data, freely available |
| Reference positions for validation | JPL Horizons, https://ssd.jpl.nasa.gov/horizons/ | NASA JPL service |
| Crater names, positions, diameters | Gazetteer of Planetary Nomenclature, IAU WGPSN and USGS Astrogeology Science Center, https://planetarynames.wr.usgs.gov (file `MOON_nomenclature_center_pts.zip`) | Public domain (USGS metadata) |
| Global terrain: LOLA GDR `LDEM_16` (16 px/deg, product V3.1) | PDS Geosciences Node, https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ | NASA PDS data, freely available |
| Average illumination and permanently shadowed regions: LOLA `AVGVISIB_75S_120M_201608`, `LPSR_75S_120M_201608` | NASA GSFC PGDA "Lunar Polar Illumination", https://pgda.gsfc.nasa.gov/products/69 | NASA data, freely available; cite Mazarico et al. (2011) |
| Offline globe texture and imagery: LRO WAC global mosaic `LRO_WAC_Mosaic_Global_303ppd_v02` | NASA Moon Trek WMTS, https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon (NASA/GSFC/Arizona State University) | NASA data |
| Coordinates of Apollo 11, Chang'e-4 and Apollo 15 (validation sites only) | Wikipedia articles cited in `pipeline/03_horizons_fixtures.py` (NASA NSSDCA was unreachable on 2026-11-10) | CC BY-SA text; coordinates are facts |

Citations:

- Mazarico, E., et al. (2011). Illumination conditions of the lunar polar regions using LOLA
  topography. *Icarus*, 211, 1066-1081. doi:10.1016/j.icarus.2010.10.030 (citation as requested on
  https://pgda.gsfc.nasa.gov/products/69)
- Barker, M. K., Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Head, J. W., Sun, X. (2021).
  Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on
  illumination conditions. *Planetary and Space Science*, 203, 105119. Preprint:
  https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf
- Acton, C. H. (1996). Ancillary data services of NASA's Navigation and Ancillary Information Facility.
  *Planetary and Space Science*, 44(1), 65-70.
- Gazetteer of Planetary Nomenclature. Planetary Geomatics Group of the USGS Astrogeology Science Center,
  https://planetarynames.wr.usgs.gov. IAU Working Group for Planetary System Nomenclature. Accessed
  2026-10-09.
- NASA (2022). NASA identifies candidate regions for landing next Americans on Moon.
  https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- NASA Artemis landing site briefing, NTRS 20230005904.
  https://ntrs.nasa.gov/api/citations/20230005904/downloads/PlatteCity_Artemis.pdf
- NASA, Artemis III site selection update, NTRS 20250011660. https://ntrs.nasa.gov/citations/20250011660
- ESA lander landing site study (illumination and Earth visibility at the south pole).
  https://arxiv.org/pdf/1208.5587
- OHB/IAI LSAS candidate landing sites (slope ≤ 10°, Sun and Earth visible), IAC-21.
  https://p.iafastro.directory/iac/paper/id/65346/abstract-pdf/IAC-21,A3,IP,60,x65346.brief.pdf
- Georgia Tech SSDL, Sun and Earth access trades for lunar south pole sites, AIAA-2010-8780.
  https://ssdl1.gatech.edu/sites/default/files/ssdl-files/papers/conferencePapers/AIAA-2010-8780.pdf

## Licences

This project: Apache-2.0 ([LICENSE](LICENSE)).

Web app dependencies (exact versions in `web/package.json` and `web/package-lock.json`; licences read from
each installed package). All 94 production packages are permissive: 87 MIT, 3 OFL-1.1 (fonts), and one
each Apache-2.0, BSD-2-Clause, ISC and 0BSD.

| Package | Version | Licence |
|---|---|---|
| react, react-dom | 19.2.8 | MIT |
| leaflet | 1.9.4 | BSD-2-Clause |
| three | 0.186.1 | MIT |
| zustand | 5.0.15 | MIT |
| radix-ui (tooltip, popover, select, slider, toggle) | 1.7.0 | MIT |
| react-day-picker (with date-fns, @date-fns/tz) | 10.0.2 | MIT |
| motion (with framer-motion, motion-dom, motion-utils) | 13.4.0 | MIT |
| lucide-react | 1.54.0 | ISC |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| tailwind-merge | 3.7.0 | MIT |
| @fontsource-variable/space-grotesk | 5.3.0 | OFL-1.1 |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 |
| @fontsource/jetbrains-mono | 5.3.0 | OFL-1.1 |
| Dev only: vite 8.3.0, vitest 5.0.3, tailwindcss and @tailwindcss/vite 4.3.3, @vitejs/plugin-react 6.1.1, proj4 2.22.0, oxlint 1.83.0 | | MIT |

UI components: shadcn/ui primitives (MIT, https://github.com/shadcn-ui/ui) in `web/src/components/ui/`, and
one 21st.dev component (Segmented Control by Mohammad Shehadeh, MIT). Details:
[web/src/components/ATTRIBUTIONS.md](web/src/components/ATTRIBUTIONS.md).

Pipeline dependencies (`pipeline/requirements.txt`):

| Package | Version | Licence |
|---|---|---|
| spiceypy | 8.2.0 | MIT (NAIF CSPICE toolkit: free, NASA) |
| numpy | 2.5.3 | BSD-3-Clause (with bundled 0BSD, MIT, Zlib, CC0-1.0 parts) |
| rasterio | 1.5.2 | BSD-3-Clause |
| pyproj | 3.8.0 | MIT |
| pillow | 12.3.0 | MIT-CMU |
| requests | 2.34.2 | Apache-2.0 |
| scipy | 1.18.1 | BSD-3-Clause |
