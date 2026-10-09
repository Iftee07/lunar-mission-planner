# Third-party UI components (21st.dev)

Every 21st.dev component installed in this app is listed here (PRD rule 11).
shadcn/ui primitives in `components/ui/` are MIT licensed (https://github.com/shadcn-ui/ui) and are not listed per file.

| Component | Source URL | Author | License | Installed (UTC date) |
|---|---|---|---|---|
| Segmented Control (`components/ui/segmented-control.jsx`) | https://21st.dev/@mohammadshehadeh/components/segmented-control (origin: https://github.com/MohammadShehadeh/hirael) | Mohammad Shehadeh | MIT (header in file; repository LICENSE "MIT © Mohammad Shehadeh") | 2026-10-09 |

Install notes: fetched once from the 21st.dev registry, inspected (imports: `react`, `@/lib/utils` only; no
extra npm packages, no remote fonts/CSS/URLs at runtime), then installed with the shadcn CLI from the saved
registry JSON (`tsx: false`, converted to `.jsx`). Used for the `Map | Surface` view toggle (antenna presets moved to a shadcn ToggleGroup in Phase 7).

Candidates reviewed and not installed:
- Segmented Control by Théo Balick (https://21st.dev/@balick/components/segmented-control), MIT: needs the extra `motion` package.
- Slider with Tooltip Indicator by cnippet-dev (https://21st.dev/@cnippet-dev/components/v-slider-6), MIT: a percentage range slider (time bar needs one hours value); not fetched (daily registry limit).
- Stat Card by Mohammad Shehadeh (https://21st.dev/@mohammadshehadeh/components/stat-card), MIT: registry returned "private component"; not installable.

# Data sources added in PRD v3

| Data | Source URL | Producer | License / terms | Retrieved (UTC date) |
|---|---|---|---|---|
| Named lunar craters (`public/data/craters.json`, built by `pipeline/09_build_features.py`) | https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip (listed on https://planetarynames.wr.usgs.gov/GIS_Downloads) | Gazetteer of Planetary Nomenclature, IAU Working Group for Planetary System Nomenclature and USGS Astrogeology Science Center | Public domain (use constraints in the bundled FGDC metadata) | 2026-10-09 |

Citation: Gazetteer of Planetary Nomenclature. Planetary Geomatics Group of the USGS Astrogeology Science Center,
https://planetarynames.wr.usgs.gov. International Astronomical Union (IAU) Working Group for Planetary System
Nomenclature (WGPSN). Accessed 2026-10-09.

# npm packages added in PRD v3 (licence read from each package's package.json / LICENSE)

| Package | Version (exact) | License | Used for |
|---|---|---|---|
| @fontsource-variable/space-grotesk | 5.3.0 | OFL-1.1 | Headings, welcome slides |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Body text |
| react-day-picker | 10.0.2 | MIT | Calendar (brings date-fns 4.x and @date-fns/tz, both MIT) |
| motion | 13.4.0 | MIT (Motion B.V.) | Welcome slide transitions and UI micro-animations (brings framer-motion, motion-dom, motion-utils 13.5.x, all MIT; exact versions in package-lock.json) |

No Lottie files are used: all welcome art is inline SVG with CSS keyframes, plus a canvas starfield.
