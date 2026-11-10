"""Python references for light / Earth-visibility hours and for the mission-window metrics.

Independent of the JS engine and of ephemeris.bin: Sun and Earth vectors come straight from
SPICE (float64, no interpolation). Uses the Python horizons from 07_horizon_reference.py.
Same algorithm as the engine: 0.25 h scan, bisection to 0.01 h.
- hours_reference.json: 2 polar pins x 2 times x 2 bodies, scan to 1500 h, window = 156 h.
- metrics_reference.json: 2 polar + 2 non-polar pins, one start time each, mission window
  METRICS_MISSION_H: sunlit / Earth / both fractions, Sun up with Earth down, longest dark and
  no-Earth stretches, Sun elevation now / min / max (sampled every 0.25 h).
A fixture that already exists is kept (delete it to recompute).
"""
import json
import math

import numpy as np
import spiceypy as sp

from common import ABCORR, FIXTURES, FRAME, iso_to_unix, load_kernels, unix_to_iso, MOON_RADIUS_M

TIMES_UTC = ["2026-11-01T00:00:00Z", "2027-02-14T12:00:00Z"]
N_PINS = 2
METRICS_MISSION_H = 156.0
METRICS_TIMES_UTC = {"pins": "2026-11-01T00:00:00Z", "global_pins": "2027-03-10T06:00:00Z"}
STEP_H, LOOKAHEAD_H, WINDOW_H, TOL_H = 0.25, 1500.0, 156.0, 0.01
SPICE_NAME = {"sun": "SUN", "earth": "EARTH"}


class Site:
    def __init__(self, pin):
        lat, lon = math.radians(pin["lat"]), math.radians(pin["lon"])
        self.up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
        self.east = np.array([-math.sin(lon), math.cos(lon), 0.0])
        self.north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
        self.pos = self.up * (MOON_RADIUS_M + pin["groundM"] + pin["antennaM"]) / 1000.0
        self.hz = np.array(pin["horizon"])

    def az_el(self, body, unix_s):
        et = sp.str2et(unix_to_iso_frac(unix_s))
        v, _ = sp.spkpos(SPICE_NAME[body], et, FRAME, ABCORR, "MOON")
        v = np.asarray(v) - self.pos
        el = math.degrees(math.asin((v @ self.up) / np.linalg.norm(v)))
        az = math.degrees(math.atan2(v @ self.east, v @ self.north)) % 360.0
        return az, el

    def visible(self, body, unix_s):
        az, el = self.az_el(body, unix_s)
        hz = np.interp(az, np.arange(721) * 0.5, np.append(self.hz, self.hz[0]))
        return el > hz


def unix_to_iso_frac(t):
    whole = math.floor(t)
    return unix_to_iso(int(whole)) + f"{t - whole:.6f}"[1:]


def bisect(site, body, start, a, b, sa):
    while b - a > TOL_H:
        m = (a + b) / 2
        if site.visible(body, start + m * 3600) == sa:
            a = m
        else:
            b = m
    return (a + b) / 2


def next_change(site, body, start, frm, state):
    n = int(round((LOOKAHEAD_H - frm) / STEP_H))
    for k in range(1, n + 1):
        h = frm + k * STEP_H
        if site.visible(body, start + h * 3600) != state:
            return bisect(site, body, start, h - STEP_H, h, state), h
    return None, None


def hours(site, body, start):
    now = site.visible(body, start)
    first, after = next_change(site, body, start, 0.0, now)
    nxt = None
    if first is not None:
        second, _ = next_change(site, body, start, after, not now)
        if second is not None:
            nxt = second - first
    vis = sum(site.visible(body, start + k * STEP_H * 3600) for k in range(int(WINDOW_H / STEP_H)))
    return {"visibleNow": bool(now), "hoursToChange": first, "nextPeriodHours": nxt,
            "continuous": first is None, "windowVisibleHours": vis * STEP_H,
            "windowHiddenHours": WINDOW_H - vis * STEP_H}


def intervals(site, body, start, span_h):
    """Visible intervals [(a, b)] in [0, span_h] h: 0.25 h scan, edges bisected to 0.01 h."""
    out, state = [], site.visible(body, start)
    open_at = 0.0 if state else None
    for k in range(1, int(round(span_h / STEP_H)) + 1):
        h = k * STEP_H
        s = site.visible(body, start + h * 3600)
        if s == state:
            continue
        at = bisect(site, body, start, h - STEP_H, h, state)
        if s:
            open_at = at
        else:
            out.append((open_at, at))
            open_at = None
        state = s
    if open_at is not None:
        out.append((open_at, span_h))
    return out


def overlap(a, b):
    return sum(max(0.0, min(x1, y1) - max(x0, y0)) for x0, x1 in a for y0, y1 in b)


def longest_gap(ivs, span_h):
    edges = [0.0] + [v for iv in ivs for v in iv] + [span_h]
    return max(edges[i + 1] - edges[i] for i in range(0, len(edges), 2))


def metrics(site, start, span_h):
    sun, earth = intervals(site, "sun", start, span_h), intervals(site, "earth", start, span_h)
    sun_h, earth_h, both_h = sum(b - a for a, b in sun), sum(b - a for a, b in earth), overlap(sun, earth)
    els = [site.az_el("sun", start + k * STEP_H * 3600)[1] for k in range(int(round(span_h / STEP_H)) + 1)]
    return {"missionH": span_h, "sunlitFraction": sun_h / span_h, "earthFraction": earth_h / span_h,
            "bothFraction": both_h / span_h, "sunUpEarthDownH": sun_h - both_h,
            "longestDarkH": longest_gap(sun, span_h), "longestNoEarthH": longest_gap(earth, span_h),
            "sunElevationNowDeg": els[0], "sunElevationMinDeg": min(els), "sunElevationMaxDeg": max(els),
            "sunIntervals": sun, "earthIntervals": earth}


def build_metrics(ref):
    cases = []
    for key, n in (("pins", N_PINS), ("global_pins", 2)):
        t = METRICS_TIMES_UTC[key]
        for pin in ref[key][:n]:
            m = metrics(Site(pin), iso_to_unix(t), METRICS_MISSION_H)
            cases.append({"set": key, "lat": pin["lat"], "lon": pin["lon"], "timeUtc": t, **m})
            print(f"metrics ({pin['lat']}, {pin['lon']}) {t}: sunlit {m['sunlitFraction']:.4f} earth "
                  f"{m['earthFraction']:.4f} both {m['bothFraction']:.4f} sunUpEarthDown {m['sunUpEarthDownH']:.2f} h "
                  f"longest dark {m['longestDarkH']:.2f} h no-Earth {m['longestNoEarthH']:.2f} h "
                  f"Sun el {m['sunElevationMinDeg']:.2f}..{m['sunElevationMaxDeg']:.2f} deg")
    (FIXTURES / "metrics_reference.json").write_text(json.dumps({"cases": cases}, indent=1))
    print(f"wrote {FIXTURES / 'metrics_reference.json'}")


def main():
    load_kernels()
    full = json.loads((FIXTURES / "horizon_reference.json").read_text())
    if not (FIXTURES / "metrics_reference.json").exists():
        build_metrics(full)
    else:
        print("metrics_reference.json exists: kept")
    if (FIXTURES / "hours_reference.json").exists():
        print("hours_reference.json exists: kept")
        return
    ref = full["pins"][:N_PINS]
    cases = []
    for pin in ref:
        site = Site(pin)
        for t in TIMES_UTC:
            for body in ("sun", "earth"):
                r = hours(site, body, iso_to_unix(t))
                cases.append({"lat": pin["lat"], "lon": pin["lon"], "timeUtc": t, "body": body, **r})
                f = lambda v: "-" if v is None else f"{v:.2f}"
                print(f"({pin['lat']}, {pin['lon']}) {t} {body:<5} now {str(r['visibleNow']):<5} "
                      f"change in {f(r['hoursToChange']):>7} h  next period {f(r['nextPeriodHours']):>7} h  "
                      f"window visible {r['windowVisibleHours']:.2f} / hidden {r['windowHiddenHours']:.2f} h")
    (FIXTURES / "hours_reference.json").write_text(json.dumps({"cases": cases}, indent=1))
    print(f"wrote {FIXTURES / 'hours_reference.json'}")


if __name__ == "__main__":
    main()
