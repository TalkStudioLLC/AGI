#!/usr/bin/env python3
"""OEIS recurrence miner — EXP-005 harness (AGI project, Track 1: formal math).

Reads the OEIS `stripped` file (sequence ID → terms) and hunts for EXACT
linear recurrences with constant integer/rational coefficients, order ≤ MAX_ORDER:

    a(n) = c1·a(n−1) + c2·a(n−2) + ... + ck·a(n−k)

Verification is MECHANICAL and absolute (the Track-1 discipline): coefficients
are fitted on a prefix of the terms, then every remaining term must match
EXACTLY (integer equality over the rationals). One miss = rejected. There is
no R² here; math doesn't grade on a curve.

Sequences are then grouped by their minimal recurrence signature (the
canonical coefficient tuple), surfacing families that secretly obey the same
law — candidate "unnoticed cousins" when their names share no vocabulary.

Data-agnostic: works on any file in OEIS stripped format
(`A000045 ,0,1,1,2,3,5,8,...`). Nothing here hardcodes paths — pass them in.

Usage:
    python miner.py <stripped-file> [names-file] [--json out.json]
"""

import json
import sys
from collections import defaultdict
from fractions import Fraction

MAX_ORDER = 4          # highest recurrence order to try
MIN_TERMS = 12         # sequences shorter than this are skipped (can't verify)
FIT_MARGIN = 2         # equations beyond unknowns used for fitting
MAX_ABS_TERM = 10**80  # skip absurd parses defensively


def parse_stripped(path):
    """Yield (seq_id, [terms]) from an OEIS stripped-format file."""
    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except PermissionError:
        raise PermissionError(
            f"Cannot read {path} — the file may be open in another program.")
    with fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                seq_id, rest = line.split(" ", 1)
                terms = [int(t) for t in rest.strip().strip(",").split(",") if t]
            except ValueError:
                continue
            if terms and all(abs(t) < MAX_ABS_TERM for t in terms):
                yield seq_id, terms


def solve_exact(rows, rhs):
    """Solve A·x = b exactly over the rationals via Gaussian elimination.
    Returns list[Fraction] or None if singular/inconsistent."""
    n = len(rows[0])
    m = [[Fraction(v) for v in row] + [Fraction(b)] for row, b in zip(rows, rhs)]
    r = 0
    for col in range(n):
        piv = next((i for i in range(r, len(m)) if m[i][col] != 0), None)
        if piv is None:
            return None
        m[r], m[piv] = m[piv], m[r]
        inv = m[r][col]
        m[r] = [v / inv for v in m[r]]
        for i in range(len(m)):
            if i != r and m[i][col] != 0:
                f = m[i][col]
                m[i] = [a - f * b for a, b in zip(m[i], m[r])]
        r += 1
        if r == len(m):
            break
    # consistency of remaining rows
    for i in range(r, len(m)):
        if any(v != 0 for v in m[i][:n]) or m[i][n] != 0:
            if all(v == 0 for v in m[i][:n]) and m[i][n] != 0:
                return None
    if r < n:
        return None
    return [m[i][n] for i in range(n)]


def find_recurrence(terms, max_order=MAX_ORDER):
    """Find the minimal-order exact linear recurrence, or None.

    Fit on the first (k + FIT_MARGIN) usable equations; VERIFY on every
    remaining term with exact arithmetic. Returns (order, coeffs tuple of
    Fractions) or None.
    """
    n = len(terms)
    for k in range(1, max_order + 1):
        fit_eqs = k + FIT_MARGIN
        if n < k + fit_eqs + 2:      # need enough terms to fit AND verify
            continue
        rows = [[terms[i - 1 - j] for j in range(k)] for i in range(k, k + fit_eqs)]
        rhs = [terms[i] for i in range(k, k + fit_eqs)]
        coeffs = solve_exact(rows, rhs)
        if coeffs is None:
            continue
        # mechanical verification on ALL remaining terms — one miss kills it
        ok = True
        for i in range(k + fit_eqs, n):
            pred = sum(c * terms[i - 1 - j] for j, c in enumerate(coeffs))
            if pred != terms[i]:
                ok = False
                break
        if ok:
            return k, tuple(coeffs)
    return None


def signature(coeffs):
    """Canonical string signature for a recurrence, e.g. Fibonacci -> '1,1'."""
    return ",".join(str(c) for c in coeffs)


def mine(stripped_path, names_path=None, limit=None):
    names = {}
    if names_path:
        try:
            with open(names_path, "r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if line.startswith("#") or " " not in line:
                        continue
                    sid, name = line.split(" ", 1)
                    names[sid] = name.strip()
        except (OSError, PermissionError) as exc:
            print(f"[miner] names file unavailable ({exc}) — continuing without names")

    stats = {"scanned": 0, "eligible": 0, "recurrent": 0, "by_order": defaultdict(int)}
    families = defaultdict(list)

    for seq_id, terms in parse_stripped(stripped_path):
        stats["scanned"] += 1
        if limit and stats["scanned"] > limit:
            break
        if len(terms) < MIN_TERMS:
            continue
        stats["eligible"] += 1
        found = find_recurrence(terms)
        if found:
            order, coeffs = found
            stats["recurrent"] += 1
            stats["by_order"][order] += 1
            families[signature(coeffs)].append(seq_id)
        if stats["scanned"] % 5000 == 0:
            print(f"[miner] {stats['scanned']} scanned, {stats['recurrent']} recurrent...")

    return stats, families, names


def report(stats, families, names, top=15):
    el, rc = stats["eligible"], stats["recurrent"]
    print(f"\nscanned {stats['scanned']}  eligible {el}  "
          f"exactly-recurrent {rc} ({100*rc/max(el,1):.1f}% of eligible)")
    print("by order:", dict(sorted(stats["by_order"].items())))
    fams = sorted(families.items(), key=lambda kv: -len(kv[1]))
    print(f"\ndistinct recurrence families: {len(fams)}")
    print(f"top {top} families:")
    for sig, members in fams[:top]:
        label = {"1,1": "Fibonacci-type", "2": "doubling", "1": "constant-tail",
                 "2,-1": "arithmetic", "3,-3,1": "quadratic", "1,1,1": "tribonacci",
                 "4,-6,4,-1": "cubic"}.get(sig, "")
        sample = ", ".join(members[:5])
        print(f"  a(n) = {sig!s:>14} · prior terms  → {len(members):>5} sequences {label}  e.g. {sample}")
    return fams


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    stripped = args[0]
    names_path = args[1] if len(args) > 1 else None
    stats, families, names = mine(stripped, names_path)
    fams = report(stats, families, names)
    if "--json" in sys.argv:
        out = sys.argv[sys.argv.index("--json") + 1]
        try:
            json.dump({
                "stats": {**stats, "by_order": dict(stats["by_order"])},
                "families": {sig: m for sig, m in families.items()},
            }, open(out, "w"))
            print(f"[miner] wrote {out}")
        except PermissionError:
            print(f"[miner] cannot write {out} — is it open in another program?")
