"""Optional Prometheus metrics — push model, fail-safe by design.

The Symbolic Regression Lab pushes metrics to a Prometheus **Pushgateway**
(SR runs are batch jobs; the pushgateway is exactly the tool for jobs whose
lifetime is shorter than a scrape interval). Prometheus then scrapes the
pushgateway on its own schedule.

Hard rule: monitoring must never take the app down. Every dependency here is
optional and every network call is swallowed:

  * If `prometheus-client` is not installed, this module degrades to no-ops.
  * If the pushgateway is unreachable, pushes fail silently and the app keeps
    serving. Nothing in the request/run path ever blocks on or raises from a
    push — instrumentation only mutates in-process counters; a background
    daemon thread does the network I/O.

Config (env):
  PUSHGATEWAY_URL   default http://pushgateway:9091 (empty string disables)
  PUSH_INTERVAL_S   background push cadence, seconds (default 10)
  METRICS_JOB       pushgateway job label (default sr_lab_backend)
  METRICS_INSTANCE  instance label (default HOSTNAME or "backend")
"""

import logging
import os
import socket
import threading
import time

log = logging.getLogger("sr_lab.metrics")

# --- optional dependency -------------------------------------------------
try:
    from prometheus_client import (
        CollectorRegistry,
        Counter,
        Gauge,
        Histogram,
        push_to_gateway,
    )
    _HAVE_CLIENT = True
except Exception:  # ImportError, or any partial-install breakage
    _HAVE_CLIENT = False

_GATEWAY = os.getenv("PUSHGATEWAY_URL", "http://pushgateway:9091").strip()
_JOB = os.getenv("METRICS_JOB", "sr_lab_backend")
_INSTANCE = os.getenv("METRICS_INSTANCE") or os.getenv("HOSTNAME") or socket.gethostname() or "backend"
try:
    _INTERVAL = max(2.0, float(os.getenv("PUSH_INTERVAL_S", "10")))
except ValueError:
    _INTERVAL = 10.0

ENABLED = _HAVE_CLIENT and bool(_GATEWAY)

# --- metric definitions --------------------------------------------------
# Guarded so an import of this module never fails even if prometheus_client is
# half-present. When disabled, every public function below is a no-op.
if ENABLED:
    registry = CollectorRegistry()

    RUNS_STARTED = Counter(
        "sr_runs_started_total", "Symbolic-regression runs started",
        ["dataset"], registry=registry,
    )
    RUNS_FINISHED = Counter(
        "sr_runs_finished_total", "Runs that reached a terminal state",
        ["dataset", "status"], registry=registry,  # status: finished|failed
    )
    RUN_DURATION = Histogram(
        "sr_run_duration_seconds", "Wall-clock duration of a run",
        ["dataset"],
        buckets=(1, 5, 10, 30, 60, 120, 300, 600, 1200),
        registry=registry,
    )
    ACTIVE_RUNS = Gauge(
        "sr_active_runs", "Runs currently executing", registry=registry,
    )
    BEST_TEST_R2 = Gauge(
        "sr_last_best_test_r2", "Best held-out R^2 from the most recent run",
        ["dataset"], registry=registry,
    )
    EQUATIONS_FOUND = Counter(
        "sr_equations_discovered_total", "Ranked equations persisted",
        ["dataset"], registry=registry,
    )
    MEMORIES_WRITTEN = Counter(
        "sr_memories_written_total",
        "Verified laws written to F3IL memory (a new/improved best for a dataset)",
        ["dataset"], registry=registry,
    )
    HTTP_REQUESTS = Counter(
        "sr_http_requests_total", "HTTP requests handled",
        ["method", "path", "status"], registry=registry,
    )
    HTTP_LATENCY = Histogram(
        "sr_http_request_seconds", "HTTP request latency",
        ["method", "path"], registry=registry,
    )
    BUILD_INFO = Gauge(
        "sr_build_info", "Static build/info metric (always 1)",
        ["instance"], registry=registry,
    )
    BUILD_INFO.labels(instance=_INSTANCE).set(1)


def _push():
    """Push the whole registry to the gateway. Never raises."""
    if not ENABLED:
        return
    try:
        push_to_gateway(
            _GATEWAY, job=_JOB,
            grouping_key={"instance": _INSTANCE},
            registry=registry, timeout=3,
        )
    except Exception as exc:  # unreachable gateway, DNS, timeout, anything
        log.debug("metrics push skipped: %s", exc)


def _pusher_loop():
    while True:
        time.sleep(_INTERVAL)
        _push()


def init():
    """Start the background pusher. Safe to call once at app startup."""
    if not ENABLED:
        log.info(
            "metrics disabled (client=%s gateway=%r) — running without monitoring",
            _HAVE_CLIENT, _GATEWAY,
        )
        return
    t = threading.Thread(target=_pusher_loop, name="metrics-pusher", daemon=True)
    t.start()
    log.info("metrics push enabled → %s (job=%s instance=%s)", _GATEWAY, _JOB, _INSTANCE)
    _push()  # publish build_info immediately so the target shows up fast


def push_now():
    """Fire an out-of-band push (e.g. right after a run finishes)."""
    if not ENABLED:
        return
    threading.Thread(target=_push, name="metrics-push-now", daemon=True).start()


# --- instrumentation entry points (all no-op when disabled) --------------
def run_started(dataset):
    if not ENABLED:
        return
    try:
        RUNS_STARTED.labels(dataset=dataset).inc()
        ACTIVE_RUNS.inc()
        push_now()
    except Exception:
        pass


def run_finished(dataset, duration_s, best_test_r2, n_equations):
    if not ENABLED:
        return
    try:
        RUNS_FINISHED.labels(dataset=dataset, status="finished").inc()
        RUN_DURATION.labels(dataset=dataset).observe(max(0.0, duration_s))
        ACTIVE_RUNS.dec()
        if best_test_r2 is not None:
            BEST_TEST_R2.labels(dataset=dataset).set(best_test_r2)
        if n_equations:
            EQUATIONS_FOUND.labels(dataset=dataset).inc(n_equations)
        push_now()
    except Exception:
        pass


def run_failed(dataset, duration_s):
    if not ENABLED:
        return
    try:
        RUNS_FINISHED.labels(dataset=dataset, status="failed").inc()
        RUN_DURATION.labels(dataset=dataset).observe(max(0.0, duration_s))
        ACTIVE_RUNS.dec()
        push_now()
    except Exception:
        pass


def memory_written(dataset):
    if not ENABLED:
        return
    try:
        MEMORIES_WRITTEN.labels(dataset=dataset).inc()
        push_now()
    except Exception:
        pass


def http_observed(method, path, status, seconds):
    if not ENABLED:
        return
    try:
        HTTP_REQUESTS.labels(method=method, path=path, status=str(status)).inc()
        HTTP_LATENCY.labels(method=method, path=path).observe(max(0.0, seconds))
    except Exception:
        pass
