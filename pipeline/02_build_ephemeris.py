"""Phase 1: build web/public/data/ephemeris.bin (Sun and Earth vectors, Moon-centred, MOON_ME, km).

One sample every 900 s (0.25 h) of UTC from EPHEMERIS_START_UTC to EPHEMERIS_END_UTC.
Each UTC sample is converted to ephemeris time with the leapseconds kernel.
Layout: Float32 LE, 6 values per sample: sun_x, sun_y, sun_z, earth_x, earth_y, earth_z.
"""
import numpy as np
import spiceypy as sp

from common import (ABCORR, EPHEMERIS_END_UTC, EPHEMERIS_START_UTC, EPHEMERIS_STEP_S, FRAME,
                    OUT, iso_to_unix, load_kernels, unix_to_iso, update_manifest)

FILE = "ephemeris.bin"


def main():
    kernels = load_kernels()
    print("kernels:", ", ".join(kernels))
    print("frame:", FRAME, "-> resolves to frame id", sp.namfrm(FRAME))

    t0, t1 = iso_to_unix(EPHEMERIS_START_UTC), iso_to_unix(EPHEMERIS_END_UTC)
    unix = np.arange(t0, t1 + 1, EPHEMERIS_STEP_S, dtype=np.int64)
    n = len(unix)
    print(f"samples: {n} ({unix_to_iso(t0)} .. {unix_to_iso(int(unix[-1]))} UTC, step {EPHEMERIS_STEP_S} s)")

    # UTC -> ET through the LSK (handles leap seconds). SPICE reads ISO "T" strings as UTC.
    et = np.array([sp.str2et(unix_to_iso(int(t))) for t in unix])

    sun, lt_sun = sp.spkpos("SUN", et, FRAME, ABCORR, "MOON")
    earth, lt_earth = sp.spkpos("EARTH", et, FRAME, ABCORR, "MOON")
    sun, earth = np.asarray(sun), np.asarray(earth)
    lt_sun, lt_earth = np.asarray(lt_sun), np.asarray(lt_earth)

    data = np.hstack([sun, earth]).astype("<f4")
    OUT.mkdir(parents=True, exist_ok=True)
    data.tofile(OUT / FILE)

    # float32 storage error, as an angle seen from the Moon
    err = np.hstack([sun, earth]) - data.astype(np.float64)
    ang_sun = np.degrees(np.linalg.norm(err[:, :3], axis=1) / np.linalg.norm(sun, axis=1)).max()
    ang_earth = np.degrees(np.linalg.norm(err[:, 3:], axis=1) / np.linalg.norm(earth, axis=1)).max()

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
        },
    })

    d_sun = np.linalg.norm(sun, axis=1)
    d_earth = np.linalg.norm(earth, axis=1)
    print(f"wrote {OUT / FILE} ({(OUT / FILE).stat().st_size:,d} bytes)")
    print(f"Sun   distance {d_sun.min():,.0f} .. {d_sun.max():,.0f} km")
    print(f"Earth distance {d_earth.min():,.0f} .. {d_earth.max():,.0f} km")
    print(f"Sun   light time: mean {lt_sun.mean() / 3600:.4f} h ({lt_sun.mean():.1f} s)")
    print(f"Earth light time: mean {lt_earth.mean() / 3600:.6f} h ({lt_earth.mean():.3f} s)")
    print(f"float32 rounding, max angle: Sun {ang_sun:.2e} deg, Earth {ang_earth:.2e} deg")
    print("OK")


if __name__ == "__main__":
    main()
