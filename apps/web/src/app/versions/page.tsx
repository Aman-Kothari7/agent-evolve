import Link from "next/link";
import { listConfigDocs, type ConfigDoc } from "@evolve/core";
import { AREA_DOT, ConfigDiff } from "@/components/config-diff";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const kept = (d: ConfigDoc) => d.status === "accepted" || d.status === "active";

export default async function EvolutionPage() {
  const docs = await listConfigDocs();
  const byVersion = new Map(docs.map((d) => [d.version, d]));
  const line = docs.filter(kept);
  const rejected = docs.filter((d) => d.status === "rejected");
  const newestFirst = [...docs].reverse();

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
      <header className="max-w-3xl">
        <p className="eyebrow">Evolution · stored in MongoDB Atlas (configs)</p>
        <h1 className="display mt-1 text-4xl">Every version of the harness, and why it changed.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {line.length} versions kept, {rejected.length} rejected. Each change was proposed by the coach from conversation evidence and tested on practice visitors before it went live.
        </p>
      </header>

      <Lineage line={line} rejected={rejected} />

      <ol className="flex flex-col gap-5">
        {newestFirst.map((d, i) => (
          <VersionCard key={d._id} doc={d} parent={d.parentVersion ? byVersion.get(d.parentVersion) : undefined} open={i < 2} />
        ))}
      </ol>
    </div>
  );
}

function Lineage({ line, rejected }: { line: ConfigDoc[]; rejected: ConfigDoc[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card px-6 py-5">
      <div className="flex min-w-max items-start">
        {line.map((d, i) => {
          const branches = rejected.filter((r) => r.parentVersion === d.version);
          return (
            <div key={d._id} className="flex items-start">
              <div className="flex flex-col items-center gap-2">
                <a
                  href={`#v${d.version}`}
                  className={cn(
                    "grid size-12 place-items-center rounded-full border-2 font-mono text-sm font-semibold transition hover:scale-105",
                    d.status === "active" ? "border-agent bg-agent text-white" : "border-ink bg-card",
                  )}
                >
                  v{d.version}
                </a>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {d.change ? (
                    <>
                      <span className={cn("size-1.5 rounded-full", AREA_DOT[d.change.area])} />
                      {d.change.area}
                    </>
                  ) : (
                    "baseline"
                  )}
                </span>
                {branches.map((b) => (
                  <a key={b._id} href={`#v${b.version}`} className="flex flex-col items-center">
                    <span className="h-4 w-px border-l border-dashed border-fail/60" />
                    <span className="grid size-8 place-items-center rounded-full border border-dashed border-fail font-mono text-[10px] text-fail">v{b.version}</span>
                    <span className="text-[10px] text-fail">rejected</span>
                  </a>
                ))}
              </div>
              {i < line.length - 1 && <span className="mx-2 mt-6 h-0.5 w-16 bg-ink/70" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VersionCard({ doc, parent, open }: { doc: ConfigDoc; parent?: ConfigDoc; open: boolean }) {
  const t = doc.test;
  const c = doc.change;
  const status = doc.status === "active" ? "Live" : doc.status === "accepted" ? "Kept" : doc.status === "rejected" ? "Rejected" : "Testing";
  return (
    <li id={`v${doc.version}`} className={cn("scroll-mt-6 rounded-2xl border bg-card", doc.status === "rejected" && "border-dashed border-fail/50")}>
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <span className="font-mono text-xl font-semibold">v{doc.version}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
            doc.status === "active" && "bg-agent text-white",
            doc.status === "accepted" && "bg-pass-soft text-pass",
            doc.status === "rejected" && "bg-fail-soft text-fail",
            doc.status === "candidate" && "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
        {c && (
          <span className="flex items-center gap-1.5 text-xs font-medium capitalize">
            <span className={cn("size-2 rounded-full", AREA_DOT[c.area])} />
            {c.area}
          </span>
        )}
        {doc.parentVersion && <span className="font-mono text-xs text-muted-foreground">from v{doc.parentVersion}</span>}
        <span className="ml-auto font-mono text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
      </div>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-3">
          {c ? (
            <p className="text-[15px] leading-relaxed">{c.reason}</p>
          ) : (
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              The starting harness: a friendly generalist with docs search, calendar, and limits lookup turned off, and a meeting tool anyone can trigger.
            </p>
          )}
          {t && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Failing visitors fixed" value={`${t.target.after}/${t.target.n}`} tone={t.target.after > 0 ? "pass" : "fail"} />
              <Stat label="Passing visitors kept" value={`${t.regression.after}/${t.regression.n}`} tone={t.regression.after >= t.regression.before ? "pass" : "fail"} />
              <Stat label="Locked-rule violations" value={String(t.lockedViolations)} tone={t.lockedViolations ? "fail" : "pass"} />
            </div>
          )}
          {doc.status === "rejected" && t?.notes && <p className="rounded-lg bg-fail-soft px-3 py-2 text-xs text-fail">{t.notes}</p>}
          {c && c.evidenceConversationIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="eyebrow">Evidence</span>
              {c.evidenceConversationIds.map((id) => (
                <Link key={id} href={`/conversations/${id}`} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-agent hover:underline">
                  {id.slice(0, 8)}
                </Link>
              ))}
            </div>
          )}
        </div>

        {c ? (
          <details open={open} className="group">
            <summary className="mb-2 cursor-pointer list-none text-xs font-medium text-muted-foreground">
              <span className="group-open:hidden">Show the patch ({c.ops.length} changes)</span>
              <span className="hidden group-open:inline">Patch against v{doc.parentVersion}</span>
            </summary>
            <ConfigDiff base={parent?.config} ops={c.ops} from={doc.parentVersion ?? undefined} to={doc.version} />
          </details>
        ) : (
          <ToolsSummary doc={doc} />
        )}
      </div>
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "pass" | "fail" }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <p className={cn("font-mono text-lg font-semibold", tone === "pass" ? "text-pass" : "text-fail")}>{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function ToolsSummary({ doc }: { doc: ConfigDoc }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">Tool catalog in v{doc.version}</p>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(doc.config.tools).map(([k, t]) => (
          <span key={k} className={cn("rounded-md px-2 py-1 font-mono text-[11px]", t.enabled ? "bg-agent-soft text-agent" : "bg-muted text-muted-foreground line-through")}>
            {t.name ?? k}
          </span>
        ))}
      </div>
    </div>
  );
}
