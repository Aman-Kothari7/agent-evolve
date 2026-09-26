import { getDb } from "@evolve/core";

export type VersionScore = { version: number; n: number; success: number; rate: number };

// Goal success of practice visitors (simulated conversations) on each config version.
export async function successByVersion(): Promise<Map<number, VersionScore>> {
  const rows = await (await getDb())
    .collection("conversations")
    .aggregate<{ _id: number; n: number; success: number }>([
      { $match: { source: "sim", outcome: { $exists: true } } },
      { $group: { _id: "$configVersion", n: { $sum: 1 }, success: { $sum: { $cond: ["$outcome.success", 1, 0] } } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, { version: r._id, n: r.n, success: r.success, rate: r.n ? r.success / r.n : 0 }]));
}

export const pct = (r: number) => `${Math.round(r * 100)}%`;
