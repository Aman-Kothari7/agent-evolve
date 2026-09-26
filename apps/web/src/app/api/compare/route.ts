import { getConversation, runTurn } from "@evolve/core";

export const maxDuration = 120;

// Sends one visitor message to each side (a config version + its own conversation) and returns the full transcripts.
export async function POST(req: Request) {
  const { message, sides } = (await req.json()) as { message?: string; sides?: { version: number; conversationId?: string }[] };
  if (!message?.trim() || !sides?.length) return Response.json({ error: "message and sides are required" }, { status: 400 });
  try {
    const results = await Promise.all(
      sides.map(async (s) => {
        const r = await runTurn({ conversationId: s.conversationId, configVersion: s.version, message: message.trim(), source: "live" });
        const convo = await getConversation(r.conversationId);
        return { version: s.version, conversationId: r.conversationId, turns: convo?.turns ?? [] };
      }),
    );
    return Response.json({ results: JSON.parse(JSON.stringify(results)) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
