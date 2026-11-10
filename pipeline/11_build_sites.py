"""Curated landing sites for the globe's mission pins (and the Phase 3 site search).

Reads the hand-curated pipeline/data/sites_source.csv (one row per site, each with the official source
it was copied from and a quote in source_note), validates every row, and writes
web/public/data/sites.json:
  [{"id", "name", "group", "lat", "lon", "status", "mission_date", "source_url", "source_note", "verified"}]
lat in degrees north, lon in degrees east normalised to (-180, 180] (the CSV keeps each source's own
convention, e.g. 340.488 E); mission_date is "YYYY-MM-DD" or null. No coordinate is computed or
invented here: the values are the CSV's, only the longitude convention changes.
Registers "sites" in manifest.json. Fails (exit 1) on any invalid row.
"""
import csv
import json
import re
import sys
from datetime import date

from common import OUT, REPO, update_manifest

SOURCE = REPO / "pipeline" / "data" / "sites_source.csv"
OUT_FILE = "sites.json"
COLUMNS = ["id", "name", "group", "lat", "lon", "status", "mission_date", "source_url", "source_note", "verified"]
# Pin groups shown on the globe (web/src/view/globeModel.js SITE_GROUPS uses the same names).
GROUPS = ["Apollo", "CLPS", "Artemis III candidate regions", "Other countries", "South-pole reference"]
ID_RE = re.compile(r"^[a-z0-9_]+$")


def east_180(lon):
    """Degrees east in (-180, 180], rounded to the CSV's precision (no float noise from the shift)."""
    out = ((lon + 180.0) % 360.0) - 180.0
    if out == -180.0:
        out = 180.0
    return round(out, 6)


def parse_row(n, row, seen):
    errors = []
    sid = row["id"]
    if not ID_RE.match(sid):
        errors.append(f"id {sid!r} is not a lowercase slug")
    if sid in seen:
        errors.append(f"duplicate id {sid!r}")
    if not row["name"].strip():
        errors.append("empty name")
    if row["group"] not in GROUPS:
        errors.append(f"unknown group {row['group']!r} (expected one of {GROUPS})")
    try:
        lat = float(row["lat"])
        lon = float(row["lon"])
    except ValueError:
        errors.append(f"lat/lon not numbers: {row['lat']!r}, {row['lon']!r}")
        lat = lon = None
    if lat is not None and not -90.0 <= lat <= 90.0:
        errors.append(f"lat {lat} out of range")
    if lon is not None and not -180.0 <= lon <= 360.0:
        errors.append(f"lon {lon} out of range")
    if not row["status"].strip():
        errors.append("empty status")
    mission_date = row["mission_date"].strip() or None
    if mission_date:
        try:
            date.fromisoformat(mission_date)
        except ValueError:
            errors.append(f"mission_date {mission_date!r} is not YYYY-MM-DD")
    if not row["source_url"].startswith("https://"):
        errors.append(f"source_url {row['source_url']!r} is not an https URL")
    if len(row["source_note"].strip()) < 20:
        errors.append("source_note missing or too short to cite the source")
    if row["verified"] not in ("true", "false"):
        errors.append(f"verified must be true or false, got {row['verified']!r}")
    if errors:
        raise ValueError(f"row {n} ({sid}): " + "; ".join(errors))
    return {
        "id": sid,
        "name": row["name"].strip(),
        "group": row["group"],
        "lat": lat,
        "lon": east_180(lon),
        "status": row["status"].strip(),
        "mission_date": mission_date,
        "source_url": row["source_url"],
        "source_note": row["source_note"].strip(),
        "verified": row["verified"] == "true",
    }


def main():
    with SOURCE.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUMNS:
            sys.exit(f"{SOURCE.name}: columns {reader.fieldnames} != expected {COLUMNS}")
        sites, seen = [], set()
        try:
            for n, row in enumerate(reader, start=2):  # row 1 is the header
                site = parse_row(n, row, seen)
                seen.add(site["id"])
                sites.append(site)
        except ValueError as e:
            sys.exit(f"{SOURCE.name}: {e}")

    text = json.dumps(sites, ensure_ascii=False, separators=(",", ":"))
    (OUT / OUT_FILE).write_text(text, encoding="utf-8")
    by_group = {g: sum(s["group"] == g for s in sites) for g in GROUPS}
    unverified = [s["id"] for s in sites if not s["verified"]]
    update_manifest({"sites": {
        "file": OUT_FILE,
        "count": len(sites),
        "count_by_group": by_group,
        "unverified": unverified,
        "source": "pipeline/data/sites_source.csv (hand-curated; each row cites its fetched source_url)",
        "lon_convention": "degrees east, (-180, 180]",
        "bytes": len(text.encode("utf-8")),
    }})
    print(f"{OUT_FILE}: {len(sites)} sites, {len(text.encode('utf-8')):,} B")
    for g in GROUPS:
        print(f"  {g}: {by_group[g]}")
    print(f"  unverified: {unverified or 'none'}")


if __name__ == "__main__":
    main()
