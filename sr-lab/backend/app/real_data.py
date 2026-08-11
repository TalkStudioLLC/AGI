"""Real-world dataset loaders for the Symbolic Regression Lab.

Unlike sample_data.py (synthetic, generated from known laws), these load
REAL observational data from CSV files dropped into backend/data/real/.
Datasets register automatically at startup when their file is present —
absence of a file is a state, not an error (the registry just reports it).

Loaders are data-agnostic: each registry entry declares the columns it
needs, an optional row-transform, and the physically-expected law (if any)
for validation display. Nothing here hardcodes environment-specific paths.
"""

import numpy as np
import pandas as pd

from .db import register_dataset
from .sample_data import RNG_SEED  # noqa: F401  (kept for parity; real data is not seeded)

from pathlib import Path

REAL_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "real"

# Private datasets: same loader machinery, but this directory is gitignored —
# protected data (e.g. production telemetry) NEVER enters version control.
# Registry entries with "private": True are looked up here. Code stays public;
# data stays home. Results referencing private datasets must use generic
# labels ("Service A"), never real hostnames or domains.
PRIVATE_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "private"


def _load_exoplanets(df: pd.DataFrame) -> pd.DataFrame:
    """NASA Exoplanet Archive (ps table): orbital period vs semi-major axis
    and stellar mass. Real observations — noisy, heterogeneous, with actual
    measurement error. Expected law (Newton's form of Kepler III, in
    years/AU/solar-mass units): T = sqrt(a^3 / M).

    Source columns: pl_orbper [days], pl_orbsmax [AU], st_mass [M_sun].
    """
    df = df.rename(columns={
        "pl_orbper": "T_days", "pl_orbsmax": "a", "st_mass": "M",
    })
    df = df[["a", "M", "T_days"]].dropna()
    df["T"] = df["T_days"] / 365.25          # days → years
    df = df.drop(columns=["T_days"])
    # basic physical sanity filters (real catalogs contain junk rows)
    df = df[(df["a"] > 0) & (df["M"] > 0.05) & (df["T"] > 0)]
    # clip absurd outliers (data-driven, not hardcoded: keep central 99%)
    for col in ["a", "M", "T"]:
        lo, hi = df[col].quantile([0.005, 0.995])
        df = df[(df[col] >= lo) & (df[col] <= hi)]
    return df.reset_index(drop=True)




def _load_mass_radius(df: pd.DataFrame) -> pd.DataFrame:
    """NASA Exoplanet Archive: planet radius vs. planet mass.

    THE OPEN QUESTION (EXP-003): unlike Kepler's law, no single accepted
    formula exists here. The literature uses piecewise power laws with
    regime breaks (rocky / volatile / giant) — what one compact global
    formula best describes the relation is genuinely unsettled.

    Source columns: pl_bmasse [Earth masses], pl_rade [Earth radii].
    Target: R (radius). Feature: M (mass).
    """
    df = df.rename(columns={"pl_bmasse": "M", "pl_rade": "R"})
    df = df[["M", "R"]].dropna()
    df = df[(df["M"] > 0) & (df["R"] > 0)]
    # real catalogs contain flagged-junk extremes; keep central 99%
    for col in ["M", "R"]:
        lo, hi = df[col].quantile([0.005, 0.995])
        df = df[(df[col] >= lo) & (df[col] <= hi)]
    return df.reset_index(drop=True)






def _load_service_telemetry(df: pd.DataFrame) -> pd.DataFrame:
    """EXP-007 — service telemetry, CUSTOMER-AGNOSTIC by design: no hostnames,
    no domains, no environment specifics. Auto-detects common column names
    from a metrics export (Prometheus/Grafana CSV or similar).

    Credential test: Little's Law, L = λ·W — things-in-system equals arrival
    rate times time-in-system. As much a law as Kepler's. Canonical columns
    after detection:
        rate    — arrivals/sec (λ)
        latency — seconds in system (W)   [ms auto-converted if detected]
        inflight— concurrent in-system (L, the target)
    Rows kept in time order for the engine's time_split mode.
    """
    aliases = {
        "rate": ["rate", "rps", "requests_per_sec", "req_rate", "arrival_rate",
                 "throughput", "qps"],
        "latency": ["latency", "latency_s", "avg_latency", "response_time",
                    "duration", "latency_ms", "avg_latency_ms", "response_time_ms"],
        "inflight": ["inflight", "in_flight", "active_requests", "concurrency",
                     "active", "in_system", "queue_depth_total"],
        "ts": ["ts", "time", "timestamp", "date", "datetime"],
    }
    cols = {c.lower().strip(): c for c in df.columns}
    found = {}
    for canon, names in aliases.items():
        for n in names:
            if n in cols:
                found[canon] = cols[n]
                break
    missing = [k for k in ("rate", "latency", "inflight") if k not in found]
    if missing:
        raise ValueError(
            f"telemetry csv missing columns for: {missing}; "
            f"recognized aliases: { {k: v for k, v in aliases.items() if k != 'ts'} }")
    out = pd.DataFrame({
        "rate": pd.to_numeric(df[found["rate"]], errors="coerce"),
        "latency": pd.to_numeric(df[found["latency"]], errors="coerce"),
        "inflight": pd.to_numeric(df[found["inflight"]], errors="coerce"),
    })
    if "ts" in found:
        ts = pd.to_datetime(df[found["ts"]], errors="coerce")
        out = out.assign(_ts=ts).sort_values("_ts").drop(columns="_ts")
    # ms → s auto-detect (median latency > 10 ⇒ almost certainly milliseconds)
    if out["latency"].median() > 10:
        out["latency"] = out["latency"] / 1000.0
    out = out.dropna()
    out = out[(out["rate"] > 0) & (out["latency"] > 0) & (out["inflight"] >= 0)]
    for col in out.columns:
        lo, hi = out[col].quantile([0.005, 0.995])
        out = out[(out[col] >= lo) & (out[col] <= hi)]
    return out.reset_index(drop=True)


# Registry of known real datasets. Each activates when its CSV exists.
REGISTRY = [
    {
        "filename": "exoplanets.csv",
        "dataset_id": "exoplanets_real",
        "name": "REAL: Exoplanet Orbits (NASA Archive)",
        "description": (
            "Actual observed exoplanets from the NASA Exoplanet Archive — "
            "orbital period vs. semi-major axis and host-star mass. Real "
            "measurement noise, no synthetic anything. Units: years, AU, "
            "solar masses."
        ),
        "target_col": "T",
        "feature_cols": ["a", "M"],
        "true_law": "T = sqrt(a^3/M)  (Kepler III / Newton — expected, not guaranteed)",
        "transform": _load_exoplanets,
    },
    {
        "filename": "mass_radius.csv",
        "dataset_id": "mass_radius_real",
        "name": "REAL: Planet Mass → Radius (NASA Archive) [OPEN QUESTION]",
        "description": (
            "Actual measured exoplanets: does a planet's mass predict its "
            "size? Unlike Kepler's law there is NO settled single formula — "
            "rocky worlds, gas-envelope worlds, and giants follow different "
            "rules. Units: Earth masses, Earth radii."
        ),
        "target_col": "R",
        "feature_cols": ["M"],
        "true_law": None,   # genuinely open — that's the point of EXP-003
        "transform": _load_mass_radius,
    },
    {
        "filename": "service_telemetry.csv",
        "dataset_id": "service_telemetry",
        "name": "PRIVATE: Service Telemetry — Little's Law credential test",
        "description": (
            "Concurrency (L) vs. arrival rate and latency from a production "
            "service's metrics export. Expected law: Little's Law, L = rate x "
            "latency — queueing theory's Kepler. Data is private (gitignored); "
            "this loader and all code are public and customer-agnostic."
        ),
        "target_col": "inflight",
        "feature_cols": ["rate", "latency"],
        "true_law": "L = rate * latency  (Little's Law — expected)",
        "transform": _load_service_telemetry,
        "private": True,
    },
]


def build_all():
    """Register every real dataset whose CSV is present. Never raises on a
    missing or malformed file — reports and continues."""
    results = []
    for entry in REGISTRY:
        base = PRIVATE_DATA_DIR if entry.get("private") else REAL_DATA_DIR
        path = base / entry["filename"]
        if not path.exists():
            where = "backend/data/private/" if entry.get("private") else "backend/data/real/"
            results.append((entry["dataset_id"], "awaiting_data",
                            f"drop {entry['filename']} into {where}"))
            continue
        try:
            raw = pd.read_csv(path, comment="#")
            df = entry["transform"](raw) if entry["transform"] else raw
            if len(df) < 30:
                results.append((entry["dataset_id"], "too_few_rows", f"{len(df)} rows after cleaning"))
                continue
            # replace=True: these datasets mirror a file on disk — a changed
            # CSV must win over whatever was imported before (EXP-007 lesson:
            # without this, a re-export was silently ignored on restart).
            register_dataset(
                entry["dataset_id"], entry["name"], entry["description"],
                entry["target_col"], entry["feature_cols"], entry["true_law"], df,
                replace=True,
            )
            results.append((entry["dataset_id"], "registered", f"{len(df)} rows"))
        except PermissionError:
            results.append((entry["dataset_id"], "permission_error",
                            f"{path} could not be read — is it open in another program?"))
        except Exception as exc:  # malformed CSV, wrong columns, etc.
            results.append((entry["dataset_id"], "load_error", str(exc)[:200]))
    for dataset_id, status, detail in results:
        print(f"[real_data] {dataset_id}: {status} ({detail})")
    return results
