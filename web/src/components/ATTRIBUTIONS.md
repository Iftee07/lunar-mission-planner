# Third-party UI components (21st.dev)

Every 21st.dev component installed in this app is listed here (PRD rule 11).
shadcn/ui primitives in `components/ui/` are MIT licensed (https://github.com/shadcn-ui/ui) and are not listed per file.

| Component | Source URL | Author | License | Installed (UTC date) |
|---|---|---|---|---|
| Segmented Control (`components/ui/segmented-control.jsx`) | https://21st.dev/@mohammadshehadeh/components/segmented-control (origin: https://github.com/MohammadShehadeh/hirael) | Mohammad Shehadeh | MIT (header in file; repository LICENSE "MIT © Mohammad Shehadeh") | 2026-10-09 |

Install notes: fetched once from the 21st.dev registry, inspected (imports: `react`, `@/lib/utils` only; no
extra npm packages, no remote fonts/CSS/URLs at runtime), then installed with the shadcn CLI from the saved
registry JSON (`tsx: false`, converted to `.jsx`). Used for the `Map | Surface` view toggle and the antenna presets.

Candidates reviewed and not installed:
- Segmented Control by Théo Balick (https://21st.dev/@balick/components/segmented-control), MIT: needs the extra `motion` package.
- Slider with Tooltip Indicator by cnippet-dev (https://21st.dev/@cnippet-dev/components/v-slider-6), MIT: a percentage range slider (time bar needs one hours value); not fetched (daily registry limit).
- Stat Card by Mohammad Shehadeh (https://21st.dev/@mohammadshehadeh/components/stat-card), MIT: registry returned "private component"; not installable.
