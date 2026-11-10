# CLAUDE.md

Lunar Mission Planner, for the NASA Space Apps 2026 challenge "Lunar Landing Site Navigator".
**The plan is [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).** Read its sections 1–6 before any work, and
work one phase at a time: finish with the gate (section 6) and the phase report, then stop.
Also read `README.md`, `docs/VALIDATION.md` and `docs/CLEANUP.md`.

Commands (in `web/`): `npm run lint && npm test && npm run build`, and `npm run preview`.
Pipeline (repo root): `venv\Scripts\python pipeline\NN_*.py`. Branch: `feature/navigator`.

## Ground rules 1–11 (full text in BUILD_PLAN.md section 4)

1. Never break existing validation. Lint, tests and build pass at the end of every phase. Never
   loosen a tolerance.
2. The engine works in hours. The UI converts only through `web/src/lib/format.js`.
3. Calculations never use the network. All engine data comes from the pipeline in
   `web/public/data/`. The only runtime network use is NASA Moon Trek imagery tiles (display only),
   with a bundled fallback texture.
4. No invented coordinates, numbers or facts. Every curated site needs a fetched `source_url` and a
   `source_note`. If unverified: `"verified": false`, an "unverified" tag in the UI, and a line in
   the report.
5. Pure engine functions with tests first, UI second.
6. Heavy compute stays off the main thread (worker or rAF-coalesced). Large typed arrays never go
   into React state.
7. Dependencies: what is installed, plus `cesium` for the globe only (lazy chunk). No other globe,
   chart or UI-kit libraries, no AI SDKs, no Cesium ion and no terrain provider. Ask before adding
   any other package.
8. Do not change rating thresholds in `ratings.js`.
9. Out of scope: AI chatbot, user accounts, a live Horizons backend, real-time multiplayer.
10. Polar HD (84°S–90°S, 120/240 m grids) vs Global DEM: the Landing rating is given only in Polar
    HD; elsewhere it shows "Not assessed (coarse terrain)". Never mix the two silently.
11. First load (before any pin, excluding imagery tiles) ≤ 10 MB. The Cesium chunk, global DEM and
    polar grids are lazy-loaded, with progress.

Also: commit after each task. Update README, `docs/VALIDATION.md` and `CHANGELOG.md` as you go.
Remove superseded code in the same phase, in separate `chore: remove …` commits (rule 15).
