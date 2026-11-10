"""Global (whole-Moon) data for the globe and for horizons outside the polar grids.

1. Global horizon DEM: LOLA GDR LDEM_16 (PDS, 16 px/deg = 1895.21 m/px at the equator, heights
   relative to a 1737.4 km sphere, 0.5 m per unit, simple cylindrical 0..360 E, pixel registered,
   mean-Earth/polar axis of DE421). Kept at full 16 ppd and written losslessly as
   web/public/data/global_dem.bin = gzip( high-byte plane | low-byte plane ) of the int16 residuals
   of a 2D predictor (left + up - upleft). The browser decodes it in the horizon worker
   (DecompressionStream, then the inverse predictor). Size rule (BUILD_PLAN 1.1): 16 ppd only if
   the compressed transfer is <= 20 MB, else 8 ppd; the sizes are printed and kept in the manifest.
2. Offline globe texture: NASA SVS CGI Moon Kit was unreachable from the build machine
   (svs.gsfc.nasa.gov timed out, 2026-11-10), so the 4096 x 2048 fallback is stitched from the
   16 x 8 level-3 tiles of the same NASA Moon Trek LRO WAC global mosaic the globe streams
   (equirectangular, -180..180 E, so 0 E is in the centre). Credit: NASA/GSFC/Arizona State
   University (LROC WAC), served by NASA Moon Trek.
3. South Pole HD overlay: the 120 m LOLA hillshade (hillshade.png, south polar stereographic)
   resampled to a geographic (lat/lon) image for 84 S - 90 S, the extent of the 120 m grid,
   so the globe can drape it over the pole. Width is capped at 4096 px (WebGL texture limit on
   phones), which is 278 m/px in longitude at 84 S and finer towards the pole.

Downloads are cached in data/raw/ (re-runs reuse them).
"""
import gzip
import io
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

from common import MANIFEST, OUT, RAW, download, session, stereo_fwd, update_manifest

PDS_GDR = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/"
LDEM = {"img": "ldem_16.img", "lbl": "ldem_16.lbl", "width": 5760, "height": 2880, "ppd": 16,
        "pixel_m": 1895.21, "scale": 0.5, "radius_m": 1737400.0}
DEM_FILE = "global_dem.bin"
SIZE_LIMIT_BYTES = 20_000_000

TREK = ("https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/"
        "default/default028mm/{z}/{row}/{col}.jpg")
TREK_CAPS = "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml"
TREK_LEVEL, TILE = 3, 256          # level 3 = 16 x 8 tiles of 256 px (from WMTSCapabilities.xml)
FALLBACK_FILE = "moon_fallback_4k.jpg"

POLE_FILE = "south_pole_hd.jpg"
POLE_LAT = (-90.0, -84.0)
POLE_SIZE = (4096, 1536)           # (lon px, lat px): 6 deg / 1536 = 121 m per row


def predict_encode(a):
    """int16 grid -> gzip(high plane | low plane) of residuals of left + up - upleft."""
    p = a.astype(np.int32)
    pred = np.zeros_like(p)
    pred[0, 1:] = p[0, :-1]
    pred[1:, 0] = p[:-1, 0]
    pred[1:, 1:] = p[1:, :-1] + p[:-1, 1:] - p[:-1, :-1]
    res = (p - pred).astype("<i2").view("<u2")
    planes = np.concatenate([(res >> 8).astype(np.uint8).ravel(), (res & 0xFF).astype(np.uint8).ravel()])
    return gzip.compress(planes.tobytes(), compresslevel=9, mtime=0)


def predict_decode(blob, height, width):
    """Inverse of predict_encode (used here to prove the encoding is lossless)."""
    planes = np.frombuffer(gzip.decompress(blob), dtype=np.uint8)
    n = height * width
    res = ((planes[:n].astype(np.uint16) << 8) | planes[n:]).view("<i2").reshape(height, width).astype(np.int32)
    out = np.zeros_like(res)
    out[0] = np.cumsum(res[0])
    out[1:, 0] = out[0, 0] + np.cumsum(res[1:, 0])
    for r in range(1, height):  # out[r, c] = res + out[r, c-1] + out[r-1, c] - out[r-1, c-1]
        out[r, 1:] = out[r, 0] + np.cumsum(res[r, 1:] + out[r - 1, 1:] - out[r - 1, :-1])
    return out.astype(np.int16)


def build_global_dem():
    raw = RAW / "global"
    for f in (LDEM["img"], LDEM["lbl"]):
        download(PDS_GDR + f, raw / f)
    a = np.fromfile(raw / LDEM["img"], dtype="<i2").reshape(LDEM["height"], LDEM["width"])
    blob = predict_encode(a)
    assert np.array_equal(predict_decode(blob, *a.shape), a), "encoding is not lossless"
    plain = len(gzip.compress(a.tobytes(), compresslevel=9, mtime=0))
    print(f"LDEM_16: {a.shape[1]} x {a.shape[0]}, heights {a.min() * 0.5:.1f} .. {a.max() * 0.5:.1f} m")
    print(f"  raw {a.nbytes:,} B, plain gzip {plain:,} B, predictor+planes gzip {len(blob):,} B "
          f"(limit {SIZE_LIMIT_BYTES:,} B) -> {'16 ppd' if len(blob) <= SIZE_LIMIT_BYTES else 'too big'}")
    if len(blob) > SIZE_LIMIT_BYTES:
        sys.exit("16 ppd exceeds the size limit: switch to 8 ppd (BUILD_PLAN 1.1)")
    (OUT / DEM_FILE).write_bytes(blob)
    return {
        "file": DEM_FILE,
        "encoding": "gzip(int16 residuals of left+up-upleft predictor, high-byte plane then low-byte plane)",
        "width": LDEM["width"], "height": LDEM["height"], "pixels_per_degree": LDEM["ppd"],
        "pixel_m": LDEM["pixel_m"], "scale": LDEM["scale"],
        "layout": "row 0 = 90 N, column 0 = 0 E, pixel registered (centres at (i + 0.5) / ppd deg)",
        "reference_radius_m": LDEM["radius_m"],
        "frame": "Mean Earth/polar axis of DE421 (same as MOON_ME)",
        "source": "LOLA GDR LDEM_16 (LRO-L-LOLA-4-GDR-V1.0, product version V3.1)",
        "source_url": PDS_GDR + LDEM["img"],
        "bytes_raw": int(a.nbytes), "bytes_gzip_plain": plain, "bytes_file": len(blob),
        "size_decision": f"16 ppd: lossless predictor+planes gzip {len(blob):,} B <= {SIZE_LIMIT_BYTES:,} B "
                         f"(plain gzip would be {plain:,} B)",
    }


def build_fallback_texture():
    cache = RAW / "trek_l3"
    n_cols, n_rows = 2 ** (TREK_LEVEL + 1), 2 ** TREK_LEVEL
    img = Image.new("RGB", (n_cols * TILE, n_rows * TILE))
    for row in range(n_rows):
        for col in range(n_cols):
            dest = cache / f"{row}_{col}.jpg"
            if not dest.exists():
                r = session.get(TREK.format(z=TREK_LEVEL, row=row, col=col), timeout=60)
                r.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(r.content)
            img.paste(Image.open(io.BytesIO(dest.read_bytes())).convert("RGB"), (col * TILE, row * TILE))
    img.save(OUT / FALLBACK_FILE, quality=85, optimize=True, progressive=True)
    size = (OUT / FALLBACK_FILE).stat().st_size
    print(f"fallback texture {img.size[0]} x {img.size[1]} from {n_cols * n_rows} level-{TREK_LEVEL} tiles: {size:,} B")
    return {
        "file": FALLBACK_FILE, "width": img.size[0], "height": img.size[1],
        "rectangle_deg": [-180, -90, 180, 90],
        "source": f"NASA Moon Trek WMTS, layer LRO_WAC_Mosaic_Global_303ppd_v02, tile level {TREK_LEVEL}",
        "source_url": TREK_CAPS,
        "credit": "NASA/GSFC/Arizona State University (LROC WAC global mosaic), via NASA Moon Trek",
        "note": "NASA SVS CGI Moon Kit (svs.gsfc.nasa.gov/4720) was unreachable on 2026-11-10",
        "bytes": size,
    }


def build_pole_overlay():
    import json
    man = json.loads(MANIFEST.read_text())
    g = man["grids"]["near"]
    hs = np.asarray(Image.open(OUT / man["hillshade"]).convert("L"), dtype=np.float32)
    w, h = POLE_SIZE
    lon = -180 + (np.arange(w) + 0.5) * 360 / w
    lat = POLE_LAT[1] - (np.arange(h) + 0.5) * (POLE_LAT[1] - POLE_LAT[0]) / h   # row 0 = 84 S
    lon2, lat2 = np.meshgrid(lon, lat)
    x, y = stereo_fwd(lat2, lon2)
    cols = (x - g["x_min"]) / g["pixel_m"] - 0.5
    rows = (g["y_max"] - y) / g["pixel_m"] - 0.5
    out = map_coordinates(hs, [rows, cols], order=1, mode="nearest")
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "L").save(OUT / POLE_FILE, quality=85, optimize=True)
    size = (OUT / POLE_FILE).stat().st_size
    print(f"south pole overlay {w} x {h} ({POLE_LAT[1]} .. {POLE_LAT[0]} deg): {size:,} B")
    return {
        "file": POLE_FILE, "width": w, "height": h,
        "rectangle_deg": [-180, POLE_LAT[0], 180, POLE_LAT[1]],
        "source": "LOLA 20 m south pole DEM (LDEM_80S_20MPP_ADJ) -> 120 m hillshade.png, resampled to lat/lon",
        "bytes": size,
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dem = build_global_dem()
    fallback = build_fallback_texture()
    pole = build_pole_overlay()
    update_manifest({"global_dem": dem, "globe": {"fallback_texture": fallback, "south_pole_hd": pole}})
    print("OK")


if __name__ == "__main__":
    main()
