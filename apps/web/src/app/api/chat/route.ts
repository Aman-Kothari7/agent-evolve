import { runTurn } from "@evolve/core";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { conversationId, configVersion, message } = (await req.json()) as { conversationId?: string; configVersion?: number; message?: string };
  if (!message?.trim()) return Response.json({ error: "message is required" }, { status: 400 });
  try {
    const r = await runTurn({ conversationId, configVersion, message: message.trim(), source: "live" });
    return Response.json(r);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
