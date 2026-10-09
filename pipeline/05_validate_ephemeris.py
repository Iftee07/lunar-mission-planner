"""Phase 1: compare our azimuth/elevation (ephemeris.bin + PRD section 5.2 on a smooth
1737.4 km sphere, height 0) with the cached JPL Horizons fixtures.
Pass: max |d_az| and max |d_el| <= 0.1 deg for both Sun and Earth.
"""
import json
import sys
from datetime import datetime, timezone

from common import FIXTURES, az_el, body_at, load_ephemeris

TOL_DEG = 0.1


def parse_time(s):
    # Horizons prints e.g. "2026-Nov-15 06:07:00.000"
    for fmt in ("%Y-%b-%d %H:%M:%S.%f", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc).timestamp()
        except ValueError:
            pass
    raise ValueError(f"cannot parse Horizons time {s!r}")


def main():
    fx = json.loads((FIXTURES / "horizons.json").read_text())
    man, arr = load_ephemeris()
    print(f"ephemeris: frame {man['frame']}, abcorr {man['abcorr']}, {man['count']} samples")
    print(f"{'body':<6}{'lat':>7}{'lon':>6}  {'time (UTC)':<22}"
          f"{'az ours':>10}{'az HZN':>10}{'d_az':>8}{'el ours':>10}{'el HZN':>10}{'d_el':>8}")
    worst = {"sun": [0.0, 0.0], "earth": [0.0, 0.0]}
    for rec in fx["records"]:
        t = parse_time(rec["time_ut"])
        sun, earth = body_at(man, arr, t)
        az, el = az_el(rec["lat"], rec["lon"], sun if rec["body"] == "sun" else earth)
        d_az = (az - rec["az_deg"] + 180) % 360 - 180
        d_el = el - rec["el_deg"]
        w = worst[rec["body"]]
        w[0], w[1] = max(w[0], abs(d_az)), max(w[1], abs(d_el))
        print(f"{rec['body']:<6}{rec['lat']:>7}{rec['lon']:>6}  {rec['time_ut']:<22}"
              f"{az:>10.4f}{rec['az_deg']:>10.4f}{d_az:>8.4f}{el:>10.4f}{rec['el_deg']:>10.4f}{d_el:>8.4f}")
    ok = True
    for body, (da, de) in worst.items():
        good = da <= TOL_DEG and de <= TOL_DEG
        ok &= good
        print(f"max |d_az| {body:<5} {da:.6f} deg ({da * 3600:.2f} arcsec)   "
              f"max |d_el| {body:<5} {de:.6f} deg ({de * 3600:.2f} arcsec)   "
              f"{'PASS' if good else 'FAIL'} (tol {TOL_DEG})")
    print("OK" if ok else "NOT OK")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
