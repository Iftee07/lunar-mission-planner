"""Phase 1: query JPL Horizons once for apparent azimuth/elevation of the Sun and Earth
at 5 lunar surface sites x 3 UTC times. Caches to data/fixtures/horizons.json and
skips the network entirely if that file already exists (delete it to re-query).

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

SITES = [(-89.5, 0), (-88, 90), (-86, 180), (-85, 270), (-84.5, 45)]   # (lat, lon east)
# Off the 15-minute grid on purpose, so the validation also exercises interpolation.
TIMES_UTC = ["2026-11-15 06:07", "2028-03-20 12:22", "2030-07-04 18:41"]
BODIES = {"sun": "10", "earth": "399"}


def query(body_id, lat, lon):
    params = {
        "format": "json",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "TLIST": " ".join(f"'{t}'" for t in TIMES_UTC),
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


def main():
    if OUT_FILE.exists():
        print(f"{OUT_FILE} exists: skipping Horizons (delete it to re-query)")
        return
    FIXTURES.mkdir(parents=True, exist_ok=True)
    out = {"source": API, "times_utc": TIMES_UTC, "sites": SITES, "records": [], "headers": {}}
    for body, bid in BODIES.items():
        for lat, lon in SITES:
            text, sig = query(bid, lat, lon)
            rows = parse(text)
            if len(rows) != len(TIMES_UTC):
                raise RuntimeError(f"expected {len(TIMES_UTC)} rows, got {len(rows)}:\n{text}")
            for row in rows:
                out["records"].append({"body": body, "lat": lat, "lon": lon, **row})
            out["headers"][f"{body} {lat},{lon}"] = header_lines(text)
            out["signature"] = sig
            print(f"{body:<5} site ({lat:>6}, {lon:>4}): {len(rows)} rows")
            time.sleep(1)  # be polite to the API
    OUT_FILE.write_text(json.dumps(out, indent=2))
    print("Horizons header (first query):")
    for ln in next(iter(out["headers"].values())):
        print("  " + ln)
    print(f"wrote {OUT_FILE} ({len(out['records'])} records)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}")
        sys.exit(1)
