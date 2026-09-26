import { getPersona, runConversation, runTurn } from "@evolve/core";

export const maxDuration = 300;

// Re-runs one demo persona against each requested version (same opening, same seed, temperature 0).
export async function POST(req: Request) {
  const { personaId, versions, seed = 1 } = (await req.json()) as { personaId: string; versions: number[]; seed?: number };
  const persona = await getPersona(personaId);
  if (!persona) return Response.json({ error: `persona ${personaId} not found` }, { status: 404 });
  const runId = `replay_${Date.now()}`;
  const results = await Promise.all(
    [...new Set(versions)].map((v) =>
      runConversation({ persona, configVersion: v, seed, runId, agentTurn: runTurn, source: "replay" }).catch((e) => ({
        configVersion: v,
        error: e instanceof Error ? e.message : String(e),
      })),
    ),
  );
  return Response.json({ runId, results });
}
