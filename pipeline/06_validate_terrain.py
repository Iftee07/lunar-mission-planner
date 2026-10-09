"""Phase 2: validate the terrain files against the manifest, pyproj and the raw LOLA file.

Prints grid sizes, height range, nodata fraction inside the map disc, slope statistics,
projection round-trip error at 10 random points, independent spot checks against LOLA,
and writes pipeline/out/hillshade_preview.png (rings 84-89 S, meridians every 30 deg).
"""
import json
import math
import sys

import numpy as np
import rasterio
from PIL import Image, ImageDraw
from pyproj import Transformer
from rasterio.windows import Window

from common import MANIFEST, OUT, RAW, REPO, stereo_fwd, stereo_inv, stereo_rho

LOLA = RAW / "lola" / "LDEM_80S_20MPP_ADJ.TIF"
PREVIEW = REPO / "pipeline" / "out" / "hillshade_preview.png"
MAP_LAT = -84.0
rng = np.random.default_rng(42)
failures = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name} {detail}")
    if not ok:
        failures.append(name)


def load_grid(g):
    a = np.fromfile(OUT / g["file"], dtype="<i2").reshape(g["height"], g["width"])
    h = a.astype(np.float64) * g["scale"]
    h[a == g["nodata"]] = np.nan
    return h


def load_slope(man, key):
    g = man["grids"][man["slope"]["grid"]]
    a = np.fromfile(OUT / man["slope"][key], dtype=np.uint8).reshape(g["height"], g["width"])
    s = a.astype(np.float64) * man["slope"]["scale"]
    s[a == man["slope"]["nodata"]] = np.nan
    return s


def centres(g):
    xs = g["x_min"] + (np.arange(g["width"]) + 0.5) * g["pixel_m"]
    ys = g["y_max"] - (np.arange(g["height"]) + 0.5) * g["pixel_m"]
    return xs, ys


def random_points_in_disc(n, lat_limit):
    lat = rng.uniform(-89.9, lat_limit + 0.05, n)
    lon = rng.uniform(-180, 180, n)
    return lat, lon


def main():
    man = json.loads(MANIFEST.read_text())
    near, far = man["grids"]["near"], man["grids"]["far"]
    print("proj4:", man["proj4"])

    print("\n1. Grids")
    for name, g in (("near", near), ("far", far)):
        size = (OUT / g["file"]).stat().st_size
        print(f"  {name}: {g['width']} x {g['height']} @ {g['pixel_m']} m, x_min {g['x_min']}, "
              f"y_max {g['y_max']}, file {size:,d} B")
        check(f"{name} file size", size == g["width"] * g["height"] * 2)

    hn, hf = load_grid(near), load_grid(far)
    xs, ys = centres(near)
    rho_n = np.hypot(xs[None, :], ys[:, None])
    disc = rho_n <= stereo_rho(MAP_LAT)
    xf, yf = centres(far)
    rho_f = np.hypot(xf[None, :], yf[:, None])
    disc_f = rho_f <= stereo_rho(-80.0) - far["pixel_m"]

    print("\n2. Heights (m, relative to 1737400 m sphere)")
    for name, h, d in (("near", hn, disc), ("far", hf, disc_f)):
        v = h[d]
        lo, hi = np.nanmin(v), np.nanmax(v)
        nd = np.isnan(v).mean()
        print(f"  {name}: min {lo:.1f}  max {hi:.1f}  mean {np.nanmean(v):.1f}  nodata in disc {nd * 100:.4f}%")
        check(f"{name} heights within +-10000 m", -10000 <= lo and hi <= 10000)
        check(f"{name} nodata < 1% inside disc", nd < 0.01)

    print("\n3. Slopes (deg, 100 m radius, near grid)")
    sp, sm = load_slope(man, "plane"), load_slope(man, "max")
    for name, s in (("slope_plane", sp), ("slope_max", sm)):
        v = s[disc]
        q = np.nanpercentile(v, [50, 90, 99])
        print(f"  {name}: median {q[0]:.2f}  p90 {q[1]:.2f}  p99 {q[2]:.2f}  max {np.nanmax(v):.2f}  "
              f"nodata {np.isnan(v).mean() * 100:.4f}%")
    v = sp[disc]
    v = v[np.isfinite(v)]
    print(f"  landing classes (plane): <8 deg {np.mean(v < 8) * 100:.1f}%   8-10 {np.mean((v >= 8) & (v < 10)) * 100:.1f}%"
          f"   >=10 {np.mean(v >= 10) * 100:.1f}%")
    both = disc & np.isfinite(sp) & np.isfinite(sm)
    bad = (sp[both] > sm[both] + 1).sum()
    check("slope_plane <= slope_max + 1 at every pixel in disc", bad == 0,
          f"({bad} of {both.sum():,d} violate)")

    print("\n4. Projection: closed form (PRD 5.3) vs pyproj, 10 random points")
    tf = Transformer.from_crs("+proj=longlat +R=1737400 +no_defs", man["proj4"], always_xy=True)
    lat, lon = random_points_in_disc(10, MAP_LAT)
    px = near["pixel_m"]
    worst_fwd = worst_rt = 0.0
    for la, lo in zip(lat, lon):
        x, y = stereo_fwd(la, lo)
        xp, yp = tf.transform(lo, la)
        col = (x - near["x_min"]) / px                 # fractional pixel coordinates
        row = (near["y_max"] - y) / px
        x2, y2 = near["x_min"] + col * px, near["y_max"] - row * px
        la2, lo2 = stereo_inv(x2, y2)
        xb, yb = tf.transform(lo2, la2)
        fwd = math.hypot(x - xp, y - yp) / px
        rt = math.hypot(xb - xp, yb - yp) / px
        worst_fwd, worst_rt = max(worst_fwd, fwd), max(worst_rt, rt)
        print(f"  lat {la:9.4f} lon {lo:9.4f} -> x {x:12.2f} y {y:12.2f}  "
              f"pyproj diff {fwd:.2e} px   round-trip {rt:.2e} px")
    check("closed form == pyproj (< 0.01 px)", worst_fwd < 0.01, f"(max {worst_fwd:.2e} px)")
    check("round-trip error < 1 px", worst_rt < 1, f"(max {worst_rt:.2e} px)")

    print("\n5. Independent spot checks against raw LOLA (10 random near pixels)")
    with rasterio.open(LOLA) as ds:
        tr = ds.transform
        check("raster row 0 = max y (north-up)", tr.e < 0 and tr.f > 0, f"(origin y {tr.f}, dy {tr.e})")
        worst_h = worst_s = 0.0
        n_ok = 0
        while n_ok < 10:
            r, c = rng.integers(0, near["height"]), rng.integers(0, near["width"])
            if not disc[r, c] or np.isnan(hn[r, c]) or np.isnan(sp[r, c]):
                continue
            n_ok += 1
            x, y = xs[c], ys[r]
            # 6x6 LOLA block under this pixel, located by coordinates (not by our grid offsets)
            col0 = int(round((x - near["pixel_m"] / 2 - tr.c) / tr.a))
            row0 = int(round((y + near["pixel_m"] / 2 - tr.f) / tr.e))
            blk = ds.read(1, window=Window(col0, row0, 6, 6)).astype(np.float64)
            dh = abs(np.nanmean(blk) - hn[r, c])
            # least-squares plane with intercept over the 100 m disc around the pixel centre
            win = ds.read(1, window=Window(col0 - 3, row0 - 3, 12, 12)).astype(np.float64)
            gx = tr.c + (np.arange(col0 - 3, col0 + 9) + 0.5) * tr.a - x
            gy = tr.f + (np.arange(row0 - 3, row0 + 9) + 0.5) * tr.e - y
            X, Y = np.meshgrid(gx, gy)
            m = X ** 2 + Y ** 2 <= man["slope"]["radius_m"] ** 2
            A = np.column_stack([np.ones(m.sum()), X[m], Y[m]])
            coef, *_ = np.linalg.lstsq(A, win[m], rcond=None)
            k = 1 + (x * x + y * y) / (4 * man["moon_radius_m"] ** 2)
            s_ref = math.degrees(math.atan(k * math.hypot(coef[1], coef[2])))
            ds_ = abs(s_ref - sp[r, c])
            worst_h, worst_s = max(worst_h, dh), max(worst_s, ds_)
            la, lo = stereo_inv(x, y)
            print(f"  ({la:8.4f}, {lo:9.4f})  height ours {hn[r, c]:8.1f} LOLA {np.nanmean(blk):8.1f}"
                  f"   slope_plane ours {sp[r, c]:5.2f} lstsq {s_ref:5.2f}  ({m.sum()} px)")
    check("near height == LOLA 6x6 mean (<= 0.25 m, int16 rounding)", worst_h <= 0.25 + 1e-6,
          f"(max {worst_h:.3f} m)")
    check("slope_plane == independent lstsq (<= 0.13 deg, uint8 rounding)", worst_s <= 0.13,
          f"(max {worst_s:.3f} deg)")

    print("\n6. Preview")
    img = Image.open(OUT / man["hillshade"])
    w = img.size[0]
    check("hillshade size == near grid", img.size == (near["width"], near["height"]))
    alpha = np.asarray(img)[..., 3] > 0
    edge_rho = rho_n[alpha].max()
    check("hillshade alpha edge at 84 S (within 1 px)", abs(edge_rho - stereo_rho(MAP_LAT)) <= px,
          f"(max lit radius {edge_rho:.0f} m vs 84 S {stereo_rho(MAP_LAT):.0f} m)")
    scale = 1024 / w
    bg = Image.new("RGBA", img.size, (13, 27, 42, 255))
    prev = Image.alpha_composite(bg, img).convert("RGB").resize((1024, 1024), Image.LANCZOS)
    d = ImageDraw.Draw(prev)
    def to_px(x, y):
        return ((x - near["x_min"]) / px * scale, (near["y_max"] - y) / px * scale)
    for lat_ring in (-84, -85, -86, -87, -88, -89):
        r = stereo_rho(lat_ring) / px * scale
        cx, cy = to_px(0, 0)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 80, 80) if lat_ring == -84 else (255, 209, 102))
        d.text((cx + 3, cy - r + 2), f"{-lat_ring} S", fill=(255, 209, 102))
    for lon_m in range(0, 360, 30):
        x0, y0 = stereo_fwd(-90, lon_m)
        x1, y1 = stereo_fwd(-84, lon_m)
        d.line([to_px(x0, y0), to_px(x1, y1)], fill=(76, 201, 240))
        lx, ly = to_px(*stereo_fwd(-84.3, lon_m))
        d.text((lx - 8, ly - 6), f"{lon_m}E", fill=(76, 201, 240))
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    prev.save(PREVIEW)
    print(f"  wrote {PREVIEW}")

    print("\nOK" if not failures else f"\nNOT OK: {failures}")
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
