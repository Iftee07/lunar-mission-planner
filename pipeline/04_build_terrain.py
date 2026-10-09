"""Phase 2: build the terrain files in web/public/data/ from LDEM_80S_20MPP_ADJ.TIF.

  dem_near.bin     int16 LE, height = value * 0.5 m, 120 m pixels (6x6 mean), lat <= -84 + 1 px margin
  dem_far.bin      int16 LE, same scaling, 240 m pixels (12x12 mean), lat <= -80
  slope_plane.bin  uint8, deg = value * 0.25, near grid: least-squares plane slope over a
                   100 m radius disc centred on each near-grid pixel centre (20 m data)
  slope_max.bin    uint8, same scaling: steepest 20 m per-pixel gradient slope inside that disc
  hillshade.png    RGBA on the near grid, alpha 0 where lat > -84 or no data

Heights are relative to the 1737400 m sphere. Nodata: int16 -32768, uint8 255.
Slopes are corrected for the stereographic scale factor k = 1 + rho^2 / (4 R^2).
"""
import math
import time

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

from common import MOON_RADIUS_M, OUT, RAW, stereo_rho, update_manifest

LOLA = RAW / "lola" / "LDEM_80S_20MPP_ADJ.TIF"
SRC_PX = 20.0
NEAR_F, FAR_F = 6, 12                  # averaging factors -> 120 m, 240 m
MAP_LAT, FAR_LAT = -84.0, -80.0
LANDING_RADIUS_M = 100.0
HEIGHT_SCALE = 0.5
SLOPE_SCALE = 0.25
I16_NODATA, U8_NODATA = -32768, 255
MIN_VALID = 0.5                        # a block needs >= 50% valid 20 m pixels
TILE_BLOCKS = 128                      # near-grid rows per tile (~60 MB of 20 m data)
MARGIN = 6                             # 20 m pixels around a tile (disc radius 5 + gradient 1)
HILL_AZ_DEG, HILL_ALT_DEG, HILL_Z = 315.0, 35.0, 2.0   # display only: light from map upper-left


def grid_spec(ds, factor, radius_m, margin_px):
    """Square grid of factor*20 m pixels, symmetric about the pole, aligned to LOLA pixels,
    covering radius_m plus margin_px pixels, clipped to the extent of the LOLA file."""
    px = SRC_PX * factor
    data_half = min(-ds.transform.c, ds.transform.f)
    n_half = min(math.ceil(radius_m / px) + margin_px, math.floor(data_half / px))
    x_min = -n_half * px
    col0 = (x_min - ds.transform.c) / SRC_PX         # LOLA column of the grid's left edge
    row0 = (ds.transform.f - (-x_min)) / SRC_PX      # LOLA row of the grid's top edge (y_max = -x_min)
    assert col0 == int(col0) and row0 == int(row0) and col0 >= 0 and row0 >= 0
    return {"width": 2 * n_half, "height": 2 * n_half, "pixel_m": px,
            "x_min": x_min, "y_max": -x_min, "col0": int(col0), "row0": int(row0)}


def block_mean(z, f):
    """Mean of f x f blocks ignoring NaN; NaN where fewer than MIN_VALID are valid."""
    h, w = z.shape[0] // f, z.shape[1] // f
    b = z[:h * f, :w * f].reshape(h, f, w, f)
    valid = np.isfinite(b)
    s = np.where(valid, b, 0).sum(axis=(1, 3), dtype=np.float64)
    n = valid.sum(axis=(1, 3))
    out = np.full((h, w), np.nan, dtype=np.float64)
    ok = n >= MIN_VALID * f * f
    out[ok] = s[ok] / n[ok]
    return out


def to_i16(h):
    q = np.round(h / HEIGHT_SCALE)
    q = np.where(np.isfinite(q), np.clip(q, -32767, 32767), I16_NODATA)
    return q.astype("<i2")


def to_u8(deg):
    q = np.round(deg / SLOPE_SCALE)
    q = np.where(np.isfinite(q), np.clip(q, 0, 254), U8_NODATA)
    return q.astype(np.uint8)


def disc_offsets():
    """20 m pixel offsets (di, dj) around a pixel-corner centre whose pixel centres lie
    within LANDING_RADIUS_M. Offset of pixel centre in metres: ((dj+.5)*20, -(di+.5)*20)."""
    r = LANDING_RADIUS_M / SRC_PX
    n = int(math.ceil(r))
    offs = [(di, dj) for di in range(-n, n) for dj in range(-n, n)
            if (di + 0.5) ** 2 + (dj + 0.5) ** 2 <= r * r]
    xs = np.array([(dj + 0.5) * SRC_PX for _, dj in offs])
    ys = np.array([-(di + 0.5) * SRC_PX for di, _ in offs])
    assert abs(xs.sum()) < 1e-9 and abs(ys.sum()) < 1e-9 and abs((xs * ys).sum()) < 1e-9
    return offs, xs, ys


def build_near(ds, g):
    nb = g["width"]
    offs, xs, ys = disc_offsets()
    sxx, syy = (xs ** 2).sum(), (ys ** 2).sum()
    print(f"slope disc: {len(offs)} pixels of 20 m (radius {LANDING_RADIUS_M:.0f} m)")

    dem = np.full((nb, nb), np.nan)
    plane = np.full((nb, nb), np.nan)
    smax = np.full((nb, nb), np.nan)

    # stereographic scale factor at each near-grid pixel centre
    c = g["x_min"] + (np.arange(nb) + 0.5) * g["pixel_m"]
    rho2 = c[None, :] ** 2 + c[:, None] ** 2
    kfac = 1.0 + rho2 / (4.0 * MOON_RADIUS_M ** 2)

    t0 = time.time()
    for b0 in range(0, nb, TILE_BLOCKS):
        b1 = min(nb, b0 + TILE_BLOCKS)
        h = b1 - b0
        win = Window(g["col0"] - MARGIN, g["row0"] + NEAR_F * b0 - MARGIN,
                     NEAR_F * nb + 2 * MARGIN, NEAR_F * h + 2 * MARGIN)
        z = ds.read(1, window=win).astype(np.float64)

        core = z[MARGIN:MARGIN + NEAR_F * h, MARGIN:MARGIN + NEAR_F * nb]
        dem[b0:b1] = block_mean(core, NEAR_F)

        # per-pixel gradient magnitude (tan of slope) by central differences
        grad = np.full_like(z, np.nan)
        gx = (z[1:-1, 2:] - z[1:-1, :-2]) / (2 * SRC_PX)
        gy = (z[:-2, 1:-1] - z[2:, 1:-1]) / (2 * SRC_PX)
        grad[1:-1, 1:-1] = np.hypot(gx, gy)

        bx = np.zeros((h, nb))
        by = np.zeros((h, nb))
        gmax = np.full((h, nb), -np.inf)
        base = MARGIN + NEAR_F // 2         # local index of the pixel just below/right of the centre
        for (di, dj), x, y in zip(offs, xs, ys):
            r0, c0 = base + di, base + dj
            sl = (slice(r0, r0 + NEAR_F * h, NEAR_F), slice(c0, c0 + NEAR_F * nb, NEAR_F))
            zz = z[sl]
            bx += x * zz
            by += y * zz
            gmax = np.maximum(gmax, grad[sl])     # NaN propagates -> slope nodata
        k = kfac[b0:b1]
        plane[b0:b1] = np.degrees(np.arctan(k * np.hypot(bx / sxx, by / syy)))
        smax[b0:b1] = np.degrees(np.arctan(k * gmax))
        print(f"  near rows {b0:>4}-{b1 - 1:>4} / {nb}  ({time.time() - t0:5.0f} s)", flush=True)
    return dem, plane, smax


def build_far(ds, g):
    nb = g["width"]
    dem = np.full((nb, nb), np.nan)
    rows = 64
    t0 = time.time()
    for b0 in range(0, nb, rows):
        b1 = min(nb, b0 + rows)
        win = Window(g["col0"], g["row0"] + FAR_F * b0, FAR_F * nb, FAR_F * (b1 - b0))
        dem[b0:b1] = block_mean(ds.read(1, window=win).astype(np.float64), FAR_F)
        if b1 == nb or (b0 // rows) % 8 == 0:
            print(f"  far rows {b0:>4}-{b1 - 1:>4} / {nb}  ({time.time() - t0:5.0f} s)", flush=True)
    return dem


def hillshade(dem, g):
    """Grey hillshade (display only) with alpha 0 where lat > -84 or no data."""
    px = g["pixel_m"]
    z = dem * HILL_Z
    gy, gx = np.gradient(z, px)          # gy along rows (down = -y)
    dzdx, dzdy = gx, -gy
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, -dzdy)    # downslope direction, clockwise from map-up
    az, alt = math.radians(HILL_AZ_DEG), math.radians(HILL_ALT_DEG)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    grey = np.clip(shade, 0, 1) ** 0.8 * 235 + 20
    n = g["width"]
    c = g["x_min"] + (np.arange(n) + 0.5) * px
    rho = np.hypot(c[None, :], c[:, None])
    inside = (rho <= stereo_rho(MAP_LAT)) & np.isfinite(grey)
    rgba = np.zeros((n, n, 4), dtype=np.uint8)
    rgba[..., :3] = np.where(np.isfinite(grey), grey, 0).astype(np.uint8)[..., None]
    rgba[..., 3] = np.where(inside, 255, 0)
    return rgba


def grid_manifest(g, file):
    keys = ("width", "height", "pixel_m", "x_min", "y_max")
    return {"file": file, **{k: g[k] for k in keys}, "scale": HEIGHT_SCALE, "nodata": I16_NODATA}


def main():
    t_start = time.time()
    with rasterio.open(LOLA) as ds:
        tr = ds.transform
        print(f"LOLA {ds.width} x {ds.height}, {ds.dtypes[0]}, nodata {ds.nodata}, "
              f"pixel {tr.a} x {tr.e} m, origin ({tr.c}, {tr.f})")
        if not (tr.a == SRC_PX and tr.e == -SRC_PX and tr.b == 0 and tr.d == 0):
            raise RuntimeError("expected 20 m north-up pixels (row 0 = max y)")
        proj4 = ds.crs.to_proj4().replace("=True", "")
        print("CRS:", proj4)
        scale, offset = ds.scales[0], ds.offsets[0]
        if (scale, offset) != (1.0, 0.0):
            raise RuntimeError(f"unexpected scale/offset {scale}/{offset}")

        near = grid_spec(ds, NEAR_F, stereo_rho(MAP_LAT), margin_px=1)
        far = grid_spec(ds, FAR_F, stereo_rho(FAR_LAT), margin_px=0)
        print(f"near grid {near['width']} x {near['height']} @ {near['pixel_m']:.0f} m, "
              f"x_min {near['x_min']:.0f}  (84 S radius {stereo_rho(MAP_LAT):.0f} m)")
        print(f"far  grid {far['width']} x {far['height']} @ {far['pixel_m']:.0f} m, "
              f"x_min {far['x_min']:.0f}  (80 S radius {stereo_rho(FAR_LAT):.0f} m)")

        print("building near grid + slopes ...")
        dem_n, plane, smax = build_near(ds, near)
        print("building far grid ...")
        dem_f = build_far(ds, far)

    OUT.mkdir(parents=True, exist_ok=True)
    to_i16(dem_n).tofile(OUT / "dem_near.bin")
    to_i16(dem_f).tofile(OUT / "dem_far.bin")
    to_u8(plane).tofile(OUT / "slope_plane.bin")
    to_u8(smax).tofile(OUT / "slope_max.bin")
    Image.fromarray(hillshade(dem_n, near), "RGBA").save(OUT / "hillshade.png", optimize=True)

    update_manifest({
        "proj4": proj4,
        "moon_radius_m": MOON_RADIUS_M,
        "grids": {"near": grid_manifest(near, "dem_near.bin"),
                  "far": grid_manifest(far, "dem_far.bin")},
        "slope": {"plane": "slope_plane.bin", "max": "slope_max.bin", "scale": SLOPE_SCALE,
                  "nodata": U8_NODATA, "radius_m": LANDING_RADIUS_M, "grid": "near"},
        "hillshade": "hillshade.png",
        "terrain_source": LOLA.name,
    })
    for f in ("dem_near.bin", "dem_far.bin", "slope_plane.bin", "slope_max.bin", "hillshade.png"):
        print(f"wrote {f:<16} {(OUT / f).stat().st_size:>12,d} B")
    print(f"done in {time.time() - t_start:.0f} s")
    print("OK")


if __name__ == "__main__":
    main()
