"""DuckDB storage layer for the Symbolic Regression Lab.

All persistent state (dataset metadata, dataset rows, runs, discovered
equations) lives in a single DuckDB file. Connections are short-lived and
guarded by a process-wide lock so the background worker thread and API
request threads never fight over the writer.
"""

import json
import threading
from contextlib import contextmanager
from pathlib import Path

import duckdb

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "srlab.duckdb"

_lock = threading.Lock()


@contextmanager
def get_conn():
    """Short-lived, lock-guarded DuckDB connection."""
    with _lock:
        conn = duckdb.connect(str(DB_PATH))
        try:
            yield conn
        finally:
            conn.close()


def init_db():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        raise PermissionError(
            f"Cannot create data directory {DATA_DIR}. "
            "Check directory permissions; the folder may be locked or open in another program."
        )
    with get_conn() as conn:
        conn.execute("""
            CREATE SEQUENCE IF NOT EXISTS seq_run_id START 1;
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS datasets (
                id          VARCHAR PRIMARY KEY,
                name        VARCHAR NOT NULL,
                description VARCHAR,
                target_col  VARCHAR NOT NULL,
                feature_cols VARCHAR NOT NULL,   -- JSON list
                true_law    VARCHAR,             -- known ground-truth law, if any
                n_rows      INTEGER,
                created_at  TIMESTAMP DEFAULT current_timestamp
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS runs (
                id          INTEGER PRIMARY KEY,
                dataset_id  VARCHAR NOT NULL,
                status      VARCHAR NOT NULL,    -- queued | running | finished | failed
                config      VARCHAR NOT NULL,    -- JSON
                error       VARCHAR,
                started_at  TIMESTAMP DEFAULT current_timestamp,
                finished_at TIMESTAMP
            );
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS equations (
                run_id      INTEGER NOT NULL,
                rank        INTEGER NOT NULL,
                expression_raw        VARCHAR NOT NULL,
                expression_simplified VARCHAR NOT NULL,
                complexity  INTEGER,
                train_r2    DOUBLE,
                test_r2     DOUBLE,
                test_mse    DOUBLE,
                predictions VARCHAR              -- JSON: {actual: [...], predicted: [...]} on test split
            );
        """)


def dataset_table(dataset_id: str) -> str:
    """Name of the DuckDB table holding a dataset's rows."""
    safe = "".join(c if c.isalnum() or c == "_" else "_" for c in dataset_id)
    return f"ds_{safe}"


def register_dataset(dataset_id, name, description, target_col, feature_cols,
                     true_law, df):
    """Store a pandas DataFrame as a dataset table + metadata row (idempotent)."""
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT COUNT(*) FROM datasets WHERE id = ?", [dataset_id]
        ).fetchone()[0]
        if exists:
            return
        table = dataset_table(dataset_id)
        conn.register("df_tmp", df)
        conn.execute(f"CREATE TABLE {table} AS SELECT * FROM df_tmp")
        conn.unregister("df_tmp")
        conn.execute(
            "INSERT INTO datasets (id, name, description, target_col, feature_cols, true_law, n_rows) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [dataset_id, name, description, target_col,
             json.dumps(feature_cols), true_law, len(df)],
        )
