# Lunar South Pole Light, Comms and Landing Browser (LSPB)

Local prototype. Full README (data sources, method, validation, licenses) is written in phase 6.

## Setup (Windows, Git Bash or PowerShell)

```
python -m venv venv
venv\Scripts\python -m pip install -r pipeline\requirements.txt
venv\Scripts\python pipeline\00_check_env.py
venv\Scripts\python pipeline\01_download.py     # ~2.7 GB, resumable: re-run if interrupted
venv\Scripts\python pipeline\09_build_features.py  # named craters (IAU gazetteer, ~24 MB download)

cd web
npm ci
npm run dev                                      # http://localhost:5173
```

## Known limits

- Surface view: the drawn skyline is the Earth skyline at the selected antenna height. The Sun is always
  evaluated from a fixed 2 m lander height against its own horizon, so the Sun's "(blocked)" label can
  occasionally differ slightly from what the drawn skyline suggests.

## Data citations (added in v3)

- Named craters: Gazetteer of Planetary Nomenclature, IAU WGPSN and USGS Astrogeology Science Center,
  https://planetarynames.wr.usgs.gov (file `MOON_nomenclature_center_pts.zip`). Public domain. Only IAU-adopted
  features of type "Crater, craters" whose rim reaches 84°S or further south are shown; display only.
