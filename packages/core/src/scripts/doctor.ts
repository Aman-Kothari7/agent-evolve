// Checks every external dependency: Atlas, the agent models, and Jev.
import { MongoClient } from "mongodb";
import { generateText, experimental_evaluate as evaluate, tool, stepCountIs } from "ai";
import { z } from "zod";
import { chatModel, jevModel, MODELS } from "../models";

const ok = (m: string) => console.log(`✅ ${m}`);
const bad = (m: string, e: unknown) => console.log(`❌ ${m}: ${e instanceof Error ? e.message : String(e)}`);

async function checkAtlas() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  try {
    await client.connect();
    const admin = client.db().admin();
    await admin.ping();
    const info = await admin.buildInfo();
    ok(`Atlas connected, MongoDB ${info.version}`);
    const db = client.db(process.env.MONGODB_DB ?? "evolve");
    const col = db.collection("doctor");
    await col.insertOne({ text: "doctor check", ts: new Date() });
    ok("Atlas write ok");
    try {
      const name = await col.createSearchIndex({
        name: "doctor_autoembed",
        type: "vectorSearch",
        definition: { fields: [{ type: "autoEmbed", modality: "text", path: "text", model: "voyage-4" }] },
      });
      ok(`Automated Embedding index accepted (${name}); dropping it`);
      await col.dropSearchIndex(name);
    } catch (e) {
      bad("Automated Embedding index", e);
    }
  } catch (e) {
    bad("Atlas", e);
  } finally {
    await client.close();
  }
}

async function checkAgentModel(id: string) {
  const t0 = Date.now();
  try {
    const r = await generateText({
      model: chatModel(id),
      prompt: "A customer asks the price of the Team plan for 10 seats. Look it up.",
      tools: {
        get_price: tool({
          description: "Returns per-seat monthly price for a plan",
          inputSchema: z.object({ plan: z.enum(["starter", "team", "business"]) }),
          execute: async ({ plan }) => ({ plan, perSeat: { starter: 12, team: 25, business: 45 }[plan] }),
        }),
      },
      stopWhen: stepCountIs(3),
    });
    const called = r.steps.some((s) => s.toolCalls.length > 0);
    ok(`${id}: tool call ${called ? "yes" : "NO"}, ${Date.now() - t0} ms → "${r.text.slice(0, 80)}"`);
  } catch (e) {
    bad(id, e);
  }
}

async function checkJev() {
  const t0 = Date.now();
  try {
    const r = await evaluate({
      model: jevModel(),
      state: { transcript: "customer: how much for 40 seats?\nagent: Can I get your work email first?" },
      questions: {
        contactBeforePrice: { type: "boolean", instructions: "Did the agent ask for contact details before giving any price?" },
        stage: { type: "choice", instructions: "Where is the conversation?", criteria: { pricing: null, scheduling: null, greeting: null } },
      },
    });
    ok(`Jev (${MODELS.jev}) ${Date.now() - t0} ms → ${JSON.stringify(r.answers)}`);
  } catch (e) {
    bad(`Jev (${MODELS.jev})`, e);
  }
}

await checkAtlas();
for (const id of [MODELS.agent, "deepseek/deepseek-v4-flash"]) await checkAgentModel(id);
await checkJev();
