"""Average-illumination and permanent-shadow layers for the Polar HD map (lazy-loaded).

Source: NASA GSFC PGDA "Lunar Polar Illumination" (https://pgda.gsfc.nasa.gov/products/69), the
LOLA products AVGVISIB_75S_120M_201608 and LPSR_75S_120M_201608 (GeoTIFF versions of the PDS
LRO-L-LOLA-4-GDR-V1.0 "extras/illumination" IMG files): 120 m south polar stereographic on a
1737.4 km sphere, mean-Earth/polar axis of DE421, i.e. the same projection as our terrain grids.
Values (from the PDS labels): AVGVISIB = fraction of hourly time steps with any part of the solar
disc visible (0 = permanent shadow, 1 = always lit), averaged over a lunar precession cycle;
LPSR = 1 in permanent shadow, 0 elsewhere. Citation: Mazarico, E., et al. (2011), Illumination
conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081,
doi:10.1016/j.icarus.2010.10.030. NASA data; PDS notes EXTRAS products are not supported by PDS
or the LOLA team.

Each map is resampled (using the TIF's own georeferencing, nearest neighbour) onto our near grid
(manifest grids.near: 120 m, 84 S to the pole) and written as an 8-bit grey + alpha PNG:
  illum_avg.png  grey = sunlit percent 0..100 (integer), alpha 255 inside the 84 S disc
  psr.png        grey = 255 in permanent shadow, 0 elsewhere, alpha as above
The browser colours them and reads the value under the cursor from the grey channel.
"""
import json
import sys

import numpy as np
import rasterio
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from common import MANIFEST, OUT, RAW, download, stereo_fwd, stereo_rho, update_manifest

PGDA = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
PRODUCT_PAGE = "https://pgda.gsfc.nasa.gov/products/69"
LAYERS = {
    "illum_avg": {"tif": "AVGVISIB_75S_120M_201608.TIF", "png": "illum_avg.png",
                  "meaning": "average fraction of time sunlit (any part of the solar disc), percent 0..100"},
    "psr": {"tif": "LPSR_75S_120M_201608.TIF", "png": "psr.png",
            "meaning": "permanently shadowed region: grey 255 = PSR, 0 = not"},
}
MAP_LAT_LIMIT_DEG = -84.0
CITATION = ("Mazarico, E., et al. (2011), Illumination conditions of the lunar polar regions using LOLA "
            "topography, Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030")
STEREO_PROJ4 = "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"


def to_near_grid(path, g):
    """Read band 1 of a GeoTIFF and resample it onto the near grid (float32, NaN outside)."""
    with rasterio.open(path) as src:
        print(f"  {path.name}: {src.width} x {src.height}, dtype {src.dtypes[0]}, "
              f"res {src.res}, scales {src.scales}, offsets {src.offsets}, nodata {src.nodata}")
        print(f"    crs: {src.crs.to_proj4() if src.crs else None}")
        print(f"    transform: {tuple(round(v, 3) for v in src.transform[:6])}")
        data = src.read(1).astype(np.float32) * src.scales[0] + src.offsets[0]
        if src.nodata is not None:
            data[src.read(1) == src.nodata] = np.nan
        dst = np.full((g["height"], g["width"]), np.nan, dtype=np.float32)
        reproject(data, dst, src_transform=src.transform, src_crs=src.crs or CRS.from_proj4(STEREO_PROJ4),
                  dst_transform=from_origin(g["x_min"], g["y_max"], g["pixel_m"], g["pixel_m"]),
                  dst_crs=CRS.from_proj4(STEREO_PROJ4), resampling=Resampling.nearest,
                  src_nodata=np.nan, dst_nodata=np.nan)
    return dst


def inside_disc(g):
    c = g["x_min"] + (np.arange(g["width"]) + 0.5) * g["pixel_m"]
    r = g["y_max"] - (np.arange(g["height"]) + 0.5) * g["pixel_m"]
    x, y = np.meshgrid(c, r)
    return np.hypot(x, y) <= stereo_rho(MAP_LAT_LIMIT_DEG)


def value_at(arr, g, lat, lon):
    x, y = stereo_fwd(lat, lon)
    col = int((x - g["x_min"]) / g["pixel_m"])
    row = int((g["y_max"] - y) / g["pixel_m"])
    return float(arr[row, col])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    man = json.loads(MANIFEST.read_text())
    g = man["grids"]["near"]
    disc = inside_disc(g)
    alpha = np.where(disc, 255, 0).astype(np.uint8)
    fields = {}
    for key, spec in LAYERS.items():
        path = RAW / "illumination" / spec["tif"]
        download(PGDA + spec["tif"], path)
        fields[key] = to_near_grid(path, g)
        bad = disc & ~np.isfinite(fields[key])
        print(f"    {key}: range {np.nanmin(fields[key]):.4f} .. {np.nanmax(fields[key]):.4f}, "
              f"missing inside 84 S disc: {bad.sum()} px")

    illum, psr = fields["illum_avg"], fields["psr"] >= 0.5
    grey_illum = np.where(disc, np.clip(np.round(np.nan_to_num(illum) * 100), 0, 100), 0).astype(np.uint8)
    grey_psr = np.where(disc & psr, 255, 0).astype(np.uint8)

    # Sanity checks against known geography and between the two maps.
    craters = {c["name"]: c for c in json.loads((OUT / man["craters"]["file"]).read_text(encoding="utf-8"))}
    sh = craters["Shackleton"]
    sh_psr, sh_illum = value_at(psr, g, sh["lat"], sh["lon"]), value_at(illum, g, sh["lat"], sh["lon"])
    in_disc_psr = psr & disc
    psr_lit = float(np.nanmax(np.where(in_disc_psr, illum, np.nan)))
    checks = [
        (f"Shackleton floor centre ({sh['lat']}, {sh['lon']}) is PSR", sh_psr == 1.0),
        (f"Shackleton floor centre average sunlight {sh_illum * 100:.1f}% (expect 0)", sh_illum == 0.0),
        (f"PSR pixels have average sunlight 0 (max {psr_lit:.4f})", psr_lit == 0.0),
    ]
    ok = True
    for label, passed in checks:
        ok &= passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}")
    if not ok:
        sys.exit("NOT OK: layer orientation or values look wrong")

    section = {}
    for key, grey in (("illum_avg", grey_illum), ("psr", grey_psr)):
        spec = LAYERS[key]
        Image.fromarray(np.dstack([grey, alpha]), "LA").save(OUT / spec["png"], optimize=True)
        size = (OUT / spec["png"]).stat().st_size
        print(f"wrote {spec['png']} ({size:,} B)")
        section[key] = {"file": spec["png"], "grid": "near", "meaning": spec["meaning"],
                        "source": spec["tif"].removesuffix(".TIF") + " (LOLA, NASA GSFC PGDA)",
                        "source_url": PGDA + spec["tif"], "product_page": PRODUCT_PAGE,
                        "time_span": "illumination averaged over a lunar precession cycle (18.6 years); "
                                     "LOLA topography 2009-07-13 to 2013-07-18",
                        "citation": CITATION, "bytes": size}
    section["psr"]["area_km2_inside_84S"] = round(float(in_disc_psr.sum()) * (g["pixel_m"] / 1000) ** 2, 1)
    update_manifest({"illumination": section})
    print(f"PSR area inside 84 S: {section['psr']['area_km2_inside_84S']:,} km2")
    print("OK")


if __name__ == "__main__":
    main()
