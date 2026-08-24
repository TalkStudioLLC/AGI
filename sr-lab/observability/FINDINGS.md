# SR-Lab dashboard — baseline exercise, closeout report

**Date:** 2026-08-15
**Scope:** Grafana dashboard `sr-lab-agi`, its Prometheus feeds, and the code
that emits them.
**Status:** closed. Baseline established at v1.2; eight defects found, two fixed.
One of them — defect 8 — currently has the F3!L MCP integration down.

> **Not a pre-registered experiment.** This started as "we have no baseline for
> these graphs" and became an incident report. Per `TRUTH-PROTOCOL.md` rule 1
> ("bets before looks"), nothing here may be presented as a confirmed
> hypothesis — there were no predictions written in advance. Every claim below
> is instead backed by a stated artifact: a metric value, a log line, a file
> timestamp, or a source location. Read it as evidence, not as adjudication.

---

## What we set out to do

Write down what each panel of the dashboard *should* read, so that looking at it
is a comparison rather than a guess.

## What we ended up finding

The baseline itself was the smaller half of the result. Establishing it required
driving the system, and driving the system exposed a crash, two wrong
assumptions in the first draft of the baseline, and three instrumentation
defects that make specific panels untrustworthy.

**The through-line: five of the dashboard's numbers assert that something
happened when the evidence says otherwise.** A counter that counts attempts as
successes; a crash that erases its own evidence; an error metric that cannot see
the errors it exists for; a test run that looks identical to real cognition. The
dashboard was not lying about anything it measured — it was measuring things
that were not what their titles claimed.

---

## Defect register

| # | Defect | Severity | Status |
|---|---|---|---|
| 1 | Concurrent runs segfault the backend and kill the process | backend bug | **open** |
| 2 | Cumulative counters reset to zero on backend restart | data integrity | **open** (architectural) |
| 3 | `f3il_tool_errors_total` cannot detect a failed memory write | instrumentation | **open** |
| 4 | "Verified laws remembered" counts attempts, not writes | instrumentation | **open** (latent) |
| 5 | `src` label dropped — test traffic indistinguishable from cognition | instrumentation | **open** |
| 6 | Phantom second value on three stat panels | dashboard | **fixed** (v5) |
| 7 | Duplicate R² bars from ghost pushgateway instances | dashboard | **fixed** (v5) |
| 8 | Memory MCP server broken by image rebuild (glibc mismatch) | build | **open — integration down** |

### 8. The MCP integration is down — glibc mismatch from the rebuild

The `agi-memory-server` image rebuilt at `2026-08-15T01:52:24Z` no longer starts.
Claude Desktop spawns it per session over stdio, so the F3!L memory tools
disconnect immediately. Reproduced with a direct MCP `initialize` handshake:

```
Error: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
  (required by /app/node_modules/sqlite3/build/Release/node_sqlite3.node)
  code: 'ERR_DLOPEN_FAILED'
Node.js v22.23.2
```

`Dockerfile.memory` builds on `node:22-slim` — Debian 12 bookworm, **glibc
2.36**. The `sqlite3` prebuilt native binding that `npm install` fetched
requires **glibc 2.38**. Nothing in the Dockerfile changed; `npm install` is
unpinned, so a newer upstream prebuild (targeting a newer Debian) was selected
on this rebuild and the runtime base can no longer load it.

The irony is that the Dockerfile already installs `python3 make g++` as
"belt-and-suspenders" for exactly this case — but npm prefers a prebuilt binary
whenever one nominally matches the platform, and glibc version is not part of
that match.

**This is the same class as the 01:52 tracer gap in defect 5** — an image
rebuilt underneath a running integration, changing behaviour with no signal at
the dashboard. It is also why the F3!L row's zeros needed interpreting rather
than trusting.

**Operational note — the last working build is inside a running container.**
`sr-lab-memory-api` still serves `/metrics` because it pins image
`sha256:fcaadcd0…`, while the tag now points at `sha256:fb81940b…`. That image
is no longer in the local image list, so the container's filesystem is the only
surviving copy: recreating it (`docker compose up`, `down`, `rm`) loses the
bridge too. `docker commit sr-lab-memory-api agi-memory-server:lastgood` would
capture it before touching anything.

**Fix options, cheapest first:** force a source build in the Dockerfile
(`ENV npm_config_build_from_source=true` before `npm install`, or
`npm install --build-from-source` — the toolchain is already in the image);
pin `sqlite3` to a version whose prebuilds target glibc 2.36; or move the base
to an image with glibc ≥ 2.38. Not attempted.

### 1. Concurrent runs crash the backend

Three `Fatal Python error: Segmentation fault` events, two container restarts,
produced while driving load.

| Trigger | Result |
|---|---|
| one run at `population_size 8000 × generations 80` | SIGSEGV |
| **two concurrent runs at default config** | SIGSEGV |
| one run at a time, default config | stable (7 runs) |

All three faulted at the same site:

```
gplearn/_program.py:423  get_all_indices
gplearn/genetic.py:142   _parallel_evolve
joblib/parallel.py:607   __call__
joblib/externals/loky/process_executor.py:291
```

A dead worker should not be fatal. It becomes fatal because loky's cleanup
fails on its own — `python:3.12-slim` ships neither `pgrep` nor `psutil`:

```
FileNotFoundError: [Errno 2] No such file or directory: 'pgrep'
  -> AttributeError: 'Popen' object has no attribute 'kill'
```

The `ExecutorManagerThread` then dies and takes uvicorn with it.
`restart: unless-stopped` brings the API straight back, so the only visible
symptom is that the graphs renumber.

**Collateral:** runs 20, 24, 25 are orphaned in DuckDB as `status='running'`
with no API to clear them. (Run 3 was already in that state beforehand.)

**Options:** serialise runs behind a queue — one at a time is the only pattern
proven stable; pin `n_jobs=1` for the fit; or add `psutil` + `procps` to the
backend image so a dead worker can be reaped without killing the server.

### 2. Counters reset on restart

Every cumulative panel resets to zero when the backend **process** restarts, not
merely when the container is replaced. A fresh process starts with an empty
registry, and `push_to_gateway` issues a **PUT** that replaces the whole
`{job,instance}` group — so the first push after a restart erases what the
previous process accumulated.

Observed: after two restarts the live instance had *no run counters at all*, and
the dashboard's top row read `Runs started 4` sourced **entirely from a dead
container's frozen group** while real runs were completing and counting from
zero.

**The crash erases its own evidence.** The *Lost runs* invariant read 0 while
three runs were genuinely lost, because the residue was zeroed along with
everything else. Cross-check `GET /api/runs` for rows stuck in `running`; the
metrics alone will not tell you.

No dashboard-side fix exists. The real fix is architectural: the backend is a
long-lived service, not a batch job, so Prometheus could scrape it directly and
the pushgateway could go away.

### 3. The error metric cannot see the errors

`f3il_tool_errors_total` counts trace entries with `ok: false`. The tracer sets
`ok: true` whenever the handler returns without throwing (`mcp-server.js:239`) —
but two handlers never throw:

| Handler | Inner try/catch | Failure reaches the tracer? |
|---|---|---|
| `handleRemember` | yes | **no — traced `ok: true`** |
| `handleRecall` | yes | **no — traced `ok: true`** |
| `handleReflect`, `handleReason`, `handleAssessConfidence` | no | yes |

Both wrap their body and **return** the error as a normal result
(`"❌ Failed to store memory: ..."`). So a failed memory write is indistinguishable
from a successful one, in the trace and in the metric.

Consistent with the observed anomaly: the smoke test's `remember`
(`ctx: demo`, `ok: true`) produced **no row** in `memory.db` — nothing exists
after 01:35:45 — and it was addressing the real database, since the MCP tracer
derives its path from `dirname(dbPath)` with no override and the trace landed in
the real `AGI\` directory. Sufficient mechanism, matching evidence; not proof
that this particular call failed.

### 4. "Verified laws remembered" counts attempts

`engine.py` calls `memory_client.remember()` — which spawns a daemon thread and
returns immediately — then increments `metrics.memory_written()` unconditionally
on the next line. `_post` swallows every failure, and `remember()` returns early
when `MEMORY_API_URL` is empty. The counter would keep climbing with the memory
bridge switched off entirely.

**Latent, not observed.** The one law recorded did genuinely land — `memory.db`
holds it, tagged `sr-lab,law,pendulum`, written `2026-08-14T22:21:51.554Z`:

> Discovered law for Simple Pendulum Period: `2*sqrt(Abs(L))`
> (held-out R²=0.9990, complexity 5). First verified law for this dataset.
> Known law: `T = 2*pi*sqrt(L/g) ≈ 2.006*sqrt(L)`.

The coefficient is right to ~0.3% on data the search never saw, and the mass
distractor column was correctly ignored. `Abs()` is a gplearn artifact — its
protected `sqrt` wraps the argument, a no-op here since L is strictly positive.

### 5. Test traffic is indistinguishable from cognition

The activity trace records `src` (bridge vs. Desktop MCP). `memory-http.js`
drops it when building the Prometheus exposition — `f3il_tool_calls_total`
carries only a `tool` label. This is the mechanism by which a smoke test
silently becomes a baseline, and it is exactly what happened: at closeout the
F3!L row read `sessions 1, events 9, recall 5, remember 1, reason 1, reflect 1,
assess_confidence 1`, which decomposes as

| Source | Events |
|---|---|
| Smoke test (01:44:32, **58 ms span**, context `demo`) | 6 |
| SR-lab backend via bridge (01:53–01:57), `recall` on `sr-lab` | 3 |
| **Organic F3!L cognition** | **0** |

Adding `src` as a label would let the panels separate them.

---

## Corrections to baseline v1.0

Two claims in the first draft were wrong, both exposed by the crash:

1. **"The counters are monotone and never decay."** False — see defect 2.
2. **"p50 3s, p95 ≤10s."** Far too narrow; that came from a favourable window.

| Condition | Duration |
|---|---|
| `pendulum`, sequential, default config | 10.8 s |
| two concurrent default-config runs | 33 s, 34 s |
| sweep window p50 / p95 | 45 s / 58.5 s |
| `projectile`, alone, default config | **6 m 39 s** (finished, test R² 0.9899) |

Duration is strongly dataset- and concurrency-dependent — `projectile`
(`R = v²·sin(2θ)/9.81`) searches a much harder space than `pendulum` at the same
settings. The v1.2 band is deliberately wide; the signal is a p95 pinned near
the 1200 s top bucket, not a number in the middle.

Also corrected: equations per run is capped by `top_n` (**10**), not the 7.0 that
six historical runs happened to average.

---

## What was fixed

Dashboard **version 4 → 5**, authored in `dashboards/sr-lab.json` and deployed to
the Grafana provisioning path (repo and live copies verified identical):

| Change | Panel(s) |
|---|---|
| `metric or vector(0)` → `sum(metric) or vector(0)` — killed a phantom second value | F3!L sessions, Cognitive events, Memories in store |
| `sr_last_best_test_r2` → `max by (dataset)` — collapses ghost instances to one bar | Best held-out R² |
| `f3il_tool_calls_total` → `sum by (tool)` | Tool calls by tool |
| **New:** *Lost runs* — `started − finished − active`, red above 0 | — |
| **New:** *F3!L tool errors* — scraped all along, never plotted | — |

The phantom-series bug: `metric or vector(0)` returns **both** series when the
metric exists, because `vector(0)` carries an empty label set that never matches
the scraped `{instance, job}` labels. `sum(...) or vector(0)` does not.

Both fixes confirmed working on the live dashboard: single values in the stat
panels, and five R² bars with no duplicates despite four ghost instances.

---

## What the baseline is now

`BASELINE.md` (prose), `baseline.json` (18 checks, 9 documented artifacts), and
`check_baseline.py`, which evaluates every panel's query against a live
Prometheus and reports pass/warn/fail. It distinguishes idle from active, so an
idle dashboard — flat zeros, "No data" on both histogram panels, `idle` on
*Since F3!L last active* — does not read as broken.

```bash
python sr-lab/observability/check_baseline.py
```

Three snapshots are kept in `snapshots/` so "it used to look like this" is a
diff rather than a memory.

**What it is not:** an alertable baseline. The active-regime numbers were
captured from a system that crashed twice mid-capture and that other sessions
were concurrently driving (ghost instances went 2 → 4 during the exercise). The
duration figures are sound — those histogram observations are real. The
cumulative figures are not a target to aim at.

---

## Honest accounting

- I crashed the backend three times driving load for this baseline.
- Three run rows (20, 24, 25) are orphaned as a result, with no API to clear them.
- The `sr_*` counters were reset by those restarts; the surviving history sits in
  a **dead** instance group, so deleting the ghost right now would blank the top
  row rather than clean it.
- No fake data was injected anywhere. The SR runs were real computation on the
  bundled datasets; the F3!L row was left strictly alone — its non-zero values
  were already there when the exercise began.

---

## Open follow-ups

0. **Restore the memory MCP server** — defect 8. Blocks the F3!L integration
   entirely, and blocks any organic-traffic baseline for that row. Capture the
   running container first (`docker commit`), since it holds the last working
   build.
1. Serialise SR runs (or pin `n_jobs=1`, or add `psutil`/`procps`) — defect 1.
2. Scrape the backend directly instead of pushing — defect 2.
3. Rethrow from `handleRemember` / `handleRecall` inner catches — defect 3.
4. Increment `sr_memories_written_total` only on a confirmed write — defect 4.
5. Add a `src` label to the F3!L metrics — defect 5.
6. Clear the orphaned run rows, then the ghost pushgateway groups (in that order).
7. Re-capture the active baseline once 1 and 2 are done.

The F3!L row stays uncalibrated until organic traffic exists. **`0` is the
correct reading for an unexercised system** — but note that "0 because nothing
happened" and "0 because the tracer was not in the running image yet" are
different zeros, and until the `agi-memory-server` image was rebuilt at
`2026-08-15T01:52:24Z` it was the second kind. Every memory in the store
predates every trace entry, which is how that was caught.
