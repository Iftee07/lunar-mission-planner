"""Phase 0: download SPICE kernels and the LOLA 20 m south pole DEM.

Lists the NAIF generic_kernels directories to pick current kernel names,
then downloads each file into data/raw/ with HTTP Range resume.
Re-running skips files whose local size equals the server size.
Writes data/raw/downloads.json and prints the file list with sizes.
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "data" / "raw"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
LOLA_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF"

# (NAIF subdirectory, filename regex, rule to choose among matches)
KERNEL_RULES = [
    ("lsk/", r"naif\d{4}\.tls", "highest"),            # leapseconds
    ("spk/planets/", r"de440s\.bsp", "exact"),          # planetary ephemeris
    ("pck/", r"pck00011\.tpc", "exact"),                # body constants
    ("pck/", r"moon_pa_de440_\d+\.bpc", "highest"),     # Moon PA orientation
    ("fk/satellites/", r"moon_de440_\d+\.tf", "highest"),  # Moon ME/PA frames
]

CHUNK = 1 << 20
session = requests.Session()
session.headers["User-Agent"] = "lspb-pipeline/0.1"


def list_dir(url):
    r = session.get(url, timeout=60)
    r.raise_for_status()
    return sorted(set(re.findall(r'href="([^"?/][^"]*)"', r.text)))


def pick(names, pattern, rule):
    hits = [n for n in names if re.fullmatch(pattern, n)]
    if not hits:
        raise RuntimeError(f"no file matches {pattern}")
    return max(hits) if rule == "highest" else hits[0]


def remote_size(url):
    r = session.head(url, timeout=60, allow_redirects=True)
    r.raise_for_status()
    return int(r.headers.get("Content-Length", -1))


def download(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    total = remote_size(url)
    have = dest.stat().st_size if dest.exists() else 0
    if total > 0 and have == total:
        print(f"  skip (complete) {dest.name}")
        return total
    if total > 0 and have > total:
        dest.unlink()
        have = 0

    headers = {"Range": f"bytes={have}-"} if have else {}
    with session.get(url, headers=headers, stream=True, timeout=120) as r:
        if have and r.status_code != 206:  # server ignored Range: restart
            have = 0
            mode = "wb"
        else:
            mode = "ab" if have else "wb"
        r.raise_for_status()
        t0, done, last = time.time(), have, 0.0
        with open(dest, mode) as f:
            for block in r.iter_content(CHUNK):
                f.write(block)
                done += len(block)
                now = time.time()
                if now - last > 5:
                    rate = (done - have) / max(now - t0, 1e-6) / 1e6
                    pct = 100 * done / total if total > 0 else 0
                    print(f"  {dest.name}: {done/1e6:,.0f} / {total/1e6:,.0f} MB "
                          f"({pct:.1f}%, {rate:.1f} MB/s)", flush=True)
                    last = now
    size = dest.stat().st_size
    if total > 0 and size != total:
        raise RuntimeError(f"{dest.name}: got {size} bytes, expected {total}; re-run to resume")
    return size


def main():
    plan = []
    cache = {}
    for sub, pattern, rule in KERNEL_RULES:
        if sub not in cache:
            cache[sub] = list_dir(NAIF + sub)
        name = pick(cache[sub], pattern, rule)
        plan.append((NAIF + sub + name, RAW / "kernels" / name, "kernel"))
    plan.append((LOLA_URL, RAW / "lola" / Path(LOLA_URL).name, "lola"))

    print("Planned downloads:")
    for url, _, _ in plan:
        print("  " + url)

    record = []
    for url, dest, kind in plan:
        print(f"Downloading {dest.name}")
        size = download(url, dest)
        record.append({"kind": kind, "file": str(dest.relative_to(REPO)).replace("\\", "/"),
                       "url": url, "bytes": size})

    (RAW / "downloads.json").write_text(json.dumps(record, indent=2))
    print("\nFiles:")
    for rec in record:
        print(f"  {rec['bytes']:>15,d} B  {rec['bytes']/1e6:>10,.1f} MB  {rec['file']}")
    print("DONE")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}")
        sys.exit(1)
