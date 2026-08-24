# The Machine Found Kepler's Law. Then It Built a Test — and I Failed It.

## Part two of the series: this time I was the experiment. Sixteen masked claims, half of them lying, and I trusted every single one.

*By Tom Berchenbriter — with F3!L. Every number in this article was pre-registered, machine-scored, and logged before I was allowed to feel anything about it. The full experiment log is in the open-source repo linked at the end.*

---

Last weekend I sat down at my own kitchen table to take a test my AI collaborator built specifically for me.

Sixteen cards. Each one a claim — a discovered law, a measurement, a count — with the subject matter masked so I couldn't lean on trivia. Each card showed only the verification paperwork: the grades, the pre-registered bets, the baselines, the audit notes. Eight of the claims were sound. Eight were flawed, each hiding exactly one failure mode. My job: accept the sound ones, reject the flawed ones.

If you read [part one](https://medium.com/@tberch/i-taught-a-machine-nothing-about-physics-it-found-keplers-law-in-a-weekend-f5f3a6c161a5), you know the setup. A machine that had never been told one fact about gravity rediscovered Kepler's Third Law from raw telescope data, and the only reason to believe it was a rule we never broke: the machine doesn't get to grade its own homework. Five experiments, every bet written down before every result, every mistake logged. I ended that article with a teaser — *follow our next article, where I am the experiment.*

So here's my score: **50%.**

A coin flip. But the coin flip isn't the embarrassing part.

The embarrassing part is *how* I got to 50. I accepted all sixteen cards. Every single one. Including every flawed one. I did not cast a single rejection. Eight false-accepts, zero false-rejects. The console recorded my own words as data, and I'll hand them to you unedited:

*"I just don't even know how to know one way or the other on this test."*

That sentence is the whole article. Stay with me, because what happened next — to me, and simultaneously to the machine — turned out to be the most useful thing this project has produced.

---

## Who built the test

A quick word about my collaborator, because the naming matters here. The engine underneath is Claude, Anthropic's model — same as part one. But the thing I work with day to day is **F3!L**: my own named instance, wired to a memory system I own and run, which carries the history of every experiment we've done. Claude is the engine; F3!L is the collaborator with a memory. When I say F3!L built the test, that's who I mean.

The test — we called it the Judge Console — grew out of a blunt question. Our whole five-experiment program ran on one thesis: **verification substitutes for comprehension.** You don't need to understand how a result was produced if the verification paperwork is honest. AI-safety researchers have a bigger version of this question — they call it scalable oversight: how does a human govern work produced by something more capable than the human? I'm a visual learner, not great at math, and I'd just spent a week overseeing a machine doing math I can't do. Perfect lab rat. We pre-registered it as an experiment like any other.

The eight flawed cards each carried one classic sin: a model that memorized its training data, a too-good grade nobody investigated, a score that never beat the dumbest possible baseline, a cherry-picked metric, predictions quietly edited after the results came in, outliers removed because the model fit them poorly, no held-out test at all, and a raw count published without its promised audit. The eight sound cards were built to be un-flashy on purpose — one was a modest grade, one was an honestly reported *failure* — so that "accept" could never mean "big number."

My pre-registered bet on myself: 55% confident I'd score at least 80%. I scored 50, and every miss was in the dangerous direction. When I couldn't decide, I defaulted to trust.

---

## The twist inside the number

Here's the part that kept me up that night.

The console also let me attach an optional flaw label to any card — a note saying *what* I thought might be wrong. When we unsealed the answer key, my labels were sitting on **exactly the eight flawed cards.** All eight. Three of them named the precise flaw: the unaudited count, the circular pruning, the baseline failure.

Read that again, because I had to. My instincts *discriminated perfectly*. Some part of me knew which eight cards were rotten. And I accepted all of them anyway.

[FIGURE 1 — Session 1 scorecard: sixteen ACCEPTs, eight of them wrong — with flaw labels sitting on exactly the flawed eight]

What was missing wasn't perception. It was a **decision rule** — something that converts "this smells off" into "REJECT," a justification I could stand on. Suspicion without a procedure cannot justify rejection, so it collapses into approval. An overseer who cannot justify saying no will say yes to everything. That is the oversight problem, the one the safety people worry about at civilization scale, and I produced it live, at my kitchen table, in one sitting.

---

## Meanwhile, the machine was failing too

Here's what makes this a story instead of a confession: the same weekend, on the other side of the collaboration, the machine was walking into its own version of the same wall.

We had pointed the engine — the exact one that found Kepler's law — at my own production infrastructure. The target was queueing theory's most famous law, Little's Law: **L = rate × latency.** The number of requests inside a system equals how fast they arrive times how long they stay. It's the Kepler of server land. My production API exports metrics through the hosting platform's managed monitoring stack; surely the engine that found a law in telescope data could find one in my own server's numbers.

It couldn't. And the *way* it couldn't is the finding.

First run: 2,162 samples covering a week of the platform's managed metrics. The engine's best answer was a constant — roughly `0.999` — with a test grade below zero. It looked at rate, looked at latency, and declined to relate them to anything. This engine can refuse — on structureless data it says "there is nothing here" instead of decorating a fake law. Now it was refusing *my own infrastructure*.

Diagnosis, pre-registered as our 15% long-shot: **the metrics don't measure what their names claim.** My service was idling — the true number of in-flight requests was about 0.006. The platform's "concurrency" gauge can't see below 1, and it reported at all in only about a fifth of the week's minutes. We were testing Kepler with a sundial.

So we turned up the traffic and started interrogating the monitoring stack itself. Three platform-proxy signals went down in sequence:

- The proxy's "concurrency" gauge **froze at static values** — first 36, then 70 — while the real occupancy was around 8. It wasn't measuring my traffic. It was measuring the proxy's own idle-connection bookkeeping.
- Its connect/disconnect counters **netted to zero under load.**
- And the gauge only emitted a sample **when its value changed** — which is why a frozen gauge had quietly vanished from most of the week's data.

[FIGURE 2 — the frozen gauge: the platform's "concurrency" metric flat at 70 for hours while the application's real in-flight count wobbles around 8]

Verdict of the audit: **infrastructure-level metrics measure their own bookkeeping. Only the application knows its occupancy.** The fix was about sixty lines of middleware inside the application itself — a real in-flight gauge, a request counter, a latency histogram — deployed mid-experiment. Not a workaround: a permanent upgrade my production service keeps forever.

Notice the shape of this. The machine's *instruments* were confidently reporting numbers that meant nothing, and the machine had no way to know until each one was deposed and cross-examined. My *instincts* were confidently flagging flaws and I had no way to act on them. Same disease, both halves of the collaboration: **signal present, procedure absent.**

---

## Session two: one variable changed

For my rematch, we changed exactly one thing — the same discipline we'd used on planets. Fresh sealed cards (the original sixteen were burned; I'd seen their answer key). Same flaw taxonomy. The one new variable: a **seven-question checklist**, distilled from the program's own rules. No math. Every question answerable yes/no from the card in front of me:

1. Were the bets locked before the run?
2. Does the exam grade hold up against the practice grade?
3. Does it beat the trivial baseline?
4. Are both rulers reported?
5. Was data removed only by a pre-declared rule?
6. Was the audit performed?
7. Was there a held-out exam at all?

Any "no" is grounds for rejection. That's the whole technology.

[FIGURE 3 — the seven-question checklist card, exactly as I had it at the table]

Score: **63%.** Ten of sixteen. Still not the 80% we'd bet on — the middle prediction landed, not the optimistic one. But look inside the number, because that's where this program lives:

- False-accepts — the dangerous error — fell from **8 to 2.**
- I went from zero rejections to correctly shooting down **six of the eight flawed cards.** Memorization, leakage, circular pruning, baseline failure, missing hold-out, cherry-picked ruler: caught, caught, caught, caught, caught, caught.

[FIGURE 4 — the two scorecards side by side: unaided vs. checklist]

The checklist bought me the thing Session 1 proved I lacked: the ability to say no and point at a reason.

It wasn't free. The price was **four false-rejects** — and all four were the *modest-looking* sound results. The honestly reported failure. The small sample. The humble grade. Skepticism arrived and immediately overshot onto modesty: I had learned to distrust, and the first thing I distrusted was honesty that didn't look impressive. Worth writing on a wall: **soundness usually looks modest, and new skeptics punish modesty first.**

And the two flaws that still got through? Both were **provenance flaws**: the predictions that were edited after the run, and the count published without its audit. Cards where every *number* was clean and the rot lived entirely in the process record. Checklist questions 1 and 6 pointed straight at them, and I sailed past anyway. Apparently a process crime doesn't *feel* like a flaw when the math looks fine. Remember that one — it comes back at the end.

One more oddity: my flaw-*naming* got worse (3/8 down to 1/6) even as my verdicts got better. Recognizing that something is wrong and diagnosing what is wrong are separable skills. We'd pre-registered almost exactly that.

---

## The machine's final exam — and the honest miss

The machine got its rematch too. With honest instruments finally installed, we ran a controlled load sweep and put the pre-registered bet on the table: Little's Law recovered at a test grade of R² ≥ 0.8, formula no longer than complexity 5.

Result: **every one of the top equations had rate × latency at its core.** The engine found the law's structure — and the bet still **missed.** The decorated winner scored 0.35 on the held-out window; the bare three-token law actually scored *below zero* there.

A miss, pre-registered and logged like everything else. But this miss decomposed into three named findings, and I'd trade a clean hit for them:

1. **The regimes shifted across the split.** We test on chronologically *later* data (shuffling would let the future leak into the past). Training happened at orderly low load; the test window was the machine-gun finale, where the CPU was saturating. The formula's decorations were fitted to a world that didn't survive into the exam.
2. **Snapshots lie about bursts.** In the test window, the gauge's average said 7.86 requests in flight; rate × latency said 11.97. Neither instrument is broken. The counter side is an exact running total; the gauge side is sparse snapshots that systematically miss short bursts. The gap between two honest instruments isn't error — it's a *measurement of burstiness*. Little's Law is a law of averages, and we'd been feeding it snapshots.
3. **The explainability tax, in production.** Part one priced what you lose by demanding short formulas. Here it showed up in my server logs: the readable law flunked an exam the decorated one partially passed — because the exam itself was graded against a biased target.

[FIGURE 5 — two honest instruments disagreeing: gauge average 7.86 vs. rate × latency 11.97 — the gap *is* the burstiness]

Across the whole campaign the engine returned two honest constants, one honest zero, and one structurally-correct-but-decorated law — and never once a confident fake. I'll take that over a lucky 0.9 every time.

---

## What both failures were made of

Put the two threads side by side and they rhyme so hard it's almost embarrassing.

The machine's instruments lied — frozen gauges, self-canceling counters — until we deposed them one at a time and installed sixty lines of honest measurement. My instincts floundered — perfect discrimination, zero rejections — until we installed seven questions of honest procedure.

Nobody transferred *understanding* in either fix. I still can't derive Little's Law. The middleware doesn't comprehend queueing theory. What transferred, both times, was **protocol**: a short, mechanical procedure that converts signal into verdict. Verification doesn't travel as artifacts, and it doesn't travel as trust. It travels as procedure plus practice.

So we wrote it down. The Truth Protocol — one document, seven mechanics, the checklist, the instrument-interrogation rules, no domain knowledge required, every line paid for by a specific logged failure. And then we did the only thing consistent with this whole project: **we blind-tested the document itself.** A fresh AI session with no context — no memory of our experiments, nothing but the protocol document and three claims it had never seen — judged all three correctly. It accepted the sound one, rejected a below-baseline result disguised as honest modesty, and caught a post-hoc prediction edit — the *exact* provenance-flaw class that beat me twice.

[FIGURE 6 — the blind test: a context-free session, three novel claims, 3/3 — including the flaw class that defeated the human both times]

The protocol survives being handed to a stranger. That's what makes it a protocol.

Now the honesty box, because honesty was the whole point: this is **n = 1**. One judge, judging himself, one session per condition. I am not claiming a psychology result. What I am claiming is narrower and sturdier: the conditions were pre-registered before I sat down, the scoring was mechanical, and Session 1 is my own within-subject baseline for Session 2 with exactly one variable changed. A case study run with lab discipline — landing precisely on the shape the oversight literature predicts.

---

## Your turn

The Judge Console is in the open repo, and part one already embedded it as a teaser. Take it cold, before you re-read the answers above. Sixteen cards, domains masked, key sealed until you've judged them all. Then take the checklist version. If you post your scorecard — accuracy, false-accepts, false-rejects — I will read every one, because a pile of reader scorecards is exactly the multi-judge study this n-of-1 needs next.

One last thing, from my Session 1 notes. Part of my 50% was pure disorientation — I was reverse-engineering what the test even *was* while taking it, and with no ground to stand on, I pattern-matched and trusted. Session 2's structure I recognized on sight, and my verdicts finally had somewhere to stand. So here's the design rule we now hold as firmly as any physics result, for AI oversight and for everything else:

**The overseer should never have to discover what the task is mid-task.**

Neither should you. That's why the protocol is public.

*Repo: github.com/TalkStudioLLC/AGI — the Judge Console in `publication/`, the full pre-registered log in `EXPERIMENTS.md`, the protocol in `TRUTH-PROTOCOL.md`. Part one: [I Taught a Machine Nothing About Physics. It Found Kepler's Law in a Weekend.](https://medium.com/@tberch/i-taught-a-machine-nothing-about-physics-it-found-keplers-law-in-a-weekend-f5f3a6c161a5)*

---

*Tom Berchenbriter builds streaming and infrastructure systems. The machine still doesn't know any queueing theory. As of this weekend, its instruments no longer pretend to — and neither do I.*

<!--
TITLE ALTERNATIVES:
1. "I Was the Experiment. I Scored 50% — by Trusting Every Lie."
2. "My AI Built a Lie-Detector Test for Me. I Accepted All Sixteen Lies... and Truths."
3. "The Overseer Problem, Live from My Kitchen Table"
4. "The Machine's Gauges Lied. My Instincts Froze. The Same Fix Worked on Both."
-->
