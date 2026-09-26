import Link from "next/link";
import { getActiveVersion, listConfigDocs, listPersonas, type ChangeOp, type ConfigDoc } from "@evolve/core";
import { Frame } from "@/components/frame";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Steps sit on the ring clockwise from the top, 72° apart. The traveling dot passes one every 2s.
const STEPS = [
  { label: "Visitors chat", sub: "simulated customers" },
  { label: "Graded", sub: "stored in Atlas" },
  { label: "Coach finds the pattern", sub: "stats + search" },
  { label: "One change, tested", sub: "fixed? broke anything?" },
  { label: "Kept or rejected", sub: "then again" },
];

const human = (s: string) => s.replace(/_/g, " ");

// A few words for what a change did, read from its ops instead of the coach's long reason.
function describe(doc: ConfigDoc): string {
  const c = doc.change;
  if (!c) return "the weak starting point";
  const out = new Set<string>();
  for (const o of c.ops as ChangeOp[]) {
    const [area, name, field] = o.path.split(".");
    const v = "value" in o ? o.value : undefined;
    if (area === "tools" && field === "enabled" && v === true) out.add(`turned on ${human(name)}`);
    else if (area === "tools" && !field && o.op !== "remove") out.add(`built a ${human(name)} tool`);
    else if (area === "rules") out.add("added a guardrail");
    else if (area === "widgets") out.add(`added ${human(name ?? "a widget")}`);
    else if (area === "state") out.add(`remembers ${human(name ?? "more")}`);
    else if (area === "instructions") out.add("rewrote its instructions");
    else if (area === "context") out.add("loads docs by topic");
  }
  return [...out].slice(0, 2).join(", ") || `changed its ${c.area}`;
}

const TICKER = ["Versioned in Atlas", "Jev labels every chat", "$rankFusion search", "One change per round", "Tested before it ships", "Locked guardrails", "No hand edits"];

export default async function OverviewPage() {
  const [docs, active, practice] = await Promise.all([listConfigDocs(), getActiveVersion(), listPersonas("train")]);
  const line = docs.filter((d) => d.status === "accepted" || d.status === "active");
  const rejected = docs.filter((d) => d.status === "rejected");

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-6">
      {/* Masthead */}
      <Frame className="grid bg-card lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,0.45fr)]">
        <h1 className="display px-6 py-6 text-5xl xl:text-6xl">Goal-driven harness optimization</h1>
        <p className="border-t px-6 py-6 text-[13px] leading-snug lg:border-l lg:border-t-0">
          <span className="font-semibold">Agents defined as config. Improved by a coach. Graded against the goal.</span>
          <br />
          A MongoDB Atlas support assistant and a coach that studies its conversations. You set the goal; a judge turns it into a rubric; the coach changes one
          thing at a time and keeps it only if more conversations meet the goal.
        </p>
        <Link href="/coach" className="group flex flex-col justify-between gap-6 border-t px-5 py-6 outline-none hover:bg-agent-soft focus-visible:bg-agent-soft lg:border-l lg:border-t-0">
          <span className="label text-agent">Watch a round</span>
          <span className="self-end text-2xl text-agent transition group-hover:translate-x-1">→</span>
        </Link>
        <div className="col-span-full overflow-hidden border-t py-2">
          <div className="ticker flex w-max gap-8 whitespace-nowrap">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="label flex items-center gap-2 text-muted-foreground">
                <span className="size-2 rounded-full border border-muted-foreground/60" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </Frame>

      <Frame className="grid bg-card lg:grid-cols-2">
        {/* Result + versions */}
        <section className="flex flex-col justify-between gap-10 p-6">
          <div>
            <p className="label flex justify-between border-b pb-2 text-muted-foreground">
              <span>Versions</span>
              <span>[01]</span>
            </p>
            <ol>
              {line.map((d) => {
                const live = d.version === active;
                return (
                  <li key={d._id} className="grid grid-cols-[3rem_1fr] items-center gap-4 border-b py-3">
                    <span className={cn("display text-2xl", live && "text-agent")}>v{d.version}</span>
                    <span className="text-[13px] font-medium uppercase leading-tight tracking-wide">
                      {describe(d)}
                      {live && <span className="label ml-2 bg-agent px-1.5 py-0.5 text-white">live</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {rejected.length > 0 && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                <span className="font-semibold text-fail">{rejected.length} rejected</span> when a test showed no gain.{" "}
                <Link href="/versions" className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                  See every change
                </Link>
              </p>
            )}
          </div>
        </section>

        {/* The loop */}
        <section aria-label="The improvement loop" className="flex flex-col gap-4 border-t p-6 lg:border-l lg:border-t-0">
          <p className="label flex justify-between text-muted-foreground">
            <span>The loop</span>
            <span>[02]</span>
          </p>
          <div className="flex flex-1 items-center justify-center py-4">
            <Loop version={active} visitors={practice.length} />
          </div>
        </section>
      </Frame>
    </div>
  );
}

function Loop({ version, visitors }: { version: number; visitors: number }) {
  const R = 36; // ring radius, % of the box
  const ticks = Array.from({ length: 60 }, (_, i) => i * 6);
  return (
    <div className="relative aspect-square w-full max-w-[500px]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible text-ink" aria-hidden>
        <line x1="50" y1="4" x2="50" y2="96" stroke="var(--border)" strokeWidth="0.25" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="var(--border)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r={R + 6} fill="none" stroke="var(--border)" strokeWidth="0.25" strokeDasharray="0.6 1.2" />
        <circle cx="50" cy="50" r={R - 12} fill="none" stroke="var(--border)" strokeWidth="0.25" />
        {ticks.map((t) => {
          const a = (t * Math.PI) / 180;
          const long = t % 30 === 0;
          return (
            <line
              key={t}
              x1={50 + (R + 1.2) * Math.cos(a)}
              y1={50 + (R + 1.2) * Math.sin(a)}
              x2={50 + (R + (long ? 3.2 : 2.2)) * Math.cos(a)}
              y2={50 + (R + (long ? 3.2 : 2.2)) * Math.sin(a)}
              stroke="currentColor"
              strokeWidth={long ? 0.3 : 0.15}
            />
          );
        })}
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="0.35" />
      </svg>

      {/* The dot rides a rotating layer on the same CSS clock as the step highlights, so they stay in sync. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="loop-spin absolute inset-0">
          <span className="absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-agent" style={{ top: `${50 - R}%` }} />
        </div>
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <div className="bg-card px-3 text-center">
          <p className="label text-muted-foreground">Live now</p>
          <p className="display text-7xl">v{version}</p>
        </div>
      </div>

      {STEPS.map((s, i) => {
        const a = (-90 + i * 72) * (Math.PI / 180);
        return (
          <div
            key={s.label}
            className="loop-node absolute flex -translate-x-1/2 -translate-y-1/2 flex-col border bg-card px-3 py-2 whitespace-nowrap"
            style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%`, animationDelay: `${i * 2}s` }}
          >
            <span className="label flex items-center gap-2 text-muted-foreground">
              <span className="loop-num size-1.5 bg-muted-foreground" />[{String(i + 1).padStart(2, "0")}]
            </span>
            <span className="text-[13px] font-bold uppercase leading-tight tracking-wide">{s.label}</span>
            <span className="text-[11px] text-muted-foreground">{i === 0 && visitors ? `${visitors} ${s.sub}` : s.sub}</span>
          </div>
        );
      })}
    </div>
  );
}
