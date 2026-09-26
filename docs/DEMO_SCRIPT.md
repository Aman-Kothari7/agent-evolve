# Demo script: Agent Evolve (3 minutes, voice-over)

**Setup before recording**
- App open at `/coach`, focus box filled with: `stop offering engineer calls to students and hobby projects`
- Second tab on `/replay` with the compare panel set to **v2 vs v3**
- Live config is v3 (after the two story rounds)
- Browser zoom about 110%; close other tabs

---

## 0:00 – 0:15 · The problem (on /coach, before clicking)
> "This is a support assistant for MongoDB Atlas. It answers questions and books calls with engineers. Its behavior comes from a config: instructions, tools, rules, state, and UI widgets. Agent Evolve is a harness that rewrites that config toward a goal, using evidence from its own conversations."

**Click "Run a round on v3"** so the round runs while you show the next part.

## 0:15 – 1:05 · Same message, before and after (on /replay → Send to both)
Type: `We're moving a 4 TB fintech database from Postgres to MongoDB and need multi-region plus compliance. Can we talk to someone?`

> "Same visitor message, two versions of the config. On v2 the assistant answers in text and asks what time works. That's where real visitors gave up: it couldn't see the calendar, and free-text times can't be booked."
>
> "On v3 it shows a slot picker. I click a time, and the call is booked."

Point at the tag **v3 · widget slot_picker**.

> "Nobody wrote this widget by hand. The coach proposed it after it saw every visitor who needed a call fail at scheduling. It turned on the calendar tool, made it run before booking, and rendered the times as buttons."

## 1:05 – 2:30 · The coach at work (back on /coach, the round you started)
**Baseline / Diagnose**
> "Every round starts from real conversations. Thirty-six practice visitors talked to v3 through the real agent, and code graded each one against a hidden success rule: was a real slot booked, was the signup link sent, was the fact correct."

**Classify card**
> "Here's the key step. The coach turns this round's focus into its own question: 'Did the assistant offer an engineer call to someone with no production workload?' Jev, a fast classifier, answers it for every conversation in about two seconds, and the answers are stored in MongoDB Atlas as new labels."

**Investigate**
> "Then it uses Atlas hybrid search, `$rankFusion` over vector and full-text search, filtered by those labels, and reads the failing transcripts."

**Proposed patch**
> "It proposes one change, shown as a diff: a new state fact for whether the visitor has a production workload, the calendar and booking tools gated on it, and a rule against offering calls to learners."

**Test + Decision**
> "The change is only kept if it fixes the visitors who failed this way without breaking the ones who already succeeded. Graded by code, not by an LLM's opinion."

(If the decision hasn't landed yet, click the previous finished round in the round picker.)

## 2:30 – 3:00 · Evolution (on /versions)
> "Every version lives in Atlas: v1, grounded answers in v2, the booking widget in v3, and the student fix now. Rejected ideas stay in the history too. The model never changed; the harness around it learned."

---

## 1-minute submission video (same beats, shorter)
1. **0:00–0:20:** `/replay`, v2 vs v3, same message. Plain text vs slot-picker widget.
2. **0:20–0:50:** `/coach`, a finished round: classify card, then the patch diff, then "Kept."
3. **0:50–1:00:** `/versions` lineage. "A harness that rewrites itself from its own conversations, stored in MongoDB Atlas."
