// Typed yes/no and multiple-choice judgments via Jev, with a cheap-LLM fallback.
import { experimental_evaluate as evaluate, generateText, Output } from "ai";
import { z } from "zod";
import { chatModel, jevModel, MODELS } from "../models";

export type Question =
  | { type: "boolean"; instructions: string }
  | { type: "choice"; instructions: string; options: Record<string, string | null> };

export type Answer = { type: "boolean"; probability: number } | { type: "choice"; choice: string; confidence: number };

type JsonState = string | Record<string, unknown>;

export async function ask(state: JsonState, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  if (!Object.keys(questions).length) return {};
  try {
    const r = await evaluate({
      model: jevModel(),
      state: state as never,
      questions: Object.fromEntries(
        Object.entries(questions).map(([k, q]) => [
          k,
          q.type === "boolean" ? { type: "boolean", instructions: q.instructions } : { type: "choice", instructions: q.instructions, criteria: q.options },
        ]),
      ),
    });
    const out: Record<string, Answer> = {};
    for (const [k, a] of Object.entries(r.answers as Record<string, { type: string; probability?: number; choice?: string; probabilities?: Record<string, number> }>)) {
      out[k] =
        a.type === "choice"
          ? { type: "choice", choice: a.choice!, confidence: a.probabilities?.[a.choice!] ?? 1 }
          : { type: "boolean", probability: a.probability ?? 0 };
    }
    return out;
  } catch (e) {
    console.warn(`[jev] falling back to LLM: ${e instanceof Error ? e.message : e}`);
    return askWithLlm(state, questions);
  }
}

async function askWithLlm(state: JsonState, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [k, q] of Object.entries(questions)) {
    const keys = q.type === "choice" ? Object.keys(q.options) : [];
    shape[k] = (q.type === "boolean" ? z.boolean() : z.enum(keys as [string, ...string[]])).describe(q.instructions);
  }
  const r = await generateText({
    model: chatModel(MODELS.summary),
    temperature: 0,
    output: Output.object({ schema: z.object(shape) }),
    prompt: `Answer each field about this state.\n\n${typeof state === "string" ? state : JSON.stringify(state, null, 2)}`,
  });
  const o = r.output as Record<string, boolean | string>;
  return Object.fromEntries(
    Object.entries(questions).map(([k, q]) => [
      k,
      q.type === "boolean" ? { type: "boolean", probability: o[k] ? 1 : 0 } : { type: "choice", choice: String(o[k]), confidence: 1 },
    ]),
  );
}
