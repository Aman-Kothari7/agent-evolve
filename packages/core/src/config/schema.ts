import { z } from "zod";

// Every config element records which version introduced it and why, so the UI
// can tag agent behavior with the change that caused it.
const provenance = {
  introducedIn: z.number().int().default(1),
  reason: z.string().optional(),
};

export const StateField = z.object({
  question: z.string(),
  type: z.enum(["choice", "yesno", "text"]),
  options: z.array(z.string()).optional(),
  extractor: z.enum(["jev", "llm"]).default("jev"),
  ...provenance,
});

const toolCommon = {
  description: z.string(),
  enabled: z.boolean().default(true),
  requires: z.array(z.string()).default([]),
  maxUses: z.number().int().positive().optional(),
  ...provenance,
};

export const BuiltinTool = z.object({
  kind: z.literal("builtin"),
  ...toolCommon,
});

export const TemplateParam = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("number"),
    description: z.string().default(""),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    type: z.literal("enum"),
    description: z.string().default(""),
    values: z.array(z.string()).min(1),
  }),
]);

export const TemplateTool = z.object({
  kind: z.literal("template"),
  ...toolCommon,
  collection: z.enum(["limits", "slots", "knowledge"]),
  params: z.record(z.string(), TemplateParam),
  pipeline: z.array(z.record(z.string(), z.unknown())).min(1),
});

export const Tool = z.discriminatedUnion("kind", [BuiltinTool, TemplateTool]);

const ruleCommon = {
  id: z.string(),
  locked: z.boolean().default(false),
  ...provenance,
};

export const Rule = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool_order"), require: z.string(), before: z.string(), ...ruleCommon }),
  z.object({ type: z.literal("limit"), tool: z.string(), max: z.number().int().positive(), ...ruleCommon }),
  z.object({
    type: z.literal("check"),
    question: z.string(),
    onViolation: z.enum(["rewrite", "block"]).default("rewrite"),
    ...ruleCommon,
  }),
]);

export const ContextTrigger = z.object({
  id: z.string(),
  when: z.union([
    z.object({ stateField: z.string(), equals: z.string() }),
    z.object({ messageQuestion: z.string() }),
  ]),
  load: z.string(),
  ...provenance,
});

export const Widget = z.object({
  description: z.string(),
  template: z.string(),
  dataFrom: z.string().optional(),
  requires: z.array(z.string()).default([]),
  maxPerChat: z.number().int().positive().default(1),
  ...provenance,
});

export const AgentConfig = z.object({
  version: z.number().int().positive(),
  goal: z.object({ description: z.string() }),
  instructions: z.object({
    persona: z.string(),
    sections: z.array(z.object({ id: z.string(), title: z.string(), text: z.string(), ...provenance })),
  }),
  state: z.record(z.string(), StateField),
  tools: z.record(z.string(), Tool),
  rules: z.array(Rule),
  context: z.array(ContextTrigger).default([]),
  widgets: z.record(z.string(), Widget).default({}),
  routing: z
    .object({ default: z.string(), overrides: z.array(z.object({ stateField: z.string(), equals: z.string(), model: z.string() })).default([]) })
    .optional(),
  limits: z.object({ maxTurns: z.number().int().positive().default(10) }),
});

export const ChangeArea = z.enum(["instructions", "state", "tools", "rules", "context", "widgets", "routing"]);

export const ChangeOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("add"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string() }),
]);

export const Proposal = z.object({
  ops: z.array(ChangeOp).min(1),
  area: ChangeArea,
  reason: z.string(),
  evidenceConversationIds: z.array(z.string()).default([]),
  targetFilter: z.record(z.string(), z.unknown()),
});

// Dot paths the coach may touch. goal, limits and locked rules are never editable.
export const EDITABLE_PATHS: RegExp[] = [
  /^instructions\.persona$/,
  /^instructions\.sections(\.\d+(\.(title|text))?)?$/,
  /^state\.[a-z_]+$/,
  /^tools\.[a-z_]+(\.(description|enabled|requires|maxUses))?$/,
  /^rules(\.\d+)?$/,
  /^context(\.\d+)?$/,
  /^widgets\.[a-z_]+(\.(description|template|dataFrom|requires|maxPerChat))?$/,
  /^routing(\..+)?$/,
];

export type AgentConfig = z.infer<typeof AgentConfig>;
export type StateField = z.infer<typeof StateField>;
export type Tool = z.infer<typeof Tool>;
export type TemplateTool = z.infer<typeof TemplateTool>;
export type Rule = z.infer<typeof Rule>;
export type ContextTrigger = z.infer<typeof ContextTrigger>;
export type Widget = z.infer<typeof Widget>;
export type ChangeOp = z.infer<typeof ChangeOp>;
export type ChangeArea = z.infer<typeof ChangeArea>;
export type Proposal = z.infer<typeof Proposal>;
