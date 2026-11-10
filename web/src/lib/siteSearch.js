// Site search (the Ctrl-K / Cmd-K dialog): match curated sites by name, id, group or status, grouped by
// category in SITE_GROUPS order. Pure: pins are sitePins() rows, [{ site, group }].

import { SITE_GROUPS } from "@/view/globeModel.js"

// Artemis III points are reference points inside NASA's candidate regions (PGDA), not landing targets.
const STATUS_TEXT = { region: "point in a candidate region, not a landing target" }

// Plain-words status: "landed", "planned", "reference point", "point in a candidate region, ...".
export const statusText = (site) => STATUS_TEXT[site.status] || site.status

// "IM-2" matches "im2" and "IM 2": compare letters and digits only.
const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

const haystack = ({ site, group }) => fold([site.name, site.id, group.label, group.id, site.status].join(" "))

// [{ group, items: [{ site, group }] }]: every word of the query must match; an empty query lists every site.
export function searchSites(pins, query) {
  const words = String(query || "")
    .split(/\s+/)
    .map(fold)
    .filter(Boolean)
  const hits = pins.filter((p) => {
    const h = haystack(p)
    return words.every((w) => h.includes(w))
  })
  return SITE_GROUPS.map((group) => ({ group, items: hits.filter((p) => p.group.id === group.id) })).filter((g) => g.items.length)
}
