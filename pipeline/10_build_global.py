"""Global (whole-Moon) data for the globe and for horizons outside the polar grids.

1. Global horizon DEM: LOLA GDR LDEM_16 (PDS, 16 px/deg = 1895.21 m/px at the equator, heights
   relative to a 1737.4 km sphere, 0.5 m per unit, simple cylindrical 0..360 E, pixel registered,
   mean-Earth/polar axis of DE421). Kept at full 16 ppd and written losslessly as
   web/public/data/global_dem.bin = gzip( high-byte plane | low-byte plane ) of the int16 residuals
   of a 2D predictor (left + up - upleft). The browser decodes it in the horizon worker
   (DecompressionStream, then the inverse predictor). Size rule (BUILD_PLAN 1.1): 16 ppd only if
   the compressed transfer is <= 20 MB, else 8 ppd; the sizes are printed and kept in the manifest.
2. Offline globe texture (used only when Moon Trek tiles cannot load): NASA SVS CGI Moon Kit
   (https://svs.gsfc.nasa.gov/4720), the 2025 colour map lroc_color_16bit_srgb_4k.tif (4096 x 2048,
   16-bit sRGB, equirectangular, centred on 0 E), converted to an 8-bit JPEG. svs.gsfc.nasa.gov is not
   reachable from the build machine, so the TIFF is downloaded by hand from that page into
   data/raw/svs/. Credit: NASA's Scientific Visualization Studio, with LROC data from
   NASA/GSFC/Arizona State University.

Downloads are cached in data/raw/ (re-runs reuse them).
"""
import gzip
import sys

import numpy as np
from PIL import Image

from common import OUT, RAW, download, update_manifest

PDS_GDR = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/"
LDEM = {"img": "ldem_16.img", "lbl": "ldem_16.lbl", "width": 5760, "height": 2880, "ppd": 16,
        "pixel_m": 1895.21, "scale": 0.5, "radius_m": 1737400.0}
DEM_FILE = "global_dem.bin"
SIZE_LIMIT_BYTES = 20_000_000

SVS_PAGE = "https://svs.gsfc.nasa.gov/4720"
SVS_TIFF = RAW / "svs" / "lroc_color_16bit_srgb_4k.tif"
SVS_SIZE = (4096, 2048)
FALLBACK_FILE = "moon_fallback_4k.jpg"


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
    import rasterio
    if not SVS_TIFF.exists():
        sys.exit(f"missing {SVS_TIFF}: download lroc_color_16bit_srgb_4k.tif from {SVS_PAGE} into data/raw/svs/")
    with rasterio.open(SVS_TIFF) as src:
        if (src.width, src.height) != SVS_SIZE or src.count != 3 or src.dtypes[0] != "uint16":
            sys.exit(f"{SVS_TIFF.name}: expected {SVS_SIZE} 3-band uint16, got {src.width}x{src.height} "
                     f"{src.count} bands {src.dtypes[0]}")
        rgb16 = src.read()
    rgb8 = np.round(rgb16.astype(np.float32) / 257.0).clip(0, 255).astype(np.uint8)  # 16-bit sRGB -> 8-bit sRGB
    img = Image.fromarray(np.moveaxis(rgb8, 0, -1), "RGB")
    img.save(OUT / FALLBACK_FILE, quality=85, optimize=True, progressive=True)
    size = (OUT / FALLBACK_FILE).stat().st_size
    print(f"fallback texture {img.size[0]} x {img.size[1]} from {SVS_TIFF.name}: {size:,} B")
    return {
        "file": FALLBACK_FILE, "width": img.size[0], "height": img.size[1],
        "rectangle_deg": [-180, -90, 180, 90],
        "source": "NASA SVS CGI Moon Kit, 2025 colour map lroc_color_16bit_srgb_4k.tif (8-bit JPEG)",
        "source_url": SVS_PAGE,
        "credit": "NASA's Scientific Visualization Studio, with LROC data from NASA/GSFC/Arizona State University",
        "bytes": size,
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dem = build_global_dem()
    fallback = build_fallback_texture()
    update_manifest({"global_dem": dem, "globe": {"fallback_texture": fallback}})
    print("OK")


if __name__ == "__main__":
    main()
