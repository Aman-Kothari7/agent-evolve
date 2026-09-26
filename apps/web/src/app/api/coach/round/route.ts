import { after } from "next/server";
import { logCoachEvent, runRound, runTurn } from "@evolve/core";

export const maxDuration = 800;

// Starts one coach round in the background; the page polls /api/coach/events.
// Optional body: { focus: "what to look into first this round" }.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { focus?: string };
  const focus = body.focus?.trim().slice(0, 300) || undefined;
  const round = `r_${Date.now()}`;
  after(async () => {
    try {
      await runRound({ round, agentTurn: runTurn, focus });
    } catch (e) {
      await logCoachEvent(round, "error", { stage: "round", error: e instanceof Error ? e.message : String(e) });
    }
  });
  return Response.json({ round });
}
