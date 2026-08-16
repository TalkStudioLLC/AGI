"""Symbolic regression engine.

Wraps gplearn's genetic-programming SymbolicRegressor: given a dataset table
in DuckDB, it searches for closed-form equations that fit the data, scores
every candidate on a held-out test split (the verification step — we never
trust training fit), simplifies the winners with sympy, and persists ranked
results back to DuckDB.

Runs execute on a background thread; the API polls run status.
"""

import json
import threading
import time
import traceback
from datetime import datetime

import numpy as np
import sympy as sp
from gplearn.genetic import SymbolicRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from . import memory_client, metrics
from .db import dataset_table, get_conn

# Organic memory write-back policy. A run only feeds F3!L's memory when it
# produces a law that (a) clears a real held-out bar — verification, not
# training fit — and (b) beats the prior best for that dataset. Everything
# else stays silent, so memory accrues genuine advances, not a firehose.
VERIFIED_R2_BAR = 0.95
IMPROVE_EPS = 1e-4
MEMORY_CONTEXT = "sr-lab"   # kept out of F3!L's identity/agi-project recall


def _maybe_remember_law(run_id, dataset_id, rows):
    """If this run's best equation is a new verified best, remember it.

    Defensive: wrapped so a memory hiccup can never fail a completed run. The
    supersede check uses the lab's own DuckDB history (not memory recall), so
    memory only ever sees genuine improvements.
    """
    try:
        if not rows:
            return
        best = max(rows, key=lambda r: r["test_r2"])
        if best["test_r2"] < VERIFIED_R2_BAR:
            return
        with get_conn() as conn:
            prev = conn.execute(
                "SELECT MAX(e.test_r2) FROM equations e JOIN runs r ON e.run_id = r.id "
                "WHERE r.dataset_id = ? AND e.run_id != ?",
                [dataset_id, run_id],
            ).fetchone()[0]
            meta = conn.execute(
                "SELECT name, true_law FROM datasets WHERE id = ?", [dataset_id]
            ).fetchone()
        if prev is not None and best["test_r2"] <= prev + IMPROVE_EPS:
            return  # not an improvement — stay silent

        name = meta[0] if meta and meta[0] else dataset_id
        true_law = meta[1] if meta else None
        note = ("First verified law for this dataset."
                if prev is None else f"Improves prior best R²={prev:.4f}.")
        content = (
            f"Discovered law for {name}: {best['simplified']} "
            f"(held-out R²={best['test_r2']:.4f}, complexity {best['complexity']}). {note}"
        )
        if true_law:
            content += f" Known law: {true_law}."

        memory_client.remember(
            content=content,
            context=MEMORY_CONTEXT,
            type="semantic",
            emotional_weight=round(min(1.0, best["test_r2"]), 3),
            tags=f"sr-lab,law,{dataset_id}",
        )
        metrics.memory_written(dataset_id)
    except Exception:
        pass

DEFAULT_CONFIG = {
    "population_size": 2000,
    "generations": 25,
    "test_size": 0.25,
    "parsimony_coefficient": 0.001,
    "function_set": ["add", "sub", "mul", "div", "sqrt", "sin", "cos", "log", "inv"],
    "top_n": 10,
    "random_state": 0,
    # EXP-002: fit in log-log space (features and target log-transformed;
    # predictions inverted with exp() and ALWAYS scored in linear space so
    # results stay comparable across modes). Requires strictly positive data.
    "log_space": False,
    # EXP-007: chronological hold-out for time-series data. A shuffled split
    # leaks the future into training (train on Thursday, test on Wednesday);
    # with time_split the exam is strictly the LAST test_size fraction of
    # rows, in row order. Loaders must supply rows sorted by time.
    "time_split": False,
    # Parallel search workers (joblib): -1 = all cores. In containers with
    # small /dev/shm this can segfault workers; the engine auto-retries the
    # whole fit with n_jobs=1 if the parallel attempt dies.
    "n_jobs": -1,
}

# gplearn program token -> sympy constructor
_SYMPY_FUNCS = {
    "add": lambda a, b: a + b,
    "sub": lambda a, b: a - b,
    "mul": lambda a, b: a * b,
    "div": lambda a, b: a / b,           # protected div in gplearn; plain in sympy
    "sqrt": lambda a: sp.sqrt(sp.Abs(a)),
    "sin": sp.sin,
    "cos": sp.cos,
    "log": lambda a: sp.log(sp.Abs(a)),
    "inv": lambda a: 1 / a,
    "neg": lambda a: -a,
    "abs": sp.Abs,
    "max": sp.Max,
    "min": sp.Min,
}


def _program_to_sympy(program, feature_names):
    """Convert a gplearn program (prefix token list) to a sympy expression."""
    symbols = [sp.Symbol(name) for name in feature_names]

    def build(idx):
        node = program.program[idx]
        if isinstance(node, (int, np.integer)):
            return symbols[node], idx + 1
        if isinstance(node, float):
            return sp.Float(round(node, 4)), idx + 1
        fn = _SYMPY_FUNCS.get(node.name)
        args = []
        next_idx = idx + 1
        for _ in range(node.arity):
            arg, next_idx = build(next_idx)
            args.append(arg)
        return fn(*args), next_idx

    expr, _ = build(0)
    return expr


def _simplify(expr):
    try:
        simplified = sp.simplify(expr)
        # keep the shorter of the two string forms
        return simplified if len(str(simplified)) <= len(str(expr)) else expr
    except Exception:
        return expr


def load_dataset(dataset_id):
    with get_conn() as conn:
        meta = conn.execute(
            "SELECT target_col, feature_cols FROM datasets WHERE id = ?",
            [dataset_id],
        ).fetchone()
        if meta is None:
            raise ValueError(f"Unknown dataset: {dataset_id}")
        target_col, feature_cols_json = meta
        feature_cols = json.loads(feature_cols_json)
        df = conn.execute(f"SELECT * FROM {dataset_table(dataset_id)}").df()
    return df, feature_cols, target_col


def _recall_prior_laws(dataset_id):
    """Read-before-search: consult memory for laws already found on this
    dataset, so the lab builds on what it knows. Also the read half of the
    organic loop — every run leaves a recall in F3!L's activity trace.
    Fail-safe: never raises, never blocks the fit meaningfully."""
    try:
        hits = memory_client.recall(
            f"{dataset_id} discovered law", context=MEMORY_CONTEXT, limit=5
        )
        # Semantic recall can surface OTHER datasets' laws that share the
        # "Discovered law for …" phrasing. Keep only laws actually about this
        # dataset (its id is stamped into the memory's tags: "sr-lab,law,<id>").
        mine = [h for h in hits
                if dataset_id in (h.get("tags") or "")
                or dataset_id in (h.get("content") or "")]
        if mine:
            print(f"[memory] recalled {len(mine)} prior law(s) for {dataset_id}; "
                  f"best-known: {str(mine[0].get('content', ''))[:90]}")
        else:
            print(f"[memory] no prior laws for {dataset_id} "
                  f"({len(hits)} unrelated hit(s) ignored)")
    except Exception:
        pass


def _execute_run(run_id, dataset_id, config):
    started = time.monotonic()
    _recall_prior_laws(dataset_id)
    try:
        df, feature_cols, target_col = load_dataset(dataset_id)
        X = df[feature_cols].to_numpy()
        y = df[target_col].to_numpy()
        if config.get("time_split", False):
            # strictly chronological: past → train, future → exam
            cut = int(len(y) * (1 - config["test_size"]))
            X_train, X_test = X[:cut], X[cut:]
            y_train, y_test = y[:cut], y[cut:]
        else:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y,
                test_size=config["test_size"],
                random_state=config["random_state"],
            )

        log_space = bool(config.get("log_space", False))
        if log_space:
            if not (np.all(X > 0) and np.all(y > 0)):
                raise ValueError("log_space requires strictly positive features and target")
            Xf_train, Xf_test = np.log(X_train), np.log(X_test)
            yf_train = np.log(y_train)
        else:
            Xf_train, Xf_test = X_train, X_test
            yf_train = y_train

        def _make_est(n_jobs):
            return SymbolicRegressor(
                population_size=config["population_size"],
                generations=config["generations"],
                function_set=tuple(config["function_set"]),
                parsimony_coefficient=config["parsimony_coefficient"],
                const_range=(-10.0, 10.0),
                random_state=config["random_state"],
                n_jobs=n_jobs,
            )

        n_jobs = int(config.get("n_jobs", -1))
        est = _make_est(n_jobs)
        try:
            est.fit(Xf_train, yf_train)
        except Exception:
            # Parallel workers can die (SIGSEGV/OOM) in memory-constrained
            # containers — joblib memmaps arrays into /dev/shm, which Docker
            # caps at 64MB by default. Same search, single process: slower
            # but immune to worker shared-memory limits.
            if n_jobs == 1:
                raise
            est = _make_est(1)
            est.fit(Xf_train, yf_train)

        # Collect the best final-generation programs, dedupe by expression string.
        programs = sorted(
            est._programs[-1], key=lambda p: p.fitness_
        )[: config["top_n"] * 3]
        seen, rows = set(), []
        for prog in programs:
            raw = str(prog)
            if raw in seen:
                continue
            seen.add(raw)
            try:
                y_pred_train = prog.execute(Xf_train)
                y_pred_test = prog.execute(Xf_test)
                if log_space:
                    # invert to linear space; scoring below is apples-to-apples
                    y_pred_train = np.exp(y_pred_train)
                    y_pred_test = np.exp(y_pred_test)
                if not (np.all(np.isfinite(y_pred_test)) and np.all(np.isfinite(y_pred_train))):
                    continue
                train_r2 = r2_score(y_train, y_pred_train)
                test_r2 = r2_score(y_test, y_pred_test)
                mse = mean_squared_error(y_test, y_pred_test)
                if log_space:
                    names = [f"log_{c}" for c in feature_cols]
                    expr = _simplify(sp.exp(_program_to_sympy(prog, names)))
                else:
                    expr = _simplify(_program_to_sympy(prog, feature_cols))
                # sample up to 200 test points for the frontend scatter plot
                k = min(200, len(y_test))
                idx = np.linspace(0, len(y_test) - 1, k).astype(int)
                rows.append({
                    "raw": raw,
                    "simplified": str(expr),
                    "complexity": prog.length_,
                    "train_r2": float(train_r2),
                    "test_r2": float(test_r2),
                    "mse": float(mse),
                    "predictions": json.dumps({
                        "actual": [round(float(v), 5) for v in y_test[idx]],
                        "predicted": [round(float(v), 5) for v in y_pred_test[idx]],
                    }),
                })
            except Exception:
                continue
            if len(rows) >= config["top_n"]:
                break

        rows.sort(key=lambda r: r["test_r2"], reverse=True)

        with get_conn() as conn:
            for rank, r in enumerate(rows, start=1):
                conn.execute(
                    "INSERT INTO equations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [run_id, rank, r["raw"], r["simplified"], r["complexity"],
                     r["train_r2"], r["test_r2"], r["mse"], r["predictions"]],
                )
            conn.execute(
                "UPDATE runs SET status = 'finished', finished_at = ? WHERE id = ?",
                [datetime.now(), run_id],
            )
        best_r2 = max((r["test_r2"] for r in rows), default=None)
        metrics.run_finished(dataset_id, time.monotonic() - started, best_r2, len(rows))
        _maybe_remember_law(run_id, dataset_id, rows)
    except Exception:
        err = traceback.format_exc()
        with get_conn() as conn:
            conn.execute(
                "UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
                [err[-2000:], datetime.now(), run_id],
            )
        metrics.run_failed(dataset_id, time.monotonic() - started)


def start_run(dataset_id, user_config=None):
    config = {**DEFAULT_CONFIG, **(user_config or {})}
    with get_conn() as conn:
        run_id = conn.execute("SELECT nextval('seq_run_id')").fetchone()[0]
        conn.execute(
            "INSERT INTO runs (id, dataset_id, status, config) VALUES (?, ?, 'running', ?)",
            [run_id, dataset_id, json.dumps(config)],
        )
    metrics.run_started(dataset_id)
    thread = threading.Thread(
        target=_execute_run, args=(run_id, dataset_id, config), daemon=True
    )
    thread.start()
    return run_id
