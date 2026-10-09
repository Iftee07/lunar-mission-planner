"""Phase 3: Python reference for light / Earth-visibility hours (PRD section 5.5).

Independent of the JS engine and of ephemeris.bin: Sun and Earth vectors come straight from
SPICE (float64, no interpolation). Uses the Python horizons from 07_horizon_reference.py.
Same algorithm as the spec: 0.25 h scan to 1500 h, bisection to 0.01 h, window = 156 h.
Writes data/fixtures/hours_reference.json for 2 pins x 2 times x 2 bodies.
"""
import json
import math

import numpy as np
import spiceypy as sp

from common import ABCORR, FIXTURES, FRAME, iso_to_unix, load_kernels, unix_to_iso, MOON_RADIUS_M

TIMES_UTC = ["2026-11-01T00:00:00Z", "2027-02-14T12:00:00Z"]
N_PINS = 2
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

    def visible(self, body, unix_s):
        et = sp.str2et(unix_to_iso_frac(unix_s))
        v, _ = sp.spkpos(SPICE_NAME[body], et, FRAME, ABCORR, "MOON")
        v = np.asarray(v) - self.pos
        el = math.degrees(math.asin((v @ self.up) / np.linalg.norm(v)))
        az = math.degrees(math.atan2(v @ self.east, v @ self.north)) % 360.0
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


def main():
    load_kernels()
    ref = json.loads((FIXTURES / "horizon_reference.json").read_text())["pins"][:N_PINS]
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
