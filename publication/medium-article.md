# I Taught a Machine Nothing About Physics. It Found Kepler's Law in a Weekend.

## Five pre-registered experiments with an AI co-pilot, a $0 budget, and a rule we never broke: the machine doesn't get to grade its own homework.

*By Tommy Berchtold — built in collaboration with Claude (Anthropic). Every experiment, dataset, and number in this article is reproducible from the open-source repo linked at the end.*

---

A couple of days ago I asked an AI a naive question: what's actually the difference between AI and AGI? The answer that stuck with me wasn't about intelligence at all. It was about two humbler things: **verification** — can you trust a result without trusting the system that produced it? — and **memory** — does anything persist?

Instead of debating it, we built instruments and ran experiments. This is the report.

The ground rules, which mattered more than any single result:

1. **Predictions locked before results.** Before every run, we wrote down what we expected, with confidence percentages. Hindsight never got to edit our expectations.
2. **Verification the machine can't flatter.** Every discovered formula was graded only on data it never saw — a locked drawer of held-out examples. In the math experiment, we went further: exact integer agreement or death.
3. **Everything documented as it happened**, including the mistakes. Especially the mistakes.

The toolkit was deliberately modest: a small symbolic-regression engine (genetic programming — it *breeds* formulas like livestock, keeping the fittest), public data anyone can download, and a few evenings. No GPUs, no grants, no PhD.

---

## Experiment 1: The Credential Test

You can't aim an instrument at the unknown until it passes a test where you know the answer. So we pointed ours at 2,886 real exoplanets from the NASA Exoplanet Archive — actual telescope measurements, with actual noise and actual junk rows — and asked: given each planet's distance from its star and the star's mass, can you predict the length of its year?

Humanity knows this answer. It took Kepler decades of Tycho Brahe's observations to find the pattern in 1619, and Newton's calculus to explain it: T = √(a³/M). *Cube the distance, divide by the star's weight, take the square root.*

We pre-registered our bets: 75% that the machine fully rediscovers it, 20% that it finds the distance rhythm but misses the subtler star-mass term, 5% that real-world data gremlins wreck the run.

The machine bred two thousand random formulas for twenty-five generations. Almost all of them were nonsense. The survivor:

**T = a × √(a ÷ M)**

That is Newton's form of Kepler's Third Law, exactly — star-mass term included — produced by a process that has never been told a single fact about gravity. Its grade on the hidden planets: **R² = 0.9967**, with the practice grade nearly identical, meaning it learned the law, not the answer key.

[FIGURE 1 — the verdict: formula, grades, dial]

[FIGURE 2 — every dot is a real planet: 200 hidden test planets hugging the perfect-prediction line across four orders of magnitude]

One run doesn't make the machine smart. What it makes the machine is **credentialed**: it demonstrably extracts true structure from messy reality. Now we could point it at something nobody knows.

---

## Experiment 2: A Question With No Answer Key

If you know a planet's mass, can you predict its size? Unlike Kepler's law, there is no settled formula. Planets come in three families that play by different rules: rocky worlds barely grow as you add mass (rock compresses), gas-envelope worlds balloon, and giants stop growing entirely — squeeze and puff cancel out. The literature stitches together piecewise fits. One clean global formula? Genuinely open.

This changes the epistemics completely. With no answer key, *whatever comes out is the finding* — including "no simple law exists," which would arrive disguised as a mediocre grade. We pre-registered four outcomes, among them a 10% bet we called "suspiciously perfect": if the grade came back *too high*, we'd investigate for data leakage before celebrating. Skepticism was in the protocol before the data was.

The result, on 1,513 real planets: the machine refused to draw a smooth curve. It drew a **bend** — a log-shaped formula that flattens hard right around 300 Earth-masses, exactly where astrophysics knows the giant plateau begins. Grade: 0.679. The best possible smooth power law on the same exam: **0.096**. The bend beats the smoothest story anyone could tell by a factor of seven.

[FIGURE 3 — real planets, the machine's bent curve, and the smooth curve that fails]

Nobody told it planets come in families. It found the families.

And the mediocre-sounding 0.679 landed exactly inside the band we'd pre-registered for "planet sizing has no one-sentence law" — the machine told the truth instead of a flattering story. We logged three caveats anyway: a physically meaningless sine wiggle in the formula, an overshoot at extreme masses, and suspiciously identical runner-up formulas. Remember those three; they're about to matter.

---

## Experiment 3: Same Question, New Lens

Those caveats had two possible sources: facts about planets, or artifacts of how the machine *looks* at planets. So we changed exactly one thing — the lens — and re-ran the identical question on the identical data.

The new lens was logarithmic space, where multiplication becomes addition, power laws become straight lines, and every planet family gets equal visual weight instead of letting the giants dominate. (Sanity check first: on textbook data, the log lens recovered Kepler's exponent as a clean 1.502. It works.)

Result: the grade rose from 0.679 to **0.755** on the same hidden-planet exam, the formula shrank to less than half its length, the plateau overshoot vanished, and the clone problem disappeared. Two of our three caveats had been lens artifacts all along. The structure — the bend, the families — survived, which is exactly what you want: real findings survive instrument changes; artifacts don't.

[FIGURE 4 — both lenses over the real planets: same bend, better rendered]

This experiment also handed us an accidental gem. We scored every formula with two different rulers — absolute error and relative error — and the *same* smooth power law scored 0.10 on one and 0.72 on the other. Identical formula, wildly different verdicts. Since that day, our protocol reports both rulers on everything. When someone shows you a single accuracy number, your first question should be: *which ruler?*

---

## Experiment 4: The Price of Understanding

Here's a question I care about as a visual learner who's not great at math: if you force the machine to keep its answers **short enough for a human to read**, how much truth does it give up?

We made brevity a dial — four settings from indulgent to brutal — and swept it across both problems: the one where nature's true law is short (orbits) and the one where it isn't (mass→radius). Eight runs. What came out was cleaner than anything we predicted:

**The explainability tax has a sign.**

On the messy problem, brevity is genuinely expensive: forcing the shortest formula cost 0.19 of exam grade. But on the simple problem, brevity *paid* — the brutal setting beat the indulgent one, which had bloated to a 45-token formula and overfit the noise. Demanding short answers costs you truth exactly when the truth isn't short, and *protects* you exactly when it is.

[FIGURE 5 — the frontier: formula length vs. exam grade for both problems]

My favorite detail: we could price the discovery itself. Watching the mass-radius formula starve from 44 tokens down to 2, the planet-families bend survives at length 5 and dies at length 2. **The insight costs about three tokens.** And the two-token haiku that remains — exp(√|log M|) — still captures 61% of the pattern.

---

## Experiment 5: The Secret-Law Census

For the finale we changed fields and raised the bar. The OEIS — the Online Encyclopedia of Integer Sequences — catalogues roughly 370,000 integer sequences humanity has found worth writing down. We asked every one of them a single question: *do you secretly obey a short exact law?*

No more R². In mathematics, a claimed law must predict **every** held-out term with perfect integer accuracy, or it's dead. Our harness proved it could refuse before it ran: fed a booby-trapped sequence that follows Fibonacci's rule for twenty terms and then lies, it caught the lie. It also correctly refused the primes and the Catalan numbers, which genuinely obey no such law.

The census: of 365,520 eligible sequences, **5.8%** obey an exact linear law. One in seventeen. Mathematics mostly refuses to be simple — our under-15% bet won, and our cozier 15–35% window would have missed it.

[FIGURE 6 — the census: 365,520 interrogated, 5.8% lawful, 4,776 distinct laws]

But the census's best story is a counting error — ours. The fun side-hunt was "stranger pairs": sequences obeying the *identical* law whose names share no vocabulary — candidate mathematical cousins nobody noticed. The raw count came back at 26,830 pairs, and it was a lie, inflated five-fold by trivial families of constants and zeros. Our investigate-before-celebrating rule caught it. After an honest filter: 5,556 pairs across 404 nontrivial families — still a hundred times our pre-registered threshold, and now real. A result that survives its own audit is worth ten that were never audited.

What do the honest ones look like? A 14th-century Indian cattle-breeding sequence (Narayana's cows) obeys the exact same law as counting Tatami-mat arrangements in a Japanese room. Jacobsthal numbers share a law with map colorings. The Perrin sequence pairs with Padovan differences. The miner even independently flagged an entry the encyclopedia itself marks as a duplicate. To be clear about what these are: **candidates, not claimed discoveries** — some are identities known to specialists, and sorting known from new is human work that starts now.

[FIGURE 7 — unnoticed cousins: same exact law, no shared vocabulary]

---

## What Five Experiments Actually Taught Us

**Verification is the whole game.** Every trustworthy thing in this study flows from one habit: the system never grades its own homework. Held-out planets, exact held-out integers, baselines, dual rulers, audits. None of it required trusting the AI — that was the point.

**Pre-registration is cheap and changes everything.** Writing down bets before results cost us minutes each time and made every outcome meaningful — including the misses. Our confidence numbers were routinely wrong in interesting ways (the 25% underdog won twice). That's not embarrassing; that's calibration data.

**Instruments are opinions.** The lens experiment and the ruler lesson taught the same thing from two sides: every methodological choice is a bet about what kind of world you're looking at. The only defense is changing one thing at a time and watching what moves.

**Simplicity is rarer than its reputation.** One in seventeen sequences. A planet relation with no one-sentence law. The universe's greatest hits — Kepler, Newton — are famous partly *because* short true laws are exceptional.

**And the meta-lesson:** none of this needed an institution. Public data, open-source tools, an AI collaborator to build the instruments, and a discipline borrowed from real science. The barrier to doing honest empirical work has never been lower. The discipline is the hard part, and the discipline is free.

## Limitations, Because Honesty Was the Whole Point

This is not peer-reviewed work, and the "rediscoveries" are exactly that — rediscoveries, valuable as instrument credentials rather than new science. The symbolic-regression engine is a modest open-source library, not the state of the art; serious tools like PySR would push every frontier here further. The stranger pairs await human review, and some will be old news to specialists. And an AI (Claude) built the instruments and co-wrote this article — every claim, however, is checkable against the repo without trusting either of us. That's by design.

## What's Next

The instruments are open. The experiment log — every pre-registration, every audit, every miss — is in the repo. Follow-ups we've scoped: a stronger search engine on the same harness, live datasets with anomaly-first sweeps, and the human review of those 5,556 mathematical cousins.

*Repo: github.com/TalkStudioLLC/AGI — experiments in `EXPERIMENTS.md`, the lab in `sr-lab/`, the census miner in `oeis-miner/`. Data: NASA Exoplanet Archive and OEIS (both open).*

---

*Tommy Berchtold builds streaming and infrastructure systems. This project began as a question about AGI and turned into a question about honesty. The machine still doesn't know any physics — and that's why the results are believable.*
