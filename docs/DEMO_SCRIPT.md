# Demo script: Agent Evolve (3 minutes, voice-over)

**Setup before recording**
- App open at `/coach`, focus box filled with: `book the call as soon as the visitor picks a time` (goal box: leave as is)
- Second tab on `/replay` with the compare panel set to **v2 vs v4**
- Live config is v4 (v1 → v2 kept, v3 rejected, v4 kept)
- Browser zoom about 110%; close other tabs

---

## 0:00 – 0:15 · The problem (on /coach, before clicking)
> "This is goal-driven harness optimization. The agent, a MongoDB Atlas support assistant, is defined as config: instructions, tools, rules, state, and UI widgets. A coach improves that config toward a goal, and every change is graded against the goal before it's kept."

**Click "Run a round on v4"** so the round runs while you show the next part.

## 0:15 – 1:05 · Same message, before and after (on /replay → Send to both)
Type: `We're moving a 4 TB fintech database from Postgres to MongoDB and need multi-region plus compliance. Can we talk to someone?`

> "Same visitor message, two versions of the config. On v2 the assistant answers in text and asks what time works. That's where real visitors gave up: it couldn't see the calendar, and free-text times can't be booked."
>
> "On v4 it shows a slot picker. I click a time, and the call is booked."

Point at the tag **v4 · widget slot_picker**.

> "Nobody wrote this widget by hand. The coach proposed it after it saw every visitor who needed a call fail at scheduling. It turned on the calendar tool, made it run before booking, and rendered the times as buttons."

## 1:05 – 2:30 · The coach at work (back on /coach, the round you started)
**Baseline / Diagnose**
> "Every round starts from real conversations. Thirty-six simulated visitors, each with their own need and patience, talked to v4 through the real agent, and every conversation is stored in Atlas."

**Define success (rubric card)**
> "First, an independent judge turns the goal and this round's focus into a rubric: hard facts like 'was a call booked' plus a few yes/no questions. It's frozen before the coach proposes anything. Jev grades every conversation against it in a few seconds, and it agrees with the practice set's known outcomes about 95% of the time."

**Classify card**
> "Then the coach turns the focus into its own question: 'Did the visitor pick a time but the call wasn't booked right away?' Jev answers it for every conversation in about a second, and the answers are stored in MongoDB Atlas as new labels."

**Investigate**
> "Then it uses Atlas hybrid search, `$rankFusion` over vector and full-text search, filtered by those labels, and reads the failing transcripts."

**Proposed patch**
> "It proposes one change, shown as a diff. Here it rewires booking so that picking a time books the call immediately, instead of asking for more details first."

**Test + Decision**
> "It's only kept if more of the failing visitors now meet the goal and none of the passing ones break, graded by the same frozen rubric before and after."

(If the decision hasn't landed yet, click the previous finished round in the round picker.)

## 2:30 – 3:00 · Evolution (on /versions)
> "Every version lives in Atlas: v1, grounded answers in v2, a first booking attempt in v3 that the tests rejected, the booking widget in v4, and instant booking now. Rejected ideas stay in the history too. The model never changed; the harness around it did."

---

## 1-minute submission video (same beats, shorter)
1. **0:00–0:20:** `/replay`, v2 vs v4, same message. Plain text vs slot-picker widget.
2. **0:20–0:50:** `/coach`, a finished round: classify card, then the patch diff, then "Kept."
3. **0:50–1:00:** `/versions` lineage. "A harness that rewrites itself from its own conversations, stored in MongoDB Atlas."
