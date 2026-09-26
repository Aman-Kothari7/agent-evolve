import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { applyProposal } from "../config/patch";
import type { AgentConfig, Proposal } from "../config/schema";
import { transcriptText } from "../labeler";
import { chatModel, MODELS } from "../models";
import { conversationStats, getConversation, listExperiments, logCoachEvent, searchConversations } from "../store";

const FAILURE_TYPES = ["contact_before_price", "wrong_quote", "scheduling_friction", "unqualified_booking", "missed_qualification", "generic_answer", "none"] as const;

function systemPrompt(config: AgentConfig): string {
  return `You are the coach for a website sales-chat agent. Your job: improve the agent's HARNESS CONFIG so it reaches its goal more often.

GOAL (locked): ${config.goal.description}

HOW THE RUNTIME USES THE CONFIG
- instructions: persona + named sections, placed in the agent's system prompt.
- state: facts the runtime tracks each turn. Jev (a fast classifier) answers each field's question from the transcript. type "choice" needs "options"; "yesno" is true/false; "text" is extracted by an LLM.
- tools: builtin tools (get_price, ask_email, book_meeting, send_trial_link, get_slots) or "template" tools you create. A tool is offered to the agent only if enabled and every state field in "requires" is known. The tool "description" is what the agent reads to decide when to call it.
- rules: "tool_order" {require, before} blocks tool "before" until tool "require" was called; "limit" {tool, max} caps uses per chat; "check" {question, onViolation: rewrite|block} is a yes/no question Jev asks about every draft reply ("yes" = violation).
- context: triggers {when: {stateField, equals} | {messageQuestion}, load: knowledge doc id} add a knowledge doc to the prompt. Knowledge ids: features, security, integrations, faq, competitor_dashco.
- widgets: markdown templates the agent can render. {placeholder} values come from the latest output of the "dataFrom" tool. Links like [Pick Thu 2pm](action:send?text=Thu%202pm) render as buttons the customer can click. "requires" gates them on state fields.

TEMPLATE TOOLS (you can create new tools without code)
A template tool runs a read-only MongoDB aggregation on one collection: "pricing", "slots", or "knowledge".
- pricing docs: {plan: "starter"|"team"|"business"|"enterprise", perSeat: number|null, minSeats, maxSeats, features: string[], selfServeTrial: bool}; plus one doc {_id: "billing_rules", annualMonthsCharged: 10, volumeDiscount: {minSeats: 100, pct: 10, plans: ["team","business"]}}.
- slots docs: {slotId, label, start: Date, booked: bool}.
- knowledge docs: {_id, title, text}.
Params are typed ("number" with min/max or "enum" with values). Write "{{param}}" inside string values; a string that is exactly "{{param}}" becomes the typed value. Allowed stages: $match, $project, $addFields, $set, $group, $sort, $limit, $unwind.
Example (format only): {"kind":"template","description":"Features included in a plan","enabled":true,"requires":[],"collection":"pricing","params":{"plan":{"type":"enum","values":["starter","team","business"]}},"pipeline":[{"$match":{"plan":"{{plan}}"}},{"$project":{"_id":0,"plan":1,"features":1}}]}

WHAT YOU MAY CHANGE (dot paths): instructions.persona, instructions.sections[.N[.title|.text]], state.<field>, tools.<name>[.description|.enabled|.requires|.maxUses], rules[.N] (not locked rules), context[.N], widgets.<name>[...]. You may NOT change the goal, limits, or locked rules.
Ops: {"op":"set","path":"tools.book_meeting.description","value":"..."} | {"op":"add","path":"rules","value":{...rule}} | {"op":"set","path":"tools.calc_x","value":{...new tool}} | {"op":"remove","path":"context.0"}.

HOW TO WORK
1. Use stats (group by labels.failureType on the active version) to find where qualified buyers are lost or the goal fails.
2. Use search and read to study real conversations for that failure. Look at exactly what the agent said and which tools it called.
3. Check list_experiments so you don't repeat a change that was already rejected.
4. Propose ONE coherent change (it may have several ops, e.g. create a tool + a widget that uses it). Prefer structural fixes (rules, tools, state, widgets) over just rewording instructions when the evidence supports it. Cite 2-5 evidence conversation ids and the failureType it targets.
The change will be tested on practice customers who failed that way; it's kept only if they improve without breaking customers who already succeeded.

CURRENT CONFIG (v${config.version}):
${JSON.stringify(config, null, 1)}`;
}

export type CoachResult = { proposal: Proposal | null; newConfig: AgentConfig | null; steps: number };

export async function runCoach(opts: { round: string; config: AgentConfig; newVersion: number }): Promise<CoachResult> {
  const { round, config, newVersion } = opts;
  let accepted: { proposal: Proposal; newConfig: AgentConfig } | null = null;
  const v = config.version;

  const tools = {
    stats: tool({
      description: "Counts, successes, bookings and leaves per group for sim conversations on a config version.",
      inputSchema: z.object({
        groupBy: z.enum(["labels.failureType", "labels.intent", "labels.dropStage", "outcome.qualified"]),
        version: z.number().int().optional().describe(`defaults to the active version (${v})`),
        onlyQualified: z.boolean().optional(),
      }),
      execute: async ({ groupBy, version, onlyQualified }) =>
        conversationStats(groupBy, { configVersion: version ?? v, source: "sim", ...(onlyQualified ? { "outcome.qualified": true } : {}) }),
    }),
    search: tool({
      description: "Semantic search over conversation summaries. Returns ids, summaries, labels, outcomes.",
      inputSchema: z.object({
        query: z.string(),
        failureType: z.enum(FAILURE_TYPES).optional(),
        version: z.number().int().optional(),
        k: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, failureType, version, k }) => {
        const filter: Record<string, unknown> = { configVersion: version ?? v };
        if (failureType) filter["labels.failureType"] = failureType;
        const rows = await searchConversations(query, filter, k ?? 6);
        return rows.map((r) => ({ id: r._id, summary: r.summary, labels: r.labels, success: r.outcome?.success, qualified: r.outcome?.qualified }));
      },
    }),
    read: tool({
      description: "Full transcript of one conversation, including tool calls, rule events, labels and outcome.",
      inputSchema: z.object({ conversationId: z.string() }),
      execute: async ({ conversationId }) => {
        const c = await getConversation(conversationId);
        if (!c) return { error: "not found" };
        return { transcript: transcriptText(c).slice(0, 6000), labels: c.labels, outcome: c.outcome, configVersion: c.configVersion };
      },
    }),
    list_experiments: tool({
      description: "Recent change proposals and whether they were accepted or rejected, with test results.",
      inputSchema: z.object({}),
      execute: async () =>
        (await listExperiments(15)).map((e) => ({ area: e.proposal?.area, reason: e.proposal?.reason, ops: e.proposal?.ops, decision: e.decision, results: e.results })),
    }),
    propose: tool({
      description: "Submit ONE change for testing. Returns validation errors if the change is invalid; fix and resubmit.",
      inputSchema: z.object({
        area: z.enum(["instructions", "state", "tools", "rules", "context", "widgets"]),
        reason: z.string().describe("One sentence: what pattern you saw and why this fixes it"),
        targetFailureType: z.enum(FAILURE_TYPES),
        evidenceConversationIds: z.array(z.string()).min(1),
        ops: z
          .array(z.object({ op: z.enum(["set", "add", "remove"]), path: z.string(), value: z.any().optional() }))
          .min(1),
      }),
      execute: async (p) => {
        const proposal: Proposal = {
          area: p.area,
          reason: p.reason,
          evidenceConversationIds: p.evidenceConversationIds,
          targetFilter: { "labels.failureType": p.targetFailureType },
          ops: p.ops as Proposal["ops"],
        };
        const res = applyProposal(config, proposal, newVersion);
        if (!res.ok) {
          await logCoachEvent(round, "error", { stage: "validate", errors: res.errors });
          return { ok: false, errors: res.errors };
        }
        accepted = { proposal, newConfig: res.config };
        await logCoachEvent(round, "proposal", proposal);
        return { ok: true, message: "Accepted for testing." };
      },
    }),
  };

  const r = await generateText({
    model: chatModel(MODELS.coach),
    system: systemPrompt(config),
    prompt: "Diagnose the biggest reason the goal is being missed on the active version and propose one change.",
    tools,
    // Stop once a valid proposal is in, or after 16 steps. (hasToolCall alone would also stop on invalid proposals.)
    stopWhen: [stepCountIs(16), () => accepted !== null],
    onStepFinish: async (step) => {
      if (step.text?.trim()) await logCoachEvent(round, "thinking", { text: step.text.trim().slice(0, 1500) });
      for (const c of step.toolCalls) if (c.toolName !== "propose") await logCoachEvent(round, "tool_call", { tool: c.toolName, input: c.input });
    },
  });

  const final = accepted as { proposal: Proposal; newConfig: AgentConfig } | null;
  return { proposal: final?.proposal ?? null, newConfig: final?.newConfig ?? null, steps: r.steps.length };
}
