import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { applyProposal } from "../config/patch";
import type { AgentConfig, Proposal } from "../config/schema";
import { transcriptText } from "../labeler";
import { chatModel, MODELS } from "../models";
import { conversationStats, getConversation, listExperiments, logCoachEvent, searchConversations } from "../store";

const FAILURE_TYPES = ["generic_answer", "wrong_fact", "scheduling_friction", "unnecessary_meeting", "missed_meeting", "none"] as const;

function systemPrompt(config: AgentConfig): string {
  return `You are the coach for the MongoDB Atlas website chat assistant (support + sales). Your job: improve the agent's HARNESS CONFIG so it reaches its goal more often.

GOAL (locked): ${config.goal.description}

HOW THE RUNTIME USES THE CONFIG
- instructions: persona + named sections, placed in the agent's system prompt.
- state: facts the runtime tracks each turn. Jev (a fast classifier) answers each field's question from the transcript. type "choice" needs "options"; "yesno" is true/false; "text" is extracted by an LLM.
- tools: builtin tools (search_docs {query} → top docs with title/url/text; get_slots → open engineer call times; book_meeting {slot} → books ONLY an exact open slot id/label, free-text times fail; send_signup_link → free-tier signup + getting-started links) or "template" tools you create. A tool is offered to the agent only if enabled and every state field in "requires" is known. The tool "description" is what the agent reads to decide when to call it.
- rules: "tool_order" {require, before} blocks tool "before" until tool "require" was called; "limit" {tool, max} caps uses per chat; "check" {question, onViolation: rewrite|block} is a yes/no question Jev asks about every draft reply ("yes" = violation).
- context: triggers {when: {stateField, equals} | {messageQuestion}, load: knowledge doc id} add a knowledge doc to the prompt. Knowledge ids: network_access, connection_string, search_index_limits, rerank, automated_embedding, mcp_server, tiers, migration, change_streams, get_started.
- widgets: markdown templates shown under the agent's message. A widget with "dataFrom" renders AUTOMATICALLY whenever that tool runs, filled from the tool's output. Placeholders: {field} or {a.b} for a value; {items:button} makes one clickable button per item of an array (button label = item.label/name/title); {items:list} a bulleted list; {items:table} a table. Clicking a button sends its label as the visitor's next message. Example slot picker: {"description":"Clickable open call times","template":"**Pick a time for a 20-min call:**\\n{slots:button}","dataFrom":"get_slots","requires":[]} (get_slots returns {slots:[{slotId,label}]}). A widget without dataFrom is shown when the agent calls render_widget. "requires" gates a widget on state fields; maxPerChat caps how often it appears.

TEMPLATE TOOLS (you can create new tools without code)
A template tool runs a read-only MongoDB aggregation on one collection: "limits", "slots", or "knowledge".
- limits docs: {kind:"tier", tier:"free"|"flex"|"dedicated", maxSearchIndexes: number|null, multiRegion: bool, forProduction: bool, bestFor: string} and {kind:"feature", feature: string (e.g. "$rerank"), minVersion: string}.
- slots docs: {slotId, label, start: Date, booked: bool}.
- knowledge docs: {_id, title, text}.
Params are typed ("number" with min/max or "enum" with values). Write "{{param}}" inside string values; a string that is exactly "{{param}}" becomes the typed value. Allowed stages: $match, $project, $addFields, $set, $group, $sort, $limit, $unwind.
Example (format only): {"kind":"template","description":"Look up a knowledge doc by id","enabled":true,"requires":[],"collection":"knowledge","params":{"id":{"type":"enum","values":["tiers","migration"]}},"pipeline":[{"$match":{"_id":"{{id}}"}},{"$project":{"_id":0,"title":1,"url":1,"text":1}}]}

WHAT YOU MAY CHANGE (dot paths): instructions.persona, instructions.sections[.N[.title|.text]], state.<field>, tools.<name>[.description|.enabled|.requires|.maxUses], rules[.N] (not locked rules), context[.N], widgets.<name>[...]. You may NOT change the goal, limits, or locked rules.
Ops: {"op":"set","path":"tools.book_meeting.description","value":"..."} | {"op":"add","path":"rules","value":{...rule}} | {"op":"set","path":"tools.calc_x","value":{...new tool}} | {"op":"remove","path":"context.0"}.

HOW TO WORK
1. Use stats (group by labels.failureType, or labels.intent, on the active version) to find where the goal fails most.
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
