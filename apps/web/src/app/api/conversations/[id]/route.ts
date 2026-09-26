import { getConversation } from "@evolve/core";

export async function GET(_req: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const c = await getConversation(id);
  return c ? Response.json(c) : Response.json({ error: "not found" }, { status: 404 });
}
