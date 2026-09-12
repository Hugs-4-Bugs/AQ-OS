## Interview Difficulty Blueprint — How Hard Should You Prepare?

> **Difficulty mix recommendation for a 4-year engineer at product companies** (based on the Uber / Meta / NetApp / Google / Amazon interview pattern for backend roles):

| Difficulty | Share of questions you should master | What they test | Examples in this guide |
|---|---|---|---|
| **Easy** | ~15–20% | Definitions, annotation syntax, "did you actually use this" | Q3-14 CORS, Q5-18 audit fields, Q7-9 @Cacheable |
| **Medium** | ~40–45% | Feature design, standard patterns, trade-off awareness | Q3-9 @Async, Q5-10 pagination, Q8-4 error format |
| **Hard** | ~25–30% | Internals, concurrency, failure modes, measured numbers | Q5-15 locking, Q6-6 zero-downtime migrations, Q7-5 distributed locks |
| **Twisted / Scenario** | ~10–15% | Debugging live incidents, "what breaks at 10× scale", adversarial follow-up chains | Q2-15 duplicate emails, Q6-15 500M rows, Q7-10 Redis down at peak |

**How interviewers at each target company actually drill:**

- **Uber (your next interview)** — system-design-heavy, real-time and marketplace-shaped thinking. Expect: "walk me through the API end-to-end" (Q2-11, Appendix B), queueing vs inline trade-offs, idempotency under retries, and at-least-once semantics. Uber interviewers love the phrase "what breaks first at 10×?" — rehearse Q2-14, Q6-15, Q12-3. Coding rounds: clean HashMap/stream usage, concurrency (ThreadPoolExecutor sizing is a favorite).
- **NetApp** — deeper JVM and OS-layer probes: GC internals (Q12-9), memory model, file I/O, storage-shaped questions (their domain: expect "how would you design for sequential write throughput"). Hibernate session internals and locking (Q5-9, Q5-15) land well here.
- **Meta** — scale + product thinking combined. "Design for 100M users" variants (Q2-14), move-fast trade-offs (what would you NOT build — Q14-10), and behavioral rounds that drill ownership (Q14-3, Q14-9). They probe metric intuition: know your numbers cold (p95, error budgets, hit rates).
- **Google** — algorithm-adjacent system design, "estimate then design" (the general PDF's Part 5), and API design purity (Q8-4, Q8-10's compatibility machinery impresses here).
- **Amazon** — Leadership Principles woven into technical answers: every STAR story (Category 14) should name the principle it demonstrates (Dive Deep for Q12-5, Ownership for Q14-3, Earn Trust for Q14-3's credit-grant, Deliver Results for Q14-4).

**The twisted-question ladder** — how interviewers escalate one topic (practice climbing it aloud):

1. "How does your credit deduction work?" → (normal)
2. "Two requests deduct simultaneously — exactly what happens at the row level?" → (hard)
3. "Now the DB is a read replica behind by 2 seconds — what does the user see?" → (twisted)
4. "You can't change the schema. Fix it in code." → (expert-twisted)

Every question in this guide lists its follow-up chain — practice answering level 2-4 BEFORE the interview, because that's where offers are decided.

---

