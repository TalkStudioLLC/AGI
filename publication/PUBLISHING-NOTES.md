# Medium publishing notes — the study article

**Version:** v1.0
**Target repo/branch:** `C:\Users\Tom\Documents\GitHub\AGI` → `publication/`

## What's in this kit

- `medium-article.md` — the full draft (~1,900 words), written in Tommy's
  voice with the AI collaboration disclosed. Figure insertion points are
  marked `[FIGURE N — caption]`.
- `figures/fig1..fig7` — cropped PNGs from the results artifacts, in
  article order. Light-mode renders (Medium is white-background).

## How to publish on Medium

1. medium.com → profile icon → **Write story**
2. Paste the article text (Medium keeps # headings, **bold**, *italics*,
   and --- dividers on paste; check the two tables-turned-prose spots)
3. At each `[FIGURE N]` marker: delete the marker line, press +, upload
   the matching PNG from `figures/`, and use the marker's caption text as
   the image caption
4. Title and subtitle are the first two lines — Medium will pick them up
5. Suggested tags: Artificial Intelligence, Science, Data Science, Math,
   Citizen Science
6. Before hitting publish, update the repo link paragraph if you make the
   repo layout public-ready first (see checklist below)

## Pre-publish checklist (recommended)

- [ ] Push the AGI repo so EXPERIMENTS.md v1.8, sr-lab/, and oeis-miner/
      are actually visible at the linked URL (the article promises
      reproducibility — the repo must deliver it)
- [ ] Give the repo README the one-line description the article implies
      ("pre-registered discovery experiments with verifiable instruments")
- [ ] Read the draft aloud once and make it yours — swap any sentence
      that doesn't sound like you; it's your byline
- [ ] Optional: link the interactive artifacts (exp-001..005 results
      pages) by committing them to the repo under `publication/artifacts/`
      so readers can hover the real charts

## Facts said in the article (verified against the log)

- EXP-001: 2,886→2,793 planets; T = a·√(a/M); test R² 0.9967 / train 0.9982
- EXP-003: 1,513 planets; bent law 0.679 vs power law 0.096 (7×); plateau ~300 M⊕
- EXP-002: 0.679→0.7545; complexity 23→10; Kepler exponent 1.502 sanity check;
  ruler split 0.096 vs 0.716
- EXP-004: tax −0.19 messy / +0.03 simple; bend survives at 5 tokens, dies at 2;
  2-token formula scores 0.61
- EXP-005: 365,520 eligible; 21,113 recurrent (5.8%); 4,776 laws; Fibonacci
  family 180; strangers 26,830 raw → 5,556 audited across 404 families

## Revision history

- **v1.0** (2026-08-08) — initial kit: draft + 7 figures + publish steps.
