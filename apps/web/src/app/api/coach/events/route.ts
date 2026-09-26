import { getDb, listCoachEvents } from "@evolve/core";

// ?round=r_123[&since=ISO] -> that round's events; no round -> the most recent rounds.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const round = url.searchParams.get("round");
  if (!round) {
    const rounds = await (await getDb())
      .collection("coach_events")
      .aggregate([{ $group: { _id: "$round", start: { $min: "$ts" }, end: { $max: "$ts" }, n: { $sum: 1 }, types: { $addToSet: "$type" } } }, { $sort: { start: -1 } }, { $limit: 20 }])
      .toArray();
    return Response.json({ rounds });
  }
  const since = url.searchParams.get("since");
  return Response.json({ events: await listCoachEvents(round, since ? new Date(since) : undefined) });
}
