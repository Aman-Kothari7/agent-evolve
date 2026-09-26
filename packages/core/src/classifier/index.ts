// On-demand classification: the coach writes a new question, Jev answers it for every conversation on a
// version, and the answers are stored in Atlas as labels.custom.<name> for stats and targeting.
import { experimental_evaluate as evaluate } from "ai";
import { describeOutcome, transcriptText } from "../labeler";
import { jevModel } from "../models";
import { findConversations, getDb } from "../store";

export type ClassifySpec = {
  name: string; // lowercase_with_underscores
  question: string;
  type: "boolean" | "choice";
  options?: Record<string, string>; // choice value -> description
  version: number;
};

export type ClassifyResult = {
  name: string;
  question: string;
  version: number;
  classified: number;
  seconds: number;
  distribution: { value: string; n: number; success: number; examples: string[] }[];
};

export async function classifyConversations(spec: ClassifySpec, concurrency = 12): Promise<ClassifyResult> {
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(spec.name)) throw new Error("name must be lowercase_with_underscores");
  if (spec.type === "choice" && Object.keys(spec.options ?? {}).length < 2) throw new Error("choice questions need at least 2 options");
  const convos = await findConversations({ configVersion: spec.version, source: "sim", outcome: { $exists: true } } as never, 400);
  const t0 = Date.now();
  const answers: { id: string; value: string; success: boolean }[] = [];
  const queue = [...convos];

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        try {
          const q =
            spec.type === "boolean"
              ? { type: "boolean" as const, instructions: spec.question }
              : { type: "choice" as const, instructions: spec.question, criteria: spec.options! };
          const r = await evaluate({ model: jevModel(), state: { transcript: transcriptText(c), outcome: describeOutcome(c) }, questions: { q } });
          const a = r.answers.q as { type: string; probability?: number; choice?: string };
          const value = a.type === "boolean" ? ((a.probability ?? 0) >= 0.5 ? "yes" : "no") : String(a.choice);
          answers.push({ id: c._id, value, success: (c as { grade?: { success: boolean } }).grade?.success ?? !!c.outcome?.success });
        } catch {
          // skip conversations Jev couldn't answer; they simply get no custom label
        }
      }
    }),
  );

  const col = (await getDb()).collection("conversations");
  if (answers.length)
    await col.bulkWrite(answers.map((a) => ({ updateOne: { filter: { _id: a.id as never }, update: { $set: { [`labels.custom.${spec.name}`]: a.value } } } })));

  const byValue = new Map<string, { value: string; n: number; success: number; examples: string[] }>();
  for (const a of answers) {
    const cur = byValue.get(a.value) ?? { value: a.value, n: 0, success: 0, examples: [] };
    cur.n++;
    if (a.success) cur.success++;
    else if (cur.examples.length < 4) cur.examples.push(a.id);
    byValue.set(a.value, cur);
  }
  return {
    name: spec.name,
    question: spec.question,
    version: spec.version,
    classified: answers.length,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    distribution: [...byValue.values()].sort((x, y) => y.n - x.n),
  };
}
