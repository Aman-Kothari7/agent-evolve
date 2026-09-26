import { findConversations, getActiveVersion, listConfigDocs, listPersonas } from "@evolve/core";
import { plain } from "@/lib/ui";
import { ReplayClient } from "./replay-client";

export const dynamic = "force-dynamic";

export default async function ReplayPage() {
  const [personas, docs, active] = await Promise.all([listPersonas("demo"), listConfigDocs(), getActiveVersion()]);
  const convos = await findConversations(
    { personaId: { $in: personas.map((p) => p._id) }, source: { $in: ["replay", "sim"] }, outcome: { $exists: true } } as never,
    400,
  );
  return (
    <ReplayClient
      personas={plain(personas.sort((a, b) => (a.caseId ?? "").localeCompare(b.caseId ?? "")))}
      versions={plain(docs.filter((d) => d.status !== "candidate" && d.status !== "rejected"))}
      conversations={plain(convos)}
      active={active}
    />
  );
}
