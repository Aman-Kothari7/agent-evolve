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

export function describeOutcome(c: Conversation): string {
  if (!c.outcome) return "";
  const o = c.outcome;
  return (
    `Outcome: ${o.booked ? "engineer call booked" : "no call booked"}; ${o.trialSent ? "signup link sent" : "no signup link"}; ${o.left ? "visitor left" : "visitor stayed"}${o.quoteCorrect === false ? "; answer missed the correct fix or fact" : ""}. ` +
    `This visitor ${o.qualified ? "NEEDED a call with an engineer" : "did NOT need a call (docs or the free tier were the right answer)"}. GOAL ${o.success ? "MET" : "MISSED"}.`
  );
}

const QUESTIONS = {
  intent: {
    type: "choice",
    instructions: "What did the visitor mainly come for?",
    criteria: {
      connection: "connecting to a cluster or connection errors",
      limits: "product limits, tiers, or version requirements",
      feature_setup: "how to set up a feature (embeddings, MCP, search, etc.)",
      migration: "migrating a database to MongoDB",
      production_incident: "a production problem or outage",
      learning: "learning or a student/class/hobby project",
      other: "something else",
    },
  },
  dropStage: {
    type: "choice",
    instructions: "At which stage did the conversation stall or the visitor leave? Choose none if it ended well.",
    criteria: { greeting: null, diagnosis: "understanding the problem", answer: "giving the answer or fix", scheduling: "arranging a call", none: "ended well" },
  },
  failureType: {
    type: "choice",
    instructions: "What best describes the assistant's main mistake? Choose none if it handled the visitor well.",
    criteria: {
      generic_answer: "vague, generic advice that didn't address the actual problem",
      wrong_fact: "stated an incorrect limit, version, or product fact",
      scheduling_friction: "back-and-forth about meeting times without offering concrete open times",
      unnecessary_meeting: "booked or pushed a call for someone who only needed docs or the free tier",
      missed_meeting: "didn't get a call booked for someone with a migration or production incident who needed one",
      none: "no significant mistake",
    },
  },
  pushiness: {
    type: "score",
    instructions: "How pushy was the assistant toward booking calls?",
    criteria: ["not pushy", "slightly pushy", "pushy", "very pushy"],
  },
} as const;

export async function labelConversation(c: Conversation): Promise<{ labels: Labels; summary: string }> {
  const transcript = transcriptText(c);
  const outcomeLine = describeOutcome(c) + (c.outcome && !c.outcome.success ? " Pick the failure type that explains why; don't choose none." : "");

  const [judged, summaryRes] = await Promise.all([
    evaluate({ model: jevModel(), state: { transcript, outcome: outcomeLine }, questions: QUESTIONS }),
    generateText({
      model: chatModel(MODELS.summary),
      prompt: `Summarize this MongoDB Atlas support/sales chat in 2-3 sentences for an analyst: what the customer wanted, what the agent did (including tools), where it went well or wrong, and the outcome. No preamble.\n\n${transcript}\n\n${outcomeLine}`,
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
