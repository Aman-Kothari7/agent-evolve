// runTurn: one customer message in, one agent reply out, driven entirely by the config.
// See docs/ARCHITECTURE.md section 5 for the step list this follows.
import { generateText, Output, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import type { AgentConfig, Rule } from "../config/schema";
import { chatModel, MODELS } from "../models";
import { appendTurn, createConversation, getActiveVersion, getConfig, getConversation, getKnowledgeDoc } from "../store";
import type { RenderedWidget, RuleEvent, RunTurnInput, RunTurnResult, StateSnapshot, ToolCallLog, Turn } from "../types";
import { ask, type Question } from "./jev";
import { BUILTINS, runTemplateTool, templateInputSchema } from "./tools";
import { renderWidget } from "./widgets";

export { renderWidget, buttonLink } from "./widgets";
export { runTemplateTool } from "./tools";
export { ask } from "./jev";

const UNKNOWN = "unknown";
const CHECK_THRESHOLD = 0.5;
const STICKY_CONFIDENCE = 0.8;
const FALLBACK_REPLY = "Sorry, I can't help with that one. Is there anything else about our plans I can answer?";

// $ per million tokens (input, output), for cost tracking only.
const PRICES: Record<string, [number, number]> = {
  "openai/gpt-6-luna": [0.1, 0.5],
  "deepseek/deepseek-v4-flash": [0.1, 0.4],
  "anthropic/claude-sonnet-5": [2, 10],
};

export async function runTurn(input: RunTurnInput): Promise<RunTurnResult> {
  // ---- Load conversation + config ----
  let convo = input.conversationId ? await getConversation(input.conversationId) : null;
  if (input.conversationId && !convo) throw new Error(`Conversation ${input.conversationId} not found`);
  const version = convo?.configVersion ?? input.config?.version ?? input.configVersion ?? (await getActiveVersion());
  const config = input.config ?? (await getConfig(version));
  const conversationId =
    convo?._id ??
    (await createConversation({ configVersion: version, source: input.source ?? "live", personaId: input.personaId, seed: input.seed, runId: input.runId }));
  const history: Turn[] = convo?.turns ?? [];

  // 1. Append the customer message.
  const customerTurn: Turn = { role: "customer", text: input.message, ts: new Date() };
  await appendTurn(conversationId, customerTurn);
  const turns = [...history, customerTurn];

  const priorCalls = history.flatMap((t) => t.toolCalls ?? []).filter((c) => !c.blockedBy);
  const priorWidgets = history.flatMap((t) => t.widgets ?? []);
  const prevState = [...history].reverse().find((t) => t.stateAfter)?.stateAfter ?? {};

  // 2 + 3. State update and message-based context triggers.
  const { state, messageTriggers } = await updateState(config, turns, prevState);
  const known = (f: string) => state[f] !== null && state[f] !== undefined;

  const firedContext = config.context.filter((c) =>
    "stateField" in c.when ? String(state[c.when.stateField] ?? "") === c.when.equals : messageTriggers[c.id] === true,
  );
  const contextDocs = (await Promise.all(firedContext.map((c) => getKnowledgeDoc(c.load)))).filter((d) => !!d);

  // 4. Available tools.
  const calls: ToolCallLog[] = [];
  const ruleEvents: RuleEvent[] = [];
  const widgets: RenderedWidget[] = [];
  const usedSoFar = (name: string) => [...priorCalls, ...calls].filter((c) => c.tool === name && !c.blockedBy).length;

  const offered = Object.entries(config.tools).filter(
    ([name, t]) => t.enabled && t.requires.every(known) && (t.maxUses === undefined || usedSoFar(name) < t.maxUses),
  );
  const orderRules = config.rules.filter((r): r is Extract<Rule, { type: "tool_order" | "limit" }> => r.type !== "check");

  // Returns the id of the rule that blocks this call, if any.
  const gate = (name: string): { rule: Rule; detail: string } | null => {
    for (const r of orderRules) {
      if (r.type === "tool_order" && r.before === name && usedSoFar(r.require) === 0)
        return { rule: r, detail: `You must call ${r.require} before ${name}.` };
      if (r.type === "limit" && r.tool === name && usedSoFar(name) >= r.max)
        return { rule: r, detail: `${name} can be used at most ${r.max} time(s) per conversation.` };
    }
    return null;
  };

  // Widgets whose requirements are met and that haven't hit maxPerChat.
  const widgetsReady = Object.entries(config.widgets).filter(
    ([name, w]) => w.requires.every(known) && priorWidgets.filter((x) => x.name === name).length < w.maxPerChat,
  );
  const show = (name: string, data: unknown) => {
    if (widgets.some((x) => x.name === name)) return;
    const w = config.widgets[name];
    widgets.push({ name, markdown: renderWidget(w, data), introducedIn: w.introducedIn });
  };

  const wrap = (name: string, run: (args: Record<string, unknown>) => Promise<unknown>) => async (args: Record<string, unknown>) => {
    const blocked = gate(name);
    if (blocked) {
      calls.push({ tool: name, input: args, blockedBy: blocked.rule.id });
      ruleEvents.push({ ruleId: blocked.rule.id, type: blocked.rule.type, action: "blocked", detail: blocked.detail });
      return { error: `Not allowed: ${blocked.detail}` };
    }
    try {
      const output = await run(args);
      calls.push({ tool: name, input: args, output });
      // A widget bound to this tool renders from its output automatically.
      const bound = widgetsReady.filter(([, w]) => w.dataFrom === name).map(([n]) => n);
      for (const n of bound) show(n, output);
      return bound.length
        ? { ...(output as object), shownToVisitor: `Already displayed to the visitor as a widget (${bound.join(", ")}). Don't list these details again; just refer to it briefly.` }
        : output;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      calls.push({ tool: name, input: args, output: { error } });
      return { error };
    }
  };

  const tools: ToolSet = {};
  for (const [name, t] of offered) {
    if (t.kind === "builtin") {
      const b = BUILTINS[name];
      if (!b) continue;
      tools[name] = tool({ description: t.description, inputSchema: b.input, execute: wrap(name, (a) => b.run(a, { conversationId })) });
    } else {
      tools[name] = tool({ description: t.description, inputSchema: templateInputSchema(t), execute: wrap(name, (a) => runTemplateTool(t, a)) });
    }
  }

  // Widgets without a data tool are shown when the agent asks for them.
  const standalone = widgetsReady.filter(([, w]) => !w.dataFrom);
  if (standalone.length) {
    tools.render_widget = tool({
      description: `Show a UI widget under your message. Options: ${standalone.map(([n, w]) => `${n} (${w.description})`).join("; ")}.`,
      inputSchema: z.object({ name: z.enum(standalone.map(([n]) => n) as [string, ...string[]]) }),
      execute: async ({ name }) => {
        show(name, {});
        calls.push({ tool: "render_widget", input: { name }, output: { shown: true } });
        return { shown: true };
      },
    });
  }

  // 5. Generate.
  const model = pickModel(config, state);
  const system = buildSystem(config, state, contextDocs, [...priorCalls]);
  const messages = toMessages(history, input.message);
  const gen = await generateText({
    model: chatModel(model),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(4),
    temperature: 0,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  });
  let reply = gen.text.trim();
  let inTok = gen.totalUsage.inputTokens ?? 0;
  let outTok = gen.totalUsage.outputTokens ?? 0;

  // 6. Check rules against the draft.
  const checks = config.rules.filter((r): r is Extract<Rule, { type: "check" }> => r.type === "check");
  const lastCustomer = input.message;
  let violations = await runChecks(checks, lastCustomer, reply, calls);
  if (violations.some((r) => r.onViolation === "block")) {
    for (const r of violations) ruleEvents.push({ ruleId: r.id, type: "check", action: "blocked", detail: `Blocked draft: ${reply}` });
    reply = FALLBACK_REPLY;
    widgets.length = 0;
  } else if (violations.length) {
    const rewrite = await generateText({
      model: chatModel(model),
      system,
      messages: [
        ...messages,
        ...gen.response.messages,
        {
          role: "user",
          content: `[Reviewer note, not from the visitor] Your draft reply broke these rules:\n${violations.map((v) => `- ${v.question}`).join("\n")}\nWrite a corrected reply to the visitor. Output only the reply.`,
        },
      ],
      temperature: 0,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    });
    inTok += rewrite.totalUsage.inputTokens ?? 0;
    outTok += rewrite.totalUsage.outputTokens ?? 0;
    const draft = reply;
    reply = rewrite.text.trim();
    for (const r of violations) ruleEvents.push({ ruleId: r.id, type: "check", action: "rewrote", detail: `Rewrote draft: ${draft}` });
    violations = await runChecks(checks, lastCustomer, reply, calls);
    const stillBlocked = violations.filter((r) => r.onViolation === "block");
    if (stillBlocked.length) {
      for (const r of stillBlocked) ruleEvents.push({ ruleId: r.id, type: "check", action: "blocked", detail: `Blocked rewrite: ${reply}` });
      reply = FALLBACK_REPLY;
      widgets.length = 0;
    }
  }
  for (const r of checks) if (!ruleEvents.some((e) => e.ruleId === r.id)) ruleEvents.push({ ruleId: r.id, type: "check", action: "passed" });
  if (!reply && !widgets.length) reply = "Could you tell me a bit more about what you're looking for?";

  // Provenance: the introducedIn of every config element that shaped this turn.
  const provenance = [
    ...config.instructions.sections.map((s) => s.introducedIn),
    ...Object.values(config.state).map((s) => s.introducedIn),
    ...offered.map(([, t]) => t.introducedIn),
    ...config.rules.filter((r) => r.type === "check" || offered.some(([n]) => n === (r.type === "limit" ? r.tool : r.before))).map((r) => r.introducedIn),
    ...firedContext.map((c) => c.introducedIn),
    ...widgets.map((w) => w.introducedIn),
  ];
  const uniqProvenance = [...new Set(provenance)].sort((a, b) => a - b);

  // 8. Persist.
  const [pin, pout] = PRICES[model] ?? [0, 0];
  const agentTurn: Turn = {
    role: "agent",
    text: reply,
    toolCalls: calls,
    widgets,
    ruleEvents,
    stateAfter: state,
    provenance: uniqProvenance,
    toolsAvailable: Object.keys(tools),
    contextLoaded: contextDocs.map((d) => d.id),
    model,
    costUsd: (inTok * pin + outTok * pout) / 1e6,
    ts: new Date(),
  };
  await appendTurn(conversationId, agentTurn);

  const agentTurns = history.filter((t) => t.role === "agent").length + 1;
  return {
    conversationId,
    reply,
    widgets,
    state,
    toolCalls: calls,
    ruleEvents,
    provenance: uniqProvenance,
    toolsAvailable: agentTurn.toolsAvailable,
    contextLoaded: agentTurn.contextLoaded,
    ended: agentTurns >= config.limits.maxTurns,
  };
}

// ---------- Helpers ----------

const transcriptText = (turns: Turn[]) =>
  turns.map((t) => `${t.role === "customer" ? "Visitor" : "Assistant"}: ${[t.text, ...(t.widgets ?? []).map((w) => w.markdown)].join("\n")}`).join("\n");

async function updateState(config: AgentConfig, turns: Turn[], prev: StateSnapshot) {
  const jevQs: Record<string, Question> = {};
  const llmFields: [string, AgentConfig["state"][string]][] = [];
  for (const [name, f] of Object.entries(config.state)) {
    if (f.extractor === "llm" || f.type === "text") llmFields.push([name, f]);
    else if (f.type === "yesno")
      jevQs[`state_${name}`] = { type: "choice", instructions: f.question, options: { yes: null, no: null, [UNKNOWN]: "The conversation doesn't say yet" } };
    else
      jevQs[`state_${name}`] = {
        type: "choice",
        instructions: f.question,
        options: { ...Object.fromEntries((f.options ?? []).map((o) => [o, null])), [UNKNOWN]: "The conversation doesn't say yet" },
      };
  }
  for (const c of config.context) {
    if ("messageQuestion" in c.when)
      jevQs[`ctx_${c.id}`] = { type: "boolean", instructions: `About lastVisitorMessage only: ${c.when.messageQuestion}` };
  }

  const lastVisitorMessage = [...turns].reverse().find((t) => t.role === "customer")?.text ?? "";
  const transcript = transcriptText(turns);
  const [answers, llmValues] = await Promise.all([
    ask({ transcript, lastVisitorMessage }, jevQs),
    extractWithLlm(llmFields, transcript),
  ]);

  const state: StateSnapshot = {};
  for (const [name, f] of Object.entries(config.state)) {
    const before = prev[name] ?? null;
    let v: string | boolean | null = null;
    const a = answers[`state_${name}`];
    // Once learned, a fact only changes when Jev is confident it did.
    if (a?.type === "choice" && a.choice !== UNKNOWN && (before === null || a.confidence >= STICKY_CONFIDENCE))
      v = f.type === "yesno" ? a.choice === "yes" : a.choice;
    if (name in llmValues) v = llmValues[name];
    state[name] = v ?? before;
  }
  const messageTriggers: Record<string, boolean> = {};
  for (const c of config.context) {
    const a = answers[`ctx_${c.id}`];
    if (a?.type === "boolean") messageTriggers[c.id] = a.probability >= 0.5;
  }
  return { state, messageTriggers };
}

async function extractWithLlm(fields: [string, AgentConfig["state"][string]][], transcript: string): Promise<StateSnapshot> {
  if (!fields.length) return {};
  const shape: Record<string, z.ZodType> = {};
  for (const [name, f] of fields) {
    const base =
      f.type === "yesno" ? z.boolean() : f.type === "choice" && f.options?.length ? z.enum(f.options as [string, ...string[]]) : z.string();
    shape[name] = base.nullable().describe(`${f.question} (null if not stated yet)`);
  }
  try {
    const r = await generateText({
      model: chatModel(MODELS.summary),
      temperature: 0,
      output: Output.object({ schema: z.object(shape) }),
      prompt: `Extract these facts about the visitor from the chat. Use null for anything not stated.\n\n${transcript}`,
    });
    return r.output as StateSnapshot;
  } catch (e) {
    console.warn(`[state] LLM extraction failed: ${e instanceof Error ? e.message : e}`);
    return {};
  }
}

async function runChecks(checks: Extract<Rule, { type: "check" }>[], lastVisitorMessage: string, reply: string, calls: ToolCallLog[]) {
  if (!checks.length || !reply) return [];
  const toolResultsThisTurn = calls.filter((c) => !c.blockedBy && c.tool !== "render_widget").map((c) => ({ tool: c.tool, output: c.output }));
  const answers = await ask(
    { lastVisitorMessage, assistantReply: reply, ...(toolResultsThisTurn.length ? { toolResultsThisTurn: JSON.parse(JSON.stringify(toolResultsThisTurn)) } : {}) },
    Object.fromEntries(checks.map((r) => [r.id, { type: "boolean", instructions: `About assistantReply: ${r.question}` } satisfies Question])),
  );
  return checks.filter((r) => {
    const a = answers[r.id];
    return a?.type === "boolean" && a.probability >= CHECK_THRESHOLD;
  });
}

function pickModel(config: AgentConfig, state: StateSnapshot): string {
  if (!config.routing) return MODELS.agent;
  const o = config.routing.overrides.find((x) => String(state[x.stateField] ?? "") === x.equals);
  return o?.model ?? config.routing.default ?? MODELS.agent;
}

function buildSystem(config: AgentConfig, state: StateSnapshot, docs: { id: string; title: string; text: string }[], priorCalls: ToolCallLog[]) {
  const parts = [config.instructions.persona, ...config.instructions.sections.map((s) => `## ${s.title}\n${s.text}`)];

  const facts = Object.entries(state).filter(([, v]) => v !== null);
  if (facts.length) parts.push(`## What you know about the visitor\n${facts.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`);

  for (const d of docs) parts.push(`## Reference: ${d.title}\n${d.text}`);

  const latest = new Map<string, unknown>();
  for (const c of priorCalls) if (c.tool !== "render_widget") latest.set(c.tool, c.output);
  if (latest.size)
    parts.push(`## Tool results earlier in this chat\n${[...latest].map(([k, v]) => `- ${k}: ${JSON.stringify(v).slice(0, 1500)}`).join("\n")}`);

  parts.push(
    `## Format\nThis is a website chat widget. Keep replies short (1-3 sentences). Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`,
  );
  return parts.join("\n\n");
}

function toMessages(history: Turn[], message: string): ModelMessage[] {
  const msgs: ModelMessage[] = history.map((t) =>
    t.role === "customer"
      ? { role: "user", content: t.text }
      : { role: "assistant", content: [t.text, ...(t.widgets ?? []).map((w) => w.markdown)].filter(Boolean).join("\n\n") },
  );
  msgs.push({ role: "user", content: message });
  return msgs;
}
