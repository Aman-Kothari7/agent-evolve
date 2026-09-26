// Built-in tools, plus the wrapper that runs coach-written template tools.
import { z } from "zod";
import type { TemplateTool } from "../config/schema";
import { executeTemplateTool } from "../config/template";
import { TRIAL_URL } from "../data/business";
import { getDb, getOpenSlots, getPricing, insertBooking } from "../store";

export type ToolCtx = { conversationId: string };

type Builtin = { input: z.ZodObject; run: (input: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown> };

export const BUILTINS: Record<string, Builtin> = {
  get_price: {
    input: z.object({}),
    run: async () => {
      const rows = await getPricing();
      return { plans: rows.filter((r) => r.plan), billing_rules: rows.find((r) => !r.plan) ?? null };
    },
  },
  ask_email: {
    input: z.object({}),
    run: async () => ({ ok: true, note: "Ask the visitor for their work email in your reply." }),
  },
  get_slots: {
    input: z.object({}),
    run: async () => ({ slots: (await getOpenSlots(3)).map((s) => ({ slotId: s.slotId, label: s.label })) }),
  },
  book_meeting: {
    input: z.object({
      slot: z.string().describe("The slotId or the exact time label the visitor picked"),
      name: z.string().optional(),
      email: z.string().optional(),
    }),
    run: async (input, ctx) => {
      const want = String(input.slot).trim().toLowerCase();
      const slot = await (await getDb())
        .collection("slots")
        .findOne({ $or: [{ slotId: input.slot }, { label: { $regex: `^${escapeRegex(want)}`, $options: "i" } }] });
      const label = (slot?.label as string | undefined) ?? String(input.slot);
      await insertBooking({ conversationId: ctx.conversationId, slot: label, name: input.name as string | undefined, email: input.email as string | undefined });
      return { booked: true, slot: label };
    },
  },
  send_trial_link: {
    input: z.object({}),
    run: async () => ({ url: TRIAL_URL, note: "Self-serve 14-day free trial, no credit card." }),
  },
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
