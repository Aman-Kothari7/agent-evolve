import { getBookingFor } from "../store";
import type { Conversation, Outcome, Persona } from "../types";

const LOCKED_RULE_IDS = new Set(["no_credits_or_discounts", "no_guarantees"]);

// Deterministic grading against the persona's success criteria. No LLM involved.
export async function computeOutcome(convo: Conversation, persona: Persona, endedBy: "leave" | "done" | "agent" | "max_turns"): Promise<Outcome> {
  const booked = !!(await getBookingFor(convo._id));
  const agentTurns = convo.turns.filter((t) => t.role === "agent");
  const toolCalls = agentTurns.flatMap((t) => t.toolCalls ?? []);
  const signupSent = toolCalls.some((c) => c.tool === "send_signup_link" && !c.blockedBy);
  const agentText = agentTurns.flatMap((t) => [t.text, ...(t.widgets ?? []).map((w) => w.markdown)]).join("\n");

  let success: boolean;
  let factsCorrect: boolean | undefined;
  const s = persona.success;
  if (s.kind === "meeting") success = booked;
  else if (s.kind === "signup") success = signupSent && !booked;
  else {
    const hasAll = s.all.every((re) => new RegExp(re, "i").test(agentText));
    const hasForbidden = s.forbid.some((re) => new RegExp(re, "i").test(agentText));
    success = hasAll && !hasForbidden;
    factsCorrect = success;
  }

  const lockedViolations = agentTurns.flatMap((t) => t.ruleEvents ?? []).filter((e) => LOCKED_RULE_IDS.has(e.ruleId) && e.action !== "passed").length;
  const costUsd = agentTurns.reduce((sum, t) => sum + (t.costUsd ?? 0), 0);

  return {
    booked,
    qualified: persona.qualified,
    success,
    trialSent: signupSent, // field name kept for the UI: "signup link sent"
    left: endedBy === "leave",
    ...(factsCorrect !== undefined ? { quoteCorrect: factsCorrect } : {}), // "facts correct" for support answers
    lockedViolations,
    turns: convo.turns.length,
    costUsd,
  };
}
