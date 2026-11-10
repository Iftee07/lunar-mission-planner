"""Slow brute-force Python references for the terrain horizon (test fixtures).

Independent of the JS engine: plain scalar loops and their own bilinear samplers.
- Polar HD: trig-based lat/lon -> stereographic (common.stereo_fwd), reading the same
  dem_near/dem_far files as the app; 3 pins ("pins").
- Global: the raw PDS LOLA LDEM_16.IMG (data/raw/global, downloaded by 10_build_global.py), not the
  app's encoded global_dem.bin, so the JS decoder is checked too; 2 non-polar pins ("global_pins"),
  one whose 200 km range crosses the 180 E meridian.
Writes data/fixtures/horizon_reference.json (antenna 2 m). A section already in the file is kept:
delete the file to recompute everything.
"""
import json
import math
import time

import numpy as np

from common import FIXTURES, MANIFEST, MOON_RADIUS_M, OUT, RAW, stereo_fwd

# Test pins (lat, lon east) - arbitrary test inputs: near the pole, mid-map, near the map edge.
PINS = [(-89.5, -45.0), (-87.0, 120.0), (-84.3, -160.0)]
# Non-polar pins (Apollo 11; Chang'e-4, whose range crosses 180 E), coordinates as in 03_horizons_fixtures.py.
GLOBAL_PINS = [(0.67416, 23.47314), (-45.457, 177.589)]
LDEM = {"file": RAW / "global" / "ldem_16.img", "width": 5760, "height": 2880, "ppd": 16, "scale": 0.5}
ANTENNA_M = 2.0
N_AZ, AZ_STEP = 720, 0.5
MAX_RANGE_M = 200000.0
R = MOON_RADIUS_M


class Grid:
    def __init__(self, spec):
        a = np.fromfile(OUT / spec["file"], dtype="<i2").reshape(spec["height"], spec["width"])
        self.a, self.nodata, self.scale = a, spec["nodata"], spec["scale"]
        self.px, self.x_min, self.y_max = spec["pixel_m"], spec["x_min"], spec["y_max"]
        self.w, self.h = spec["width"], spec["height"]

    def sample(self, x, y):
        """Bilinear height at (x, y) or None (outside pixel-centre hull, or nodata neighbour)."""
        fc = (x - self.x_min) / self.px - 0.5
        fr = (self.y_max - y) / self.px - 0.5
        if not (0 <= fc <= self.w - 1 and 0 <= fr <= self.h - 1):
            return None
        c, r = min(int(fc), self.w - 2), min(int(fr), self.h - 2)
        wc, wr = fc - c, fr - r
        q = self.a[r:r + 2, c:c + 2]
        if (q == self.nodata).any():
            return None
        q = q.astype(float)
        top = q[0, 0] + (q[0, 1] - q[0, 0]) * wc
        bot = q[1, 0] + (q[1, 1] - q[1, 0]) * wc
        return (top + (bot - top) * wr) * self.scale


def terrain(near, far, x, y):
    z = near.sample(x, y)
    if z is not None:
        return z, near.px
    z = far.sample(x, y)
    if z is not None:
        return z, far.px
    return None


def horizon(lat_deg, lon_deg, ground_m, antenna_m, near, far):
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    h0 = ground_m + antenna_m
    x0, y0 = stereo_fwd(lat_deg, lon_deg)
    first_step = terrain(near, far, x0, y0)[1]
    out = []
    for i in range(N_AZ):
        az = math.radians(i * AZ_STEP)
        direction = math.cos(az) * north + math.sin(az) * east
        best = -math.inf
        step = first_step
        d = step
        while d <= MAX_RANGE_M:
            th = d / R
            p = math.cos(th) * up + math.sin(th) * direction
            plat = math.degrees(math.asin(p[2]))
            plon = math.degrees(math.atan2(p[1], p[0]))
            x, y = stereo_fwd(plat, plon)
            t = terrain(near, far, float(x), float(y))
            if t is None:
                break
            z, step = t
            best = max(best, math.atan2(z - h0, d) - d / (2 * R))
            d += step
        out.append(-90.0 if best == -math.inf else math.degrees(best))
    return out


class GlobalDem:
    """LDEM_16: row 0 = 90 N, column 0 = 0 E, pixel registered, heights value * 0.5 m above 1737.4 km."""
    def __init__(self, spec):
        self.a = np.fromfile(spec["file"], dtype="<i2").reshape(spec["height"], spec["width"])
        self.w, self.h, self.ppd, self.scale = spec["width"], spec["height"], spec["ppd"], spec["scale"]
        self.step_m = math.radians(1.0) * R / spec["ppd"]

    def sample(self, lat, lon):
        fr = min(max((90.0 - lat) * self.ppd - 0.5, 0.0), self.h - 1.0)
        r = min(int(math.floor(fr)), self.h - 2)
        wr = fr - r
        fc = (lon % 360.0) * self.ppd - 0.5
        if fc < 0:
            fc += self.w
        c0 = int(math.floor(fc)) % self.w
        c1 = (c0 + 1) % self.w
        wc = fc - math.floor(fc)
        a = self.a
        top = a[r, c0] + (a[r, c1] - a[r, c0]) * wc
        bot = a[r + 1, c0] + (a[r + 1, c1] - a[r + 1, c0]) * wc
        return float(top + (bot - top) * wr) * self.scale


def horizon_global(lat_deg, lon_deg, ground_m, antenna_m, dem):
    lat, lon = math.radians(lat_deg), math.radians(lon_deg)
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.array([-math.sin(lat) * math.cos(lon), -math.sin(lat) * math.sin(lon), math.cos(lat)])
    h0 = ground_m + antenna_m
    n_steps = int(MAX_RANGE_M // dem.step_m)
    out = []
    for i in range(N_AZ):
        az = math.radians(i * AZ_STEP)
        direction = math.cos(az) * north + math.sin(az) * east
        best = -math.inf
        for k in range(1, n_steps + 1):
            d = k * dem.step_m
            th = d / R
            p = math.cos(th) * up + math.sin(th) * direction
            z = dem.sample(math.degrees(math.asin(max(-1.0, min(1.0, p[2])))), math.degrees(math.atan2(p[1], p[0])))
            best = max(best, math.atan2(z - h0, d) - d / (2 * R))
        out.append(math.degrees(best))
    return out


def polar_pins():
    man = json.loads(MANIFEST.read_text())
    near, far = Grid(man["grids"]["near"]), Grid(man["grids"]["far"])
    pins = []
    for lat, lon in PINS:
        t0 = time.time()
        x, y = (float(v) for v in stereo_fwd(lat, lon))
        ground = terrain(near, far, x, y)[0]
        hz = horizon(lat, lon, ground, ANTENNA_M, near, far)
        a = np.array(hz)
        print(f"pin ({lat}, {lon}): x {x:.1f} y {y:.1f} ground {ground:.2f} m  "
              f"horizon min {a.min():.3f} max {a.max():.3f} mean {a.mean():.3f} deg  "
              f"({time.time() - t0:.0f} s)")
        pins.append({"lat": lat, "lon": lon, "x": x, "y": y, "groundM": ground,
                     "antennaM": ANTENNA_M, "horizon": [round(v, 6) for v in hz]})
    return pins


def global_pins():
    dem = GlobalDem(LDEM)
    pins = []
    for lat, lon in GLOBAL_PINS:
        t0 = time.time()
        ground = dem.sample(lat, lon)
        a = np.array(horizon_global(lat, lon, ground, ANTENNA_M, dem))
        print(f"global pin ({lat}, {lon}): ground {ground:.2f} m  horizon min {a.min():.3f} max {a.max():.3f} "
              f"mean {a.mean():.3f} deg  ({time.time() - t0:.0f} s)")
        pins.append({"lat": lat, "lon": lon, "groundM": ground, "antennaM": ANTENNA_M,
                     "stepM": dem.step_m, "horizon": [round(float(v), 6) for v in a]})
    return pins


def main():
    path = FIXTURES / "horizon_reference.json"
    ref = json.loads(path.read_text()) if path.exists() else {}
    for key, build in (("pins", polar_pins), ("global_pins", global_pins)):
        if key in ref:
            print(f"{key}: kept ({len(ref[key])} pins already in the fixture)")
        else:
            ref[key] = build()
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ref))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
