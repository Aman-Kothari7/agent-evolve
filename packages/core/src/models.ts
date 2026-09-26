import { wrapLanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// Override any of these per machine with env vars. Each role uses a different model because the
// OpenRouter account is limited to ~20 requests/minute per model.
export const MODELS = {
  agent: process.env.MODEL_AGENT ?? "openai/gpt-6-luna",
  customer: process.env.MODEL_CUSTOMER ?? "deepseek/deepseek-v4-flash",
  coach: process.env.MODEL_COACH ?? "anthropic/claude-sonnet-5",
  summary: process.env.MODEL_SUMMARY ?? "qwen/qwen3.7-flash",
  jev: process.env.MODEL_JEV ?? "typesafe/jev-1.13",
};

// Simulated shoppers are spread across this pool (a shopper always gets the same model, so
// comparisons between config versions stay fair). Live chats use MODELS.agent.
export const AGENT_POOL = (process.env.MODEL_AGENT_POOL ?? `${MODELS.agent},openai/gpt-5-mini,google/gemini-2.5-flash`).split(",").map((s) => s.trim()).filter(Boolean);

// Simulated visitors are spread across a pool too (stable per visitor), so large baselines aren't rate-limited.
export const CUSTOMER_POOL = (process.env.MODEL_CUSTOMER_POOL ?? `${MODELS.customer},openai/gpt-5-nano,z-ai/glm-5.3-flash`).split(",").map((x) => x.trim()).filter(Boolean);

export function customerModelFor(personaId: string, seed?: number): string {
  let h = 7;
  for (const ch of `${personaId}:${seed ?? 1}`) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return CUSTOMER_POOL[h % CUSTOMER_POOL.length];
}

export function agentModelFor(personaId?: string, seed?: number): string {
  if (!personaId) return MODELS.agent;
  const key = `${personaId}:${seed ?? 1}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AGENT_POOL[h % AGENT_POOL.length];
}

// ---------- Per-model rate limiting (sliding one-minute window, per process) ----------
const RPM = Number(process.env.MODEL_RPM ?? 16);
const windows = new Map<string, number[]>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acquire(id: string) {
  for (;;) {
    const now = Date.now();
    const recent = (windows.get(id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length < RPM) {
      recent.push(now);
      windows.set(id, recent);
      return;
    }
    windows.set(id, recent);
    await sleep(60_000 - (now - recent[0]) + 100);
  }
}

export const chatModel = (id: string) =>
  wrapLanguageModel({
    model: openrouter(id),
    middleware: {
      specificationVersion: "v4",
      wrapGenerate: async ({ doGenerate }) => {
        await acquire(id);
        return doGenerate();
      },
      wrapStream: async ({ doStream }) => {
        await acquire(id);
        return doStream();
      },
    },
  });

export const jevModel = () => openrouter.evaluationModel(MODELS.jev);
