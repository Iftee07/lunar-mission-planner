# Lunar South Pole Light, Comms and Landing Browser (LSPB)

Local prototype. Full README (data sources, method, validation, licenses) is written in phase 6.

## Setup (Windows, Git Bash or PowerShell)

```
python -m venv venv
venv\Scripts\python -m pip install -r pipeline\requirements.txt
venv\Scripts\python pipeline\00_check_env.py
venv\Scripts\python pipeline\01_download.py     # ~2.7 GB, resumable: re-run if interrupted

cd web
npm ci
npm run dev                                      # http://localhost:5173
```
