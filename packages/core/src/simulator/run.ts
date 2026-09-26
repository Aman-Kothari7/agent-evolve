import { appendTurn, getConversation, setOutcome } from "../store";
import type { Outcome, Persona, RunTurnInput, RunTurnResult } from "../types";
import { computeOutcome } from "./checks";
import { customerReply, type SimLine } from "./customer";

export type AgentTurnFn = (input: RunTurnInput) => Promise<RunTurnResult>;

// Loads Person A's runtime lazily so the simulator compiles before it exists.
export async function loadRunTurn(): Promise<AgentTurnFn> {
  const path = "../runtime/index";
  const mod = (await import(path)) as { runTurn?: AgentTurnFn };
  if (!mod.runTurn) throw new Error("packages/core/src/runtime/index.ts must export runTurn");
  return mod.runTurn;
}

export type SimResult = { conversationId: string; personaId: string; configVersion: number; seed: number; outcome: Outcome };

export async function runConversation(opts: {
  persona: Persona;
  configVersion: number;
  seed: number;
  runId: string;
  agentTurn: AgentTurnFn;
  maxTurns?: number;
  source?: "sim" | "replay";
}): Promise<SimResult> {
  const { persona, configVersion, seed, runId, agentTurn } = opts;
  const maxTurns = opts.maxTurns ?? 8;
  const transcript: SimLine[] = [];
  let conversationId: string | undefined;
  let message = persona.opening;
  let endedBy: "leave" | "done" | "agent" | "max_turns" = "max_turns";

  for (let i = 0; i < maxTurns; i++) {
    transcript.push({ role: "customer", text: message });
    const res = await agentTurn({ conversationId, configVersion, message, source: opts.source ?? "sim", personaId: persona._id, seed, runId });
    conversationId = res.conversationId;
    const widgetText = res.widgets.map((w) => w.markdown).join("\n\n");
    transcript.push({ role: "agent", text: [res.reply, widgetText].filter(Boolean).join("\n\n") });
    if (res.ended) { endedBy = "agent"; break; }

    const move = await customerReply(persona, transcript, seed);
    if (move.ended === "leave") {
      await appendTurn(conversationId, { role: "customer", text: move.text, ts: new Date() });
      endedBy = "leave";
      break;
    }
    if (move.ended === "done") {
      // The visitor's last message (e.g. picking a slot) is still sent, so the assistant gets to act on it.
      await agentTurn({ conversationId, configVersion, message: move.text, source: opts.source ?? "sim", personaId: persona._id, seed, runId });
      endedBy = "done";
      break;
    }
    message = move.text;
  }

  const convo = await getConversation(conversationId!);
  const outcome = await computeOutcome(convo!, persona, endedBy);
  await setOutcome(conversationId!, outcome);
  return { conversationId: conversationId!, personaId: persona._id, configVersion, seed, outcome };
}

// Small concurrency pool.
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
