import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

// Override any of these per machine with env vars.
export const MODELS = {
  agent: process.env.MODEL_AGENT ?? "openai/gpt-6-luna",
  customer: process.env.MODEL_CUSTOMER ?? "openai/gpt-6-luna",
  coach: process.env.MODEL_COACH ?? "anthropic/claude-sonnet-5",
  summary: process.env.MODEL_SUMMARY ?? "openai/gpt-6-luna",
  jev: process.env.MODEL_JEV ?? "typesafe/jev-1.13",
};

export const chatModel = (id: string) => openrouter(id);
export const jevModel = () => openrouter.evaluationModel(MODELS.jev);
