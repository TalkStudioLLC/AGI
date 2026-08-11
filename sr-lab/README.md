# Symbolic Regression Lab

**Version:** v1.8
**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main) — lives as `sr-lab/` alongside the v1 memory/reasoning MCP system
**Lineage:** AGI project, iteration 2. Iteration 1 tackled *memory and continuity* (persistent memory MCP server, symbolic reasoning engine, meta-cognition layer). This iteration tackles *verifiable discovery* — using AI-style search to find mathematical laws in data, with results that don't depend on trusting the search: every equation is scored on a held-out test split it never saw.

## What it does

Given a dataset with numeric features and a target column, the app runs
genetic-programming symbolic regression (gplearn) to evolve closed-form
equations that fit the data. Candidates are simplified with sympy, ranked by
R² on a held-out test split, and shown with a predicted-vs-actual chart.

It ships with five bundled physics datasets generated from known laws plus 1%
noise (pendulum period, Kepler's third law, ideal gas, Newtonian gravitation,
projectile range) so you can validate the pipeline by checking it rediscovers
the known law before pointing it at data where the law is unknown.

Verified result from the build session: on the Kepler dataset the search
recovered `T = a*sqrt(a)` (= a^1.5, the true law) with test R² 0.9997, and on
the pendulum dataset it recovered `T = 2*sqrt(L)` (true: 2.006·√L) while
correctly ignoring the mass distractor column.

## Stack

- **Frontend:** React 18 + Vite (`frontend/`) — plain-SVG chart, no chart library
- **API:** FastAPI (`backend/app/main.py`)
- **Storage:** DuckDB single-file DB (`backend/data/srlab.duckdb`) — datasets, runs, and discovered equations
- **Engine:** gplearn `SymbolicRegressor` + sympy simplification (`backend/app/engine.py`), running on a background thread; the API polls run status

## Running it — Docker (recommended)

**From the repo root** (`C:\Users\Tom\Documents\GitHub\AGI`) — this is the
canonical compose file, with frontend/backend profile flags for development:

```bash
docker compose up --build                      # full stack (default)
docker compose --profile backend up --build    # backend only — API on :8000
docker compose --profile frontend up --build   # frontend only — nginx on :5173
```

The default comes from `COMPOSE_PROFILES=full` in the root `.env`; a CLI
`--profile` flag overrides it. Backend-only publishes the API on
localhost:8000, so you can develop the frontend against it with `npm run dev`
(the Vite proxy already points there). Frontend-only starts even with no
backend container — nginx resolves the backend lazily per request and serves
502 on `/api` until one is reachable.

Running from `sr-lab/` still works too (no profiles, both services):

```bash
docker compose up --build
```

Open http://localhost:5173. Two containers come up: the FastAPI backend
(uvicorn on an internal port) and an nginx container serving the built React
app and proxying `/api` to the backend. The DuckDB file lives in a named
volume (`srlab-data`), so runs and results persist across rebuilds. To reset
all data: `docker compose down -v`.

Note: the compose build was authored and statically checked in the build
session, but container registries were blocked in that environment, so the
image build itself was not executed there — if anything trips on first
`docker compose up`, it will be in the Dockerfiles, not the app (which was
verified end-to-end in dev mode).

## Running it — dev mode (hot reload)

Backend (from `sr-lab/backend/`):

```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000
```

Frontend (from `sr-lab/frontend/`):

```bash
npm install
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api` to port 8000.
On first startup the backend creates the DuckDB file and registers the five
sample datasets automatically (idempotent — safe to restart).

## Layout

```
sr-lab/
├── README.md                      # this file
├── docker-compose.yml             # backend + frontend, named volume for DuckDB
├── backend/
│   ├── Dockerfile                 # python:3.12-slim + uvicorn
│   ├── .dockerignore
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # FastAPI endpoints
│       ├── db.py                  # DuckDB storage layer
│       ├── engine.py              # symbolic regression + held-out scoring
│       └── sample_data.py         # bundled physics datasets
└── frontend/
    ├── Dockerfile                 # node build stage → nginx serve stage
    ├── .dockerignore
    ├── nginx.conf                 # serves dist/, proxies /api → backend:8000
    ├── package.json
    ├── package-lock.json          # committed for reproducible Docker builds
    ├── vite.config.js             # dev proxy /api → :8000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                # dataset browser, run config, results
        ├── ScatterChart.jsx       # predicted-vs-actual SVG scatter
        ├── api.js
        └── styles.css             # light/dark tokens
```

## How to read the results

The **test R²** column is the one that matters: it scores each equation on the
25% of rows the search never saw. Train R² far above test R² means the
equation memorized noise. Complexity is the program length — between two
equations with similar test R², prefer the simpler one (the parsimony
coefficient in the engine config pushes the search the same way).

## Adding your own dataset

Call `register_dataset()` in `backend/app/sample_data.py` (or a new module)
with a pandas DataFrame, the target column name, and the feature column names.
`true_law` is optional — leave it `None` for genuinely open questions. A CSV
upload endpoint is the natural next feature.

## Roadmap (from the experiments proposal)

- v1.x: CSV upload; run-history browser; log-space search option for power laws
- v2: swap-in PySR backend (Julia) for stronger search on the same API
- v2: live public datasets (NASA Exoplanet Archive, CERN Open Data) — the
  "anomaly-first sweep" experiment from the proposal doc

## Real-world data (experiments)

Drop CSVs into `backend/data/real/` and restart the backend — datasets in
`app/real_data.py`'s registry activate when their file appears (missing file
= "awaiting_data", never an error). First registered experiment: NASA
Exoplanet Archive orbits (see `EXPERIMENTS.md` at the repo root). In Docker,
that folder is bind-mounted read-only into the container.

## Protected data (EXP-007: private telemetry, public code)

Registry entries flagged `private: True` load from `backend/data/private/`
instead — **gitignored in its entirety**, same guarantee as memory.db. The
loaders are customer-agnostic (column aliases auto-detected, ms/s
auto-converted, no hostnames or environment values anywhere in code), and
logged results use generic labels ("Service A").

### Exporting telemetry (Phase 1: Little's Law credential test)

`export-telemetry.sh` (bash — Git Bash, WSL, or any Linux host; requires
curl + jq) pulls three series from any Prometheus-compatible API and
writes `backend/data/private/service_telemetry.csv`.

**Configure once in `.env`, run bare.** Copy `sr-lab/.env.example` to
`sr-lab/.env`, fill in your URL and queries (`.env` is gitignored at every
level — your values never enter version control), then:

```bash
cd <repo>/sr-lab
bash export-telemetry.sh
```

Flags override `.env` when needed:

```bash
bash export-telemetry.sh --prom-url http://YOUR-PROM:9090 \
  --rate-query 'sum(rate(http_requests_total{job="YOURSERVICE"}[5m]))' \
  --latency-query 'sum(rate(http_request_duration_seconds_sum{job="YOURSERVICE"}[5m]))/sum(rate(http_request_duration_seconds_count{job="YOURSERVICE"}[5m]))' \
  --inflight-query 'sum(http_requests_in_flight{job="YOURSERVICE"})'
```

Optional: `--days 7`, `--step 60`, `--out FILE`; `--help` prints the full
header. Verified end-to-end against a mock Prometheus (2,881 aligned
samples; output satisfies L = rate·latency at R² 0.92 by construction).
A PowerShell twin (`export-telemetry.ps1`, same `.env`, same behavior)
exists for PowerShell-only environments.

**Hosted Prometheus APIs (auth):** for endpoints that require a token
(Fly.io managed Prometheus, Grafana Cloud, ...), set `PROM_TOKEN` in
`.env` (sent as `Authorization: Bearer <token>`) or `PROM_AUTH_HEADER`
(sent verbatim — covers Fly's `FlyV1 ...` macaroon tokens; wins over
`PROM_TOKEN`). Flags `--token` / `--auth-header` override. Unset = no
header, exactly as before. Tokens live only in the gitignored `.env`.

**Fly.io note:** every Fly org gets a managed Prometheus at
`https://api.fly.io/prometheus/<org-slug>` whose proxy already records
the Little's Law triple for each app with **no app changes**:
`fly_app_http_responses_count` (rate), `fly_app_http_response_time_seconds`
histogram (latency), `fly_app_concurrency` (in-flight). A commented
example lives in `.env.example`; a read-only token comes from
`fly tokens create readonly`.

Not sure of your metric names? List candidates first:

```powershell
(Invoke-RestMethod "http://YOUR-PROM:9090/api/v1/label/__name__/values").data -match "request|duration|latency|in_flight|connections" | Select-Object -First 40
```

Optional flags: `-Days 7` (range), `-StepSeconds 60` (resolution). Wrap
every query in `sum(...)` so it returns one series. nginx-ingress and
generic `http_*` examples are in the script's comment header
(`Get-Help .\export-telemetry.ps1 -Examples`).

**No Prometheus / low-tech path:** any Grafana panel → Inspect → Download
CSV, saved as `backend/data/private/service_telemetry.csv` — the loader
auto-detects common column names (rate/rps/qps, latency/duration/response
time, inflight/active/concurrency, timestamp).

Then restart the backend; dataset **"PRIVATE: Service Telemetry"** appears.
Run it with `time_split` enabled — chronological hold-out is mandatory for
time-series (a shuffled split leaks the future).

## Revision history

- **v1.8** (2026-08-08) — exporter auth support: PROM_TOKEN (Bearer) /
  PROM_AUTH_HEADER (verbatim, e.g. FlyV1) in .env or via --token /
  --auth-header, both scripts; Fly.io managed-Prometheus example in
  .env.example (fly_app_* proxy metrics = rate/latency/in-flight with
  no app changes). Verified against an auth-enforcing mock Prometheus.
- **v1.7** (2026-08-08) — bash exporter (export-telemetry.sh) is now the
  primary path (curl+jq, same .env, flags override); verified end-to-end
  against a mock Prometheus. PowerShell twin retained.
- **v1.6** (2026-08-08) — export-telemetry.ps1 reads sr-lab/.env
  (set-once config; parameters override; .env.example committed).
- **v1.5** (2026-08-08) — protected-data section: data/private (gitignored),
  customer-agnostic telemetry loader, export-telemetry.ps1 usage + metric
  discovery one-liner + Grafana CSV fallback; time_split engine mode
  documented for time-series.
- **v1.4** (2026-08-08) — engine `log_space` option (EXP-002): fits in
  log-log space, inverts with exp(), always scores in linear space for
  cross-mode comparability; `log_space` accepted on POST /api/runs.
- **v1.3** (2026-08-07) — real-data loader (`real_data.py`) + registry,
  bind-mount for `backend/data/real/`, EXP-001 wiring.

- **v1.2** (2026-08-06) — root-level `docker-compose.yml` in the AGI repo
  with `backend`/`frontend` profile flags (default `full` via root `.env`);
  nginx now resolves the backend lazily so frontend-only mode starts clean;
  backend publishes :8000 for frontend-dev against the dockerized API.
- **v1.1** (2026-08-06) — Docker Compose deployment: backend and frontend
  Dockerfiles, nginx production proxy, named volume for DuckDB persistence,
  committed package-lock.json for reproducible builds.
- **v1.0** (2026-08-06) — initial build: FastAPI + DuckDB backend, gplearn
  engine with held-out scoring and sympy simplification, React/Vite frontend,
  five bundled physics datasets, end-to-end verified (Kepler, pendulum).
