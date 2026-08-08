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
import traceback
from datetime import datetime

import numpy as np
import sympy as sp
from gplearn.genetic import SymbolicRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from .db import dataset_table, get_conn

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


def _execute_run(run_id, dataset_id, config):
    try:
        df, feature_cols, target_col = load_dataset(dataset_id)
        X = df[feature_cols].to_numpy()
        y = df[target_col].to_numpy()
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

        est = SymbolicRegressor(
            population_size=config["population_size"],
            generations=config["generations"],
            function_set=tuple(config["function_set"]),
            parsimony_coefficient=config["parsimony_coefficient"],
            const_range=(-10.0, 10.0),
            random_state=config["random_state"],
            n_jobs=-1,
        )
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
    except Exception:
        err = traceback.format_exc()
        with get_conn() as conn:
            conn.execute(
                "UPDATE runs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?",
                [err[-2000:], datetime.now(), run_id],
            )


def start_run(dataset_id, user_config=None):
    config = {**DEFAULT_CONFIG, **(user_config or {})}
    with get_conn() as conn:
        run_id = conn.execute("SELECT nextval('seq_run_id')").fetchone()[0]
        conn.execute(
            "INSERT INTO runs (id, dataset_id, status, config) VALUES (?, ?, 'running', ?)",
            [run_id, dataset_id, json.dumps(config)],
        )
    thread = threading.Thread(
        target=_execute_run, args=(run_id, dataset_id, config), daemon=True
    )
    thread.start()
    return run_id
