# SR-Lab dashboard baseline

**Dashboard:** `SR-Lab / AGI — Symbolic Regression` (uid `sr-lab-agi`)
<http://localhost:3000/d/sr-lab-agi/sr-lab-agi-e28094-symbolic-regression>
**Baseline version:** 1.1 — established 2026-08-15T01:05Z (dashboard version 5)
**Established from:** the live stack (Prometheus `localhost:9090`), backend
container `3537b1806e73` — an idle capture over 6 prior runs, then a deliberate
run sweep to capture the active regime.

> **v1.1 corrects two things v1.0 got wrong, and the sweep that produced it
> crashed the backend three times.** See *Corrections* and *Backend instability*
> below. The crashes are not incidental to the baseline — they are the reason
> two of its claims were wrong.

This document answers "what should these graphs look like?" so that a glance at
the dashboard is a *comparison* rather than a guess. Every number below was
measured, not invented; the derivation is in the panel sections.

Three files make up the baseline:

| File | Role |
|---|---|
| `BASELINE.md` | this document — the expected reading of each panel, and why |
| `baseline.json` | the same expectations, machine-readable, one entry per check |
| `check_baseline.py` | evaluates the checks against a live Prometheus |
| `snapshots/` | captured observations, for before/after comparison |
| `dashboards/sr-lab.json` | vendored copy of the dashboard (see *Provenance*) |

```bash
python sr-lab/observability/check_baseline.py
```

Result at the moment the baseline was established: **14 pass / 1 warn / 0 fail /
3 skipped** — the single warning is the ghost-instance artifact described below,
which is a real defect in the data, not in the baseline.

---

## Corrections in v1.1

**1. The cumulative counters are not monotone.** v1.0 said they "hold their last
value forever" and "never decay". Wrong. They reset to zero whenever the backend
**process** restarts — not merely when the container is replaced. A fresh
process starts with an empty registry, and `push_to_gateway` issues a **PUT**,
which replaces the entire `{job,instance}` group. The first push after a restart
therefore erases everything the previous process had accumulated.

This was observed live and it is nastier than it sounds: after two restarts, the
live instance had **no run counters at all**, and the dashboard's top row was
showing `Runs started 4` sourced *entirely from a dead container's frozen group*
while real runs were completing and being counted from zero. With
`restart: unless-stopped` in compose, the API comes straight back and the only
visible symptom is that the graphs quietly renumber.

Read every cumulative panel as **"since the last backend restart, plus whatever
dead instances left behind"**. There is no dashboard-side fix. The real fix is
architectural: the backend is a long-lived service, not a batch job, so
Prometheus could scrape it directly and the pushgateway could go away.

**2. The run-duration band was far too narrow.** v1.0's "p50 3s, p95 ≤10s" came
from a favourable window of `pendulum` and `ideal_gas` runs. Measured since:

| Condition | Duration |
|---|---|
| `pendulum`, sequential, default config | 10.8 s |
| two concurrent default-config runs | 33 s and 34 s |
| sweep window, p50 / p95 | 45 s / 58.5 s |
| `projectile`, alone, default config | still running past **7 minutes** |

Duration is strongly dataset- and concurrency-dependent — `projectile`
(`R = v²·sin(2θ)/9.81`) searches a much harder space than `pendulum` with the
same settings. The v1.1 band is deliberately wide (p50 ≤120s, p95 ≤300s); the
useful signal is a p95 pinned near the 1200s top bucket, not a number in the
middle.

Also corrected: equations per run is capped by `top_n` (**10** in the default
config), not the 7.0 that six historical runs happened to average.

---

## Backend instability found while establishing v1.1

**Concurrent symbolic-regression runs crash the backend.** Three
`Fatal Python error: Segmentation fault` events and two container restarts were
produced while driving the sweep:

| Trigger | Result |
|---|---|
| one run at `population_size 8000 × generations 80` | SIGSEGV, process died |
| **two concurrent runs at default config** | SIGSEGV, process died |
| one run at a time, default config | stable (7 runs, no crash) |

All three faulted at the same place:

```
gplearn/_program.py:423  get_all_indices
gplearn/genetic.py:142   _parallel_evolve
joblib/parallel.py:607   __call__
joblib/externals/loky/process_executor.py:291
```

A dying worker should not be fatal — but loky's cleanup then fails on its own,
because the `python:3.12-slim` image has neither `pgrep` nor `psutil`:

```
FileNotFoundError: [Errno 2] No such file or directory: 'pgrep'
  -> AttributeError: 'Popen' object has no attribute 'kill'   (ExecutorManagerThread dies)
```

That escalation is what turns one dead worker into a dead uvicorn. Runs in
flight are orphaned in DuckDB as `status='running'` **forever** — rows 20, 24
and 25 are in that state now, with no API to clear them.

Note the interaction with correction 1: the restart zeroes the counters, so the
*Lost runs* invariant reads 0 even though three runs were genuinely lost. **The
crash erases its own evidence.** Cross-check `GET /api/runs` for rows stuck in
`running` — the metrics alone will not tell you.

Not fixed. The options are to serialise runs behind a queue (one at a time is
the only pattern proven stable), pin `n_jobs=1` for the fit, or add `psutil` and
`procps` to the backend image so loky can clean up a dead worker without taking
the server with it.

---

## The two regimes

Most of this dashboard is **idle almost all of the time**, and idle has a
specific correct appearance that is easy to mistake for breakage:

- Rate panels sit flat at zero.
- Both histogram panels (*Run duration*, *HTTP p95 latency*) show **No data**.
  This is correct: `histogram_quantile` over a rate window with no observations
  is `0/0` = NaN. A flat line at zero there would actually be the *wrong*
  reading.
- *Since F3!L last active* shows the word **idle**, not a number.
- Every cumulative stat panel (*Runs started*, *Equations discovered*, …) holds
  its last value for as long as the backend process lives — but see
  *Corrections*: a restart zeroes them.

`check_baseline.py` detects the regime from live metrics and only applies the
active-regime expectations when something is actually running, so an idle
dashboard does not produce false failures.

**Active** means `sum(sr_active_runs) > 0` or a non-zero run-start rate. The
active-regime numbers below come from the observed burst of 6 runs.

---

## Where the numbers come from

Two independent feeds, and they fail differently — worth knowing before
diagnosing a blank panel:

| Feed | Job | Path | Failure mode |
|---|---|---|---|
| SR runs + HTTP | `sr_lab_pushgateway` | backend → pushgateway `:9091` (push, 10s) → Prometheus scrape | values **freeze** at their last push, or **reset to zero** if the backend restarted; nothing goes blank |
| F3!L cognition | `sr_lab_memory_api` | Prometheus scrapes the bridge on `:4300` | series **disappear**; panels go blank |

The push model is deliberate — SR runs are batch jobs shorter than a scrape
interval — but it has a consequence that dominates the top row of this
dashboard, described under *Instances reporting*.

---

## Panel-by-panel baseline

### Row 1 — run counters

**Active runs** — `sum(sr_active_runs)`
Baseline **0**, green. During a burst it equals the number of runs you submitted
concurrently (measured: 1). A value stuck above zero while the start-rate is
flat means a run thread died without decrementing the gauge — check the backend
log for a joblib worker SIGSEGV (the `shm_size: 1gb` line in `docker-compose.yml`
exists because of exactly that failure).

**Runs started / Runs finished / Runs failed**
Baseline **6 / 6 / 0**. The number that matters is not any one of them but the
invariant between them:

```
started − finished − failed − active == 0     (when idle)
```

A positive residue is a lost run. `check_baseline.py` asserts this as
`runs-conserved`, and dashboard version 5 adds a **Lost runs** panel for it.
Caveat from v1.1: the residue is only trustworthy within one process lifetime —
a restart zeroes it and hides the loss. Confirm against `GET /api/runs`.

**Equations discovered** — `sum(sr_equations_discovered_total)`
The absolute number is meaningless (it only grows, and resets on restart); the
*ratio* to finished runs is the signal. It is capped by `top_n` = **10** in the
default config, with sympy simplification collapsing duplicates below that —
measured 7.0 before the sweep and 10.0 after. Near zero while runs finish means
the search is returning nothing. The check allows 5–12 per run.

**Instances reporting** — `sum(sr_build_info)`
Baseline should be **1** — one live backend container. **It read 2 at capture,
and that is a genuine defect.**

The pushgateway keys each group on `{job, instance}`, and `instance` defaults to
the container hostname. A rebuilt backend gets a new hostname and leaves its old
group behind **permanently**. At capture, group `b02134b367cf` had not pushed for
2h17m while the live backend was `3537b1806e73`. Consequences:

- *Runs started*, *Runs finished*, *Equations discovered* are sums over a live
  container **and a dead one** — they are all-time-across-all-containers-ever,
  not current-deployment.
- *Best held-out R²* can show two bars with the same dataset name and different
  values (an earlier ghost held `ideal_gas = 0.6697` alongside the live 0.9555).

Two fixes, either is fine:

```bash
curl -X DELETE http://localhost:9091/metrics/job/sr_lab_backend/instance/b02134b367cf
```

or, permanently, set `METRICS_INSTANCE=backend` on the backend container so
rebuilds reuse a single stable group (`metrics.py` already reads that env var).

### Row 2 — rates and durations

**Run start rate (per min)** — `sum by (dataset) (rate(sr_runs_started_total[5m])) * 60`
Baseline **0**, flat, one line per dataset that has ever run (lines persist at
zero; they do not disappear). Measured peak during the burst: **0.69/min**.

Read this panel knowing its shape: because it is a 5-minute rate, **a single run
appears as a ~0.2/min bump five minutes wide**, not a spike. Two runs a minute
apart merge into one plateau. Do not try to count runs off this graph — use
*Runs started* for that.

**Run duration (seconds)** — p95 and p50 over `sr_run_duration_seconds_bucket[10m]`
Baseline while idle: **No data** (correct — see *The two regimes*).
Active: see the table under *Corrections* — anywhere from 10s to minutes
depending on dataset and concurrency. The histogram buckets are
`1, 5, 10, 30, 60, 120, 300, 600, 1200`, so a p50 of 3s means most runs land in
the `[1,5)` bucket — do not read the quantiles as more precise than the buckets.

Red flag: p95 pinned near 1200 = runaway search (population/generations
misconfigured, or a dataset the engine cannot fit).

### Row 3 — quality and API

**Best held-out R² (last run per dataset)** — `sr_last_best_test_r2`
Baseline: **one bar per dataset, all in the green band (≥0.9)**. Measured
`pendulum 0.9990`, `ideal_gas 0.9555`. Every bundled dataset is generated from a
known closed-form law with 1% noise, so a bar below 0.9 is a real regression in
the engine or its config, not dataset difficulty. The earlier ghost value of
**0.6697 for ideal_gas** is exactly the shape this panel exists to catch.

Two bars with the *same* name = ghost instance, not two datasets.

**HTTP request rate by path** — baseline **0** flat, five paths present
(`/`, `/api/datasets`, `/api/runs`, `/api/runs/{id}`, `/api/runs/{id}/equations`).
Measured peak **0.337 req/s** total. Cumulative counts at capture: datasets 73,
runs 47, run-detail 7, equations 1, plus one `404` on `/`.
Sustained traffic with no active runs = a browser tab polling a finished run.

**HTTP p95 latency by path** — baseline **No data** while idle; **27–67 ms**
during the burst. The one hard expectation: `POST /api/runs` must stay
sub-second. The engine runs on a background thread and the API polls for status,
so a multi-second p95 on that path means the run went synchronous.

### Row 4 — memory writes

**Verified laws remembered** — `sum(sr_memories_written_total)`
Baseline **1** against 6 finished runs. This counter increments *only* when a run
beats the stored best for its dataset, so the expected shape is a step function
that plateaus — it should grow far more slowly than run count. If it starts
tracking runs 1:1, the improve-only guard has broken. Bound: it can never exceed
finished runs.

**Laws written by dataset (cumulative)** — step lines, one per dataset that has
ever written. Baseline: a single flat `pendulum` line at 1. Flat is normal.

### Row 5 — F3!L cognition — **pipeline verified, baseline still not established**

Two separate questions, and they have different answers.

**Is the instrumentation correct?** Yes — verified end to end on 2026-08-15.
The trace picked up all five MCP tools and the bridge path, the bridge
aggregated them, Prometheus scraped them, and the panels moved:

| Panel | Reading | From |
|---|---|---|
| F3!L sessions | 1 | one `recall` on the `identity` context = a session boot |
| Cognitive events | 7 | trace line count |
| Tool calls by tool | recall 3, remember 1, reason 1, reflect 1, assess_confidence 1 | all five tools exercised |
| Since F3!L last active | a real number, no longer `idle` | `f3il_last_activity_timestamp_seconds` |
| Memories in store | 16 (was 13) | live `memory.db` row count |

Both writers work and both resolve to the same file. `mcp-server.js` uses
`ActivityTracer` → `dirname(dbPath)/f3il-activity.jsonl`; `memory-http.js`
appends from `/remember` and `/recall` tagged `src:"bridge"`. Claude Desktop
mounts `C:\Users\Tom\Documents\GitHub\AGI:/data` and the bridge container mounts
the same host directory with `F3IL_DB_PATH=/data/memory.db`, so writer and
reader agree on the path. That was the open question in v1.0 and it is now
closed: **the graph would move if you tripped it.**

**Is this a baseline?** No — every event in it is test or machine traffic:

| Source | Events | What it is |
|---|---|---|
| Smoke test, 01:44:32, **58 ms span** | 6 | one call per tool, context `demo` |
| SR-lab backend via the bridge, 01:53–01:57 | 3 | `recall` on `sr-lab` — the engine checking for a prior best |
| **Organic F3!L cognition** | **0** | — |

So `reason 1`, `reflect 1`, `assess_confidence 1` and `remember 1` are *entirely*
the smoke test; `recall 5` is 2 test + 3 automated lookups; `F3!L sessions 1` is
the test's `recall` on the `identity` context being read as a boot. The SR-lab
recalls are real but they are plumbing, not thinking.

So the numbers above are **proof of correctness, not a target**. Do not treat
them as expected values; a real baseline needs organic traffic, and one
scripted burst is not that. The floor values (`0` everywhere except *Memories in
store*) remain the honest reading for an unexercised system, and **`0` is the
correct baseline as long as the write path is sound — which it now demonstrably
is.**

**Gap worth closing:** the trace records `src` (bridge vs. Desktop) but the
Prometheus exposition throws it away — `f3il_tool_calls_total` carries only a
`tool` label. The dashboard therefore cannot distinguish a smoke test from real
cognition, or SR-lab's automated recalls from F3!L's own reasoning. Adding `src`
as a label in `memory-http.js` would let the panels separate them, and would
stop a test run from quietly becoming the baseline.

**`f3il_tool_errors_total` cannot detect a failed memory write.** It reads 0
above, and structurally it always will for the two tools that matter. The
tracer records `ok: true` after the handler returns without throwing
(`mcp-server.js:239`) — but `handleRemember` and `handleRecall` each carry their
own inner try/catch that **returns the error as a normal result** (`"❌ Failed to
store memory: ..."`) rather than rethrowing:

| Handler | Inner try/catch | Failure reaches the tracer? |
|---|---|---|
| `handleRemember` | yes | **no — traced `ok: true`** |
| `handleRecall` | yes | **no — traced `ok: true`** |
| `handleReflect`, `handleReason`, `handleAssessConfidence` | no | yes — traced `ok: false` |

This is consistent with the observed anomaly: the smoke test's `remember`
(`ctx: demo`, `ok: true`) produced **no row** in `memory.db` — nothing exists
after 01:35:45, and the call targeted the real database (the MCP tracer derives
its path from `dirname(dbPath)` with no override, and the trace landed in the
real `AGI\` directory). A sufficient mechanism with matching evidence; not proof
that this particular call failed.

Fix: rethrow from the inner catch, or have the tracer inspect the returned
payload, so a swallowed storage failure stops counting as a successful call.

---

## Known artifacts (do not chase these)

1. ~~**Phantom second value on three stat panels.**~~ *F3!L sessions*,
   *Cognitive events*, and *Memories in store* used `metric or vector(0)`. When
   the metric exists, PromQL returns **both** series — `vector(0)` carries an
   empty label set that never matches the scraped `{instance, job}` labels — so
   the panel rendered two numbers (e.g. `13` and `0`). **Fixed in dashboard
   version 5** by wrapping the left side in `sum()`.

2. **Ghost pushgateway groups** inflate every cumulative stat. The duplicate-R²
   half is **fixed in version 5** (`max by (dataset)`); the counter inflation is
   a data problem, not a dashboard one. See *Instances reporting*.

3. **Counter resets on backend restart** — see *Corrections*. No dashboard-side
   fix exists.

4. **NaN → "No data"** on both histogram panels while idle is correct behaviour.

5. **"idle" on *Since F3!L last active*** is correct behaviour: the query filters
   `f3il_last_activity_timestamp_seconds > 0`, returning nothing until there has
   been activity, and the panel's `noValue` text renders as `idle`.

## Dashboard changes applied (version 4 → 5)

Deployed to the live provisioning path and mirrored in `dashboards/sr-lab.json`:

| Change | Panel(s) |
|---|---|
| `metric or vector(0)` → `sum(metric) or vector(0)` | F3!L sessions, Cognitive events, Memories in store |
| `sr_last_best_test_r2` → `max by (dataset) (...)` — collapses ghost instances into one bar per dataset | Best held-out R² |
| `f3il_tool_calls_total` → `sum by (tool) (...)` — same hardening | Tool calls by tool |
| **New:** *Lost runs* — `started − finished − active`, red above 0 | (new, next to Verified laws remembered) |
| **New:** *F3!L tool errors* — `sum(f3il_tool_errors_total)`, scraped all along but never plotted | (new, left of the tool-calls timeseries) |

Grid layout was re-flowed to fit the two new panels (22 panels, no overlaps,
verified programmatically). Nothing else was touched, and no panel was removed.

---

## Provenance — the dashboard is not in this repo

The live dashboard is provisioned from **outside the AGI repo**:

```
<a separate "monitoring" project on this machine, outside the AGI repo>/
  docker-compose.yml                                  # grafana + prometheus, project "monitoring"
  prometheus.yml                                      # scrapes host.docker.internal:9091 and :4300
  grafana/provisioning/dashboards/sr-lab.json         # <- the dashboard
  grafana/provisioning/datasources/prometheus.yml
```

> The exact host path is intentionally omitted — this repo is public and the
> monitoring stack lives in a separate, private project directory.

`dashboards/sr-lab.json` here is the source of truth for dashboard `version: 5`;
it was edited here and copied out to the provisioning path, where Grafana's
file provisioner picked it up (it polls every 10s). If you edit the dashboard in
Grafana's UI instead, the provisioner allows it (`allowUiUpdates: true`) and this
copy will drift — copy it back and bump `baseline_version`.

Related: the backend instrumentation this dashboard reads (`sr-lab/backend/app/metrics.py`,
`memory-http.js`, `src/telemetry/`) is currently **uncommitted**, living in the
`claude/local-grafana-credentials-6a2596` worktree. The metric names asserted
here are stable only once that lands.

Grafana admin credentials are set from `GF_SECURITY_ADMIN_USER/PASSWORD=admin`
in the monitoring compose file, but the running instance rejects them — the
password was changed after first boot and persists in the `monitoring_grafana-data`
volume. The baseline tooling does not need Grafana: it talks to Prometheus
directly.

---

## Re-establishing the baseline

After a change to the engine, the datasets, or the dashboard:

```bash
# 1. capture what the graphs look like now
python sr-lab/observability/check_baseline.py --capture sr-lab/observability/snapshots/$(date +%Y-%m-%d)-idle.json

# 2. drive some runs, then capture the active picture too
python sr-lab/observability/check_baseline.py --capture sr-lab/observability/snapshots/$(date +%Y-%m-%d)-active.json
```

Then update the measured numbers in `baseline.json` and the panel sections here,
and bump `meta.baseline_version`. Snapshots are kept so "it used to look like
this" is a diff rather than a memory.

Two snapshots exist: `2026-08-15-idle.json` and `2026-08-15-active.json`
(captured live with a run in flight).

**What v1.1 still does not have:** a clean active-regime capture. The sweep that
produced the active snapshot also crashed the backend twice, so the run counters
it recorded are a mix of a live instance that had been zeroed and a dead one that
was frozen. The duration figures are sound (the histogram observations are real);
the cumulative figures in that snapshot are not a target to aim at. Re-capture
once the concurrency crash is fixed and the ghost group is cleared — that is the
one thing standing between this and a baseline you could alert on.

The F3!L row also remains uncalibrated, for the separate reason given above:
its activity trace has never been written to.
