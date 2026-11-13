# Lunar Mission Planner

A web app for choosing a lunar landing site and date. Spin a 3D Moon, tap a famous landing site or any
point, and pick a date; the planner tells you how long the site stays in sunlight, how long Earth stays
above the local horizon for direct communication, and (near the south pole) whether the ground is flat
enough to land. The globe shows the real day/night line for the chosen time; a 120 m map of the south
pole, the sky from the site as a line drawing, a calendar of days with Earth in view and the named craters
are one tap away.

Every calculation runs on your machine from data generated once by a Python pipeline and served from
`web/public/data/`. The only runtime network use is the globe's imagery: NASA Moon Trek map tiles,
display only. Without them (offline, or `?offline=1`) the globe falls back to a bundled Moon texture and
everything else keeps working. Data loads in tiers: the Sun/Earth ephemeris at start (4.6 MB on the
welcome screen), the 3D globe (CesiumJS, about 1 MB) when the planner opens, the 120 m polar terrain when
the Polar HD map opens or a pin is placed south of 84°S, and the global terrain the first time a point
elsewhere is used. With the globe open and no pin, the first load is 6.0 MB (imagery tiles excluded).

- Built for the NASA Space Apps 2026 challenge **Lunar Landing Site Navigator**. Changes are listed
  in [CHANGELOG.md](CHANGELOG.md).
- Region: the map covers 84°S to the pole at 120 m ("Polar HD"); the engine also computes any other
  point on the Moon from LOLA's global terrain at ~1.9 km ("Global", no landing rating). Dates:
  2026-01-01 to 2035-12-31 (UTC).
- Ratings follow the mission length: 6.5 days by default (NASA's Artemis III crewed surface stay).
- Licence: Apache-2.0 (see [LICENSE](LICENSE)).

## Contents

- [Challenge objectives](#challenge-objectives)
- [Quick start](#quick-start)
- [Deploy](#deploy)
- [Using the app](#using-the-app)
- [Method](#method)
- [Ratings](#ratings)
- [Validation](#validation)
- [Known limits](#known-limits)
- [Data sources and citations](#data-sources-and-citations)
- [Licences](#licences)
- [Use of AI](#use-of-ai)

## Challenge objectives

How each objective (O) and consideration (C) of the challenge statement maps to a feature you can see.

| | Objective | Where in the app |
|---|---|---|
| O1 | Curated sites and custom coordinates; side-by-side compare | 25 sourced mission pins on the globe (Apollo, CLPS, Artemis III regions, other countries), search, typed coordinates (any point, both poles), compare up to 4 sites in the drawer |
| O2 | Dates and times; changes across lunar days and seasons | Any time 2026-2035, the timeline, Play, the same site at another date side by side, the Earth-days calendar |
| O3 | Sun and Earth vs the horizon; time left before sunset or Earthset | First-person surface view with the real skyline; countdown chips on the Sun and Earth cards |
| O4 | Solar elevation (prominent), sunlight duration, Earth windows | Large Sun-elevation readout, sunlight and Earth durations, next windows in Details |
| O5 | 2D maps, 3D surfaces, other views | 3D globe, 120 m Polar HD map with slope, sunlight and shadow layers, surface view |
| O6 | Animations or timelines | Live day/night line on the globe, draggable timeline playhead, Play |
| O7 | Experts and the public | Plain-word cards; every verdict, badge and layer has a "why" (checklist, then "Show the science"); three explainers |
| C1 | Lunar vs terrestrial extremes | "Equator vs pole" compare preset (Apollo 11 vs Shackleton rim); the Sun-path explainer |
| C2 | Why small changes in place or date matter | "Move a little" ring (250 m to 20 km) and the same spot 24 h earlier and later |
| C3 | Real topography, no refraction, libration, slopes | LOLA horizons with the Moon's curvature, SPICE ephemeris (libration included), no atmosphere; slope from 20 m LOLA data |
| C4 | Schedules slip | Shareable links for the whole scenario; the "Same site, different date" preset |

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
venv\Scripts\python pipeline\10_build_global.py      # global DEM (~33 MB download), offline globe texture
venv\Scripts\python pipeline\11_build_sites.py       # validate the curated site list -> sites.json (globe mission pins)
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

Step 10 also needs one file downloaded by hand (svs.gsfc.nasa.gov does not answer scripted requests from
every network): `lroc_color_16bit_srgb_4k.tif` from the NASA SVS CGI Moon Kit page,
https://svs.gsfc.nasa.gov/4720 (Download menu of the 2025 colour map), saved as
`data/raw/svs/lroc_color_16bit_srgb_4k.tif`.

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

1. **Welcome.** Three short slides, each with a small interactive explainer: drag the latitude to the pole
   and watch the Sun's daily path flatten onto the horizon; watch Earth trace its monthly wobble
   (libration) near the horizon, from the app's own ephemeris; raise an antenna from 2 m to 15 m until the
   line to Earth clears a ridge. "Open the planner" on the last slide, or "Skip" on any slide, opens the
   planner.
2. **Pick a date and time.** The start button in the bottom bar opens a calendar. Green days have Earth
   above the horizon for at least 1 hour at the selected site. Below the calendar, type the time as a
   24-hour UTC clock (`HH:MM`). All times in the app are UTC.
3. **Pick a site on the globe.** The planner opens on a 3D Moon lit by the Sun at the selected time. Drag
   to rotate, scroll, pinch (touch screen or touchpad) or use the +/− buttons to zoom, right-drag (or two
   fingers, or Ctrl-drag) to tilt. Click anywhere
   to place the pin (its latitude and longitude show just below it, on the globe and the Polar HD map), or click a mission pin (hover, or tap once on a phone, to see its name) to fly there
   and pick it. Keyboard: focus the globe, arrows rotate, `+`/`-` zoom, Enter places the pin at the centre.
   Mission pins are coloured by group (Apollo, CLPS, Artemis III regions, other countries, south-pole
   reference points); the Layers menu toggles groups, IAU crater and feature names and a lat/lon grid.
   Double-click a feature name to fly to it. On a phone, a strip at the
   bottom shows the three ratings and the Sun and Earth countdowns, and tapping it scrolls to the full cards.
   **Search** (the app-bar button, or `Ctrl`+`K` / `⌘K`) lists every mission site by group with its
   status (landed, planned, reference point, point in an Artemis III candidate region). It also takes
   coordinates for any point on the Moon: `0.674N 23.473E`, `89.45S 137.3W` or `-89.45, 222.7` (signed
   degrees, east longitude 0 to 360 accepted). Bad input gets a plain error ("Latitude must be between
   90°S and 90°N"). Picking a result flies the globe there, or pans the Polar HD map if that is open.
4. **Polar HD map.** Near the south pole, "Open Polar HD map" (or the Polar HD tab) switches to the 120 m
   map of 84°S to the pole. Click it (or focus it and press Enter) to place the pin; drag the pin to move
   it. Named craters are outlined; hover to see a name, or hide them with the Craters button. Mission sites
   south of 84°S are marked in their globe colours (hover for the name, click or Tab + Enter to pick one;
   two missions aimed at the same point share a marker). The Layers button hides them and adds three data
   layers, each with an opacity slider, a legend and a `?` explaining it (with its source):
   **slope** (green under 8°, amber 8 to 10°, red over 10°: the Landing rating's limits), **average
   sunlight** (percent of time sunlit, a long-term average) and **permanent shadow** (PSR). The cursor
   readout shows their values under the pointer. "See slopes on the map" on the Landing card opens the
   map with the slope layer on.
5. **Read the cards.** Sun, Earth and Landing each have a rating badge and a one-line verdict in plain
   words ("Good for power: the Sun stays up 8.8 d", "Earth only part of the time (31%): plan contact
   windows"). The `?` next to a badge opens a checklist of the rule against the live numbers (✓ Sun up for
   the whole 6.5 d stay (8.8 d from landing) · ✗ plus about 1.5 d of margin), and "Show the science" inside
   it gives the method, the data and terrain resolution, the threshold with its citation, the known error
   and a link to the matching README section. The same `?` sits on the terrain badge ("Polar HD · 120 m"),
   the Antenna card, "Not assessed (coarse terrain)" and each map layer. It opens on hover, on keyboard
   focus or on a tap; Enter or a tap keeps it open and moves focus inside; Esc closes it. Dotted-underlined
   words (horizon, terminator, libration, DTE, PSR) pop up a short definition. Small links on the Sun,
   Earth and Antenna cards open the three explainers from the welcome slides.
   The Sun and Earth cards show the elevation now in large type, a small
   line of it over the mission, and a countdown: "Sunset in 42 h", "Earthrise in 3.1 d". A set countdown is
   green above 48 h, amber from 12 to 48 h and red under 12 h. Antenna height (2, 5, 10 or 15 m) changes
   the Earth results only. The **Details** card holds the mission length (6.5 d Artemis III stay or 14 d),
   "Count partial Sun" (the Sun counts as up while any part of its disc clears the skyline) and the next
   five windows of the Sun and of Earth; click one to jump there.
6. **Move a little.** The "Move a little" card answers "what if we land a bit off target?": 8 points
   around the pin at 250 m, 500 m or 1 km (on Global terrain 5, 10 or 20 km: ~1.9 km pixels cannot resolve
   less) each get their own skyline, and the card shows the spread of the sunlit and Earth-in-view shares of
   the stay ("Within 500 m: sunlight 0%–100%, Earth 0%–48%" on Shackleton's rim), a ring of the points
   coloured by sunlight or Earth, and the same spot landing 24 h earlier and later. The points also appear
   around the pin on the globe and the Polar HD map. Points past the 84°S edge of the polar terrain are
   skipped, never mixed with coarse terrain.
7. **Move through time.** The timeline at the bottom covers 29.5 days (one synodic month) after the start
   time, with three rows per site (the pin, then each compared site): Sun up, Earth in view, and both. The
   bracket marks the mission window. Drag the playhead or click the track to move the time; hover a bar for
   its start, end and length; click a bar to jump to its start. Keyboard: focus the timeline, arrows move
   15 minutes, `Shift` + arrows 1 day, `Home`/`End` the ends. Everything follows the playhead: the globe's
   day/night line and Earth marker, the surface view, the cards and the countdowns. Play runs at 1 h, 6 h,
   1 d or 3 d per second; the loop button replays the mission window.
8. **Surface view.** "View from here" on the globe, the Surface tab, or `V` (which cycles Globe, Polar HD
   and Surface) shows the sky from the pin: the terrain
   skyline, the Sun and Earth, their paths over the next 6.5 days and short fading trails behind them, so
   Play shows them moving while the skyline stays put. Hovering the timeline adds a faint Sun and Earth at
   the time under the pointer. Drag or use the arrow keys to look around, wheel or `+`/`-` to zoom (pinch
   on a touch screen).
9. **Compare.** "+ Compare" (under the site name, or in a mission pin's tooltip on the globe) adds the site
   to the compare drawer above the time bar: up to 4 columns with terrain, Sun elevation now, Power, Talk to
   Earth, Landing, the sunlit / Earth / both shares over the mission, power without Earth, the longest dark
   spell and when the Sun and Earth set. The best value in each row glows. The calendar button on a column
   adds the same site one lunar day (29.5 d) or one month later, or at a typed UTC time: the "schedule slipped"
   case. One-tap presets: "Equator vs pole" (Apollo 11 vs Shackleton rim) and "Two Artemis III regions". On
   the globe and the Polar HD map, compared sites get numbered markers joined by lines in column order
   (the map shows the sites south of 84°S). Drag the handle on the drawer's top edge
   up or down to resize it (or focus it and use the Up and Down arrows; double-click resets); the size is
   remembered in this browser. On a phone the columns swipe sideways.
10. **Share it.** The address bar always holds the current view: site or pin, time, antenna height,
   mission length, view, map layers, compared sites and camera (for example
   `?site=shackleton_rim&t=2026-03-26T00:00Z&view=polar&layers=slope`). "Copy link" copies it. Opening
   such a link skips the welcome slides and restores the view: when a schedule slips, send the
   alternative site or date as a link.

The layout adapts from phones (360 px wide, portrait or landscape) to large desktops; on touch screens
the `?` explanations open with a tap. On a desktop the sidebar's width can be dragged from the handle on its
left edge (280 to 640 px; Left and Right arrows on the focused handle; double-click resets), and is
remembered in this browser, like the compare drawer's height.

Durations are shown in Earth days (`d`), for example `6.5 d`; countdowns under 2 days are shown in hours
(`h`). The engine works in hours; only `web/src/lib/format.js` converts.

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

Polar HD map layers (`13_build_illumination.py`): NASA's LOLA average-illumination map (percent of time
sunlit) and its permanently shadowed regions (Mazarico et al. 2011), resampled onto the 120 m grid as
`illum_avg.png` and `psr.png`. The slope layer is drawn in the browser from `slope_plane.bin`, the file
the Landing card already uses. A web worker colours each layer once, on first use.

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
0.01 h. The ratings below use the same mission window.

The timeline (`engine/timeline.js`) uses the same visibility test and the same 0.01 h edge refinement
over the whole 708.7 h strip, so its bar edges match the Details windows (tested within 0.01 h). "Both"
is the overlap of the Sun and Earth rows. The rows are computed in idle time when the site, antenna, Sun
mode or start time changes, never while the playhead moves.

### Move a little (sensitivity)

`engine/sensitivity.js` places 8 points due N, NE, E, ... at the chosen distance along great circles from
the pin (tested within 1% of the radius). Each point gets its own Sun and Earth horizons in the worker,
through the same queue and cache as the pin; a newer pin, radius or antenna cancels the queued points of the
old ring. For each point, and for the pin at the selected time and 24 h before and after, the share of the
mission window with the Sun up and with Earth in view is counted exactly as in the mission metrics (the
same function; tested equal). The shares are recomputed in idle time, at most every 250 ms while the time
changes. A point whose latitude falls outside the pin's terrain source is skipped and marked.

### Explainers

`engine/explain.js`: the Sun's daily path at a latitude on a smooth Moon (standard spherical astronomy;
the highest Sun is 90° − |latitude − declination|), Earth's direction from 89.5°S, 0°E every 6 h over 27
days from the selected date (the app's ephemeris, no terrain), and the clearance of a straight line from an
antenna over a ridge. The Sun's declination seen from the Moon stays within ±1.59° (the ephemeris maximum
over 2026-2035 is 1.588°, checked by a test). The antenna explainer uses round illustrative numbers (a 10 m
ridge 500 m away, Earth 0.3° up), labelled as such.

### Antenna model

Earth visibility is computed for an antenna on the lander at the selected height (2, 5, 10 or 15 m); a
higher antenna sees over more terrain, so Earth is in view the same time or longer. The Sun is always
computed for a fixed 2 m reference height (lander deck and solar array), so the antenna control never
changes the Sun results. The surface view's camera sits at the antenna height and draws the Earth skyline.

### Calendar

For the displayed month, each UTC day is sampled every 0.25 h with the same Earth model as the Earth card
(antenna height included). A day is marked green if Earth is in view for at least 1 hour that day.

### Globe

The globe is CesiumJS on a smooth sphere of 1737.4 km (Cesium's `Ellipsoid.MOON`, the LOLA reference
sphere), with no 3D terrain (a team decision: terrain detail lives in the surface view, and every number
comes from the LOLA engine). Its fixed frame is the ephemeris frame `MOON_ME`: x toward 0° N 0° E, z north
(tested against Cesium's own conversions).

- **Imagery:** the LRO WAC global mosaic from NASA Moon Trek's WMTS service, about 83 m per pixel at the
  finest level (the tile grid is copied from the service's capabilities document and tested). Under any
  tile that fails, the bundled CGI Moon Kit texture shows; after six failed tiles in a row (or with
  `?offline=1`) the globe uses only the bundled texture and says "Offline imagery". The globe shows the
  photo mosaic at the pole too; the 120 m polar terrain is on the Polar HD map ("Open Polar HD map" appears
  when the globe looks at the south pole). An earlier 120 m hillshade overlay on the globe was removed (team
  decision, 2026-11-13): it was blurrier and brighter than the mosaic around it.
- **Light:** a directional light along the ephemeris Sun vector at the selected time, so the terminator is
  the real one and sweeps across the Moon during Play. A small dot marks the sub-solar point.
- **Earth:** a marker just beyond the limb in the true Earth direction (direction only, not to scale) and
  the sub-Earth point; during Play their slow wobble is libration.
- **Names:** IAU features (`craters_global.json`) by size rank: 300 km and larger always, smaller ones as
  the camera comes down (under 10 km below 80 km altitude), never a smaller one while a bigger one in view
  is hidden, at most 150 at once (fewer on small screens). Mission pins come from `sites.json`
  (`11_build_sites.py` validates `pipeline/data/sites_source.csv`; every site cites its source).
- **Rendering** only happens when something changes (Cesium's request-render mode), and the globe stops
  rendering while another view is shown.

### Named craters

`09_build_features.py` reads the IAU Gazetteer of Planetary Nomenclature and keeps the 34 IAU-approved
craters whose rim reaches 84°S or further south. Outlines are drawn at their real diameter and clipped to
the map. They are display only: clicking inside a crater places the pin exactly where you click.

## Ratings

Thresholds are in `web/src/engine/ratings.js` (`ratingThresholds(missionH)`). They follow the mission
length (team decision, 2026-11-10); the table shows the default 6.5-day (156 h) stay, where they are
exactly the published values. For another length L: Sun Perfect ≥ L + 1.5 d, Good ≥ L; Earth Perfect
≥ L, Good ≥ 25% of the L window.

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
  al.). The `?` explanations say so.

What the ratings do not cover: boulders and small craters (slope only) and communication relays. "Good" Earth means contact is
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
| Globe frame: our lat/lon -> position vs Cesium's Moon ellipsoid | identical (< 10⁻⁹ m) |
| Globe picking: lat/lon -> position -> screen pick -> lat/lon (36 views, both poles, 180°E) | max 1.8 × 10⁻⁸° (tolerance 0.05°) |
| Globe lighting: sub-solar point from the light direction vs the ephemeris (3 times, 2026-2035) | identical; the Sun is at 90.0000° elevation there |
| Globe imagery vs IAU positions (Mare Crisium, Collins crater near Apollo 11, Shackleton) | the names sit on their features (checked on screen) |
| Slope layer colours vs the Landing rating (0° to 20° in 0.05° steps; real pixels) | green exactly where Landing says "Possible"; pixel value = the card's value at pixel centres |
| Polar HD layers at Shackleton (cursor readout) | floor: 0% sunlit, permanent shadow; rim: 80% sunlit, slope 3.3° |
| Typed coordinates (26 cases: signed, N/S/E/W, 0-360 east, errors) | all parse or fail as expected |
| Shareable link: store -> URL -> store, and reload in the browser | same state; same URL after a reload |
| Compare column vs the single-site cards (same time; +1 lunar day vs the cards at that time) | identical, well within 0.01 h |
| Compare: 4 new sites, terrain already loaded (Polar HD / Global / mixed) | 0.74 / 0.19 / 0.48 s (budget 1.5 s) |
| Timeline bar edges vs the cards' next windows (3 polar sites, two playhead positions) | within 0.01 h (in the browser: identical) |
| Scrubbing the timeline / Play with 4 compared sites and the globe (desktop) | 59.5 / 58.0 fps (target ≥ 50) |
| Move a little: ring points vs the requested radius (5 centres incl. 89.99°S and 180°E × 6 radii) | all within 1% |
| Move a little shares vs the mission metrics (real data) | identical |
| Why checklists vs the rating functions (Sun, Earth × 3 cases × 2 mission lengths; Landing × 3) | every ✓/✗ agrees with the rating |
| Sun's declination seen from the Moon (ephemeris 2026-2035), used by the Sun-path explainer | max 1.588° (explainer uses 1.59°) |
| Play with the ring, 4 compared sites and the globe (desktop) | 59.9 fps, no long tasks (target ≥ 50) |
| **Published benchmark, Earth:** share of 2027 with Earth above the flat horizon vs JPL Horizons, hourly (PGDA Site01 and Site04) | 45.18% and 46.04%, identical; max elevation difference 0.00003° |
| **Published benchmark, Sun:** share of time any part of the Sun is above the terrain horizon, observer on the ground, vs NASA PGDA average illumination (Mazarico et al. 2011) | connecting ridge 78.9% vs 78.3%; Shackleton rim 79.2% vs 80.5% (see below) |
| First load (welcome screen, cache off) | 4.64 MB, network idle in 0.5 s locally and 3.0 s with 4× CPU slowdown and 20 Mbit/s (budget 10 MB, 6 s) |
| Pin to results ready (horizons and metrics) | Polar HD 0.22-0.26 s (budget 0.3 s); Global 0.09-0.13 s (budget 0.5 s) |
| Globe frame rate while rotating, imagery streaming | 60 fps (target ≥ 50) |
| Accessibility: axe-core WCAG 2.1 A/AA, welcome and planner, 1440 px and 360 px, with and without reduced motion | no violations; every Tab stop shows a focus ring; no horizontal scroll at 360 px |

**About the published benchmark.** The Earth check uses JPL Horizons, which has no terrain, so it tests
the ephemeris and libration, not the skyline; with the terrain and a 10 m antenna our Earth shares are 53.9%
and 49.5% over 2026-2035. The Sun check compares with NASA's average-illumination map (PGDA product 69),
which gives one value per 120 m pixel averaged over an 18.6-year cycle; ours covers 2026-2035 and samples
hourly. They agree within 1.3 percentage points. Before the first run we set a stricter check, "inside the
range of the 3 × 3 pixels around the site"; the connecting ridge misses it by 0.6 points (78.9% vs at most
78.3%: the site's pixel is the local top), Shackleton rim passes. Height matters a lot on a ridge: the app's
Sun observer stands at 2 m, which gives 87.2% and 82.8% at the same points. `pipeline/14_published_benchmark.py`
records the published values; `web/test/benchmark.test.js` computes ours.

Run them yourself: `npm test` in `web/` (190 tests) and the `05` to `08` and `14` pipeline scripts. The full
history, with dates and tolerances, is in [docs/VALIDATION.md](docs/VALIDATION.md).

## Known limits

- **Terrain resolution.** Horizons use 120 m and 240 m grids, so features smaller than a few hundred metres
  are not in the skyline. Near the pin (first ~100 m) the surface view's ground is a flat plane.
- **Sun as a point.** By default the Sun counts as up when its centre clears the horizon ("Count partial
  Sun" in Details counts any part of the disc instead). A partly hidden Sun is never modelled as partial
  light: it is either up or down.
- **Sun "(blocked)" label in the surface view.** The drawn skyline is the Earth skyline at the selected
  antenna height. The Sun is always evaluated from a fixed 2 m lander height against its own horizon, so
  the Sun's "(blocked)" label can occasionally differ slightly from what the drawn skyline suggests.
- **Lookahead.** Durations beyond 62.5 days are shown as "62.5+ d"; near the end of 2035 they are cut off
  by the end of the ephemeris.
- **Slope only.** The landing rating ignores boulders, small craters and surface roughness below the 20 m
  data.
- **Mission length.** Ratings and metrics follow the mission length (6.5 d by default; the 14 d option
  is set in the Details card). The 1.5-day Sun margin is the same for every length.
- **Global terrain is coarse.** Outside 84°S horizons come from ~1.9 km terrain: hills smaller than a few
  kilometres are not in the skyline, and the landing rating is not given.
- **Move a little is a spread, not a rating.** It shows how much the shares change within the radius;
  the ring's 8 points sample it and can miss a narrow ridge or pit between them.
- **The globe is for looking, not measuring.** It is a smooth sphere (no relief); its imagery is a photo
  mosaic with its own baked-in shadows, under our real-time lighting. At the pole much of the mosaic is in
  shadow; use the Polar HD map for the terrain there.
- **Every curated site is verified.** All 25 sites carry the source they were copied from; none is marked
  unverified.
- **Globe imagery needs the network.** Moon Trek tiles stream from trek.nasa.gov; offline, the bundled
  4096 × 2048 texture (about 2.7 km per pixel) is much less sharp.

## Data sources and citations

| Data | Source | Terms |
|---|---|---|
| Terrain: LOLA 20 m south pole DEM `LDEM_80S_20MPP_ADJ.TIF` | NASA GSFC Planetary Geodesy Data Archive, "A New View of the Lunar South Pole from LOLA", https://pgda.gsfc.nasa.gov/products/90 | NASA data, U.S. Government work, freely available |
| Sun/Earth/Moon ephemeris and orientation (SPICE kernels) | NASA JPL NAIF, https://naif.jpl.nasa.gov/naif/data.html | NASA data, freely available |
| Reference positions for validation | JPL Horizons, https://ssd.jpl.nasa.gov/horizons/ | NASA JPL service |
| Crater names, positions, diameters | Gazetteer of Planetary Nomenclature, IAU WGPSN and USGS Astrogeology Science Center, https://planetarynames.wr.usgs.gov (file `MOON_nomenclature_center_pts.zip`) | Public domain (USGS metadata) |
| Global terrain: LOLA GDR `LDEM_16` (16 px/deg, product V3.1) | PDS Geosciences Node, https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ | NASA PDS data, freely available |
| Average illumination and permanently shadowed regions: LOLA `AVGVISIB_75S_120M_201608`, `LPSR_75S_120M_201608` | NASA GSFC PGDA "Lunar Polar Illumination", https://pgda.gsfc.nasa.gov/products/69 | NASA data, freely available; cite Mazarico et al. (2011) |
| Offline globe texture (display only): CGI Moon Kit 2025 colour map `lroc_color_16bit_srgb_4k.tif`, converted to `moon_fallback_4k.jpg` | NASA's Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720, with LROC data from NASA/GSFC/Arizona State University. Downloaded by hand into `data/raw/svs/` (the SVS host is not reachable from the build machine) | NASA data |
| Globe imagery (streamed, display only): LRO WAC global mosaic `LRO_WAC_Mosaic_Global_303ppd_v02` | NASA Moon Trek WMTS, https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon; tile grid from https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml (NASA/GSFC/Arizona State University) | NASA data |
| For photometric science (not used by the app, whose numbers come from LOLA and SPICE): LROC WAC Hapke-normalized mosaic, 70°N-70°S | https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_HAPKE; Sato, H., et al. (2014), *JGR Planets* 119, 1775-1805, doi:10.1002/2013JE004580 | NASA PDS data |
| Landing-site coordinates (validation sites and the globe's mission pins): Apollo lunar module positions | NASA NSSDCA, https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html (Wagner et al. 2017, *Icarus* 283, 92-103) | NASA data |
| Landing-site coordinates: Chang'e 3-6, Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost | LROC featured images (NASA/GSFC/Arizona State University), https://lroc.im-ldi.com/images, one post per lander, listed with quotes in `pipeline/data/sites_source.csv`; cross-checked with the IAU "Statio" landing-site names in the Gazetteer | NASA data; IAU/USGS public domain |

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
each installed package). All 111 production packages are permissive: 87 MIT, 10 Apache-2.0 (CesiumJS and
class-variance-authority), 5 ISC, 3 OFL-1.1 (fonts), 2 BSD-3-Clause, and one each BSD-2-Clause, 0BSD,
MIT AND Zlib (pako) and MPL-2.0 OR Apache-2.0 (DOMPurify, used under Apache-2.0).

| Package | Version | Licence |
|---|---|---|
| react, react-dom | 19.2.8 | MIT |
| leaflet | 1.9.4 | BSD-2-Clause |
| three | 0.186.1 | MIT |
| cesium (with @cesium/engine, @cesium/widgets) | 1.147.0 | Apache-2.0 |
| zustand | 5.0.15 | MIT |
| radix-ui (popover, dialog, select, slider, toggle) | 1.7.0 | MIT |
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

## Use of AI

The team wrote the plan ([docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)): the product, the ground rules (no
invented numbers, every site sourced, never loosen a tolerance, calculations offline) and the phases. The
code, tests, pipeline scripts and most of the documentation were written by **Claude** (Anthropic) through
**Claude Code**, one phase per session, and each phase ended with a gate: lint, tests, build, browser
checks and a written report that the team read before the next phase.

Representative prompts (section 9 of the plan):

- "Read `docs/BUILD_PLAN.md` sections 1-6 fully, then the README. Execute **Phase 0** only, following the
  ground rules. Finish with the gate (section 6) and the phase report, then stop."
- "Read `docs/BUILD_PLAN.md` (sections 1-6 and Phase N) and `docs/VALIDATION.md`. Execute **Phase N** only.
  First list the files you will create or change and the tests you will add, then proceed without waiting.
  Commit after each task. Finish with the gate and the phase report, then stop."
- "The Phase N gate failed: (paste). Fix the root cause without loosening any tolerance, re-run the full
  gate, and update the report."

What the team decided (each is recorded in [CHANGELOG.md](CHANGELOG.md) or
[docs/VALIDATION.md](docs/VALIDATION.md)):

- No Cesium ion and no terrain provider: the globe is a smooth sphere; the real terrain is in the engine
  and the Polar HD map.
- Ratings follow the mission length (6.5 d default, 14 d option), with the published thresholds at 6.5 d.
- Phone frame rate was not measured; desktop performance was checked by the team on their own PC.
- The welcome's last button opens an empty planner, not a preset comparison.
- The globe's South Pole HD overlay was removed: it looked blurrier and brighter than the photo mosaic.
- Cut under the feature-freeze rule: the season heatmap, the site report export and live moving shadows.

AI is not part of the app: there is no chatbot and no AI service at run time.

The change history is in [CHANGELOG.md](CHANGELOG.md).
