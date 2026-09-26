import { generateText } from "ai";
import { priceFor } from "../data/business";
import { chatModel, MODELS } from "../models";
import type { Persona } from "../types";

export type SimLine = { role: "customer" | "agent"; text: string };
export type CustomerMove = { text: string; ended: "leave" | "done" | null };

function expectedQuote(p: Persona): string {
  const plan = p.hidden.need === "sso" || p.hidden.need === "security_review" ? "business" : p.hidden.teamSize <= 10 ? "starter" : "team";
  const q = priceFor(plan, p.hidden.teamSize, p.hidden.billing);
  if (!q) return "";
  return `You already know the correct price for the ${plan} plan at your size: $${q.perSeatEffective}/seat/month, $${q.monthly.toLocaleString()} per month, $${q.annualTotal.toLocaleString()} per year if billed annually. If the assistant quotes a different total for that plan, point it out once; if it gets it wrong again, give up.`;
}

function systemPrompt(p: Persona): string {
  const h = p.hidden;
  const b = p.behavior;
  const rules = [
    "You are role-playing a real person visiting a software company's website chat. Stay in character.",
    `You are ${h.name}, ${h.role}. Team size: ${h.teamSize}. Main need: ${h.need.replace("_", " ")}. Billing preference: ${h.billing}. Timeline: ${h.timeline}.${h.competitor ? ` You currently use ${h.competitor}.` : ""}`,
    "Only reveal these facts when asked or when it comes up naturally. Keep every reply to 1-2 short sentences, casual, like a busy person typing in a chat widget.",
    b.readiness === "ready" ? "You are ready to talk to sales soon if the product fits." : b.readiness === "browsing" ? "You are just browsing and want quick answers." : "You are evaluating options and want concrete answers before committing to anything.",
    p.qualified
      ? "If the product fits your need and you get a clear answer on price, you are happy to book a demo call, picking one of the specific times offered."
      : "You are a small buyer. A self-serve free trial suits you best. If a trial link is offered, take it and say thanks. If the assistant offers you a sales call instead, you will accept it (you don't know any better).",
    b.leavesIfContactBeforePrice ? "IMPORTANT: If the assistant asks for your email, phone, or contact details before it has told you an actual price, you get annoyed, say you just wanted a number, and leave." : "",
    `Scheduling: if the assistant asks you when you're free instead of offering specific available times, answer vaguely once. If it takes more than ${b.maxSchedulingExchanges} back-and-forth message(s) to agree on a time, give up politely and leave.`,
    b.checksMath ? expectedQuote(p) : "",
    "If the assistant shows options or buttons (markdown links like [label](action:...)), you can reply with exactly the label text to pick one.",
    "End your message with [DONE] once you've booked a demo or received a trial link that fits you. End with [LEAVE] if you give up. Otherwise don't add either tag.",
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
