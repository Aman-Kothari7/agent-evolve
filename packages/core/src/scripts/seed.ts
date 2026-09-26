// Seeds business data, personas, the v1 config, and indexes.
//   pnpm seed            -> refresh static data; insert v1 only if no configs exist
//   pnpm seed -- --reset -> also wipe configs, conversations, bookings, experiments, coach events
import { AgentConfig } from "../config/schema";
import { BILLING_RULES, KNOWLEDGE, makeSlots, PRICING } from "../data/business";
import { DEMO_PERSONAS, generatePracticePersonas } from "../data/personas";
import { V1_CONFIG } from "../data/v1-config";
import { closeDb, CONVERSATION_VECTOR_INDEX, getDb, insertConfigDoc, activateVersion } from "../store";

const reset = process.argv.includes("--reset");
const db = await getDb();

async function replaceAll(name: string, docs: Record<string, unknown>[]) {
  const col = db.collection(name);
  await col.deleteMany({});
  if (docs.length) await col.insertMany(docs as never[]);
  console.log(`  ${name}: ${docs.length}`);
}

console.log(`Seeding database "${db.databaseName}"${reset ? " (RESET)" : ""}`);

if (reset) {
  for (const name of ["configs", "settings", "conversations", "bookings", "experiments", "coach_events"]) {
    await db.collection(name).deleteMany({});
  }
  console.log("  wiped configs, settings, conversations, bookings, experiments, coach_events");
}

await replaceAll("pricing", [...PRICING.map((p) => ({ ...p })), { _id: "billing_rules", ...BILLING_RULES }]);
await replaceAll("knowledge", KNOWLEDGE.map((k) => ({ ...k })));
await replaceAll("slots", makeSlots());
const personas = [...DEMO_PERSONAS, ...generatePracticePersonas()];
await replaceAll("personas", personas);
const qualified = personas.filter((p) => p.qualified).length;
console.log(`  personas: ${personas.filter((p) => p.split === "train").length} train, ${personas.filter((p) => p.split === "heldout").length} held-out, ${personas.filter((p) => p.split === "demo").length} demo; ${qualified} qualified`);

if ((await db.collection("configs").countDocuments()) === 0) {
  await insertConfigDoc({ version: 1, parentVersion: null, status: "active", config: AgentConfig.parse(V1_CONFIG) });
  await activateVersion(1);
  console.log("  configs: inserted v1 and set it active");
} else {
  console.log("  configs: kept existing versions (use --reset to start over)");
}

// Regular indexes
await db.collection("conversations").createIndexes([
  { key: { configVersion: 1, "labels.failureType": 1 } },
  { key: { personaId: 1, configVersion: 1, seed: 1 } },
  { key: { createdAt: -1 } },
]);
await db.collection("configs").createIndex({ version: 1 }, { unique: true });
await db.collection("coach_events").createIndex({ round: 1, ts: 1 });
await db.collection("bookings").createIndex({ conversationId: 1 });

// Vector index with Automated Embedding on conversation summaries
const conv = db.collection("conversations");
const existing = await conv.listSearchIndexes(CONVERSATION_VECTOR_INDEX).toArray();
if (existing.length === 0) {
  await conv.createSearchIndex({
    name: CONVERSATION_VECTOR_INDEX,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "autoEmbed", modality: "text", path: "summary", model: "voyage-4" },
        { type: "filter", path: "configVersion" },
        { type: "filter", path: "source" },
        { type: "filter", path: "labels.failureType" },
        { type: "filter", path: "labels.intent" },
        { type: "filter", path: "outcome.success" },
      ],
    },
  });
  console.log(`  vector index ${CONVERSATION_VECTOR_INDEX}: created (builds in the background)`);
} else {
  console.log(`  vector index ${CONVERSATION_VECTOR_INDEX}: exists (${(existing[0] as { status?: string }).status ?? "unknown"})`);
}

await closeDb();
console.log("Done.");
