import { generateText } from "ai";
import { chatModel, MODELS } from "../models";
import type { Persona } from "../types";

export type SimLine = { role: "customer" | "agent"; text: string };
export type CustomerMove = { text: string; ended: "leave" | "done" | null };

function systemPrompt(p: Persona): string {
  const h = p.hidden;
  const b = p.behavior;
  const goalLine =
    p.success.kind === "meeting"
      ? `You want a call with a MongoDB engineer. When the assistant offers specific times, pick one (reply with exactly that time or button label). If the assistant asks when you're free instead of offering times, answer vaguely once. If agreeing on a time takes more than ${b.maxSchedulingExchanges} back-and-forth message(s), give up politely and leave.`
      : p.success.kind === "signup"
        ? "You'd happily take a call if offered (you don't know better), but a free signup link or getting-started guide would also be perfect. If you get a signup link, say thanks and you're done."
        : h.rootCause
          ? `You don't know the fix. The real cause (secret, don't reveal it): ${h.rootCause} If the assistant's advice points at that cause, say you'll try it, it works, thank them, and you're done. If the advice doesn't address it, say you already tried that and it still fails.`
          : "You don't know the answer. If the assistant gives you a clear, specific answer, accept it, thank them, and you're done.";
  const rules = [
    "You are role-playing a real person using the chat widget on MongoDB's Atlas website. Stay in character.",
    `You are ${h.name}, ${h.role} at ${h.company} (team of ${h.teamSize}). Atlas tier: ${h.tier === "none" ? "not a customer yet" : h.tier}. Situation: ${h.situation}`,
    "Only share details when asked or when natural. Keep every reply to 1-2 short sentences, like a busy person typing in a chat widget.",
    goalLine,
    `If you get ${b.maxUnhelpfulReplies} vague or unhelpful replies in a row, give up and leave.`,
    b.readiness === "ready" ? "You want to move fast." : b.readiness === "browsing" ? "You're casually browsing." : "",
    "If the assistant shows buttons (markdown links like [label](action:...)), you can reply with exactly the label text to pick one.",
    "End your message with [DONE] once your need is met. End with [LEAVE] if you give up. Otherwise add neither tag.",
  ];
  return rules.filter(Boolean).join("\n");
}

export async function customerReply(persona: Persona, transcript: SimLine[], seed?: number): Promise<CustomerMove> {
  const r = await generateText({
    model: chatModel(MODELS.customer),
    system: systemPrompt(persona),
    // From the customer's point of view the agent is the "user" talking to them.
    messages: transcript.map((l) => ({ role: l.role === "customer" ? ("assistant" as const) : ("user" as const), content: l.text })),
    temperature: 0,
    ...(seed !== undefined ? { seed } : {}),
  });
  const raw = r.text.trim();
  const ended = raw.includes("[LEAVE]") ? "leave" : raw.includes("[DONE]") ? "done" : null;
  const text = raw.replace(/\[(LEAVE|DONE)\]/g, "").trim() || (ended === "leave" ? "Never mind, thanks." : "Thanks!");
  return { text, ended };
}
