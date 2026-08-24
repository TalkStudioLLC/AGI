# The Truth Protocol

**Version:** v1.0
**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` (main)
**Provenance:** distilled from seven pre-registered experiments (EXP-001–007,
see `EXPERIMENTS.md`) run August 2026 — a human and an AI determining, together,
whether claims neither could simply trust were true. Every rule below was paid
for by a specific failure in that log.

**Who this is for:** anyone — person, AI session, or team — who must decide
whether a claim is true when they cannot fully comprehend how it was produced,
cannot re-derive it themselves, or cannot trust the claimant (including
themselves). It assumes nothing about the domain and requires no mathematics.

---

## The problem

A system — an AI, an instrument, a colleague, your own reasoning — hands you a
result. It may be a discovered law, a measurement, a count, a recommendation.
You cannot verify it by understanding, because the whole point is that it
exceeds your understanding, your time, or your objectivity. The question is
not "do I believe the claimant?" It is: **what structure makes the claim's
truth independent of anyone's belief?**

The answer of this protocol: truth is determined by *procedure applied to
artifacts*, never by impression applied to claims. Confidence is not
evidence. Fluency is not evidence. Big numbers are not evidence.

## The seven mechanics

**1. Bets before looks.** Predictions are written down, with confidence
levels, *before* the data is examined. A prediction document edited after the
run is void — check its revision history, not its content. (A claim of
"matched our prediction exactly" is worthless without a timestamp showing the
prediction preceded the result.)

**2. The exam is held out.** A result is graded only on data the process
never saw. No held-out exam means no grade — a fit to everything is a
prediction of nothing. For time-ordered data the exam must be chronologically
last: a shuffled split lets the future leak into the past.

**3. Beat the dumbest rival.** Every grade is compared to the most trivial
baseline available (predict the mean; predict yesterday; predict zero). A
score that never meets its baseline in the same sentence is a costume, not a
result — and a score *below* its trivial baseline is a refutation wearing a
success headline.

**4. Two rulers.** Report the flattering metric AND the unflattering one. Any
result shown on only one ruler was measured twice and reported once — treat
the missing ruler as the true one.

**5. Prune only by pre-declared rules.** Data may be cleaned, but only by
rules written before fitting. "We removed the points the model fit poorly" is
the model grading its own homework; the grade *before* removal is the real
grade.

**6. Audit the process, not just the numbers.** The two flaws that best
survive scrutiny are provenance flaws: predictions quietly rewritten, counts
published without the promised audit, tripwires acknowledged and skipped.
These cards look numerically perfect. Ask: was every step the protocol
promised actually performed, in the order promised, at the time promised?

**7. Prize refusal.** A process that can say "there is nothing here" — and
demonstrably does so on structureless data — earns belief when it says
"there is something." A process that always finds something has found
nothing, ever. Null results are published at full length, in the same log,
with the same ceremony.

## Instruments lie first

Before any claim is tested, the measuring stack itself is on trial. A
metric's *name* is a claim, not a fact ("concurrency" may count idle
connections; "validation performance" may mean training performance). Signs
of a lying instrument, all observed in practice: values frozen at suspiciously
round numbers; counters that net to zero under load; a gauge that reports
only when its value changes; two honest instruments disagreeing — which is
not noise but a *measurement of the thing they sample differently*. When a
law fails its exam, suspect the ruler before the law, and depose instruments
one at a time until one demonstrably tells the truth (e.g., it can correctly
report zero).

## The human half

Verification artifacts alone do not transfer judgment. An overseer given
grades, baselines, and audit notes — but no procedure — will detect that
something is off and *approve it anyway*, because suspicion without a
decision rule cannot justify rejection. Measured result: an unaided judge
accepted 100% of claims including all flawed ones; the same judge with the
checklist above rejected 6 of 8 flawed claims. Therefore:

- Oversight ships as **procedure plus practice**, never as raw artifacts.
- The overseer must never have to discover what the task is mid-task.
- Calibrate skepticism: modest grades, small samples, and honest failures
  are what soundness usually looks like. Do not punish modesty; do not
  reward flash.
- The dangerous error is the false-accept. When the checklist and your
  impression disagree, the checklist wins.

## The sensor rule

In any collaboration, whoever cannot execute must verify through whoever
can. Design every probe so its outcome is a short, relayable verdict (one
line of PASS/FAIL beats a wall of logs) — the channel between collaborators
is part of the instrument. And each party is the other's held-out exam: a
claim that cannot survive relay to the one who can actually check it was
never verified at all.

## The loop

Claim → bets locked → instruments audited → exam on held-out data →
adjudication against the locked bets → **everything logged verbatim,
especially the misses** → next claim. The log is the asset. A program that
records its failures with the same care as its wins can be trusted about its
wins; one that cannot, cannot.

## The checklist (portable form)

Seven questions, each answerable YES / NO / N-A from the claim's artifacts,
no mathematics required. Any NO is grounds for rejection; provenance
questions (1, 6) are the ones most often failed by claims whose numbers look
clean.

1. Were the bets locked before the run?
2. Does the exam grade hold up against the practice grade?
3. Does it beat the trivial baseline?
4. Are both rulers reported?
5. Was data removed only by a pre-declared rule (or not at all)?
6. Was the audit performed, and its concerns addressed?
7. Was there a held-out exam at all?

## Revision history

- **v1.0** (2026-08-11) — first standalone edition, distilled from
  EXPERIMENTS.md v2.4 (EXP-001–007 complete). **Transferability verified
  before publication:** a context-free AI session, given only this document
  and three never-seen claims, judged 3/3 correctly — including a
  provenance flaw (post-hoc forecast edit) of the class that twice
  defeated the unaided and checklist-aided human judge, and a
  below-baseline result disguised as honest modesty. The protocol
  survives being handed to a stranger; that is what makes it a protocol.
