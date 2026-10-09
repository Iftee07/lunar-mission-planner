"""Phase 3: slow brute-force Python reference for the terrain horizon (PRD section 5.4).

Independent of the JS engine: plain scalar loops, trig-based lat/lon -> stereographic
(common.stereo_fwd) and its own bilinear sampler, reading the same dem_near/dem_far files.
Writes data/fixtures/horizon_reference.json for 3 pins (antenna 2 m).
"""
import json
import math
import time

import numpy as np

from common import FIXTURES, MANIFEST, MOON_RADIUS_M, OUT, stereo_fwd

# Test pins (lat, lon east) - arbitrary test inputs: near the pole, mid-map, near the map edge.
PINS = [(-89.5, -45.0), (-87.0, 120.0), (-84.3, -160.0)]
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


def main():
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
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "horizon_reference.json").write_text(json.dumps({"pins": pins}))
    print(f"wrote {FIXTURES / 'horizon_reference.json'}")


if __name__ == "__main__":
    main()
