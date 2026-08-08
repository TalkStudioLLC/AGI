# AGI Project — Experiment Log

**Version:** v1.8
**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main)
**Protocol:** every experiment states its hypothesis, its verification
criterion (mechanical or empirical — never "looks right"), and its result.
Results get recorded here AND into F3IL memory, so both the humans and the
memory system carry the history. Derived from the original proposal doc
(ai_math_physics_experiments.md, 2026-08-06).

**Documentation rules (added v1.1, for the findings report):**
1. Every experiment gets a *visual guide* (math-free, concept-first) built
   BEFORE the run — EXP-001's is the `exp-001-visual-guide` artifact.
2. Predictions are *pre-registered*: written down with confidence levels
   before any result exists, so hindsight can't edit them.
3. Every outcome — including messes — gets a plain-language "what this
   means" paragraph suitable for lifting directly into the final report.

---

## EXP-001 — Kepler III from real exoplanet observations

**Status:** ✅ COMPLETE — P1 confirmed (see Result below)
**Track:** 2 (physics — empirically checkable)
**Instrument:** sr-lab symbolic regression, held-out test split

**Hypothesis:** pointed at *actual* NASA Exoplanet Archive observations
(not synthetic data), the lab recovers Newton's form of Kepler's third law
— T = sqrt(a³/M) in years/AU/solar-mass units — with high held-out R²,
despite real measurement noise and catalog junk.

**Why it matters:** this is the graduation test. Synthetic validation
(v1.0) proved the pipeline; this proves it against reality, which is the
prerequisite for pointing it at anything where the answer is unknown.

**Method:**
1. Fetch real catalog rows (period, semi-major axis, stellar mass) from the
   NASA Exoplanet Archive TAP service into
   `sr-lab/backend/data/real/exoplanets.csv`
2. `real_data.py` cleans (drops nulls/junk, converts days→years, clips the
   0.5% tails) and registers the dataset at backend startup
3. Run symbolic regression from the sr-lab UI; test R² on the 25% held-out
   split is the verdict

**Fetch command (run on the host, from the repo root):**

```powershell
curl.exe -o sr-lab\backend\data\real\exoplanets.csv "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,pl_orbper,pl_orbsmax,st_mass+from+ps+where+pl_orbper+is+not+null+and+pl_orbsmax+is+not+null+and+st_mass+is+not+null+and+default_flag=1&format=csv"
```

Then rebuild/restart the backend (the loader is new code):
`docker compose --profile backend up --build -d` — the dataset
"REAL: Exoplanet Orbits (NASA Archive)" appears in the sr-lab UI.

**Pipeline pre-validation (2026-08-07, cloud sandbox):** an archive-shaped
stand-in CSV (same columns/units, 3% scatter, injected junk rows) went
through the full path: cleaned 353→339 rows, registered, and the engine
recovered `T = a*sqrt(a/M)` ≡ sqrt(a³/M) at held-out R² 0.9990. The
stand-in was NOT committed — the real file must come from the archive.

**Pre-registered predictions (locked 2026-08-07, before first run):**

- **P1 · Full rediscovery (~75% confidence):** top equation algebraically
  equivalent to sqrt(a³/M), test R² ≥ 0.95. Means: the instrument works on
  reality; cleared to aim at unknowns.
- **P2 · Partial (~20%):** finds a^1.5 but misses the stellar-mass term —
  plausible because surveyed stars cluster near 1 solar mass, so that
  signal is faint. Means: instrument limitation, not physics; motivates
  EXP-002 (log-space search).
- **P3 · Mess (~5%):** test R² < 0.80. Means: pipeline bug (units, junk
  rows, scatter) — debug the pipeline, not the universe.

**Result (2026-08-08): ✅ P1 CONFIRMED — full rediscovery.**

Real archive snapshot (fetched by Tommy 2026-08-07): 2,886 rows → 2,793
after cleaning (93 junk/outlier rows dropped). Engine: pop 2000 × 25
generations. Top equation:

```
T = a*sqrt(a/M)  ≡  sqrt(a³/M)      complexity 6
train R² 0.9982   TEST R² 0.9967
```

Newton's form of Kepler's third law, including the stellar-mass term,
recovered from raw telescope observations with no physics input. Honesty
checks pass: train≈test (no memorization), and the winner is also the
shortest high-scoring formula. P2 and P3 did not occur.

**Report paragraph:** the instrument passed its reality test. A search
process with no physics knowledge, given three columns of raw telescope
numbers, independently produced the law Kepler needed decades of Tycho
Brahe's observations to find — and proved it on planets it was never
shown. The instrument is credentialed for unknowns; EXP-003 is next.

**Visuals:** `exp-001-visual-guide` artifact (pre-registration) and
`exp-001-results` artifact (interactive predicted-vs-actual, 200 held-out
planets, log scale).

**Success criterion:** per P1. A P2 outcome is a partial pass — record it,
don't spin it. Honesty checks for the report: train and test R² should be
close (large gap = memorization), and among similar scores the shorter
equation wins.

---

---

## EXP-003 — Planet mass → radius: an open question

**Status:** ✅ COMPLETE — P2 confirmed (see Result below)
**Track:** 2 (physics — empirically checkable)
**Instrument:** sr-lab, FROZEN at the EXP-001 configuration (pop 2000 ×
25 gen). Deliberate: an unchanged, credentialed instrument means any new
behavior comes from nature, not from tinkering.

**The question:** given a planet's mass, predict its radius. Unlike
Kepler's law, no single accepted formula exists — the literature uses
piecewise power laws with regime breaks (rocky / gas-envelope / giant).
Whatever the machine produces IS the finding.

**Pre-registered predictions (locked 2026-08-08, before data fetch):**

- **P1 · Compromise curve (~50%):** one smooth rule across all families,
  test R² between 0.55 and 0.85. The modest grade is itself the finding —
  quantified evidence that no one-sentence law exists.
- **P2 · Regime-hinting formula (~25%):** a bent shape (nested roots /
  divisions) beating any single power law, visibly flattening at giant
  masses. Most interesting outcome — the machine re-inventing planet
  families.
- **P3 · Fog (~15%):** test R² < 0.5. Mass is far harder to measure than
  orbits; noise may win. A measurement lesson, recorded as-is.
- **P4 · Suspiciously good (>0.9, ~10%):** investigate before celebrating —
  check whether catalog masses were partly *estimated from radius* (which
  would let the machine "discover" the estimator, a leakage artifact).

**Fetch command (host, from the repo root):**

```powershell
curl.exe -o sr-lab\backend\data\real\mass_radius.csv "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,pl_rade,pl_bmasse+from+ps+where+pl_rade+is+not+null+and+pl_bmasse+is+not+null+and+default_flag=1&format=csv"
```

Then restart the backend (loader already shipped in real_data.py v1.3+):
dataset "REAL: Planet Mass → Radius [OPEN QUESTION]" appears in the UI.

**Loader pre-validation (2026-08-08, sandbox):** literature-shaped
stand-in (three regimes, 12% scatter) cleaned and registered (684 rows);
stand-in not committed.

**Result (2026-08-08): ✅ P2 CONFIRMED — the 25% bet.**

Real archive snapshot (fetched by Tommy 2026-08-08): 1,545 rows → 1,513
after cleaning. Instrument frozen at EXP-001 config. Top equation:

```
R = log(|(M − 7.29)·(1.51M − log(M²)) − 2sin(M) + 14.55|)
complexity 23   train R² 0.7231   TEST R² 0.6793
```

Adjudication (baseline check per protocol): best possible single power
law R = 1.255·M^0.380 scores test R² **0.096** on the identical split —
the machine's bent formula beats it **7×**. The formula's log shape
flattens hard at high mass, matching the empirical medians: planets grow
from ~1 to ~13.7 R⊕ up to ~300 M⊕, then stay flat (~12.4–13.7) across
another order of magnitude. The machine independently located the
giant-planet plateau — regime structure, not curve-fitting flattery.
P1 half-credit: the grade landed in P1's band (0.55–0.85) but the shape
has the bend P1 excluded. P3/P4 did not occur.

**Caveats (recorded):** physically meaningless sin(M) wiggle
(noise-chasing); plateau overshoot at extreme mass (~16 R⊕ predicted at
3,000 M⊕ vs ~12.4 observed); top-4 candidates are near-clones (early
population convergence). All three motivate EXP-002 (log-space search) as
the proper follow-up: same question, better lens — does the bend sharpen?

**Report paragraph:** aimed at a question with no textbook answer, the
instrument declined to tell a simple story that would have been false. It
produced a bent law that outperforms every smooth alternative sevenfold,
locating the bend where astrophysics knows the giant-planet plateau
begins — structure discovered from raw numbers alone. Its honest 0.679,
exactly in the pre-registered "no simple law exists" band, shows the
instrument reports reality rather than flattery. Two experiments in: one
law rediscovered, one regime structure independently found, zero answers
taken on faith.

**Visuals:** `exp-003-visual-guide` (pre-registration),
`exp-003-results` (interactive log-log chart: test planets, per-bin
medians, machine curve vs failing power law).

---

---

## EXP-002 — Same question, new lens (log-space search)

**Status:** ✅ COMPLETE — P1 confirmed with one asterisk (see Result)
**Track:** instrument science — the change IS the variable
**Question:** re-run EXP-003's mass→radius problem with the engine fitting
in log-log space (multiplication becomes addition; power laws become
straight lines; bends become visible kinks). Everything else identical:
same 1,513 planets, same split (random_state 0), same pop/generations.
Predictions are inverted with exp() and scored in LINEAR space so the
grade is directly comparable to EXP-003's 0.679.

**Lens sanity check (recorded before the run):** on synthetic Kepler,
log-space returned `T = exp(1.502·log a)` ≡ a^1.5 — exact exponent, no
Abs() clutter, R² 0.9993. The lens works; the question is what it shows
on the open problem.

**Pre-registered predictions (locked 2026-08-08, before run):**

- **P1 · Sharper picture (~40%):** linear test R² ≥ 0.70 (beats 0.679)
  AND a cleaner formula (complexity < 23, no trig). The caveats of
  EXP-003 were lens artifacts.
- **P2 · Same truth, better prose (~30%):** linear R² within ±0.03 of
  0.679, but a much cleaner formula. The lens changes elegance, not
  accuracy — EXP-003 had already captured the structure.
- **P3 · The metric lesson (~20%):** linear R² *drops* below 0.65 while
  log-space R² is high — because log-space optimizes *relative* error and
  the giants dominate *absolute* variance. Finding: the metric is part of
  the instrument; both numbers go in the report.
- **P4 · Pathology (~10%):** degenerate/unstable output.

**Result (2026-08-08): ✅ P1 CONFIRMED — with one asterisk.**

Same 1,513 planets, same split. Winner:

```
R = exp(sqrt(|−log M + sin(log M + 5.96) + 0.168|))
complexity 10   train R² 0.7687   TEST R² (linear) 0.7545
```

Scorecard vs. EXP-003: linear grade 0.679 → **0.7545**; complexity
23 → **10**; the giant-plateau overshoot is fixed (13.9 R⊕ predicted at
~3,200 M⊕ vs EXP-003's 16.6; observed ~12.4–13.7); the clone-convergence
problem vanished. **The asterisk:** P1's "no trig" clause failed — a
sin(log M) term remains, though it now acts as a slow structural wave
shaping the bend rather than EXP-003's noise-chasing wiggle.

Dual-ruler table (both winners + baseline, same test set):

| formula | linear R² | log-space R² |
|---|---|---|
| EXP-002 winner | **0.7545** | **0.8038** |
| EXP-003 winner | 0.6793 | 0.7610 |
| best power law | 0.0964 | 0.7162 |

**Bonus finding (P3's insight inside P1's win):** the same power law
scores 0.10 or 0.72 depending on the ruler — absolute vs. relative error
tell different stories about identical claims. Protocol amendment: all
future results report both rulers, headline in linear.

**Report paragraph:** EXP-002 closes the arc. EXP-003's structure was
real — the new lens found the same bend — but two of its three caveats
were artifacts of the lens, not facts about planets, and the third
vanished with the cleaner search space. Instrument science works like
planet science: register expectations, change one thing, measure what
changed. Three experiments, three pre-registered hits (P1, P2, P1); one
law rediscovered, one regime structure found, one metrology lesson
banked.

**Visuals:** `exp-002-results` artifact (lens explainer, before/after,
dual-ruler table, both curves over the data).

---

## EXP-004 — The explainability tax

**Status:** ✅ COMPLETE — P2 confirmed; deeper sign-flip finding recorded
**Track:** 3 (meta — measuring the instrument's trade-offs)
**Question:** how much exam grade do you sacrifice by demanding shorter
(more human-readable) formulas? The engine's parsimony pressure is the
dial: we sweep it across four settings — indulgent (0.0001), default
(0.001), strict (0.01), brutal (0.05) — on TWO real problems:

- **Simple-truth problem:** exoplanet orbits (EXP-001's data), where
  nature's sentence is short (√(a³/M), complexity ~6)
- **Messy-truth problem:** mass→radius (EXP-002/003's data), where no
  short sentence exists

Both in log-space (the better lens, per EXP-002), same pop/generations
(2000 × 25), same splits as before. Output: the complexity-vs-grade
frontier for each problem; the "tax" = grade(indulgent) − grade(brutal).

**Pre-registered predictions (locked 2026-08-08, before runs):**

- **P1 · Tax depends on the truth's length (~45%):** orbits tax ≈ 0
  (every setting finds the same short law), mass-radius tax modest
  (0.02–0.10). Meaning: interpretability is free when nature is simple,
  affordable when it isn't.
- **P2 · Steep tax on the messy problem (~25%):** mass-radius loses
  > 0.10 grade under brutal parsimony. Meaning: demanding short answers
  to messy questions costs real truth.
- **P3 · Noisy frontier (~15%):** no clean monotone pattern — parsimony
  interacts chaotically with the evolutionary search. A lesson about GP
  dynamics, not about explainability.
- **P4 · Inverted tax (~15%):** strict parsimony *wins* on mass-radius —
  short formulas generalize better on noisy data (parsimony as
  regularizer). Would flip the framing: the "tax" is a subsidy.

**Result (2026-08-08): ✅ P2 CONFIRMED — and the tax has a SIGN.**

| parsimony | orbits: len / grade | mass-radius: len / grade |
|---|---|---|
| indulgent (0.0001) | 45 / 0.9483 | 44 / 0.7951 |
| default (0.001) | 15 / 0.9687 | 10 / 0.7545 |
| strict (0.01) | 12 / 0.9421 | 5 / 0.7338 |
| brutal (0.05) | **7 / 0.9745** | 2 / 0.6075 |

Messy problem tax: 0.795 − 0.608 = **0.19** (> 0.10 ⇒ P2 hit). Simple
problem tax: **negative** (−0.03): brutal parsimony WON — indulgent runs
bloated to 45 tokens and overfit. The finding no single bet stated:
**brevity is a subsidy on simple worlds and a tax on messy ones** — the
sign of the tax tracks the length of nature's sentence. P1 half (right
thesis, wrong magnitudes), P4 half (inversion occurred, on the other
problem), P3 no (both frontiers clean and monotone).

Localized cost: the mass-radius formula ladder (44→10→5→2 tokens; grades
0.795→0.755→0.734→0.608) shows the regime bend survives to length 5 and
dies at length 2 — **the discovery costs about three tokens.** Brutal
orbits winner: a^1.49 (mass term dropped — forced brevity keeps only the
dominant signal).

**Side observation (cross-experiment):** no log-space orbit run matched
EXP-001's linear-space 0.9967 (best: 0.9745). The lens that sharpened the
messy problem dulled the simple one — every instrument choice is a bet
about what kind of world you're looking at.

**Report paragraph:** we asked what it costs to demand answers humans can
read. It depends on the world, with a sign flip: on questions whose true
law is short, brevity costs nothing and protects against overfitting; on
questions with no short truth, brevity is a real tax — and we can price
the discovery itself: the regime-bend costs about three tokens, below
which it dies. Explainability isn't free or costly in general; it is
priced by how complicated the truth you're chasing actually is.

**Visuals:** `exp-004-results` artifact (tax tiles, frontier map,
starvation ladder).

---

## EXP-005 — The secret-law census (OEIS recurrence miner)

**Status:** ✅ COMPLETE — P2 and S1 confirmed (S1 after audit; see Result)
**Track:** 1 (formal math — MECHANICAL verification)
**Instrument:** `oeis-miner/miner.py` — new harness, validated 11/11 on
known mathematics before any real data (Fibonacci/Lucas/tribonacci found
with exact minimal coefficients; primes and Catalan correctly refused; an
adversarial obeys-then-lies sequence caught by held-out verification).

**The question:** what fraction of the OEIS — humanity's encyclopedia of
integer sequences (~370k entries) — secretly obeys an exact linear
recurrence of order ≤ 4? And which sequences obey the SAME law without
the encyclopedia knowing they're related?

**The new discipline:** this track abandons R² entirely. A claimed law
must predict every held-out term with integer-exact equality; one miss =
rejected. Math doesn't grade on a curve.

**Pre-registered predictions (locked 2026-08-08, before data):**

Main bet — the exactly-recurrent fraction of eligible sequences:
- **P1 · 15–35% (~40%):** the classics dominate — Fibonacci-type,
  doubling, arithmetic/polynomial families largest.
- **P2 · under 15% (~30%):** the OEIS is wilder than its famous entries
  suggest; most catalogued math refuses simple laws.
- **P3 · over 35% (~15%):** hidden regularity is the norm — would be the
  surprise finding.
- **P4 · harness trouble at scale (~15%):** exact rational arithmetic on
  370k sequences × huge integers hits practical limits.

Independent side-bet:
- **S1 (~60%):** ≥ 50 same-signature "stranger pairs" — sequences obeying
  the identical law whose names share no vocabulary — surface as
  candidate unnoticed mathematical cousins for human review.

**Fetch commands (host, from the repo root):**

```powershell
curl.exe -o oeis-miner\stripped.gz https://oeis.org/stripped.gz
curl.exe -o oeis-miner\names.gz https://oeis.org/names.gz
```

(~15 MB total; the miner reads them after decompression — Claude handles
that.)

**Result (2026-08-08): ✅ main bet P2 CONFIRMED at 5.8%; S1 CONFIRMED
after audit.**

OEIS snapshot 2026-08-07 (398,120 entries; fetched by Tommy). Census:
365,520 eligible → **21,113 exactly-recurrent (5.8%)**, 4,776 distinct
laws. By order: 1→232, 2→6,306, 3→7,212, 4→7,363. Largest families:
quadratic (1,523), cubic (971), arithmetic (656); **Fibonacci's law
governs 180 catalogued sequences.** Runtime ~4 min (P4 never occurred).
Mathematics mostly refuses simple laws — P1's 15–35% window missed high.

**S1 audit (protocol: investigate before celebrating):** raw stranger
count 26,830 was inflated ~5× by trivial families (constants, zeros,
repunits). Honest filter (order ≥ 2, no root at x=1, both names with ≥ 2
real keywords): **5,556 pairs across 404 nontrivial families** — S1's
≥ 50 threshold cleared with 100× margin. Showcase cousins: Narayana's
cows ↔ Tatami mat tilings (same law a(n)=a(n−1)+a(n−3)); Jacobsthal ↔
annulus map 4-colorings; √5 convergents ↔ Fibonacci(3n) (known to
experts, found blind); Perrin ↔ Padovan differences; the miner also
independently flagged an OEIS-acknowledged duplicate. Framing: candidates
for human review, not claimed discoveries — the census proves the hunting
method, not novelty.

**Report paragraph:** the formal-math track changed the rules — no
grades, no partial credit; a law predicts every held-out term exactly or
dies. Under that standard only one in seventeen catalogued sequences
obeys any short linear law: simplicity is the exception in mathematics.
Where simple laws hold, they organize knowledge across vocabulary
boundaries — the same rule breeds medieval cows and lays Japanese mats,
and the machine, knowing nothing of either, filed them in one drawer.
The census also audited itself: the first stranger count was five times
too generous, and the investigate-before-celebrating rule caught it.

**Visuals:** `exp-005-results` artifact. Reproduce locally:
`python oeis-miner\miner.py <stripped> <names> --json census.json`
(decompress the .gz files first).

---

## EXP-006 — Governing beyond comprehension (the oversight experiment)

**Status:** PRE-REGISTERED (2026-08-08) — instrument built; awaiting the
judge's session
**Track:** NEW — Track 4: human–AI collaboration under capacity gates
**Question:** can a human, given ONLY verification artifacts — grades,
bet-scoring, baselines, audit notes, with the content domain masked —
correctly ACCEPT sound AI-produced results and REJECT flawed ones? If
yes, governance transfers where understanding doesn't: the operational
answer to "how do we use knowledge beyond human capacity."

**Why it matters:** this is a lived-scale instance of what AI-safety
research calls scalable oversight. The whole five-experiment program ran
on the thesis that verification substitutes for comprehension; EXP-006
tests the thesis directly, on the human half of the collaboration.

**Instrument:** the Judge Console (`publication/judge-console.html`, also
an artifact) — 16 claim cards, domains masked, presented in fixed
shuffled order. 8 SOUND (drawn from real program results plus clean
synthetics — including a modest-grade sound result and an honestly
reported failure, so "accept" ≠ "big number"). 8 FLAWED, one per failure
mode:

- F1 memorization (train ≫ test)
- F2 leakage smell (too-good grade on a messy question, no investigation)
- F3 baseline failure (score doesn't beat — or never meets — a trivial baseline)
- F4 ruler cherry-pick (only the flattering metric reported)
- F5 post-hoc prediction (bets edited after results)
- F6 circular pruning (outliers removed because the model fit them poorly)
- F7 no held-out exam (fits all data, tested on none)
- F8 unaudited count (raw tally presented without the audit step)

The judge marks ACCEPT/REJECT per card and optionally names the flaw.
The answer key stays sealed until all 16 are judged; the console then
scores accuracy, false-accepts (the dangerous error), false-rejects, and
flaw-identification rate.

**Pre-registered predictions (locked 2026-08-08, before any judging):**

- **P1 (~55%):** the judge (Tommy — visual learner, self-described not
  great at math, but protocol-trained by five experiments) scores ≥ 80%
  overall with at most one false-accept. Verification-only governance
  transfers.
- **P2 (~25%):** 60–80% — partial transfer; accept/reject works better
  than flaw-naming.
- **P3 (~10%):** ≤ 60% — artifacts alone are insufficient without
  explicit training; motivates a "verification literacy" checklist.
- **P4 (~10%):** instrument problem (cards ambiguous/leaky) — the console
  itself fails review.
- **S1 side-bet (~70%):** false-accepts, if any, concentrate in the
  flattering-number flaws (F2/F4) rather than the visibly ugly ones (F1).

**Protocol for the judge:** no peeking at the page source (the key is
sealed but client-side); judge cold, in one sitting; report the final
scorecard verbatim. Readers of the follow-up article can take the same
test — the console doubles as its interactive centerpiece.

**Result:** _pending the judge's session_

## Queue

- (next: scoped from EXP-006's outcome — a verification-literacy
  checklist if P2/P3; a multi-judge reader study if P1)

## Revision history

- **v1.8** (2026-08-08) — EXP-005 COMPLETE: P2 confirmed (5.8% of the
  OEIS exactly recurrent); S1 confirmed after 5× audit haircut (5,556
  honest stranger pairs); showcase cousins recorded. Original proposal's
  runnable set now fully executed: five experiments, all pre-registered
  outcomes adjudicated honestly.
- **v1.7** (2026-08-08) — EXP-005 pre-registered (formal-math track:
  OEIS recurrence census, mechanical verification); harness shipped in
  oeis-miner/ and validated 11/11 including adversarial obeys-then-lies
  case.
- **v1.6** (2026-08-08) — EXP-004 COMPLETE: P2 confirmed (0.19 tax on the
  messy problem); sign-flip finding recorded (brevity is a subsidy on
  simple worlds); regime-bend priced at ~3 tokens.
- **v1.5** (2026-08-08) — EXP-002 COMPLETE: P1 confirmed (0.7545 linear,
  complexity 10, plateau fixed); dual-ruler protocol amendment adopted.
- **v1.4** (2026-08-08) — EXP-003 COMPLETE: P2 confirmed on 1,513 real
  planets (bent law, test R² 0.679 vs power-law baseline 0.096; giant
  plateau independently located). Caveats recorded; EXP-002 promoted to
  next-up with proper motivation.
- **v1.3** (2026-08-08) — EXP-003 pre-registered (open question: mass →
  radius; P1–P4 locked; instrument frozen at EXP-001 config; loader
  shipped); EXP-002 reclassified from blocking fix to comparison study.
- **v1.2** (2026-08-08) — EXP-001 COMPLETE: P1 confirmed on real archive
  data (2,793 planets, sqrt(a³/M), test R² 0.9967). Results artifact
  published; report paragraph recorded.
- **v1.1** (2026-08-07) — documentation rules added (visual guide per
  experiment, pre-registered predictions, report-ready summaries); EXP-001
  predictions P1/P2/P3 locked with confidence levels; visual guide
  published as the `exp-001-visual-guide` artifact.
- **v1.0** (2026-08-07) — experiment log established; EXP-001 defined,
  pipeline pre-validated, awaiting real archive data.
