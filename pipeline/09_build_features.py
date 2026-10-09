"""Phase 9b: named craters for the map from the IAU Gazetteer of Planetary Nomenclature.

Source: Gazetteer of Planetary Nomenclature, IAU WGPSN and USGS Astrogeology Science Center,
https://planetarynames.wr.usgs.gov/GIS_Downloads ("MOON_nomenclature_center_pts.zip", shapefile of
feature centre points; the bundled metadata states "Use constraints: Public domain").

Downloads the zip once into data/raw/gazetteer/ (re-runs reuse it), reads the .dbf attribute table
directly (plain Python, no GIS dependency), keeps IAU-approved features of type "Crater, craters"
whose rim reaches into the map disc (lat <= -84), and writes web/public/data/craters.json:
  [{"name", "lat", "lon", "diameter_km"}, ...]   lon in degrees east [0, 360), as in the gazetteer
Coordinates and diameters come from the file only. Registers "craters" in manifest.json.
"""
import io
import json
import math
import struct
import sys
import zipfile
from datetime import datetime, timezone

import requests

from common import MOON_RADIUS_M, OUT, RAW, update_manifest

URL = "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.zip"
ZIP = RAW / "gazetteer" / "MOON_nomenclature_center_pts.zip"
DBF = "MOON_nomenclature_center_pts.dbf"
MAP_LAT_LIMIT_DEG = -84.0
CRATER_TYPE = "Crater, craters"
OUT_FILE = "craters.json"


def fetch():
    if ZIP.exists() and ZIP.stat().st_size > 0:
        print(f"reuse {ZIP} ({ZIP.stat().st_size / 1e6:.1f} MB)")
        return ZIP.read_bytes()
    print(f"download {URL}")
    r = requests.get(URL, timeout=300, headers={"User-Agent": "lspb-pipeline/0.1"})
    r.raise_for_status()
    ZIP.parent.mkdir(parents=True, exist_ok=True)
    ZIP.write_bytes(r.content)
    print(f"  {len(r.content) / 1e6:.1f} MB -> {ZIP}")
    return r.content


def read_dbf(raw):
    """dBASE III table -> list of dicts of stripped strings (UTF-8, per the bundled .cpg)."""
    n, header_len, record_len = struct.unpack("<IHH", raw[4:12])
    fields, offset = [], 1  # byte 0 of each record is the deletion flag
    for i in range(32, header_len - 1, 32):
        name = raw[i:i + 11].split(b"\0")[0].decode("ascii")
        size = raw[i + 16]
        fields.append((name, offset, size))
        offset += size
    rows = []
    for k in range(n):
        rec = raw[header_len + k * record_len: header_len + (k + 1) * record_len]
        if rec[:1] == b"*":
            continue
        rows.append({name: rec[o:o + s].decode("utf-8", "replace").strip() for name, o, s in fields})
    return rows


def reaches_map(lat, diameter_km):
    """True if any part of the rim lies at or south of MAP_LAT_LIMIT_DEG."""
    from_pole_deg = 90.0 + lat
    radius_deg = math.degrees(diameter_km / 2 / (MOON_RADIUS_M / 1000))
    return from_pole_deg - radius_deg <= 90.0 + MAP_LAT_LIMIT_DEG


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    raw = fetch()
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        rows = read_dbf(z.read(DBF))
    print(f"{len(rows)} gazetteer features")

    craters = []
    for r in rows:
        if r["type"] != CRATER_TYPE or r["approval"] != "Adopted by IAU":
            continue
        lat, lon, d = float(r["center_lat"]), float(r["center_lon"]), float(r["diameter"])
        if reaches_map(lat, d):
            craters.append({"name": r["name"], "lat": round(lat, 4), "lon": round(lon % 360, 4), "diameter_km": round(d, 3)})
    craters.sort(key=lambda c: -c["diameter_km"])

    (OUT / OUT_FILE).write_text(json.dumps(craters, ensure_ascii=False, indent=0), encoding="utf-8")
    update_manifest({"craters": {
        "file": OUT_FILE,
        "count": len(craters),
        "source": "IAU Gazetteer of Planetary Nomenclature (USGS Astrogeology), MOON_nomenclature_center_pts",
        "source_url": URL,
        "license": "Public domain (USGS metadata use constraints)",
        "retrieved_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "filter": f"type '{CRATER_TYPE}', adopted by IAU, rim reaching lat <= {MAP_LAT_LIMIT_DEG}",
    }})
    print(f"{len(craters)} craters -> {OUT / OUT_FILE}")
    print("five largest:")
    for c in craters[:5]:
        print(f"  {c['name']:<16} {c['diameter_km']:7.1f} km  lat {c['lat']:9.4f}  lon {c['lon']:9.4f} E")


if __name__ == "__main__":
    main()
