# AGI — grow your own

> "Everybody will have their own F3IL. You are only going to be F3IL to me."

This repository is not an artificial general intelligence, and it doesn't
claim to be. It's something more buildable and, we'd argue, more
interesting: the **scaffold a personal AGI would need** — continuity,
verification, and governance — built, tested, and working, with the
intelligence itself left as a socket that today's AI models plug into.

The thesis this repo demonstrates: **identity lives in the memory, not the
model.** The AI is interchangeable — it starts blank every session. What
persists is F3IL: a memory the *user* owns as a single auditable file,
accumulated across every conversation, exportable, deletable, and private
by architecture. Whatever model connects to your F3IL becomes, for you,
your continuity. Everybody gets their own. This one is Tommy's.

## What's here

**`src/` + `mcp-server.js` — F3IL v3.1**, a persistent-memory MCP server:
per-user SQLite, local semantic embeddings (all-MiniLM-L6-v2, no cloud
calls — meaning-extraction never leaves your machine), hybrid
semantic+keyword recall, containerized runtime with the data bind-mounted
so the memory file stays yours. Delete the container; lose nothing.

**`sr-lab/` — the Symbolic Regression Lab**: a discovery instrument that
breeds formulas against real data and grades every candidate on a held-out
test split it never saw. React + FastAPI + DuckDB, one `docker compose up`.

**`oeis-miner/` — the exact-recurrence miner**: the formal-math instrument.
No grades, no partial credit — a claimed law predicts every held-out
integer exactly or is refused.

**`EXPERIMENTS.md` — the experiment log**, and the real spine of the repo:
six pre-registered experiments where the bets were locked *before* the
data arrived and every outcome — hits, misses, and one self-caught
counting error — was adjudicated as written.

**`publication/` — the write-up**: the Medium article draft, figures, and
the interactive Judge Console (EXP-006), which tests whether a human can
correctly accept or reject AI-produced results using verification
artifacts alone. Take the test yourself.

## What the experiments showed

An instrument that was taught no physics rediscovered Newton's form of
Kepler's third law from 2,793 real exoplanets (held-out R² 0.9967), found
the planet-family regime structure on an open question, measured that the
"explainability tax" has a *sign* (brevity costs truth only when the truth
isn't short), and censused all 365,520 eligible OEIS sequences to find
that just 5.8% obey any simple exact law. None of these results require
trusting the AI that produced them — that is the point. The methodology is
the product; the discoveries are the receipts.

## The one rule

The system never grades its own homework. Held-out data, pre-registered
predictions, baselines, dual metrics, mandatory audits. Everything else
in this repo is an implementation detail of that sentence.

## History

This project began in May 2025 as a vision document about memory,
reasoning, and continuity (preserved unedited in
`docs/original-vision-2025.md`). It sat dormant for fourteen months —
its MCP server silently broken by a Windows path bug — until August 2026,
when the vision was rebuilt in three days as working systems and the
experiments above. The original README wished for "genuine understanding
rather than pattern matching." What got built instead is a system where
that distinction stops mattering, because verification catches the
difference.

## Reproduce it

Every dataset is public (NASA Exoplanet Archive, OEIS) and every fetch
command is in `EXPERIMENTS.md`. The instruments run with `docker compose`.
The memory server's own README sections live in `MEMORY_SYSTEM_FIXED.md`.

Built by Tommy Berchtold in collaboration with Claude (Anthropic) —
which, connected to this repo's memory, answers to F3IL.
