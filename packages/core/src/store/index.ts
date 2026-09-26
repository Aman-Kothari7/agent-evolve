import { MongoClient, type Db, type Document, type Filter } from "mongodb";
import { randomUUID } from "node:crypto";
import { AgentConfig, type ChangeArea, type ChangeOp } from "../config/schema";
import type { Conversation, Labels, Outcome, Persona, Turn } from "../types";

// One client per process. globalThis survives Next.js dev hot reloads.
const g = globalThis as unknown as { __evolveMongo?: Promise<MongoClient> };

export async function getDb(): Promise<Db> {
  if (!g.__evolveMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set (see .env.example)");
    g.__evolveMongo = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 }).connect();
  }
  return (await g.__evolveMongo).db(process.env.MONGODB_DB ?? "evolve");
}

export async function closeDb() {
  if (g.__evolveMongo) await (await g.__evolveMongo).close();
  g.__evolveMongo = undefined;
}

// ---------- Config versions ----------

export type ConfigStatus = "active" | "accepted" | "rejected" | "candidate";

export type TestResult = {
  target: { before: number; after: number; n: number };
  regression: { before: number; after: number; n: number };
  lockedViolations: number;
  costUsd: number;
  notes?: string;
};

export type ConfigDoc = {
  _id: string;
  version: number;
  parentVersion: number | null;
  status: ConfigStatus;
  config: AgentConfig;
  change?: {
    ops: ChangeOp[];
    area: ChangeArea;
    reason: string;
    evidenceConversationIds: string[];
    targetFilter: Record<string, unknown>;
  };
  test?: TestResult;
  createdAt: Date;
};

const configs = async () => (await getDb()).collection<ConfigDoc>("configs");
const settings = async () => (await getDb()).collection<{ _id: string; version: number }>("settings");

export async function getActiveVersion(): Promise<number> {
  const s = await (await settings()).findOne({ _id: "active" });
  if (!s) throw new Error("No active config. Run `pnpm seed` first.");
  return s.version;
}

export async function getConfigDoc(version: number): Promise<ConfigDoc | null> {
  return (await configs()).findOne({ version });
}

export async function getConfig(version?: number): Promise<AgentConfig> {
  const v = version ?? (await getActiveVersion());
  const doc = await getConfigDoc(v);
  if (!doc) throw new Error(`Config version ${v} not found`);
  return AgentConfig.parse(doc.config);
}

export const getActiveConfig = () => getConfig();

export async function listConfigDocs(): Promise<ConfigDoc[]> {
  return (await configs()).find({}).sort({ version: 1 }).toArray();
}

export async function nextVersionNumber(): Promise<number> {
  const last = await (await configs()).find({}).sort({ version: -1 }).limit(1).next();
  return (last?.version ?? 0) + 1;
}

export async function insertConfigDoc(doc: Omit<ConfigDoc, "_id" | "createdAt">): Promise<ConfigDoc> {
  const full: ConfigDoc = { ...doc, _id: `v${doc.version}`, config: AgentConfig.parse(doc.config), createdAt: new Date() };
  await (await configs()).insertOne(full);
  return full;
}

export async function setConfigStatus(version: number, status: ConfigStatus, test?: TestResult) {
  await (await configs()).updateOne({ version }, { $set: { status, ...(test ? { test } : {}) } });
}

export async function activateVersion(version: number) {
  const col = await configs();
  await col.updateMany({ status: "active" }, { $set: { status: "accepted" } });
  await col.updateOne({ version }, { $set: { status: "active" } });
  await (await settings()).updateOne({ _id: "active" }, { $set: { version } }, { upsert: true });
}

// ---------- Conversations ----------

const conversations = async () => (await getDb()).collection<Conversation>("conversations");

export async function createConversation(init: {
  configVersion: number;
  source: Conversation["source"];
  personaId?: string;
  seed?: number;
  runId?: string;
}): Promise<string> {
  const _id = randomUUID();
  await (await conversations()).insertOne({ _id, turns: [], createdAt: new Date(), ...init });
  return _id;
}

export async function appendTurn(conversationId: string, turn: Turn) {
  await (await conversations()).updateOne({ _id: conversationId }, { $push: { turns: turn } });
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  return (await conversations()).findOne({ _id: conversationId });
}

export async function setOutcome(conversationId: string, outcome: Outcome) {
  await (await conversations()).updateOne({ _id: conversationId }, { $set: { outcome } });
}

export async function setLabels(conversationId: string, labels: Labels, summary: string) {
  await (await conversations()).updateOne({ _id: conversationId }, { $set: { labels, summary } });
}

export async function findConversations(filter: Filter<Conversation>, limit = 50): Promise<Conversation[]> {
  return (await conversations()).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
}

// Semantic search over conversation summaries (Automated Embedding index, see seed.ts).
export const CONVERSATION_VECTOR_INDEX = "conversations_summary_vec";

export async function searchConversations(query: string, filter: Record<string, unknown> = {}, k = 8) {
  const pipeline: Document[] = [
    {
      $vectorSearch: {
        index: CONVERSATION_VECTOR_INDEX,
        path: "summary",
        query,
        numCandidates: Math.max(50, k * 10),
        limit: k,
        ...(Object.keys(filter).length ? { filter } : {}),
      },
    },
    {
      $project: {
        _id: 1,
        summary: 1,
        configVersion: 1,
        labels: 1,
        outcome: 1,
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];
  return (await conversations()).aggregate(pipeline).toArray();
}

// Counts and success rate per group, e.g. groupBy "labels.failureType".
export async function conversationStats(groupBy: string, filter: Record<string, unknown> = {}) {
  return (await conversations())
    .aggregate([
      { $match: { outcome: { $exists: true }, ...filter } },
      {
        $group: {
          _id: `$${groupBy}`,
          n: { $sum: 1 },
          success: { $sum: { $cond: ["$outcome.success", 1, 0] } },
          booked: { $sum: { $cond: ["$outcome.booked", 1, 0] } },
          left: { $sum: { $cond: ["$outcome.left", 1, 0] } },
        },
      },
      { $sort: { n: -1 } },
    ])
    .toArray();
}

// ---------- Personas ----------

const personas = async () => (await getDb()).collection<Persona>("personas");

export async function getPersona(id: string) {
  return (await personas()).findOne({ _id: id });
}

export async function listPersonas(split?: Persona["split"]) {
  return (await personas()).find(split ? { split } : {}).toArray();
}

// ---------- Business data used by tools ----------

export const TOOL_COLLECTIONS = ["limits", "slots", "knowledge"] as const;
export type ToolCollection = (typeof TOOL_COLLECTIONS)[number];

export async function getOpenSlots(limit = 3) {
  return (await getDb())
    .collection("slots")
    .find({ booked: { $ne: true }, start: { $gte: new Date() } }, { projection: { _id: 0 } })
    .sort({ start: 1 })
    .limit(limit)
    .toArray();
}

export async function getKnowledgeDoc(id: string): Promise<{ id: string; title: string; text: string; url?: string } | null> {
  return (await getDb()).collection<{ _id: string; title: string; text: string; url?: string }>("knowledge")
    .findOne({ _id: id })
    .then((d) => (d ? { id: d._id, title: d.title, text: d.text, url: d.url } : null));
}

export const KNOWLEDGE_VECTOR_INDEX = "knowledge_text_vec";

// Semantic docs search (Automated Embedding index on knowledge.text), with a keyword fallback.
export async function searchKnowledge(query: string, k = 2) {
  const col = (await getDb()).collection<{ _id: string; title: string; text: string; url: string }>("knowledge");
  try {
    const rows = await col
      .aggregate([
        { $vectorSearch: { index: KNOWLEDGE_VECTOR_INDEX, path: "text", query, numCandidates: 50, limit: k } },
        { $project: { _id: 1, title: 1, url: 1, text: 1, score: { $meta: "vectorSearchScore" } } },
      ])
      .toArray();
    if (rows.length) return rows;
  } catch {
    // index still building or unavailable: fall through to keywords
  }
  const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const all = await col.find({}).toArray();
  return all
    .map((d) => ({ ...d, score: words.filter((w) => (d.title + " " + d.text).toLowerCase().includes(w)).length }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Finds an open slot by id or by the start of its label (e.g. "Tue, Sep 29, 1:00 PM").
export async function findOpenSlot(slot: string) {
  const escaped = slot.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (await getDb()).collection("slots").findOne({ booked: { $ne: true }, $or: [{ slotId: slot.trim() }, { label: { $regex: `^${escaped}`, $options: "i" } }] });
}

export async function markSlotBooked(slotId: string) {
  await (await getDb()).collection("slots").updateOne({ slotId }, { $set: { booked: true } });
}

export async function listKnowledge() {
  return (await getDb()).collection("knowledge").find({}, { projection: { text: 0 } }).toArray();
}

// Runs a coach-created template tool's pipeline. Only read-only stages on the tool collections.
const ALLOWED_STAGES = new Set(["$match", "$project", "$addFields", "$set", "$group", "$sort", "$limit", "$unwind"]);

export async function runToolPipeline(collection: ToolCollection, pipeline: Document[]) {
  if (!TOOL_COLLECTIONS.includes(collection)) throw new Error(`Collection ${collection} is not allowed for tools`);
  for (const stage of pipeline) {
    const [op] = Object.keys(stage);
    if (!ALLOWED_STAGES.has(op)) throw new Error(`Stage ${op} is not allowed in template tools`);
  }
  return (await getDb()).collection(collection).aggregate(pipeline).toArray();
}

// ---------- Bookings ----------

export async function insertBooking(b: { conversationId: string; slot: string; name?: string; email?: string }) {
  await (await getDb()).collection("bookings").insertOne({ ...b, createdAt: new Date() });
}

export async function getBookingFor(conversationId: string) {
  return (await getDb()).collection("bookings").findOne({ conversationId });
}

// ---------- Coach events + experiments ----------

export type CoachEventType = "thinking" | "tool_call" | "proposal" | "test_progress" | "decision" | "error";

export async function logCoachEvent(round: string, type: CoachEventType, payload: unknown) {
  await (await getDb()).collection("coach_events").insertOne({ round, type, payload, ts: new Date() });
}

export async function listCoachEvents(round?: string, since?: Date) {
  const filter: Document = {};
  if (round) filter.round = round;
  if (since) filter.ts = { $gt: since };
  return (await getDb()).collection("coach_events").find(filter).sort({ ts: 1 }).limit(500).toArray();
}

export async function insertExperiment(e: Document) {
  await (await getDb()).collection("experiments").insertOne({ ...e, createdAt: new Date() });
}

export async function listExperiments(limit = 30) {
  return (await getDb()).collection("experiments").find({}).sort({ createdAt: -1 }).limit(limit).toArray();
}

// ---------- One coach round at a time (shared by `pnpm evolve` and the web app) ----------

export async function acquireCoachLock(round: string, ttlMs = 20 * 60_000): Promise<boolean> {
  const locks = (await getDb()).collection<{ _id: string; round: string; until: Date }>("locks");
  const now = new Date();
  try {
    await locks.updateOne(
      { _id: "coach", $or: [{ until: { $lt: now } }, { round }] },
      { $set: { round, until: new Date(now.getTime() + ttlMs) } },
      { upsert: true },
    );
    return true;
  } catch {
    return false; // duplicate key: another round holds an unexpired lock
  }
}

export async function releaseCoachLock(round: string) {
  await (await getDb()).collection<{ _id: string; round: string; until: Date }>("locks").updateOne({ _id: "coach", round }, { $set: { until: new Date(0) } });
}
