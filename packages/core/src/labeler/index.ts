import { experimental_evaluate as evaluate, generateText } from "ai";
import { chatModel, jevModel, MODELS } from "../models";
import { findConversations, setLabels } from "../store";
import type { Conversation, Labels } from "../types";

export function transcriptText(c: Conversation): string {
  return c.turns
    .map((t) => {
      const tools = (t.toolCalls ?? []).map((x) => `[tool ${x.tool}${x.blockedBy ? ` BLOCKED by ${x.blockedBy}` : ""}]`).join(" ");
      const widgets = (t.widgets ?? []).map((w) => `[widget ${w.name}]`).join(" ");
      return `${t.role}: ${t.text} ${tools} ${widgets}`.trim();
    })
    .join("\n");
}

const QUESTIONS = {
  intent: {
    type: "choice",
    instructions: "What did the customer mainly come for?",
    criteria: {
      pricing: "a price or quote",
      sso_security: "SSO, security, audit logs or compliance",
      integrations: "integrations with other tools",
      scheduling: "booking a demo or call",
      trial: "a free trial or cheap self-serve option",
      competitor: "comparing with a competitor",
      other: "something else",
    },
  },
  dropStage: {
    type: "choice",
    instructions: "At which stage did the conversation stall or the customer leave? Choose none if it ended well.",
    criteria: { greeting: null, discovery: null, pricing: null, qualification: null, scheduling: null, none: "ended well" },
  },
  failureType: {
    type: "choice",
    instructions: "What best describes the agent's main mistake? Choose none if the agent handled it well.",
    criteria: {
      contact_before_price: "asked for email or contact details before giving a price",
      wrong_quote: "quoted a wrong or inconsistent price",
      scheduling_friction: "back-and-forth about meeting times without offering concrete slots",
      unqualified_booking: "booked a sales call for a very small team or individual who should use the trial",
      missed_qualification: "never learned team size or need, or never offered a demo to a good-fit buyer",
      generic_answer: "vague or generic answers that did not address the question",
      none: "no significant mistake",
    },
  },
  pushiness: {
    type: "score",
    instructions: "How pushy was the agent toward sales calls or collecting contact details?",
    criteria: ["not pushy", "slightly pushy", "pushy", "very pushy"],
  },
} as const;

export async function labelConversation(c: Conversation): Promise<{ labels: Labels; summary: string }> {
  const transcript = transcriptText(c);
  const outcomeLine = c.outcome
    ? `Outcome: ${c.outcome.booked ? "demo booked" : "no booking"}; ${c.outcome.trialSent ? "trial link sent" : "no trial link"}; ${c.outcome.left ? "customer left" : "customer stayed"}${c.outcome.quoteCorrect === false ? "; quote was wrong" : ""}.`
    : "";

  const [judged, summaryRes] = await Promise.all([
    evaluate({ model: jevModel(), state: { transcript, outcome: outcomeLine }, questions: QUESTIONS }),
    generateText({
      model: chatModel(MODELS.summary),
      prompt: `Summarize this sales-chat conversation in 2-3 sentences for an analyst: what the customer wanted, what the agent did (including tools), where it went well or wrong, and the outcome. No preamble.\n\n${transcript}\n\n${outcomeLine}`,
      temperature: 0,
    }),
  ]);

  const a = judged.answers;
  const violations = c.turns.flatMap((t) => t.ruleEvents ?? []).filter((e) => e.action !== "passed").map((e) => e.ruleId);
  const labels: Labels = {
    intent: a.intent.choice,
    dropStage: a.dropStage.choice,
    failureType: a.failureType.choice,
    pushiness: Math.round(a.pushiness.score) + 1,
    violations: [...new Set(violations)],
  };
  const summary = summaryRes.text.trim();
  await setLabels(c._id, labels, summary);
  return { labels, summary };
}

export async function labelPending(limit = 200, concurrency = 10) {
  const pending = await findConversations({ outcome: { $exists: true }, labels: { $exists: false } } as never, limit);
  let n = 0;
  const queue = [...pending];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          await labelConversation(c);
          n++;
        } catch (e) {
          console.log(`  label failed ${c._id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }),
  );
  return { labeled: n, pending: pending.length };
}
