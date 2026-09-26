// Built-in tools, plus the wrapper that runs coach-written template tools.
import { z } from "zod";
import type { TemplateTool } from "../config/schema";
import { executeTemplateTool } from "../config/template";
import { GET_STARTED_URL, SIGNUP_URL } from "../data/business";
import { findOpenSlot, getDb, getOpenSlots, insertBooking, markSlotBooked, searchKnowledge } from "../store";

export type ToolCtx = { conversationId: string };

type Builtin = { input: z.ZodObject; run: (input: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown> };

export const BUILTINS: Record<string, Builtin> = {
  search_docs: {
    input: z.object({ query: z.string().describe("What to look up in the MongoDB docs") }),
    run: async (input) => ({
      results: (await searchKnowledge(String(input.query), 2)).map((d) => ({ title: d.title, url: d.url, text: d.text })),
    }),
  },
  get_slots: {
    input: z.object({}),
    run: async () => ({ slots: (await getOpenSlots(3)).map((s) => ({ slotId: s.slotId, label: s.label })) }),
  },
  book_meeting: {
    input: z.object({
      slot: z.string().describe("The slotId or the exact time label of an open slot"),
      topic: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
    }),
    run: async (input, ctx) => {
      // Only real, open slots can be booked; free-text times like "Tuesday afternoon" are rejected.
      const slot = await findOpenSlot(String(input.slot));
      if (!slot) return { booked: false, error: "That isn't an open time on the engineers' calendar. You need an exact open slot to book." };
      await markSlotBooked(slot.slotId as string);
      await insertBooking({ conversationId: ctx.conversationId, slot: slot.label as string, name: input.name as string | undefined, email: input.email as string | undefined });
      return { booked: true, slot: slot.label };
    },
  },
  lookup_limits: {
    input: z.object({
      tier: z.enum(["free", "flex", "dedicated"]).optional().describe("Cluster tier to look up"),
      feature: z.string().optional().describe("Feature name, e.g. $rerank"),
    }),
    run: async (input) => {
      const col = (await getDb()).collection("limits");
      const filter = input.tier ? { kind: "tier", tier: input.tier } : input.feature ? { kind: "feature", feature: { $regex: String(input.feature).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {};
      return { rows: await col.find(filter, { projection: { _id: 0 } }).toArray() };
    },
  },
  send_signup_link: {
    input: z.object({}),
    run: async () => ({ signupUrl: SIGNUP_URL, gettingStarted: GET_STARTED_URL, note: "Free cluster, no credit card required." }),
  },
};

// ---------- Template tools (execution lives in config/template.ts, shared with the evaluator) ----------

export function templateInputSchema(t: TemplateTool): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, p] of Object.entries(t.params)) {
    if (p.type === "enum") shape[name] = z.enum(p.values as [string, ...string[]]).describe(p.description);
    else {
      let n = z.coerce.number();
      if (p.min !== undefined) n = n.min(p.min);
      if (p.max !== undefined) n = n.max(p.max);
      shape[name] = n.describe(p.description);
    }
  }
  return z.object(shape);
}

export async function runTemplateTool(t: TemplateTool, input: Record<string, unknown>) {
  const rows = (await executeTemplateTool(t, input)).map(({ _id, ...rest }) => rest);
  // A single row is spread to the top level so widgets can use {field} directly.
  return rows.length === 1 ? { ...rows[0], rows } : { rows };
}
