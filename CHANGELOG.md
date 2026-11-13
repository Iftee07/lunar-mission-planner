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
  maps of the south pole (for the Phase 3 map layers), an offline Moon texture (NASA SVS CGI Moon Kit colour map) and a South Pole HD
  overlay (for the Phase 2 globe), and 1709 IAU feature names for globe labels.
- Validation extended: JPL Horizons at Apollo 11, Chang'e-4, Apollo 15 and in 2033-2035; Python
  references for the global horizon and the metrics. 71 tests pass.
- Official coordinates for 25 sites collected for Phase 3, each with its source quote: Apollo and
  Luna 9 (NASA NSSDCA); Chang'e 3-6, Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost (LROC); Shackleton
  rim, the connecting ridge and two Artemis III regions (NASA PGDA well-lit points); upcoming CLPS
  targets (NASA CLPS graphic). The validation sites now use them too.

### Phase 2: the 3D globe (2026-11-11)

- **The planner now opens on a 3D Moon you can spin, like Google Earth.** Drag to rotate, scroll or
  pinch to zoom, right-drag to tilt; click anywhere to place the pin. Built with CesiumJS (Apache-2.0),
  loaded only when the globe opens (about 1 MB).
- **Sharp NASA imagery.** The LRO WAC global mosaic streams from NASA Moon Trek and gets sharper as you
  zoom (about 83 m per pixel). Offline, or with `?offline=1`, a bundled NASA texture takes over and an
  "Offline imagery" badge says so. Near the south pole our 120 m LOLA shading fades in ("South Pole HD").
- **Real sunlight.** The globe is lit by the Sun's true direction at the selected time, so the day/night
  line sweeps across the Moon when you drag the time or press Play. Markers show Earth's direction and
  the points where the Sun and Earth are overhead.
- **Mission pins and names.** 25 landing sites (Apollo, CLPS, Artemis III regions, other countries,
  south-pole reference points), each from a cited official source. Hover a pin for its name, click it to
  fly there and pick it; the sidebar shows the site's name. 1709 IAU crater and feature names appear by
  size as you zoom in. A Layers menu toggles groups, names, a lat/lon grid and the South Pole HD overlay.
- **Three views:** Globe, Polar HD (the 120 m south pole map) and Surface; `V` cycles them, "View from
  here" opens the surface view, and "Open Polar HD map" appears when you look at the south pole.
- Keyboard on the globe: arrows rotate, `+`/`-` zoom, Enter places the pin at the centre. Works at
  360 px wide (fewer labels, credits behind "Data attribution").
- First load with the globe open and no pin: 6.0 MB (budget 10 MB). 60 fps while rotating on a laptop.
  83 tests pass (12 new: frame and picking, Sun lighting, imagery grid and fallback, label level of
  detail, mission-pin sources).

### Phase 3: sites, search, coordinates, shareable links (2026-11-11)

- **Search** (button in the top bar, or `Ctrl`+`K` / `⌘K`): every mission site, grouped by category with
  its status (landed, planned, reference point, point in an Artemis III candidate region). Picking one flies
  the globe there, or pans the Polar HD map if that is open.
- **Go anywhere by typing coordinates** in the same box: `0.674N 23.473E`, `89.45S 137.3W` or
  `-89.45, 222.7`. Mistakes get a plain message, for example "Latitude must be between 90°S and 90°N".
- **Polar HD map layers**: slope (green under 8°, amber 8 to 10°, red over 10°, the Landing rating's limits),
  average sunlight and permanent shadow, both from NASA's LOLA illumination maps. Each layer has an
  opacity slider, a legend, a `?` with its source and time span, and its value under the cursor. Layers
  fade in and out. "See slopes on the map" on the Landing card opens the map with the slope layer on.
- **Mission sites on the Polar HD map**: the sites south of 84°S (IM-2, Griffin and IM-4, the two Artemis III
  points, Shackleton rim, the connecting ridge) appear as markers in their globe colours. Hover for the name,
  click to pick one; a checkbox in Layers hides them.
- **Shareable links**: the address bar always describes the current view (site or pin, time, antenna,
  mission length, view, layers, camera). "Copy link" copies it, and opening it restores the view and skips
  the welcome slides. When a schedule slips, send the alternative as a link. The compare list joins the
  link in Phase 4.
- The 25 mission sites are unchanged and all verified against their cited sources (Phase 2).
- Removed the developer-only URL options `?screen=app` and `?slide=`. `?pin`, `?t` and `?view` now work
  in every build, and any planner parameter opens the planner.
- First load is still 6.0 MB with the globe open (budget 10 MB). 132 tests pass (49 new: coordinate parser,
  search, map layers, link round trip).

### Phase 4: compare (2026-11-11)

- **Compare up to 4 sites side by side.** "+ Compare" under the site name (or in a mission pin's tooltip on
  the globe) adds a column to the compare drawer above the time bar. Rows: terrain, Sun elevation now, Power,
  Talk to Earth, Landing (or "Not assessed" on coarse terrain), the sunlit / Earth / both shares over the
  mission, power without Earth, longest dark, and when the Sun and Earth set. The best value in each row glows.
- **Same site, different date**, for when a schedule slips: a column's calendar button adds a copy one lunar
  day (29.5 d) or one month later, or at a typed UTC time. Every column follows the time slider and Play.
- **Presets**: "Equator vs pole" (Apollo 11 vs Shackleton rim) and "Two Artemis III regions". The planned
  "IM-2: planned target vs where it ended up" is not included: no source we fetched gives the planned
  target's coordinates.
- On the globe, compared sites get numbered markers in their column colours, joined by arcs that draw in.
- Shared links now carry the compared sites and their dates.
- On a phone the columns are a swipe carousel.
- 4 new sites compute in under 0.8 s once the terrain is loaded (budget 1.5 s); Play stays at 52 fps with
  4 columns. 143 tests pass.

### Phase 5: timeline and countdowns (2026-11-11)

- **Timeline strip** at the bottom: for the pin and each compared site, rows for Sun up, Earth in view and
  both, over the 29.5 days after the start time, with the mission window bracketed. Drag the playhead or
  click the track to move the time; hover a bar for its start, end and length; click a bar to jump to its
  start. Arrow keys move 15 minutes, Shift + arrows 1 day. Bars sweep in for a new site and cross-fade when
  a setting changes. The strip replaces the old time slider: one time control.
- **Time-lapse:** Play at 1 h, 6 h, 1 d or 3 d per second, and a loop button that replays the mission
  window. In the surface view the Sun and Earth leave short fading trails while the skyline stays put;
  hovering the timeline shows a faint Sun and Earth at that time.
- **Countdowns** on the Sun and Earth cards: "Sunset in 42 h", "Earthrise in 3.1 d", with rolling digits.
  Before a set: green above 48 h, amber 12 to 48 h, red under 12 h. The phone summary strip shows them too.
- **Elevation now** in large type on the Sun and Earth cards, with a small line of it over the mission.
- **Details card:** mission length (6.5 d or 14 d), "Count partial Sun", and the next 5 windows of the Sun
  and of Earth; click one to jump there. (The mission length and partial-Sun options had no control before,
  only the link parameters.)
- Faster: compared columns take turns while the time moves, then all update together, so scrubbing and Play
  with 4 compared sites and the globe run at 58 to 60 fps (target 50). 155 tests pass.

### Phase 6: explain it (2026-11-13)

- **Move a little:** a new card shows how much the Sun and Earth shares of the stay change within 250 m,
  500 m or 1 km of the pin (5, 10 or 20 km on coarse Global terrain), from 8 points that each get their own
  skyline: "Within 500 m: sunlight 0%–100%, Earth 0%–48%" on Shackleton's rim. A ring of dots, coloured by
  sunlight or Earth, pops in on the card and appears around the pin on the globe and the Polar HD map. The
  card also gives the same spot landing 24 h earlier and later.
- **Why, in layers:** every rating card has a one-line verdict ("Good for power: the Sun stays up 8.8 d").
  Its `?` opens a checklist of the rule against the live numbers, and "Show the science" adds the method,
  data and terrain resolution, the threshold with its citation, the known error and a README link. The same
  `?` is on the terrain badge, the Antenna card, "Not assessed" and each Polar HD layer. It opens on hover,
  keyboard focus or a tap, and Esc closes it. Glossary terms (horizon, terminator, libration, DTE, PSR) are
  dotted-underlined.
- **Three explainers:** why the Sun skims the horizon at the pole (drag the latitude), why Earth comes and
  goes (its monthly loop from the ephemeris), why antenna height matters (raise a mast over a ridge). They
  open from the Sun, Earth and Antenna cards.
- **Welcome:** the three slides now use the explainers; the last button, "Open the planner", opens an
  empty planner (team decision, 2026-11-13: not the "Apollo 11 vs Shackleton" preset the plan suggested).
- **Compare drawer resizes:** drag its top edge up or down (or Up / Down on the focused handle;
  double-click resets). The height is remembered in this browser, and the map or globe keeps at least
  240 px. The Polar HD map now re-measures whenever its area changes size.
- **Pin coordinates on the map:** the point you click shows its latitude and longitude just below the pin,
  on the globe and on the Polar HD map (hidden while the pin is dragged).
- **Compared sites on the Polar HD map:** numbered badges in the column colours, joined in column order by
  a line that draws in, as on the globe. Sites north of 84°S are left off the map.
- Fixed: a typed longitude of 360° pinned at 180°E instead of 0°.
- Not built (cut under the freeze rule): the season heatmap, the site report export and live moving
  shadows. 186 tests pass.

### Earlier (before 2026-11-10)

- South-pole landing site planner: Sun and Earth visibility from SPICE ephemeris and LOLA terrain
  horizons, slope-based landing rating, Earth-visible calendar, named craters, first-person surface
  view, welcome slides. Validated against JPL Horizons and independent Python references.
- Vercel deploy from git, with the generated data committed through Git LFS.

## At the hackathon

(Nothing yet.)
