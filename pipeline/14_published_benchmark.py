"""Published values for the benchmark in web/test/benchmark.test.js -> data/fixtures/published_benchmark.json.

At two named south-pole points (PGDA Site01 "Connecting ridge" and Site04 "Shackleton rim", the
"South-pole reference" sites in pipeline/data/sites_source.csv), it records:

1. Sun: NASA GSFC PGDA "Lunar Polar Illumination" average visibility (AVGVISIB_75S_120M_201608, the
   same raw GeoTIFF as 13_build_illumination.py, full float precision, not the 8-bit map layer):
   fraction of time any part of the solar disc is above the terrain horizon, averaged over a lunar
   precession cycle (18.6 years). Mazarico, E., et al. (2011), Icarus 211, 1066-1081,
   doi:10.1016/j.icarus.2010.10.030. The value at the site's pixel and the range over the 3 x 3
   pixels around it (+-120 m), because rim values change fast with position.
2. Earth: JPL Horizons apparent elevation of the Earth from the site (altitude 0, AIRLESS: no
   refraction), hourly through 2027. Horizons has no terrain, so this checks Earth above the flat
   (astronomical) horizon only: ephemeris and libration, not the skyline.

Like 03_horizons_fixtures.py, an existing fixture is never re-queried (it is validation evidence);
delete the file to rebuild it. Needs the network only for Horizons.
"""
import csv
import json
import sys

import numpy as np
import rasterio
import requests

from common import FIXTURES, RAW, REPO, stereo_fwd

OUT_FILE = FIXTURES / "published_benchmark.json"
SITES_CSV = REPO / "pipeline" / "data" / "sites_source.csv"
SITE_IDS = ["connecting_ridge", "shackleton_rim"]
AVGVISIB_TIF = RAW / "illumination" / "AVGVISIB_75S_120M_201608.TIF"
PGDA_PAGE = "https://pgda.gsfc.nasa.gov/products/69"
HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"
EARTH_START, EARTH_STOP, EARTH_STEP = "2027-01-01 00:00", "2027-12-31 23:00", "1 h"


def sites():
    with open(SITES_CSV, newline="", encoding="utf-8") as f:
        rows = {r["id"]: r for r in csv.DictReader(f)}
    return [rows[i] for i in SITE_IDS]


def avgvisib(lat, lon):
    with rasterio.open(AVGVISIB_TIF) as ds:
        x, y = stereo_fwd(lat, lon)
        row, col = ds.index(float(x), float(y))
        win = ds.read(1, window=((row - 1, row + 2), (col - 1, col + 2))).astype(float) * ds.scales[0] + ds.offsets[0]
        return {"pixel": round(float(win[1, 1]), 6), "min_3x3": round(float(win.min()), 6),
                "max_3x3": round(float(win.max()), 6), "row": int(row), "col": int(col)}


def horizons_earth(lat, lon):
    params = {
        "format": "json", "COMMAND": "'399'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'", "START_TIME": f"'{EARTH_START}'", "STOP_TIME": f"'{EARTH_STOP}'",
        "STEP_SIZE": f"'{EARTH_STEP}'", "TIME_TYPE": "UT", "QUANTITIES": "'4'", "APPARENT": "AIRLESS",
        "ANG_FORMAT": "DEG", "EXTRA_PREC": "YES", "CSV_FORMAT": "YES",
    }
    r = requests.get(HORIZONS_API, params=params, timeout=300)
    r.raise_for_status()
    js = r.json()
    if "error" in js:
        raise RuntimeError(js["error"])
    block = js["result"].split("$$SOE")[1].split("$$EOE")[0]
    el = []
    for line in block.strip().splitlines():
        cols = [c.strip() for c in line.split(",")]
        el.append(round(float(cols[4]), 6))  # date, solar flag, lunar flag, azimuth, elevation
    return el, js.get("signature", {})


def main():
    if OUT_FILE.exists():
        print(f"{OUT_FILE.name} exists: kept (delete it to re-query)")
        return 0
    out = {"pgda_page": PGDA_PAGE, "pgda_product": AVGVISIB_TIF.name,
           "pgda_citation": "Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using "
                            "LOLA topography, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030",
           "horizons": {"api": HORIZONS_API, "start_utc": EARTH_START, "stop_utc": EARTH_STOP, "step": EARTH_STEP,
                        "settings": "CENTER coord@301 GEODETIC altitude 0, QUANTITIES 4, APPARENT AIRLESS, UT"},
           "sites": []}
    for s in sites():
        lat, lon = float(s["lat"]), float(s["lon"])
        sun = avgvisib(lat, lon)
        el, sig = horizons_earth(lat, lon)
        out["horizons"]["signature"] = sig
        frac = float(np.mean(np.array(el) > 0))
        print(f"{s['id']:18s} AVGVISIB pixel {sun['pixel']:.4f} (3x3 {sun['min_3x3']:.4f}..{sun['max_3x3']:.4f}); "
              f"Horizons Earth above 0 deg: {frac:.4f} of {len(el)} hours")
        out["sites"].append({"id": s["id"], "name": s["name"], "lat": lat, "lon": lon, "source_url": s["source_url"],
                             "avgvisib": sun, "earth_el_deg": el})
    OUT_FILE.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT_FILE} ({OUT_FILE.stat().st_size:,} B)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
