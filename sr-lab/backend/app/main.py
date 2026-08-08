"""Symbolic Regression Lab — FastAPI backend.

Endpoints:
  GET  /api/datasets                 list datasets (+ known true laws)
  GET  /api/datasets/{id}/preview    first rows for display
  POST /api/runs                     start a symbolic-regression run
  GET  /api/runs                     list runs
  GET  /api/runs/{id}                run status
  GET  /api/runs/{id}/equations      ranked discovered equations
"""

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import real_data, sample_data
from .db import dataset_table, get_conn, init_db
from .engine import DEFAULT_CONFIG, start_run

app = FastAPI(title="Symbolic Regression Lab")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev convenience; restrict for any shared deployment
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    sample_data.build_all()
    real_data.build_all()


class RunRequest(BaseModel):
    dataset_id: str
    population_size: int | None = None
    generations: int | None = None
    test_size: float | None = None
    parsimony_coefficient: float | None = None
    log_space: bool | None = None


@app.get("/api/datasets")
def list_datasets():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, description, target_col, feature_cols, true_law, n_rows "
            "FROM datasets ORDER BY name"
        ).fetchall()
    return [
        {
            "id": r[0], "name": r[1], "description": r[2], "target_col": r[3],
            "feature_cols": json.loads(r[4]), "true_law": r[5], "n_rows": r[6],
        }
        for r in rows
    ]


@app.get("/api/datasets/{dataset_id}/preview")
def preview_dataset(dataset_id: str, limit: int = 8):
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT COUNT(*) FROM datasets WHERE id = ?", [dataset_id]
        ).fetchone()[0]
        if not exists:
            raise HTTPException(404, "dataset not found")
        df = conn.execute(
            f"SELECT * FROM {dataset_table(dataset_id)} LIMIT {int(limit)}"
        ).df()
    return {"columns": list(df.columns), "rows": df.round(5).values.tolist()}


@app.post("/api/runs")
def create_run(req: RunRequest):
    overrides = {
        k: v for k, v in req.model_dump().items()
        if k != "dataset_id" and v is not None
    }
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT COUNT(*) FROM datasets WHERE id = ?", [req.dataset_id]
        ).fetchone()[0]
    if not exists:
        raise HTTPException(404, "dataset not found")
    run_id = start_run(req.dataset_id, overrides)
    return {"run_id": run_id, "status": "running"}


@app.get("/api/runs")
def list_runs():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT r.id, r.dataset_id, d.name, r.status, r.started_at, r.finished_at "
            "FROM runs r JOIN datasets d ON d.id = r.dataset_id "
            "ORDER BY r.id DESC LIMIT 50"
        ).fetchall()
    return [
        {
            "id": r[0], "dataset_id": r[1], "dataset_name": r[2], "status": r[3],
            "started_at": str(r[4]), "finished_at": str(r[5]) if r[5] else None,
        }
        for r in rows
    ]


@app.get("/api/runs/{run_id}")
def get_run(run_id: int):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, dataset_id, status, config, error, started_at, finished_at "
            "FROM runs WHERE id = ?", [run_id]
        ).fetchone()
    if row is None:
        raise HTTPException(404, "run not found")
    return {
        "id": row[0], "dataset_id": row[1], "status": row[2],
        "config": json.loads(row[3]), "error": row[4],
        "started_at": str(row[5]), "finished_at": str(row[6]) if row[6] else None,
    }


@app.get("/api/runs/{run_id}/equations")
def get_equations(run_id: int):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT rank, expression_raw, expression_simplified, complexity, "
            "train_r2, test_r2, test_mse, predictions "
            "FROM equations WHERE run_id = ? ORDER BY rank", [run_id]
        ).fetchall()
    return [
        {
            "rank": r[0], "raw": r[1], "simplified": r[2], "complexity": r[3],
            "train_r2": r[4], "test_r2": r[5], "test_mse": r[6],
            "predictions": json.loads(r[7]),
        }
        for r in rows
    ]
