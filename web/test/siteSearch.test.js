import fs from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { searchSites, statusText } from "../src/lib/siteSearch.js"
import { SITE_GROUPS, sitePins } from "../src/view/globeModel.js"
import { DATA_DIR } from "./load.js"

const sitesFile = path.join(DATA_DIR, "sites.json")
const pins = fs.existsSync(sitesFile) ? sitePins(JSON.parse(fs.readFileSync(sitesFile, "utf8"))) : []
const ids = (groups) => groups.flatMap((g) => g.items.map((p) => p.site.id))

describe.skipIf(!pins.length)("site search", () => {
  test("an empty query lists every site, grouped in category order", () => {
    const groups = searchSites(pins, "")
    expect(ids(groups)).toHaveLength(pins.length)
    const order = SITE_GROUPS.map((g) => g.id)
    const seen = groups.map((g) => order.indexOf(g.group.id))
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    for (const g of groups) for (const p of g.items) expect(p.group.id).toBe(g.group.id)
  })

  test("matches names ignoring case, punctuation and accents", () => {
    expect(ids(searchSites(pins, "apollo 11"))).toEqual(["apollo11"])
    expect(ids(searchSites(pins, "im2"))).toEqual(["im2"])
    expect(ids(searchSites(pins, "IM 2"))).toEqual(["im2"])
    expect(ids(searchSites(pins, "schrodinger"))).toEqual(["draper_apex1"])
    expect(ids(searchSites(pins, "chang'e 4"))).toEqual(["change4"])
  })

  test("matches groups and status words", () => {
    expect(ids(searchSites(pins, "artemis")).length).toBe(2)
    const planned = searchSites(pins, "planned").flatMap((g) => g.items)
    expect(planned.length).toBeGreaterThan(0)
    for (const p of planned) expect(p.site.status).toBe("planned")
  })

  test("no match gives no groups", () => {
    expect(searchSites(pins, "zzzz")).toEqual([])
  })

  test("Artemis III points say they are not landing targets", () => {
    for (const p of pins.filter((q) => q.site.status === "region")) expect(statusText(p.site)).toMatch(/not a landing target/)
    expect(statusText({ status: "landed" })).toBe("landed")
  })
})
