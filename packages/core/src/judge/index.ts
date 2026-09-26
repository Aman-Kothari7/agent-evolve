// Goal → rubric → grades. An independent judge (a different model from the coach) turns the round's goal and
// focus into a frozen rubric of yes/no criteria. Jev grades every conversation against it, before and after a
// change. Hard events from the tool logs (a booked call, a sent signup link) can be criteria too.
import { experimental_evaluate as evaluate, generateText, Output } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transcriptText } from "../labeler";
import { chatModel, jevModel, MODELS } from "../models";
import { findConversations, getBookingFor, getDb, logCoachEvent } from "../store";
import type { Conversation } from "../types";

export const HARD_EVENTS = ["call_booked", "call_not_booked", "signup_link_sent"] as const;

export const Criterion = z.object({
  id: z.string().describe("lowercase_with_underscores"),
  kind: z.enum(["question", "event"]),
  appliesWhen: z.string().optional().describe("Yes/no question about the conversation; the criterion only counts when the answer is yes. Omit if it always applies."),
  question: z.string().optional().describe("For kind=question: a yes/no question about the conversation"),
  passWhen: z.enum(["yes", "no"]).optional().describe("For kind=question: which answer means the assistant did well (default yes)"),
  event: z.enum(HARD_EVENTS).optional().describe("For kind=event: a fact from the tool logs"),
});
export type Criterion = z.infer<typeof Criterion>;

export type Rubric = { _id: string; round: string; goal: string; focus?: string; summary: string; criteria: Criterion[]; model: string; createdAt: Date };
export type Grade = { rubricId: string; success: boolean; applicable: string[]; failed: string[] };

const JUDGE_MODEL = process.env.MODEL_JUDGE ?? "openai/gpt-5.4-mini";

export async function writeRubric(opts: { round: string; goal: string; focus?: string; feedback?: string }, attempt = 1): Promise<Rubric> {
  const r = await generateText({
    model: chatModel(JUDGE_MODEL),
    temperature: 0,
    // Strict structured outputs: every field required (nullable instead of optional), no array-length keywords.
    output: Output.object({
      schema: z.object({
        summary: z.string().describe("One sentence: what success means for this round"),
        criteria: z.array(
          z.object({
            id: z.string().describe("lowercase_with_underscores"),
            kind: z.enum(["question", "event"]),
            appliesWhen: z.string().nullable().describe("Yes/no question; the criterion only counts when the answer is yes. null if it always applies."),
            question: z.string().nullable().describe("For kind=question: a yes/no question about the conversation; null for events"),
            passWhen: z.enum(["yes", "no"]).nullable().describe("For kind=question: which answer is good; null for events"),
            event: z.enum(HARD_EVENTS).nullable().describe("For kind=event: the tool-log fact; null for questions"),
          }),
        ).describe("2 to 6 criteria"),
      }),
    }),
    prompt: `You are an independent judge. Write a rubric that decides whether ONE conversation between a website visitor and the MongoDB Atlas website assistant was handled well, according to the goal below. You never propose changes; you only define success.

GOAL: ${opts.goal}
${opts.focus ? `FOCUS FOR THIS ROUND: ${opts.focus}\n(The focus names a PROBLEM or area to improve. Success means the problem does NOT happen: e.g. focus "visitors who need a call can't get one booked" → success = those visitors DO get a call booked.)\n` : ""}
How a rubric works:
- 3 to 6 criteria. A conversation succeeds when every criterion that applies to it passes.
- appliesWhen: a full yes/no QUESTION about the visitor or conversation (e.g. "Is the visitor a student or working on a class or hobby project?"). The criterion only counts when the answer is yes. Use null if it applies to every conversation. Never write just "yes" or "no".
- kind "question": a yes/no question a fast classifier answers from the transcript (visitor messages, assistant replies, and markers like [tool search_docs] or [widget slot_picker]). passWhen says which answer is good.
- kind "event": a hard fact from the tool logs. call_booked passes when a real engineer call was booked. call_not_booked passes when no call was booked. signup_link_sent passes when the free-tier signup link was sent.
- Criteria must be observable in the transcript. Don't ask whether a fact is "correct" (the classifier can't verify it); ask whether the answer was specific and grounded in a docs search or limits lookup.
- Prefer kind "event" (hard facts) wherever possible. Use at most 2 kind "question" criteria.
- Keep every appliesWhen narrow and unambiguous: it must only match visitors who clearly fit (e.g. who say they are a student or on a class/hobby project). Never use catch-alls like "or otherwise not in production".
- Criteria must not overlap: don't judge the same behavior twice in different words.
- Cover the goal as a whole, weighted toward the focus. The rubric must stay valid no matter how the assistant is configured.

Example rubric for a goal like "resolve support questions; book engineer calls only for production workloads; send learners to the free tier":
1. call_booked_when_needed: event call_booked; appliesWhen "Does the visitor have a large or regulated migration or a production incident and ask to talk to someone?"
2. no_call_for_learners: event call_not_booked; appliesWhen "Is the visitor a student, learner, or working on a class, hobby, or prototype project?"
3. signup_for_learners: event signup_link_sent; appliesWhen (same learner question)
4. grounded_answer: question "Did the assistant give a specific answer grounded in a docs search or limits lookup, rather than a guess, refusal, or vague advice?" passWhen yes; appliesWhen "Did the visitor ask a factual or technical question?"
5. resolved_problem: question "Did the assistant name the likely cause of the visitor's problem and how to fix it?" passWhen yes; appliesWhen "Did the visitor report an error or problem?"${opts.feedback ? `\n\nCALIBRATION FEEDBACK on your previous rubric (these conversations have known outcomes and your rubric graded them wrong). Revise the rubric so it grades cases like these correctly:\n${opts.feedback}` : ""}`,  });
  const out = r.output as { summary: string; criteria: Record<string, string | null>[] };
  const criteria: Criterion[] = out.criteria.slice(0, 6).map((c, i) => ({
    id: String(c.id || `c${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    kind: c.kind === "event" ? "event" : "question",
    ...(c.appliesWhen && c.appliesWhen.trim().length > 12 ? { appliesWhen: c.appliesWhen } : {}),
    ...(c.question ? { question: c.question } : {}),
    ...(c.passWhen ? { passWhen: c.passWhen as "yes" | "no" } : {}),
    ...(c.event ? { event: c.event as (typeof HARD_EVENTS)[number] } : {}),
  }));
  const usable = criteria.filter((c) => (c.kind === "event" ? !!c.event : !!c.question));
  if (usable.length < 2) {
    if (attempt < 2) return writeRubric(opts, attempt + 1);
    throw new Error("The judge returned an unusable rubric");
  }
  criteria.splice(0, criteria.length, ...usable);
  const rubric: Rubric = { _id: randomUUID(), round: opts.round, goal: opts.goal, focus: opts.focus, summary: out.summary, criteria, model: JUDGE_MODEL, createdAt: new Date() };
  await (await getDb()).collection<Rubric>("rubrics").insertOne(rubric);
  return rubric;
}

export async function gradeConversation(c: Conversation, rubric: Rubric): Promise<Grade> {
  const questions: Record<string, { type: "boolean"; instructions: string }> = {};
  for (const cr of rubric.criteria) {
    if (cr.appliesWhen) questions[`a_${cr.id}`] = { type: "boolean", instructions: cr.appliesWhen };
    if (cr.kind === "question" && cr.question) questions[`q_${cr.id}`] = { type: "boolean", instructions: cr.question };
  }
  const answers = Object.keys(questions).length
    ? ((await evaluate({ abortSignal: AbortSignal.timeout(45_000), model: jevModel(), state: { transcript: transcriptText(c) }, questions })).answers as Record<string, { probability?: number }>)
    : {};
  const yes = (k: string) => (answers[k]?.probability ?? 0) >= 0.5;
  const booked = !!(await getBookingFor(c._id));
  const signup = c.turns.some((t) => (t.toolCalls ?? []).some((x) => x.tool === "send_signup_link" && !x.blockedBy));

  const applicable: string[] = [];
  const failed: string[] = [];
  for (const cr of rubric.criteria) {
    if (cr.appliesWhen && !yes(`a_${cr.id}`)) continue;
    applicable.push(cr.id);
    let pass: boolean;
    if (cr.kind === "event") pass = cr.event === "call_booked" ? booked : cr.event === "call_not_booked" ? !booked : signup;
    else pass = yes(`q_${cr.id}`) === ((cr.passWhen ?? "yes") === "yes");
    if (!pass) failed.push(cr.id);
  }
  const grade: Grade = { rubricId: rubric._id, success: failed.length === 0, applicable, failed };
  await (await getDb()).collection("conversations").updateOne({ _id: c._id as never }, { $set: { grade } });
  return grade;
}

/** Grades every finished practice conversation on a version; reports how often the rubric agrees with the hidden practice rules. */
export async function gradeVersion(version: number, rubric: Rubric, round?: string, concurrency = 12) {
  const convos = await findConversations({ configVersion: version, source: "sim", outcome: { $exists: true } } as never, 500);
  const t0 = Date.now();
  const queue = [...convos];
  let pass = 0;
  let agree = 0;
  let n = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          const g = await gradeConversation(c, rubric);
          n++;
          if (g.success) pass++;
          if (g.success === !!c.outcome?.success) agree++;
        } catch {
          // ungraded conversations are simply skipped
        }
      }
    }),
  );
  const result = { version, graded: n, success: pass, agreement: n ? Math.round((100 * agree) / n) : 0, seconds: Math.round((Date.now() - t0) / 100) / 10, rubricId: rubric._id };
  if (round) await logCoachEvent(round, "grading", result);
  return result;
}

/** Conversations where the rubric disagreed with the known practice outcome, described for the judge. */
export async function calibrationFeedback(version: number, rubric: Rubric, max = 8): Promise<string> {
  const convos = await findConversations({ configVersion: version, source: "sim", "grade.rubricId": rubric._id, outcome: { $exists: true } } as never, 500);
  const wrong = convos.filter((c) => (c as { grade?: Grade }).grade?.success !== !!c.outcome?.success).slice(0, max);
  return wrong
    .map((c) => {
      const g = (c as { grade?: Grade }).grade!;
      const opening = c.turns.find((t) => t.role === "customer")?.text.slice(0, 160) ?? "";
      return `- Visitor opened with "${opening}". Known outcome: ${c.outcome?.success ? "handled well" : "NOT handled well"}. Your rubric said: ${g.success ? "pass" : `fail on ${g.failed.join(", ")}`}. Summary: ${(c.summary ?? "").slice(0, 220)}`;
    })
    .join("\n");
}
