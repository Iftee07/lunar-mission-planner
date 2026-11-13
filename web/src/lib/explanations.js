// Layered "why" explanations (BUILD_PLAN P6e): one content file for every rating, layer and badge, so the wording
// stays consistent. Each builder returns
//   { verdict: { text, tone }, checks: [{ pass, text, gate }], science: { method, data, threshold, error, sources, readme } }
// Layer 1 is the verdict (always visible on the card), layer 2 the checklist (live numbers vs thresholds), layer 3
// "Show the science". gate: the rating level a line decides ("good" / "perfect" / "possible"), or null for an
// informational line. A rating reaches a level exactly when every line gated at that level passes (tested).
// Every string has a source: SOURCES below (all cited in the README), or this project's README method.
// Durations arrive in hours and are formatted only through lib/format.js (BUILD_PLAN rule 2).

import { LOOKAHEAD_H } from "@/engine/hours.js"
import {
  SLOPE_NASA_LIMIT_DEG,
  SLOPE_POSSIBLE_MAX_DEG,
  SLOPE_TYPICAL_ERROR_DEG,
  bodyDurations,
  rateEarth,
  rateLanding,
  rateSun,
  ratingThresholds,
} from "@/engine/ratings.js"
import { formatDays, formatPercent, formatTerrain } from "./format.js"

const REPO = "https://github.com/Iftee07/lunar-sp-browser"
export const readmeUrl = (anchor) => `${REPO}#${anchor}`

// Citations (README "Data sources and citations"). url null: no external source (project judgement).
export const SOURCES = {
  artemisStay: { label: "NASA: candidate Artemis III regions (6.5 d stay in continuous sunlight)", url: "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/" },
  ntrsScreening: { label: "NASA Artemis landing site briefing, NTRS 20230005904 (25% Earth, 10° slope at 100 m)", url: "https://ntrs.nasa.gov/api/citations/20230005904/downloads/PlatteCity_Artemis.pdf" },
  ntrsDte: { label: "NASA Artemis III site selection update, NTRS 20250011660 (direct-to-Earth)", url: "https://ntrs.nasa.gov/citations/20250011660" },
  barker: { label: "Barker et al. 2021: LOLA south pole maps and their errors", url: "https://ntrs.nasa.gov/api/citations/20205009660/downloads/Mike%20Barker_%20Paper_%20Improved%20Lola.pdf" },
  mazarico: { label: "Mazarico et al. 2011: illumination of the lunar poles (NASA GSFC PGDA)", url: "https://pgda.gsfc.nasa.gov/products/69" },
  lolaPolar: { label: "LOLA 20 m south pole terrain (NASA GSFC PGDA)", url: "https://pgda.gsfc.nasa.gov/products/90" },
  lolaGlobal: { label: "LOLA global terrain LDEM_16 (NASA PDS)", url: "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/" },
  naif: { label: "NAIF SPICE kernels (Sun and Earth positions)", url: "https://naif.jpl.nasa.gov/naif/data.html" },
  project: { label: "Project engineering judgement, not a NASA figure", url: null },
}

const terrainSources = (source) => (source === "polar-hd" ? "lolaPolar" : "lolaGlobal")
const terrainData = (source, resolutionM) =>
  `${formatTerrain(source, resolutionM)} terrain (LOLA), Sun and Earth positions from NAIF SPICE`

// --- ratings ---

// Sun: continuous sunlight from the landing time, against the mission length.
export function sunWhy(r, { missionH, sunMode = "center", terrainSource, resolutionM }) {
  const t = ratingThresholds(missionH)
  const { onHours } = bodyDurations(r, missionH)
  const rating = rateSun(r, missionH)
  const up = formatDays(onHours)
  const verdict = {
    perfect: `Good for power: the Sun stays up ${up}`,
    good: `Sun covers the stay, with little margin (${up})`,
    bad: r.visibleNow ? `Sun sets after ${up}, before the stay ends` : "No solar power at landing: the Sun is down",
  }[rating.level]
  return {
    rating,
    verdict: { text: verdict, tone: rating.color },
    checks: [
      { pass: r.visibleNow, text: r.visibleNow ? "Sun is up at landing" : "Sun is down at landing", gate: null },
      { pass: onHours >= t.sunGoodMinH, text: `Sun up for the whole ${formatDays(missionH)} stay (${up} from landing)`, gate: "good" },
      {
        pass: onHours >= t.sunPerfectMinH,
        text: `Plus about ${formatDays(t.sunPerfectMinH - missionH)} of margin (needs ${formatDays(t.sunPerfectMinH)})`,
        gate: "perfect",
      },
    ],
    science: {
      method: `The Sun counts as up while ${sunMode === "any_part" ? "any part of its disc" : "its centre"} clears the terrain horizon, seen from a 2 m lander deck. Time steps of 0.25 h, edges refined to 0.01 h, up to ${formatDays(LOOKAHEAD_H)} ahead.`,
      data: terrainData(terrainSource, resolutionM),
      threshold: `Perfect ≥ ${formatDays(t.sunPerfectMinH)}, Good ≥ ${formatDays(t.sunGoodMinH)}. NASA's Artemis III stay is 6.5 d in continuous sunlight; the extra margin is project judgement.`,
      error: "Terrain smaller than a few hundred metres is not in the skyline. The Sun's disc is half a degree wide: \"Count partial Sun\" in Details counts it as up while any part shows.",
      sources: ["artemisStay", "project", terrainSources(terrainSource), "naif"],
      readme: "ratings",
    },
  }
}

// Earth: in view for the whole stay (Perfect) or at least 25% of it (Good), from the antenna height.
export function earthWhy(r, { missionH, antennaM, terrainSource, resolutionM }) {
  const t = ratingThresholds(missionH)
  const { onHours, windowFraction } = bodyDurations(r, missionH)
  const rating = rateEarth(r, missionH)
  const share = formatPercent(windowFraction)
  const verdict = {
    perfect: "Earth in view the whole stay: direct-to-Earth contact any time",
    good: `Earth only part of the time (${share}): plan contact windows`,
    bad: `Earth rarely in view (${share}): needs a relay`,
  }[rating.level]
  return {
    rating,
    verdict: { text: verdict, tone: rating.color },
    checks: [
      {
        pass: onHours >= t.earthPerfectMinH,
        text: `Earth in view for the whole ${formatDays(missionH)} stay (${r.visibleNow ? `${formatDays(onHours)} from landing` : "below the horizon at landing"})`,
        gate: "perfect",
      },
      {
        pass: windowFraction >= t.earthGoodMinFraction,
        text: `In view at least ${formatPercent(t.earthGoodMinFraction)} of the stay (${share}, ${formatDays(r.windowVisibleHours)})`,
        gate: "good",
      },
      { pass: true, text: `Seen from the ${antennaM} m antenna`, gate: null },
    ],
    science: {
      method: `Earth counts as in view while its centre is above the terrain horizon seen from the antenna (${antennaM} m). The share is counted every 0.25 h over the stay.`,
      data: terrainData(terrainSource, resolutionM),
      threshold: `Perfect: the whole stay. Good: ≥ ${formatPercent(t.earthGoodMinFraction)} of it, NASA's screening level. Direct-to-Earth links favour more.`,
      error: "Terrain smaller than a few hundred metres is not in the skyline. Relays are not modelled.",
      sources: ["ntrsScreening", "ntrsDte", terrainSources(terrainSource), "naif"],
      readme: "ratings",
    },
  }
}

const deg = (d) => `${d.toFixed(1)}°`

// Landing: plane-fit slope within 100 m (Polar HD only).
export function landingWhy(slope, radiusM = 100) {
  const known = Number.isFinite(slope?.planeDeg)
  const rating = rateLanding(slope?.planeDeg)
  const verdict = !known
    ? "No slope data at this point"
    : rating.level === "possible"
      ? `Gentle enough to land: ${deg(slope.planeDeg)} slope`
      : `Too steep to land: ${deg(slope.planeDeg)} slope`
  return {
    rating,
    verdict: { text: verdict, tone: rating.color },
    checks: [
      { pass: known, text: known ? "Slope data at this point" : "No slope data at this point", gate: "possible" },
      {
        pass: known && slope.planeDeg < SLOPE_POSSIBLE_MAX_DEG,
        text: `Fitted slope within ${radiusM} m under ${SLOPE_POSSIBLE_MAX_DEG}°${known ? ` (${deg(slope.planeDeg)}, steepest point ${deg(slope.maxDeg)})` : ""}`,
        gate: "possible",
      },
    ],
    science: {
      method: `A plane is fitted to the 20 m LOLA heights over a ${radiusM} m radius; its tilt is the slope.`,
      data: "LOLA 20 m south pole terrain",
      threshold: `NASA's limit is ${SLOPE_NASA_LIMIT_DEG}° at 100 m. ${SLOPE_POSSIBLE_MAX_DEG}° leaves room for the typical ${SLOPE_TYPICAL_ERROR_DEG}° slope error of the terrain model (project judgement).`,
      error: `Typical LOLA slope error ±${SLOPE_TYPICAL_ERROR_DEG}°. Boulders and small craters are not checked.`,
      sources: ["ntrsScreening", "barker", "project", "lolaPolar"],
      readme: "ratings",
    },
  }
}

// Landing on Global terrain: not assessed (BUILD_PLAN rule 10).
export function landingCoarseWhy(resolutionM) {
  return {
    verdict: { text: "Not assessed: terrain too coarse for a slope", tone: "none" },
    checks: [
      { pass: false, text: `Terrain here is ${formatTerrain("global", resolutionM)} per pixel`, gate: null },
      { pass: false, text: "A landing slope needs the 20 m polar data, south of 84°S", gate: null },
    ],
    science: {
      method: "Outside 84°S the app uses LOLA's global map. One pixel is wider than the 100 m landing area, so a slope from it would average away the relief that matters for landing.",
      data: formatTerrain("global", resolutionM),
      threshold: `Slope is rated only on Polar HD terrain (NASA's limit is ${SLOPE_NASA_LIMIT_DEG}° at 100 m).`,
      error: "Hills smaller than a few kilometres are not in this terrain.",
      sources: ["lolaGlobal", "ntrsScreening"],
      readme: "terrain",
    },
  }
}

// --- badges and controls ---

export function terrainWhy(source, resolutionM) {
  const polar = source === "polar-hd"
  return {
    verdict: { text: formatTerrain(source, resolutionM), tone: "none" },
    checks: [
      { pass: polar, text: polar ? "Fine terrain: craters and ridges a few hundred metres across are in the skyline" : "Coarse terrain: hills under a few kilometres are not in the skyline", gate: null },
      { pass: polar, text: polar ? "Landing slope is rated" : "Landing slope is not rated here", gate: null },
    ],
    science: {
      method: polar
        ? "South of 84°S: LOLA's 20 m south pole map averaged to 120 m, with 240 m out to 80°S for distant horizons."
        : "Everywhere else: LOLA's global map LDEM_16, 16 pixels per degree (about 1.9 km).",
      data: formatTerrain(source, resolutionM),
      threshold: "The two terrains are never mixed: each result names its source.",
      error: polar ? "Features smaller than a few hundred metres are not in the skyline." : "Hills smaller than a few kilometres are not in the skyline.",
      sources: [terrainSources(source)],
      readme: "terrain",
    },
  }
}

export function antennaWhy(antennaM) {
  return {
    verdict: { text: `Antenna ${antennaM} m above the ground`, tone: "none" },
    checks: [
      { pass: true, text: "A taller antenna sees over more terrain, so Earth is in view as long or longer", gate: null },
      { pass: true, text: "The Sun is always computed from a fixed 2 m (lander deck and solar array)", gate: null },
    ],
    science: {
      method: "The Earth horizon is recomputed from the antenna height; the Sun horizon is not.",
      data: "Terrain horizon in 720 directions out to 200 km",
      threshold: "Presets 2, 5, 10 and 15 m.",
      error: "Masts, the lander's own shadow and relays are not modelled.",
      sources: ["ntrsDte"],
      readme: "antenna-model",
    },
  }
}

// Polar HD map layers (view/polarLayerModel.js POLAR_LAYERS ids). The NASA products' names, time span and
// shadowed area come from the manifest (pipeline 13_build_illumination.py); null if the build lacks the layer.
export function layerWhy(id, manifest) {
  const il = manifest?.illumination || {}
  if (id === "slope") {
    const radiusM = manifest?.slope?.radius_m ?? 100
    return {
      verdict: { text: "Landing slope, coloured like the Landing card", tone: "none" },
      checks: [
        { pass: true, text: `Green under ${SLOPE_POSSIBLE_MAX_DEG}°: landing possible`, gate: null },
        { pass: false, text: `Amber ${SLOPE_POSSIBLE_MAX_DEG}° to ${SLOPE_NASA_LIMIT_DEG}°: within NASA's limit but inside the error margin`, gate: null },
        { pass: false, text: `Red over ${SLOPE_NASA_LIMIT_DEG}°: beyond NASA's limit`, gate: null },
      ],
      science: {
        method: `A plane fitted to the terrain within ${radiusM} m of each 120 m pixel: the same number as the Landing card.`,
        data: "LOLA 20 m south pole terrain",
        threshold: `NASA's limit is ${SLOPE_NASA_LIMIT_DEG}°; ${SLOPE_POSSIBLE_MAX_DEG}° leaves room for the typical ${SLOPE_TYPICAL_ERROR_DEG}° terrain-model error (project judgement).`,
        error: `Typical slope error ±${SLOPE_TYPICAL_ERROR_DEG}°. Boulders and small craters are not in this data.`,
        sources: ["ntrsScreening", "barker", "lolaPolar"],
        readme: "ratings",
      },
    }
  }
  const spec = id === "psr" ? il.psr : il.illum_avg
  if (!spec) return null
  const psr = id === "psr"
  return {
    verdict: psr
      ? { text: "Ground the Sun never reaches", tone: "none" }
      : { text: "Share of time each spot is sunlit, a long-term average", tone: "none" },
    checks: psr
      ? [
          { pass: true, text: "Mostly crater floors: cold traps where water ice may be kept", gate: null },
          { pass: false, text: "No solar power there", gate: null },
          ...(spec.area_km2_inside_84S ? [{ pass: true, text: `${Math.round(spec.area_km2_inside_84S).toLocaleString("en-US")} km² inside 84°S`, gate: null }] : []),
        ]
      : [
          { pass: true, text: "Bright: sunlit most of the time. Dark: rarely sunlit", gate: null },
          { pass: false, text: "Not your dates: the cards and timeline use the date you pick", gate: null },
        ],
    science: {
      method: psr
        ? "NASA's map of permanently shadowed regions, resampled onto the 120 m grid."
        : "The share of time any part of the Sun is above the local horizon, from NASA's map, resampled onto the 120 m grid.",
      data: `${spec.source}. Time span: ${spec.time_span}.`,
      threshold: psr ? "A pixel is shadowed if NASA's map marks it so." : "Shown as is, 0% to 100%.",
      error: "Resampled to 120 m: features smaller than a pixel are averaged.",
      sources: ["mazarico"],
      readme: "terrain",
    },
  }
}

// "Move a little": how the numbers change within a short walk, and with a day's slip.
export function sensitivityWhy({ radiusM, terrainSource, resolutionM, globalMinM }) {
  return {
    verdict: { text: "How much the Sun and Earth shares change nearby", tone: "none" },
    checks: [
      { pass: true, text: "8 points around the pin, each with its own skyline", gate: null },
      { pass: true, text: "A wide range means the exact spot matters: land precisely or pick a steadier site", gate: null },
      ...(terrainSource === "global"
        ? [{ pass: false, text: `Coarse terrain: the smallest ring is ${globalMinM / 1000} km`, gate: null }]
        : []),
    ],
    science: {
      method: `Each point ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`} away gets its own terrain horizon; the share of the stay with the Sun up and with Earth in view is counted exactly as on the cards. The date line repeats it for the pin landing a day earlier and later.`,
      data: terrainData(terrainSource, resolutionM),
      threshold: "No rating: this shows the spread, not a verdict.",
      error: "Points past the edge of Polar HD (84°S) are skipped, never mixed with coarse terrain.",
      sources: [terrainSources(terrainSource), "naif"],
      readme: "visibility-and-durations",
    },
  }
}

// About popover: the three rating rules in one line each (the badges' popovers give the live numbers).
export function ratingRules(missionH) {
  const t = ratingThresholds(missionH)
  return [
    { topic: "Sun", text: `Perfect with ${formatDays(t.sunPerfectMinH)}+ of continuous sunlight from landing, Good with ${formatDays(t.sunGoodMinH)}+.` },
    { topic: "Earth", text: `Perfect if in view for the whole stay, Good if in view at least ${formatPercent(t.earthGoodMinFraction)} of it.` },
    { topic: "Landing", text: `Possible under ${SLOPE_POSSIBLE_MAX_DEG}° fitted slope within 100 m (NASA's limit is ${SLOPE_NASA_LIMIT_DEG}°).` },
  ]
}

// --- glossary (dotted-underlined terms) ---
export const GLOSSARY = {
  terminator: {
    term: "Terminator",
    text: "The line between day and night on the Moon. Near the poles the Sun stays low, so the terrain decides which spots are lit.",
    source: "mazarico",
  },
  libration: {
    term: "Libration",
    text: "A slow wobble in how the Moon faces Earth. Seen from the south pole, Earth moves in a small loop near the horizon over a month.",
    source: "naif",
  },
  dte: {
    term: "DTE (direct-to-Earth)",
    text: "Radio contact with Earth without a relay satellite. It needs Earth above the local horizon.",
    source: "ntrsDte",
  },
  psr: {
    term: "PSR (permanently shadowed region)",
    text: "Ground the Sun never reaches, mostly crater floors near the poles.",
    source: "mazarico",
  },
  horizon: {
    term: "Horizon",
    text: "The local skyline: the highest terrain in each of 720 directions, out to 200 km. A body is in view when its centre is above it.",
    source: null,
    readme: "horizon",
  },
}
