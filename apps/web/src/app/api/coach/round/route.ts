import { after } from "next/server";
import { logCoachEvent, runRound, runTurn } from "@evolve/core";

export const maxDuration = 800;

// Starts one coach round in the background; the page polls /api/coach/events.
export async function POST() {
  const round = `r_${Date.now()}`;
  after(async () => {
    try {
      await runRound({ round, agentTurn: runTurn });
    } catch (e) {
      await logCoachEvent(round, "error", { stage: "round", error: e instanceof Error ? e.message : String(e) });
    }
  });
  return Response.json({ round });
}
