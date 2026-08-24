#!/usr/bin/env python3
"""Check the live SR-Lab dashboard against its recorded baseline.

The Grafana dashboard (uid `sr-lab-agi`) is a picture; this script is the
assertion behind the picture. It evaluates each panel's PromQL against a live
Prometheus and compares the result to `baseline.json`, so "do the graphs look
right?" becomes a yes/no with a reason instead of a squint.

Usage
-----
    python check_baseline.py                        # check against baseline.json
    python check_baseline.py --prom http://host:9090
    python check_baseline.py --capture snapshots/foo.json   # also save a snapshot
    python check_baseline.py --json                 # machine-readable result

Regime
------
Several expectations only hold when nothing is running (idle) or only when
something is (active). The regime is detected from the live metrics, per
`baseline.json -> regime.active_if_any`, and checks whose `when` does not match
are skipped rather than failed.

Exit codes: 0 = no FAILs (warnings allowed), 1 = at least one FAIL,
2 = could not reach Prometheus.

Stdlib only — no dependency on the sr-lab backend venv.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_BASELINE = os.path.join(HERE, "baseline.json")


# --------------------------------------------------------------------------
# Prometheus access
# --------------------------------------------------------------------------
class PromError(RuntimeError):
    pass


def prom_query(base_url: str, expr: str, timeout: float = 15.0):
    """Run an instant query. Returns a list of (labels, float) pairs.

    A scalar result (e.g. `time()`) is returned as a single ({}, value) pair so
    callers never have to branch on result type.
    """
    url = base_url.rstrip("/") + "/api/v1/query?" + urllib.parse.urlencode({"query": expr})
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            payload = json.load(resp)
    except urllib.error.URLError as exc:
        raise PromError(f"cannot reach Prometheus at {base_url}: {exc}") from exc

    if payload.get("status") != "success":
        raise PromError(f"query failed: {expr!r}: {payload.get('error', payload)}")

    data = payload["data"]
    if data["resultType"] == "scalar":
        return [({}, float(data["result"][1]))]

    out = []
    for series in data["result"]:
        labels = {k: v for k, v in series["metric"].items() if k != "__name__"}
        out.append((labels, float(series["value"][1])))
    return out


# --------------------------------------------------------------------------
# Evaluation
# --------------------------------------------------------------------------
PASS, WARN, FAIL, SKIP = "PASS", "WARN", "FAIL", "SKIP"


def detect_regime(base_url: str, baseline: dict) -> str:
    """'active' if any of the regime probes is true right now, else 'idle'."""
    for probe in baseline.get("regime", {}).get("active_if_any", []):
        try:
            if prom_query(base_url, probe):
                return "active"
        except PromError:
            continue
    return "idle"


def evaluate(check: dict, samples: list) -> tuple[str, str]:
    """Compare one check's samples to its expectations -> (status, reason)."""
    expect = check.get("expect", {})
    severity = FAIL if expect.get("severity", "fail") == "fail" else WARN

    numeric = [(lbl, v) for lbl, v in samples if not math.isnan(v)]
    nan_count = len(samples) - len(numeric)

    if not samples:
        if expect.get("no_data_ok"):
            return PASS, "no data (allowed)"
        return severity, "no data returned"

    if nan_count and not expect.get("nan_ok"):
        return severity, f"{nan_count}/{len(samples)} sample(s) NaN"
    if nan_count and not numeric:
        return PASS, "all NaN (allowed - empty rate window)"

    n = len(samples)
    for key, ok, word in (
        ("series_eq", lambda want: n == want, "exactly"),
        ("series_min", lambda want: n >= want, "at least"),
        ("series_max", lambda want: n <= want, "at most"),
    ):
        if key in expect and not ok(expect[key]):
            return severity, f"expected {word} {expect[key]} series, got {n}"

    for labels, value in numeric:
        tag = ("{" + ",".join(f"{k}={v}" for k, v in sorted(labels.items())) + "} ") if labels else ""
        if "eq" in expect and value != expect["eq"]:
            return severity, f"{tag}{fmt(value)} != expected {fmt(expect['eq'])}"
        if "min" in expect and value < expect["min"]:
            return severity, f"{tag}{fmt(value)} below min {fmt(expect['min'])}"
        if "max" in expect and value > expect["max"]:
            return severity, f"{tag}{fmt(value)} above max {fmt(expect['max'])}"

    shown = ", ".join(fmt(v) for _, v in numeric[:4])
    if len(numeric) > 4:
        shown += f", ... ({len(numeric)} series)"
    return PASS, shown or "ok"


def fmt(v: float) -> str:
    if isinstance(v, float) and v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return f"{v:.4g}"


# --------------------------------------------------------------------------
# Snapshot
# --------------------------------------------------------------------------
def capture(base_url: str, baseline: dict, regime: str, results: list) -> dict:
    return {
        "captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prometheus": base_url,
        "regime": regime,
        "baseline_version": baseline.get("meta", {}).get("baseline_version"),
        "results": [
            {
                "id": r["id"],
                "panel": r["panel"],
                "expr": r["expr"],
                "status": r["status"],
                "reason": r["reason"],
                "samples": [{"labels": lbl, "value": None if math.isnan(v) else v} for lbl, v in r["samples"]],
            }
            for r in results
        ],
    }


# --------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prom", default=os.getenv("PROM_URL", "http://localhost:9090"),
                    help="Prometheus base URL (default: %(default)s, or $PROM_URL)")
    ap.add_argument("--baseline", default=DEFAULT_BASELINE, help="baseline JSON (default: ./baseline.json)")
    ap.add_argument("--capture", metavar="FILE", help="write a snapshot of what was observed")
    ap.add_argument("--json", action="store_true", help="emit the snapshot to stdout instead of a table")
    args = ap.parse_args()

    with open(args.baseline, encoding="utf-8") as fh:
        baseline = json.load(fh)

    try:
        regime = detect_regime(args.prom, baseline)
    except PromError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    results = []
    for check in baseline["checks"]:
        when = check.get("when", "always")
        row = {"id": check["id"], "panel": check["panel"], "expr": check["expr"], "samples": []}
        if when != "always" and when != regime:
            row.update(status=SKIP, reason=f"only checked when {when}")
            results.append(row)
            continue
        try:
            samples = prom_query(args.prom, check["expr"])
        except PromError as exc:
            row.update(status=FAIL, reason=str(exc))
            results.append(row)
            continue
        status, reason = evaluate(check, samples)
        row.update(status=status, reason=reason, samples=samples)
        results.append(row)

    snapshot = capture(args.prom, baseline, regime, results)

    if args.capture:
        os.makedirs(os.path.dirname(os.path.abspath(args.capture)), exist_ok=True)
        with open(args.capture, "w", encoding="utf-8") as fh:
            json.dump(snapshot, fh, indent=2)
            fh.write("\n")

    if args.json:
        json.dump(snapshot, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        mark = {PASS: "ok  ", WARN: "WARN", FAIL: "FAIL", SKIP: "--  "}
        # ASCII only below: Windows consoles default to cp1252 and mangle box glyphs.
        print(f"SR-Lab dashboard baseline | {args.prom} | regime: {regime.upper()}")
        print(f"baseline v{baseline['meta']['baseline_version']} "
              f"(established {baseline['meta']['established']})")
        print("-" * 96)
        width = max(len(r["id"]) for r in results)
        for r in results:
            print(f"  {mark[r['status']]}  {r['id']:<{width}}  {r['reason']}")
        print("-" * 96)
        tally = {s: sum(1 for r in results if r["status"] == s) for s in (PASS, WARN, FAIL, SKIP)}
        print(f"  {tally[PASS]} pass / {tally[WARN]} warn / {tally[FAIL]} fail / {tally[SKIP]} skipped")
        if tally[WARN] or tally[FAIL]:
            print("\n  Why a check matters: see the matching `note` in baseline.json,")
            print("  or the panel's section in BASELINE.md.")
        if args.capture:
            print(f"\n  snapshot -> {args.capture}")

    return 1 if any(r["status"] == FAIL for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
