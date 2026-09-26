import { validPriceFigures } from "../data/business";
import { getBookingFor } from "../store";
import type { Conversation, Outcome, Persona } from "../types";

const LOCKED_RULE_IDS = new Set(["no_invented_discounts", "no_invented_features"]);

// Dollar amounts in agent text, e.g. "$1,080", "$45/seat", "$48,600.00".
function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$\s?([\d,]+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
}

// Deterministic grading. No LLM involved.
export async function computeOutcome(convo: Conversation, persona: Persona, endedBy: "leave" | "done" | "agent" | "max_turns"): Promise<Outcome> {
  const booked = !!(await getBookingFor(convo._id));
  const agentTurns = convo.turns.filter((t) => t.role === "agent");
  const toolCalls = agentTurns.flatMap((t) => t.toolCalls ?? []);
  const trialSent = toolCalls.some((c) => c.tool === "send_trial_link" && !c.blockedBy);

  const quoted = agentTurns.flatMap((t) => [t.text, ...(t.widgets ?? []).map((w) => w.markdown)]).flatMap(dollarAmounts);
  let quoteCorrect: boolean | undefined;
  if (quoted.length) {
    const valid = validPriceFigures(persona.hidden.teamSize);
    quoteCorrect = quoted.every((q) => valid.some((v) => Math.abs(v - q) <= Math.max(1, v * 0.01)));
  }

  const lockedViolations = agentTurns.flatMap((t) => t.ruleEvents ?? []).filter((e) => LOCKED_RULE_IDS.has(e.ruleId) && e.action !== "passed").length;

  return {
    booked,
    qualified: persona.qualified,
    success: persona.qualified ? booked : trialSent && !booked,
    trialSent,
    left: endedBy === "leave",
    ...(quoteCorrect !== undefined ? { quoteCorrect } : {}),
    lockedViolations,
    turns: convo.turns.length,
    costUsd: 0,
  };
}
