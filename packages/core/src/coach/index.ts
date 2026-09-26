import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { applyProposal } from "../config/patch";
import type { AgentConfig, Proposal } from "../config/schema";
import { transcriptText } from "../labeler";
import { chatModel, MODELS } from "../models";
import { conversationStats, getConversation, hybridSearchConversations, listExperiments, logCoachEvent } from "../store";

const FAILURE_TYPES = ["generic_answer", "wrong_fact", "scheduling_friction", "unnecessary_meeting", "missed_meeting", "none"] as const;

// What each tool in the catalog actually does. The coach can't add tools or change these behaviors.
const TOOL_CATALOG = `- search_docs {query}: semantic search over the MongoDB docs knowledge base; returns the top 2 docs with title, url, and text.
- get_slots {}: returns the next 3 open call times with MongoDB engineers as {slots: [{slotId, label}]}.
- book_meeting {slot, topic?, name?, email?}: books a call, but ONLY for an exact open slotId or slot label. Free-text times like "Tuesday afternoon" fail.
- lookup_limits {tier?: free|flex|dedicated, feature?}: returns rows from the limits table: tiers {tier, maxSearchIndexes, multiRegion, forProduction, bestFor} and features {feature, minVersion}.
- send_signup_link {}: returns the free-tier signup link and the getting-started guide.`;

function systemPrompt(config: AgentConfig, focus?: string): string {
  return `You are the coach for the MongoDB Atlas website chat assistant (support + sales). Your job: improve the assistant's HARNESS CONFIG so it reaches its goal more often.

GOAL (locked): ${config.goal.description}
${focus ? `\nOPERATOR FOCUS FOR THIS ROUND: ${focus}\nInvestigate this first. Propose a change for it if the conversation evidence supports it; the locked goal and the test still decide whether the change is kept.\n` : ""}
THE TOOL CATALOG (fixed; you cannot add tools or change what a tool does)
${TOOL_CATALOG}
For each tool in the config you CAN: turn it on or off (tools.<key>.enabled), rewrite the description the assistant reads to decide when to call it (tools.<key>.description), rename it (tools.<key>.name, lowercase_with_underscores), gate it on known state facts (tools.<key>.requires), and cap uses per chat (tools.<key>.maxUses). You CANNOT create, remove, or re-implement tools.

HOW THE RUNTIME USES THE REST OF THE CONFIG
- instructions: persona + named sections, placed in the assistant's system prompt.
- state: facts tracked each turn (field names lowercase_with_underscores). A state fact changes NOTHING on its own: it only affects behavior when a tool's or widget's "requires", a context trigger, or a rule uses it. If you add a fact, wire it up in the same proposal. Jev (a fast classifier) answers each field's question from the transcript. type "choice" needs "options"; "yesno" is true/false; "text" is extracted by an LLM. A tool or widget with "requires" is only available once those facts are known.
- rules: "tool_order" {require, before} blocks tool "before" until "require" was called; "limit" {tool, max} caps uses; "check" {question, onViolation: rewrite|block} is a yes/no question Jev asks about every draft reply ("yes" = violation → rewrite or block).
- context: triggers {when: {stateField, equals} | {messageQuestion}, load: knowledge doc id} add a doc to the prompt. Knowledge ids: network_access, connection_string, search_index_limits, rerank, automated_embedding, mcp_server, tiers, migration, change_streams, get_started.
- widgets (you CAN create these): markdown shown under the assistant's message. A widget with "dataFrom": "<tool key>" renders AUTOMATICALLY whenever that tool runs, filled from the tool's output. Placeholders: {field} or {a.b} for a value; {items:button} makes one clickable button per array item (label = item.label/name/title); {items:list} a bulleted list; {items:table} a table. Clicking a button sends its label as the visitor's next message. Example slot picker: {"description":"Clickable open call times","template":"**Pick a time for a 20-min call with an engineer:**\\n{slots:button}","dataFrom":"get_slots","requires":[]}. A widget without dataFrom appears when the assistant calls render_widget. "requires" gates a widget on state facts; maxPerChat caps repeats.

WHAT YOU MAY CHANGE (dot paths): instructions.persona, instructions.sections[.N[.title|.text]], state.<field>, tools.<key>.(enabled|description|name|requires|maxUses), rules[.N] (not locked rules), context[.N], widgets.<name>[.field]. You may NOT change the goal, limits, locked rules, or the tool catalog.
Ops: {"op":"set","path":"tools.get_slots.enabled","value":true} | {"op":"set","path":"tools.book_meeting.description","value":"..."} | {"op":"add","path":"rules","value":{...rule}} | {"op":"set","path":"widgets.slot_picker","value":{...widget}} | {"op":"remove","path":"context.0"}.

HOW TO WORK
1. Use stats (group by labels.failureType or labels.intent on the active version) to find where the goal fails most.
2. Use search and read to study real conversations for that failure: exactly what the assistant said, which tools it called, and which tools were unavailable.
3. Check list_experiments so you don't repeat a rejected change.
4. Propose ONE coherent change (several ops are fine if they form one fix, e.g. enable a tool + add a widget for it + rewrite its description). Prefer structural fixes (tools, state, rules, widgets, context) over rewording instructions when the evidence supports it. Cite 2-5 evidence conversation ids and target the failed conversations it should fix (targetFailureType and/or targetIntent). Labels can be noisy, so check that failed conversations match your target.
The change is tested on practice visitors who failed that way; it's kept only if they improve without breaking visitors who already succeeded.

CURRENT CONFIG (v${config.version}):
${JSON.stringify(config, null, 1)}`;
}

// Compact version of a tool's output for the /coach timeline.
function summarizeOutput(tool: string, out: unknown): unknown {
  if (!out || typeof out !== "object") return out;
  const o = out as Record<string, unknown>;
  if (tool === "search")
    return {
      method: o.method,
      filter: o.filter,
      results: ((o.results as Record<string, unknown>[]) ?? []).map((r) => ({
        id: r.id,
        intent: (r.labels as Record<string, unknown> | undefined)?.intent,
        failureType: (r.labels as Record<string, unknown> | undefined)?.failureType,
        success: r.success,
        foundBy: r.foundBy,
        summary: String(r.summary ?? "").slice(0, 160),
      })),
    };
  if (tool === "read") return { conversationId: (out as { conversationId?: string }).conversationId, labels: o.labels, success: (o.outcome as { success?: boolean } | undefined)?.success, transcriptPreview: String(o.transcript ?? "").slice(0, 400) };
  if (Array.isArray(out)) return out.slice(0, 12);
  return out;
}

export type CoachResult = { proposal: Proposal | null; newConfig: AgentConfig | null; steps: number };

export async function runCoach(opts: { round: string; config: AgentConfig; newVersion: number; focus?: string }): Promise<CoachResult> {
  const { round, config, newVersion, focus } = opts;
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
      description:
        "Hybrid search over practice-conversation summaries: semantic (vector) + keyword (full-text), fused with $rankFusion. Pre-filter on Jev labels (failureType, intent, dropStage) and outcomes (success, qualified = needed a call). Returns ids, summaries, labels, outcomes, and which search found each.",
      inputSchema: z.object({
        query: z.string().describe("What to look for, e.g. 'visitor asked for a call and gave up on picking a time'"),
        version: z.number().int().optional().describe(`defaults to the active version (${v})`),
        failureType: z.enum(FAILURE_TYPES).optional(),
        intent: z.enum(["connection", "limits", "feature_setup", "migration", "production_incident", "learning", "other"]).optional(),
        dropStage: z.enum(["greeting", "diagnosis", "answer", "scheduling", "none"]).optional(),
        success: z.boolean().optional(),
        qualified: z.boolean().optional().describe("true = visitor needed a call with an engineer"),
        k: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, version, k, ...labels }) => {
        const r = await hybridSearchConversations(query, { configVersion: version ?? v, source: "sim", ...labels }, k ?? 6);
        return {
          method: r.method,
          filter: r.filter,
          results: r.results.map((x) => ({ id: x._id, summary: x.summary, labels: x.labels, success: x.outcome?.success, needsCall: x.outcome?.qualified, foundBy: x.foundBy })),
        };
      },
    }),
    read: tool({
      description: "Full transcript of one conversation, including tool calls, rule events, labels and outcome.",
      inputSchema: z.object({ conversationId: z.string() }),
      execute: async ({ conversationId }) => {
        const c = await getConversation(conversationId);
        if (!c) return { error: "not found" };
        return { conversationId, transcript: transcriptText(c).slice(0, 6000), labels: c.labels, outcome: c.outcome, configVersion: c.configVersion };
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
        targetFailureType: z.enum(FAILURE_TYPES).optional().describe("Failed conversations with this Jev failure label"),
        targetIntent: z.enum(["connection", "limits", "feature_setup", "migration", "production_incident", "learning", "other"]).optional().describe("Or/and: failed conversations with this Jev intent label"),
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
          targetFilter: {
            ...(p.targetFailureType ? { "labels.failureType": p.targetFailureType } : {}),
            ...(p.targetIntent ? { "labels.intent": p.targetIntent } : {}),
          },
          ops: p.ops as Proposal["ops"],
        };
        if (!p.targetFailureType && !p.targetIntent) return { ok: false, errors: ["Give targetFailureType and/or targetIntent so the change can be tested on the visitors it should fix."] };
        const res = applyProposal(config, proposal, newVersion);
        if (!res.ok) {
          await logCoachEvent(round, "error", { stage: "validate", errors: res.errors });
          return { ok: false, errors: res.errors };
        }
        accepted = { proposal, newConfig: res.config };
        await logCoachEvent(round, "proposal", { ...proposal, baseVersion: config.version, candidateVersion: newVersion });
        return { ok: true, message: "Accepted for testing." };
      },
    }),
  };

  const r = await generateText({
    model: chatModel(MODELS.coach),
    system: systemPrompt(config, focus),
    prompt: "Diagnose the biggest reason the goal is being missed on the active version and propose one change.",
    tools,
    // Stop once a valid proposal is in, or after 16 steps. (hasToolCall alone would also stop on invalid proposals.)
    stopWhen: [stepCountIs(16), () => accepted !== null],
    onStepFinish: async (step) => {
      if (step.text?.trim()) await logCoachEvent(round, "thinking", { text: step.text.trim().slice(0, 1500) });
      const results = (step as unknown as { toolResults?: { toolCallId: string; output: unknown }[] }).toolResults ?? [];
      for (const c of step.toolCalls) {
        if (c.toolName === "propose") continue;
        const out = results.find((r) => r.toolCallId === c.toolCallId)?.output;
        await logCoachEvent(round, "tool_call", { tool: c.toolName, input: c.input, output: summarizeOutput(c.toolName, out) });
      }
    },
  });

  const final = accepted as { proposal: Proposal; newConfig: AgentConfig } | null;
  return { proposal: final?.proposal ?? null, newConfig: final?.newConfig ?? null, steps: r.steps.length };
}
