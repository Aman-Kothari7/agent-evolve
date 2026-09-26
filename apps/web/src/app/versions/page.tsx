import Link from "next/link";
import { listConfigDocs, type ConfigDoc } from "@evolve/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AREA_STYLE, STATUS_STYLE } from "@/lib/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const pct = (a: number, n: number) => (n ? `${a}/${n}` : "–");

export default async function VersionsPage() {
  const docs = (await listConfigDocs()).reverse();
  const accepted = docs.filter((d) => d.status === "accepted" || d.status === "active").length - 1;
  const rejected = docs.filter((d) => d.status === "rejected").length;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Version history</h1>
        <p className="text-sm text-muted-foreground">
          Every change the coach proposed, how it was tested on practice customers, and whether it was kept. {Math.max(accepted, 0)} kept, {rejected} rejected. Stored in MongoDB Atlas (<code className="text-xs">configs</code>).
        </p>
      </div>
      <ol className="relative flex flex-col gap-3 border-l pl-5">
        {docs.map((d) => (
          <VersionCard key={d._id} doc={d} />
        ))}
      </ol>
    </div>
  );
}

function VersionCard({ doc }: { doc: ConfigDoc }) {
  const t = doc.test;
  const c = doc.change;
  const newTools = c?.ops.filter((o) => o.op !== "remove" && /^tools\.[a-z_]+$/.test(o.path) && (o.value as { kind?: string })?.kind === "template") ?? [];
  return (
    <li className="relative">
      <span className={cn("absolute -left-[27px] top-4 size-3 rounded-full border-2 border-background", doc.status === "rejected" ? "bg-rose-400" : doc.status === "candidate" ? "bg-zinc-400" : "bg-emerald-500")} />
      <Card size="sm" className={cn(doc.status === "rejected" && "opacity-80")}>
        <CardContent className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">v{doc.version}</span>
            <Badge className={cn("border-0", STATUS_STYLE[doc.status])}>{doc.status}</Badge>
            {c && <Badge className={cn("border-0", AREA_STYLE[c.area])}>{c.area}</Badge>}
            {newTools.map((o) => (
              <Badge key={o.path} className={cn("border-0", AREA_STYLE.tools)}>
                🛠 coach-built tool {o.path.split(".")[1]}
              </Badge>
            ))}
            {doc.parentVersion && <span className="text-xs text-muted-foreground">from v{doc.parentVersion}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          </div>

          {c ? <p className="text-sm">{c.reason}</p> : <p className="text-sm text-muted-foreground">Baseline config: a generic lead-capture bot. {doc.config.goal.description}</p>}

          {t && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-muted/60 px-3 py-2 text-xs">
              <span>
                <span className="text-muted-foreground">target</span> <b>{pct(t.target.before, t.target.n)} → {pct(t.target.after, t.target.n)}</b>
              </span>
              <span>
                <span className="text-muted-foreground">regression</span> <b>{pct(t.regression.before, t.regression.n)} → {pct(t.regression.after, t.regression.n)}</b>
              </span>
              <span>
                <span className="text-muted-foreground">locked-rule violations</span> <b className={t.lockedViolations ? "text-rose-600" : ""}>{t.lockedViolations}</b>
              </span>
              {t.costUsd > 0 && <span className="text-muted-foreground">${t.costUsd.toFixed(3)}</span>}
              {t.notes && <span className="basis-full text-muted-foreground">{t.notes}</span>}
            </div>
          )}

          {c && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {c.ops.length} change op{c.ops.length === 1 ? "" : "s"}
                {Object.keys(c.targetFilter ?? {}).length > 0 && <> · targets {Object.entries(c.targetFilter).map(([k, v]) => `${k}=${String(v)}`).join(", ")}</>}
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {c.ops.map((o, i) => (
                  <div key={i} className="rounded-md border bg-background p-2 font-mono">
                    <span className={cn("mr-1.5 font-semibold", o.op === "remove" ? "text-rose-600" : o.op === "add" ? "text-emerald-600" : "text-sky-600")}>{o.op}</span>
                    {o.path}
                    {"value" in o && o.value !== undefined && (
                      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{typeof o.value === "string" ? o.value : JSON.stringify(o.value, null, 2)}</pre>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {c && c.evidenceConversationIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Evidence:</span>
              {c.evidenceConversationIds.map((id) => (
                <Link key={id} href={`/conversations/${id}`} className="rounded bg-muted px-1.5 py-0.5 font-mono hover:underline">
                  {id.slice(0, 8)}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
