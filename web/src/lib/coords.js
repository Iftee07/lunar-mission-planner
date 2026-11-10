// Typed coordinates anywhere on the Moon, in decimal degrees:
//   "-89.45, 222.7"   signed latitude then longitude (east positive; 0..360 accepted)
//   "89.45S 137.3W"   hemisphere letters after the numbers (either order: "23.473E 0.674N")
//   "N 0.674 E 23.473", "0.674° N, 23.473° E", lowercase letters, commas or spaces
// parseLatLon returns { ok: true, lat, lon } with lon east in (-180, 180], or { ok: false, error }.

const EXAMPLE = "e.g. 0.674N 23.473E or -89.45, 222.7"

const fail = (error) => ({ ok: false, error })

// Numbers (with an optional sign) and hemisphere letters; commas, semicolons, spaces and degree signs separate.
function tokenize(text) {
  const src = text.replace(/[−–]/g, "-").replace(/[°º]/g, " ")
  const tokens = []
  const re = /\s*(?:([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?![\d.])|([NSEW])(?![A-Z])|([,;])|(\S+))/giy
  let m
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) tokens.push({ num: Number(m[1]), signed: /^[+-]/.test(m[1]) })
    else if (m[2] !== undefined) tokens.push({ hemi: m[2].toUpperCase() })
    else if (m[4] !== undefined) return { bad: m[4] }
  }
  return { tokens }
}

// [{ num, signed, hemi? }]: each number with its letter (before it, "N 12", or after it, "12N").
function pairUp(tokens) {
  const prefix = tokens[0]?.hemi !== undefined
  const out = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.hemi !== undefined) {
      const target = prefix ? tokens[i + 1] : out[out.length - 1]
      if (!target || target.num === undefined || (prefix ? false : target.hemi)) return null
      if (prefix) {
        out.push({ ...target, hemi: t.hemi })
        i++
      } else target.hemi = t.hemi
    } else out.push({ ...t })
  }
  return out
}

const isLatHemi = (h) => h === "N" || h === "S"

export function parseLatLon(text) {
  if (!text || !text.trim()) return fail(`Type a latitude and a longitude, ${EXAMPLE}`)
  const { tokens, bad } = tokenize(text.trim())
  if (bad) return fail(`"${bad}" is not part of a coordinate (${EXAMPLE})`)
  const values = pairUp(tokens)
  if (!values) return fail(`Put one letter N, S, E or W with each number (${EXAMPLE})`)
  if (values.length !== 2) return fail(`Type exactly two numbers, latitude then longitude (${EXAMPLE})`)
  if (values.some((v) => v.hemi && v.signed)) return fail("Use a minus sign or a hemisphere letter (N/S/E/W), not both")

  // Which value is the latitude: the letters decide; without letters, latitude comes first.
  let [a, b] = values
  if (a.hemi && b.hemi) {
    if (isLatHemi(a.hemi) === isLatHemi(b.hemi)) {
      return fail(isLatHemi(a.hemi) ? "Both values are latitudes (N/S): add a longitude (E/W)" : "Both values are longitudes (E/W): add a latitude (N/S)")
    }
    if (!isLatHemi(a.hemi)) [a, b] = [b, a]
  } else if ((a.hemi && !isLatHemi(a.hemi)) || (b.hemi && isLatHemi(b.hemi))) {
    ;[a, b] = [b, a]
  }

  const lat = a.hemi === "S" ? -a.num : a.num
  const lon = b.hemi === "W" ? -b.num : b.num
  if (!(Math.abs(lat) <= 90)) return fail("Latitude must be between 90°S and 90°N")
  if (!(lon >= -180 && lon <= 360) || (b.hemi === "W" && b.num > 180)) {
    return fail("Longitude must be between 180°W and 180°E (or 0 to 360 east)")
  }
  return { ok: true, lat, lon: normalizeLon(lon) }
}

// East longitude in (-180, 180].
export function normalizeLon(lon) {
  if (lon > 180) return lon - 360
  if (lon <= -180) return lon + 360
  return lon
}

// True when the text starts like a coordinate (a number, or a hemisphere letter then a number), so search
// can offer "Go to ..." or show the parser's error instead of only matching site names.
export function looksLikeCoordinates(text) {
  return /^\s*[+\-−]?\.?\d/.test(text) || /^\s*[NSEW]\s*[+-]?\.?\d/i.test(text)
}
