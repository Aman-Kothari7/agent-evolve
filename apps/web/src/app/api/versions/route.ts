import { getActiveVersion, listConfigDocs } from "@evolve/core";

export async function GET() {
  const [docs, active] = await Promise.all([listConfigDocs(), getActiveVersion()]);
  return Response.json({ active, versions: docs });
}
