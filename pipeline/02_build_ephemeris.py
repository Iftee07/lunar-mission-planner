"""Build web/public/data/ephemeris.bin (Sun and Earth vectors, Moon-centred, MOON_ME, km).

One sample every EPHEMERIS_STEP_S of UTC from EPHEMERIS_START_UTC to EPHEMERIS_END_UTC.
Each UTC sample is converted to ephemeris time with the leapseconds kernel.
Layout: Float32 LE, 6 values per sample: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z.

Then checks the browser's linear interpolation of the float32 table against SPICE sampled every
60 s over three 30-day spans (start, middle, end of the range); the step is accepted only if the
worst angle error is below INTERP_TOL_DEG for both bodies. 40 of those 60 s reference vectors are
written to data/fixtures/ephemeris_reference.json so the JS test can repeat the check.
"""
import json
import sys

import numpy as np
import spiceypy as sp

from common import (ABCORR, EPHEMERIS_END_UTC, EPHEMERIS_START_UTC, EPHEMERIS_STEP_S, FIXTURES, FRAME,
                    OUT, iso_to_unix, load_kernels, unix_to_iso, update_manifest)

FILE = "ephemeris.bin"
INTERP_TOL_DEG = 0.001
CHECK_SPANS_UTC = ["2026-03-01T00:00:00Z", "2031-07-01T00:00:00Z", "2035-11-15T00:00:00Z"]
CHECK_SPAN_S = 30 * 86400
CHECK_STEP_S = 60
FIXTURE_POINTS = 40


def vectors(unix):
    """SPICE (float64) Sun and Earth vectors at integer UTC unix seconds."""
    et = np.array([sp.str2et(unix_to_iso(int(t))) for t in unix])
    sun, lt_sun = sp.spkpos("SUN", et, FRAME, ABCORR, "MOON")
    earth, lt_earth = sp.spkpos("EARTH", et, FRAME, ABCORR, "MOON")
    return np.asarray(sun), np.asarray(earth), np.asarray(lt_sun), np.asarray(lt_earth)


def angle_deg(a, b):
    a = a / np.linalg.norm(a, axis=1)[:, None]
    b = b / np.linalg.norm(b, axis=1)[:, None]
    return np.degrees(np.arctan2(np.linalg.norm(np.cross(a, b), axis=1), (a * b).sum(1)))


def interpolation_check(t0, table):
    """Worst angle (deg) between the interpolated float32 table and SPICE every 60 s."""
    worst = {"sun": 0.0, "earth": 0.0}
    samples = []
    rng = np.random.default_rng(2035)
    for start in CHECK_SPANS_UTC:
        ref_t = np.arange(iso_to_unix(start), iso_to_unix(start) + CHECK_SPAN_S, CHECK_STEP_S)
        sun, earth, _, _ = vectors(ref_t)
        f = (ref_t - t0) / EPHEMERIS_STEP_S
        i = np.floor(f).astype(int)
        w = (f - i)[:, None]
        interp = table[i] * (1 - w) + table[i + 1] * w
        worst["sun"] = max(worst["sun"], angle_deg(interp[:, :3], sun).max())
        worst["earth"] = max(worst["earth"], angle_deg(interp[:, 3:], earth).max())
        for k in rng.choice(len(ref_t), FIXTURE_POINTS // len(CHECK_SPANS_UTC) + 1, replace=False):
            samples.append({"unix_s": int(ref_t[k]), "sun_km": sun[k].tolist(), "earth_km": earth[k].tolist()})
    return worst, samples[:FIXTURE_POINTS]


def main():
    kernels = load_kernels()
    print("kernels:", ", ".join(kernels))
    print("frame:", FRAME, "-> resolves to frame id", sp.namfrm(FRAME))

    t0, t1 = iso_to_unix(EPHEMERIS_START_UTC), iso_to_unix(EPHEMERIS_END_UTC)
    unix = np.arange(t0, t1 + 1, EPHEMERIS_STEP_S, dtype=np.int64)
    n = len(unix)
    print(f"samples: {n} ({unix_to_iso(t0)} .. {unix_to_iso(int(unix[-1]))} UTC, step {EPHEMERIS_STEP_S} s)")

    # UTC -> ET through the LSK (handles leap seconds). SPICE reads ISO "T" strings as UTC.
    sun, earth, lt_sun, lt_earth = vectors(unix)
    data = np.hstack([sun, earth]).astype("<f4")
    OUT.mkdir(parents=True, exist_ok=True)
    data.tofile(OUT / FILE)

    # float32 storage error, as an angle seen from the Moon
    err = np.hstack([sun, earth]) - data.astype(np.float64)
    ang_sun = np.degrees(np.linalg.norm(err[:, :3], axis=1) / np.linalg.norm(sun, axis=1)).max()
    ang_earth = np.degrees(np.linalg.norm(err[:, 3:], axis=1) / np.linalg.norm(earth, axis=1)).max()

    worst, samples = interpolation_check(t0, data.astype(np.float64))
    ok = worst["sun"] < INTERP_TOL_DEG and worst["earth"] < INTERP_TOL_DEG

    update_manifest({
        "moon_radius_m": 1737400,
        "ephemeris": {
            "file": FILE,
            "utc_start_unix_s": int(t0),
            "step_s": EPHEMERIS_STEP_S,
            "count": int(n),
            "frame": FRAME,
            "kernels": kernels,
            "abcorr": ABCORR,
            "interp_error_deg": {"sun": round(float(worst["sun"]), 7), "earth": round(float(worst["earth"]), 7),
                                 "reference_step_s": CHECK_STEP_S},
        },
    })
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "ephemeris_reference.json").write_text(json.dumps({
        "note": "SPICE float64 vectors (km, MOON_ME, LT+S) at off-grid times, from 02_build_ephemeris.py",
        "step_s": EPHEMERIS_STEP_S, "tolerance_deg": INTERP_TOL_DEG, "samples": samples}, indent=1))

    d_sun = np.linalg.norm(sun, axis=1)
    d_earth = np.linalg.norm(earth, axis=1)
    print(f"wrote {OUT / FILE} ({(OUT / FILE).stat().st_size:,d} bytes)")
    print(f"Sun   distance {d_sun.min():,.0f} .. {d_sun.max():,.0f} km")
    print(f"Earth distance {d_earth.min():,.0f} .. {d_earth.max():,.0f} km")
    print(f"Sun   light time: mean {lt_sun.mean() / 3600:.4f} h ({lt_sun.mean():.1f} s)")
    print(f"Earth light time: mean {lt_earth.mean() / 3600:.6f} h ({lt_earth.mean():.3f} s)")
    print(f"float32 rounding, max angle: Sun {ang_sun:.2e} deg, Earth {ang_earth:.2e} deg")
    print(f"interpolation at {EPHEMERIS_STEP_S} s vs SPICE every {CHECK_STEP_S} s (3 x 30 d): "
          f"Sun {worst['sun']:.6f} deg, Earth {worst['earth']:.6f} deg  "
          f"{'PASS' if ok else 'FAIL'} (tol {INTERP_TOL_DEG})")
    print(f"wrote {FIXTURES / 'ephemeris_reference.json'} ({len(samples)} samples)")
    print("OK" if ok else "NOT OK")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
