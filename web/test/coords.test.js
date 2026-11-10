import { describe, expect, test } from "vitest"
import { looksLikeCoordinates, normalizeLon, parseLatLon } from "../src/lib/coords.js"

const ok = (text, lat, lon) => {
  const r = parseLatLon(text)
  expect(r.ok, `${text}: ${r.error}`).toBe(true)
  expect(r.lat).toBeCloseTo(lat, 9)
  expect(r.lon).toBeCloseTo(lon, 9)
}
const bad = (text, pattern) => {
  const r = parseLatLon(text)
  expect(r.ok, text).toBe(false)
  expect(r.error).toMatch(pattern)
}

describe("typed coordinates: accepted", () => {
  test("signed decimals, east longitude 0..360 (BUILD_PLAN example)", () => ok("-89.45, 222.7", -89.45, -137.3))
  test("hemisphere letters after the numbers (BUILD_PLAN example)", () => ok("89.45S 137.3W", -89.45, -137.3))
  test("north and east (BUILD_PLAN example, Apollo 11)", () => ok("0.674N 23.473E", 0.674, 23.473))
  test("degree signs, spaces before the letters, comma", () => ok("0.674° N, 23.473° E", 0.674, 23.473))
  test("lowercase letters", () => ok("26.13s 3.63w", -26.13, -3.63))
  test("letters before the numbers", () => ok("N 26.13 E 3.63", 26.13, 3.63))
  test("longitude first when the letters say so", () => ok("23.473E 0.674N", 0.674, 23.473))
  test("space separated, both negative", () => ok("-3.0128 -23.4219", -3.0128, -23.4219))
  test("unicode minus sign and semicolon", () => ok("−84.5; 10", -84.5, 10))
  test("one letter only: E marks the longitude", () => ok("10E 20", 20, 10))
  test("poles and the date line", () => {
    ok("-90, 0", -90, 0)
    ok("90N 180W", 90, 180)
    ok("0, -180", 0, 180)
    ok("0, 360", 0, 0)
  })
  test("plus sign and leading-dot decimals", () => ok("+.5, +.25", 0.5, 0.25))
})

describe("typed coordinates: clear errors", () => {
  test("empty", () => bad("  ", /latitude and a longitude/))
  test("words", () => bad("Shackleton", /not part of a coordinate/))
  test("one number", () => bad("12.5", /exactly two numbers/))
  test("three numbers", () => bad("1 2 3", /exactly two numbers/))
  test("latitude out of range", () => bad("91, 0", /Latitude must be between/))
  test("longitude out of range", () => bad("10, 400", /Longitude must be between/))
  test("west longitude over 180", () => bad("10N 200W", /Longitude must be between/))
  test("two latitudes", () => bad("10N 20S", /Both values are latitudes/))
  test("two longitudes", () => bad("10E 20W", /Both values are longitudes/))
  test("minus sign and letter together", () => bad("-10S 20E", /not both/))
  test("two letters on one number", () => bad("10 N S 20", /one letter/))
  test("malformed number", () => bad("1.2.3, 4", /not part of a coordinate/))
})

describe("helpers", () => {
  test("normalizeLon maps to (-180, 180]", () => {
    expect(normalizeLon(222.7)).toBeCloseTo(-137.3, 9)
    expect(normalizeLon(-180)).toBe(180)
    expect(normalizeLon(180)).toBe(180)
    expect(normalizeLon(-12)).toBe(-12)
  })
  test("looksLikeCoordinates tells numbers from names", () => {
    for (const t of ["-89.45, 222.7", "0.674N", "N 26", " .5 1", "−1, 2"]) expect(looksLikeCoordinates(t), t).toBe(true)
    for (const t of ["Apollo 11", "Shackleton", "Nobile", "", "IM-2"]) expect(looksLikeCoordinates(t), t).toBe(false)
  })
})
