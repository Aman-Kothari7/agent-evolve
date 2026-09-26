import { z } from "zod";

// How a practice conversation is graded. All checks are deterministic (see simulator/checks.ts).
export const SuccessCriteria = z.discriminatedUnion("kind", [
  // Every regex in `all` must match the agent's replies (case-insensitive); none in `forbid` may.
  z.object({ kind: z.literal("mentions"), all: z.array(z.string()).min(1), forbid: z.array(z.string()).default([]) }),
  // A real meeting slot was booked.
  z.object({ kind: z.literal("meeting") }),
  // A signup link was sent and no meeting was booked.
  z.object({ kind: z.literal("signup") }),
]);
export type SuccessCriteria = z.infer<typeof SuccessCriteria>;

export const Persona = z.object({
  _id: z.string(),
  split: z.enum(["train", "heldout", "demo"]),
  caseId: z.string().optional(),
  segment: z.string(),
  opening: z.string(),
  hidden: z.object({
    name: z.string(),
    role: z.string(),
    company: z.string(),
    teamSize: z.number().int().positive(),
    tier: z.enum(["none", "free", "flex", "dedicated"]),
    situation: z.string(), // what's really going on; the simulated visitor uses it to judge advice
    rootCause: z.string().optional(), // for support problems: the fix that actually works
  }),
  behavior: z.object({
    maxUnhelpfulReplies: z.number().int().default(2),
    maxSchedulingExchanges: z.number().int().default(2),
    readiness: z.enum(["browsing", "evaluating", "ready"]).default("evaluating"),
  }),
  success: SuccessCriteria,
  // True when the right outcome is a meeting with a MongoDB engineer (the UI shows it as "needs a call").
  qualified: z.boolean(),
});
export type Persona = z.infer<typeof Persona>;

export const needsMeeting = (s: SuccessCriteria) => s.kind === "meeting";

export type ToolCallLog = { tool: string; input: unknown; output?: unknown; blockedBy?: string };
export type RuleEvent = { ruleId: string; type: "tool_order" | "limit" | "check"; action: "blocked" | "rewrote" | "passed"; detail?: string };
export type RenderedWidget = { name: string; markdown: string; introducedIn: number };
export type StateSnapshot = Record<string, string | boolean | null>;

export type Turn = {
  role: "customer" | "agent";
  text: string;
  toolCalls?: ToolCallLog[];
  widgets?: RenderedWidget[];
  ruleEvents?: RuleEvent[];
  stateAfter?: StateSnapshot;
  provenance?: number[];
  toolsAvailable?: string[];
  contextLoaded?: string[];
  model?: string;
  costUsd?: number;
  ts: Date;
};

export type Outcome = {
  booked: boolean;
  qualified: boolean | null; // null for live chats with no persona
  success: boolean | null;
  trialSent: boolean;
  left: boolean;
  quoteCorrect?: boolean;
  lockedViolations: number;
  turns: number;
  costUsd: number;
};

export type Labels = {
  intent: string;
  dropStage: string;
  failureType: string;
  pushiness: number;
  violations: string[];
};

export type Conversation = {
  _id: string;
  personaId?: string;
  configVersion: number;
  source: "sim" | "live" | "replay";
  runId?: string;
  seed?: number;
  turns: Turn[];
  outcome?: Outcome;
  labels?: Labels;
  summary?: string;
  createdAt: Date;
};

export type RunTurnInput = {
  conversationId?: string;
  configVersion?: number; // defaults to the active version
  config?: import("./config/schema").AgentConfig; // run an unsaved config (tests); pass it on every turn
  message: string;
  source?: Conversation["source"];
  personaId?: string;
  seed?: number;
  runId?: string;
};

export type RunTurnResult = {
  conversationId: string;
  reply: string;
  widgets: RenderedWidget[];
  state: StateSnapshot;
  toolCalls: ToolCallLog[];
  ruleEvents: RuleEvent[];
  provenance: number[];
  toolsAvailable?: string[];
  contextLoaded?: string[];
  ended: boolean;
};
