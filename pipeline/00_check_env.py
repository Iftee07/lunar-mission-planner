"""Phase 0: check the Python environment and free disk space.

Prints library versions, imports everything the pipeline needs and checks
that at least 10 GB is free on the drive that holds the repo.
Exit code 0 and a final "OK" line means the environment is ready.
"""
import importlib
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MIN_FREE_GB = 10
MIN_PY = (3, 11)

LIBS = ["spiceypy", "numpy", "rasterio", "pyproj", "PIL", "requests", "scipy"]


def main():
    ok = True
    print(f"python   {sys.version.split()[0]}  ({sys.executable})")
    if sys.version_info < MIN_PY:
        print(f"FAIL python >= {MIN_PY[0]}.{MIN_PY[1]} required")
        ok = False

    for name in LIBS:
        try:
            mod = importlib.import_module(name)
            ver = getattr(mod, "__version__", "?")
            extra = ""
            if name == "spiceypy":
                extra = f"  (CSPICE {mod.tkvrsn('TOOLKIT')})"
            if name == "rasterio":
                extra = f"  (GDAL {mod.__gdal_version__})"
            if name == "pyproj":
                extra = f"  (PROJ {mod.proj_version_str})"
            print(f"{name:<8} {ver}{extra}")
        except Exception as exc:  # noqa: BLE001 - report any import failure
            print(f"FAIL {name}: {exc}")
            ok = False

    free_gb = shutil.disk_usage(REPO).free / 1e9
    print(f"disk     {free_gb:.1f} GB free at {REPO.anchor}")
    if free_gb < MIN_FREE_GB:
        print(f"FAIL need >= {MIN_FREE_GB} GB free")
        ok = False

    print("OK" if ok else "NOT OK")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
