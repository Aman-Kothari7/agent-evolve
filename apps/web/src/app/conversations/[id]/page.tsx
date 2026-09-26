import Link from "next/link";
import { notFound } from "next/navigation";
import { getConfig, getConversation, listConfigDocs } from "@evolve/core";
import { Transcript } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { plain } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ConversationPage(props: PageProps<"/conversations/[id]">) {
  const { id } = await props.params;
  const convo = await getConversation(id);
  if (!convo) notFound();
  const [config, docs] = await Promise.all([getConfig(convo.configVersion).catch(() => undefined), listConfigDocs()]);
  const changes = Object.fromEntries(docs.map((d) => [d.version, { area: d.change?.area, reason: d.change?.reason }]));
  const o = convo.outcome;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/versions" className="text-sm text-muted-foreground hover:underline">
          ← Versions
        </Link>
        <h1 className="text-lg font-semibold">Conversation {id.slice(0, 8)}</h1>
        <Badge variant="outline">v{convo.configVersion}</Badge>
        <Badge variant="outline">{convo.source}</Badge>
        {convo.personaId && <Badge variant="outline">{convo.personaId}</Badge>}
        {o && <Badge className={o.success ? "border-0 bg-emerald-600 text-white" : "border-0 bg-rose-600 text-white"}>{o.success ? "success" : "failed"}</Badge>}
        {convo.labels && <Badge variant="secondary">{convo.labels.failureType}</Badge>}
      </div>
      {convo.summary && <p className="text-sm text-muted-foreground">{convo.summary}</p>}
      <Card>
        <CardContent>
          <Transcript turns={plain(convo.turns)} config={plain(config)} changes={changes} />
        </CardContent>
      </Card>
    </div>
  );
}
