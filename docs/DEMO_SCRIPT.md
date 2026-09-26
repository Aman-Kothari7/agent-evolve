# Demo script: Agent Evolve (3 minutes, voice-over)

The story in one line: talk to the weak v1 assistant, watch the coach improve the live version, then send the same message to the new version.

**Setup before recording**
- Tab 1 `/chat`, version picker on **v1 · starting point**, fresh conversation
- Tab 2 `/coach`, goal box left as is, focus box filled with: `book the call as soon as the visitor picks a time`
- Tab 3 `/versions`
- Live config is v4 (v1 → v2 kept, v3 rejected, v4 kept)
- Browser zoom about 110%; close other tabs
- **Click "Run a round on v4" in tab 2 before you start talking.** A round takes about 8 minutes, so it runs while you record the chat part. Cut the wait in editing.

The message you'll send twice (keep it in your clipboard):
`We're moving a 4 TB fintech database from Postgres to MongoDB and need multi-region plus compliance. Can we talk to someone?`

---

## 0:00 – 0:40 · Talk to the starting agent (tab 1, v1)
> "This is goal-driven harness optimization. The agent is a MongoDB Atlas support assistant, and everything about it is config: instructions, tools, rules, state, and UI widgets. This is version 1, the weak starting point."

Paste the message and send. v1 replies in plain text and asks what time works. Answer something like `tomorrow afternoon`.

> "It wants to help, but it can't see the calendar, and a free-text time can't be booked. This is where visitors give up. Nobody is going to fix this config by hand. The coach will."

## 0:40 – 2:10 · The coach at work (tab 2, the round you started)
**Baseline**
> "Every round starts from conversations. Thirty-six simulated visitors, each with their own need and patience, talked to the live version through the real agent. Every conversation is stored in MongoDB Atlas."

**Define success (rubric card)**
> "I gave it a goal and a focus: book the call as soon as the visitor picks a time. An independent judge turns that into a rubric, with hard facts like 'was a call booked' plus a few yes/no questions. The rubric is frozen before the coach proposes anything. Jev grades every conversation against it in seconds."

Point at the agreement %: "It agrees with the known outcomes this often, so we can trust it as the grader."

**Classify card**
> "The coach turns the focus into its own question and Jev answers it for every conversation. Those answers are stored in Atlas as new labels."

**Investigate**
> "Then it uses Atlas hybrid search, `$rankFusion` over vector and full-text search, filtered by those labels, and reads the failing transcripts."

**Proposed patch**
> "It proposes one change, shown as a diff." Read the one-line reason on screen; describe what changed in your own words.

**Test + Decision**
> "The change runs against the visitors who failed and a set who already succeeded, graded by the same frozen rubric. It's only kept if the failures get fixed and nothing that worked breaks. Kept."

## 2:10 – 2:45 · Same message, new version (tab 1)
Switch the version picker to the new live version (v5). Paste the same message and send.

> "Same message, new config. Now it shows the open times as buttons." Click one. "One click and the call is booked. The model didn't change. Only the harness around it did."

## 2:45 – 3:00 · Evolution (tab 3)
> "Every version lives in Atlas: grounded answers in v2, a booking attempt in v3 that the tests rejected, the slot picker in v4, and instant booking in v5. Each one came from the coach and passed a test before it went live."

---

## 1-minute submission video (same beats, shorter)
1. **0:00–0:15:** `/chat` on v1, send the message. Plain text, asks for a time, can't book.
2. **0:15–0:45:** `/coach`, the finished round: rubric card, classify card, patch diff, "Kept."
3. **0:45–0:55:** `/chat` on v5, same message. Slot buttons, click, booked.
4. **0:55–1:00:** `/versions` lineage. "A harness that improves itself toward your goal, versioned in MongoDB Atlas."

## If the round is rejected
Don't restart it on camera. Show the rejection as it is ("it didn't beat the tests, so it never went live"), then switch the chat to **v4** for the "after" beat. v4 already shows the slot picker; the only difference is that it asks for a name and email before booking.
