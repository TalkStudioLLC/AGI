#!/usr/bin/env python3
"""F3!L memory recovery — merge historical memory.db snapshots from git.

Why this exists: memory.db was tracked by git before it was gitignored, and
gitignore does NOT untrack an already-tracked file — so a rebase/checkout can
silently revert the database to an old committed snapshot, discarding newer
memories from disk. The same mechanism preserves every committed snapshot in
history, which is what this script harvests.

What it does (read-only on history, additive-only on the live DB):
  1. finds every commit that touched memory.db
  2. extracts each snapshot to a temp file
  3. copies over any 'memories' rows whose id is absent from the live DB
     (column-intersection insert, so older schemas merge cleanly;
      missing embeddings are left NULL for the server's backfill)
  4. reports per-snapshot and total results

Run from the repo root:  python f3il-recover.py
A timestamped backup of the current memory.db is written first.
"""
import subprocess, sqlite3, os, sys, shutil, tempfile, datetime

DB = "memory.db"

def sh(args):
    return subprocess.run(args, capture_output=True).stdout

if not os.path.exists(DB):
    sys.exit(f"{DB} not found — run this from the repo root.")

# 0. backup first, always
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
backup = f"memory.db.backup-{stamp}"
shutil.copy2(DB, backup)
print(f"backup written: {backup}")

live = sqlite3.connect(DB)
live_cols = [r[1] for r in live.execute("PRAGMA table_info(memories)")]
existing = {r[0] for r in live.execute("SELECT id FROM memories")}
print(f"live DB: {len(existing)} memories before recovery")

shas = sh(["git", "log", "--all", "--format=%H %cI", "--", DB]).decode().split("\n")
shas = [s.split() for s in shas if s.strip()]
print(f"git history: {len(shas)} commits touched {DB}\n")

total_new = 0
for sha, date in shas:
    blob = sh(["git", "show", f"{sha}:{DB}"])
    if len(blob) < 100:
        print(f"  {sha[:8]} {date[:10]}  (empty/absent — skipped)")
        continue
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        tf.write(blob); tmp = tf.name
    merged = 0
    try:
        old = sqlite3.connect(tmp)
        tabs = {r[0] for r in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "memories" not in tabs:
            print(f"  {sha[:8]} {date[:10]}  (no memories table — skipped)")
            continue
        old_cols = [r[1] for r in old.execute("PRAGMA table_info(memories)")]
        cols = [c for c in old_cols if c in live_cols]
        col_sql = ",".join(cols)
        ph = ",".join("?" * len(cols))
        rows = old.execute(f"SELECT {col_sql} FROM memories").fetchall()
        for row in rows:
            rid = row[cols.index("id")]
            if rid in existing:
                continue
            live.execute(f"INSERT INTO memories ({col_sql}) VALUES ({ph})", row)
            existing.add(rid); merged += 1
        old.close()
        print(f"  {sha[:8]} {date[:10]}  snapshot rows: {len(rows):3}  recovered: {merged}")
        total_new += merged
    except Exception as e:
        print(f"  {sha[:8]} {date[:10]}  ERROR: {e}")
    finally:
        os.unlink(tmp)

live.commit()
n = live.execute("SELECT COUNT(*) FROM memories").fetchone()[0]
print(f"\nrecovered {total_new} memories from history")
print(f"live DB now holds {n} memories")
for r in live.execute("SELECT substr(content,1,80), timestamp FROM memories ORDER BY timestamp DESC LIMIT 12"):
    print("  •", r[0].replace("\n", " "))
live.close()
print("\nNext: git rm --cached memory.db  (untrack it so git can never revert it again),")
print("then restart Docker Desktop -> restart Claude Desktop. Missing embeddings backfill on next boot.")
