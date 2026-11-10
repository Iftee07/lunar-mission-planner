"""Query JPL Horizons for apparent azimuth/elevation of the Sun and Earth at lunar surface sites
and cache the results in data/fixtures/horizons.json.

The fixture is built from named sets of (sites x UTC times). A set already in the file is never
re-queried (its records are validation evidence); only missing sets go to the network. Delete the
file to re-query everything.

Horizons settings: observer table, CENTER='coord@301' (Moon), GEODETIC site
(east longitude deg, latitude deg, altitude km), QUANTITIES='4' (apparent AZ & EL),
APPARENT='AIRLESS' (no refraction; none is modelled for the Moon anyway), TIME_TYPE='UT'.
"""
import json
import re
import sys
import time

import requests

from common import FIXTURES

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT_FILE = FIXTURES / "horizons.json"
BODIES = {"sun": "10", "earth": "399"}

# Times are off the ephemeris grid on purpose, so the validation also exercises interpolation.
POLAR_TIMES = ["2026-11-15 06:07", "2028-03-20 12:22", "2030-07-04 18:41"]
SETS = {
    # (lat, lon east) test points in the polar map region
    "polar": {"sites": [(-89.5, 0), (-88, 90), (-86, 180), (-85, 270), (-84.5, 45)], "times_utc": POLAR_TIMES},
    # Non-polar landing sites; coordinates from the cited pages (NASA NSSDCA was unreachable on 2026-11-10).
    "nonpolar": {
        "sites": [(0.67416, 23.47314), (-45.444, 177.599), (26.13222, 3.63386)],
        "names": ["Apollo 11", "Chang'e-4", "Apollo 15 (Hadley-Apennine)"],
        "sources": [
            "https://en.wikipedia.org/wiki/Apollo_11 (Moon coordinates of the landing site, 0.67416 N 23.47314 E)",
            "https://en.wikipedia.org/wiki/Chang%27e_4 (infobox landing site 45.444 S 177.599 E; cites Liu et al. 2019, Nature Communications)",
            "https://en.wikipedia.org/wiki/Hadley%E2%80%93Apennine (26.13222 N 3.63386 E)",
        ],
        "times_utc": POLAR_TIMES,
    },
    # Dates late in the extended ephemeris (2033-2035), one polar and two non-polar sites.
    "late": {"sites": [(-89.5, 0), (0.67416, 23.47314), (-45.444, 177.599)],
             "times_utc": ["2033-06-21 03:17", "2035-09-08 21:53"]},
}


def query(body_id, lat, lon, times):
    params = {
        "format": "json",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "TLIST": " ".join(f"'{t}'" for t in times),
        "TLIST_TYPE": "CAL",
        "TIME_TYPE": "UT",
        "QUANTITIES": "'4'",
        "APPARENT": "AIRLESS",
        "ANG_FORMAT": "DEG",
        "EXTRA_PREC": "YES",
        "CSV_FORMAT": "YES",
    }
    r = requests.get(API, params=params, timeout=120)
    r.raise_for_status()
    js = r.json()
    if "error" in js:
        raise RuntimeError(js["error"])
    return js["result"], js.get("signature", {})


def parse(text):
    block = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in block.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        # CSV: date, solar-presence flag, lunar-presence flag, azimuth, elevation, ...
        nums = [c for c in cols[1:] if re.fullmatch(r"-?\d+(\.\d+)?", c)]
        rows.append({"time_ut": cols[0], "az_deg": float(nums[0]), "el_deg": float(nums[1])})
    return rows


def header_lines(text):
    keys = ("Center geodetic", "Center cylindric", "Center radii", "Center body name",
            "Center-site name", "Reference frame", "Ephemeris", "Target body name", "Target radii")
    return [ln.strip() for ln in text.splitlines() if ln.strip().startswith(keys)]


def load_existing():
    if not OUT_FILE.exists():
        return {"source": API, "sets": {}, "records": [], "headers": {}}
    fx = json.loads(OUT_FILE.read_text())
    if "sets" not in fx:  # first version of the file held only the polar set at the top level
        fx["sets"] = {"polar": {"sites": fx.pop("sites"), "times_utc": fx.pop("times_utc")}}
        for rec in fx["records"]:
            rec.setdefault("set", "polar")
    return fx


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    fx = load_existing()
    for name, spec in SETS.items():
        if name in fx["sets"]:
            print(f"set {name!r}: cached ({sum(r.get('set') == name for r in fx['records'])} records)")
            continue
        for body, bid in BODIES.items():
            for lat, lon in spec["sites"]:
                text, sig = query(bid, lat, lon, spec["times_utc"])
                rows = parse(text)
                if len(rows) != len(spec["times_utc"]):
                    raise RuntimeError(f"expected {len(spec['times_utc'])} rows, got {len(rows)}:\n{text}")
                for row in rows:
                    fx["records"].append({"set": name, "body": body, "lat": lat, "lon": lon, **row})
                fx["headers"][f"{body} {lat},{lon}"] = header_lines(text)
                fx["signature"] = sig
                print(f"set {name!r}: {body:<5} site ({lat:>9}, {lon:>9}): {len(rows)} rows")
                time.sleep(1)  # be polite to the API
        fx["sets"][name] = {k: v for k, v in spec.items()}
        OUT_FILE.write_text(json.dumps(fx, indent=2))
    print(f"wrote {OUT_FILE} ({len(fx['records'])} records in sets {', '.join(fx['sets'])})")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}")
        sys.exit(1)
