"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeOp, ConfigDoc } from "@evolve/core";
import { ConfigDiff, AREA_DOT } from "@/components/config-diff";
import { Markdown } from "@/components/transcript";
import { cn } from "@/lib/utils";

type Ev = { _id: string; round: string; type: string; ts: string; payload: Record<string, unknown> };
type RoundInfo = { _id: string; start: string; end: string; n: number; types: string[] };
type Phase = { key: string; title: string; blurb: string; events: Ev[] };

const isDone = (evs: Ev[]) => evs.some((e) => e.type === "decision" || (e.type === "error" && e.payload.stage === "round"));
const clock = (ts: string) => new Date(ts).toLocaleTimeString("en-US", { minute: "2-digit", second: "2-digit" });

function phaseOf(e: Ev): string {
  const p = e.payload;
  if (e.type === "rubric" || e.type === "grading") return "define";
  if (e.type === "test_progress") return p.stage === "baseline" ? "baseline" : "test";
  if (e.type === "thinking" && String(p.text ?? "").startsWith("Round started")) return "baseline";
  if (e.type === "tool_call") return p.tool === "stats" || p.tool === "classify" ? "diagnose" : "investigate";
  if (e.type === "thinking") return "investigate";
  if (e.type === "proposal" || (e.type === "error" && p.stage === "validate")) return "propose";
  if (e.type === "decision" || e.type === "error") return "decide";
  return "investigate";
}

const PHASES: Omit<Phase, "events">[] = [
  { key: "baseline", title: "Baseline", blurb: "Practice visitors talk to the live config. Jev labels every conversation." },
  { key: "define", title: "Define success", blurb: "An independent judge turns the goal into a frozen rubric. Jev grades every conversation with it." },
  { key: "diagnose", title: "Diagnose", blurb: "Aggregations over Jev labels, plus new labels the coach asks Jev for on demand." },
  { key: "investigate", title: "Investigate", blurb: "Hybrid search ($rankFusion) and full transcripts for the failing cases." },
  { key: "propose", title: "Propose", blurb: "One typed change to the harness config, with evidence." },
  { key: "test", title: "Test", blurb: "Visitors who failed that way, plus ones that must not break." },
  { key: "decide", title: "Decide", blurb: "Kept as a new version, or rejected with the reason." },
];

export function CoachClient({ goal, active, initialVersions }: { goal: string; active: number; initialVersions: ConfigDoc[] }) {
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [round, setRound] = useState<string | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [versions, setVersions] = useState(initialVersions);
  const [liveVersion, setLiveVersion] = useState(active);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState("");
  const [goalText, setGoalText] = useState(goal);
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [r, v] = await Promise.all([fetch("/api/coach/events").then((x) => x.json()), fetch("/api/versions").then((x) => x.json())]);
    setRounds(r.rounds);
    setVersions(v.versions);
    setLiveVersion(v.active);
    return r.rounds as RoundInfo[];
  }, []);

  useEffect(() => {
    // Inline fetch (not refresh()) so every setState happens in an async callback.
    fetch("/api/coach/events")
      .then((x) => x.json())
      .then((r: { rounds: RoundInfo[] }) => {
        setRounds(r.rounds);
        if (r.rounds[0]) setRound((cur) => cur ?? r.rounds[0]._id);
      });
  }, []);

  useEffect(() => {
    if (!round) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await fetch(`/api/coach/events?round=${round}`).then((x) => x.json());
      if (stop) return;
      setEvents(r.events);
      if (!isDone(r.events)) timer = setTimeout(tick, 1500);
      else refresh();
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [round, refresh]);

  // Follow the log only while a round is live; finished rounds open at the top.
  const live = !!round && events.length > 0 && !isDone(events);
  useEffect(() => {
    if (live) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length, live]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/coach/round", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ focus, goal: goalText !== goal ? goalText : undefined }) }).then((x) => x.json());
      setEvents([]);
      setRound(r.round);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  const running = !!round && events.length > 0 && !isDone(events);
  const phases: Phase[] = useMemo(() => PHASES.map((p) => ({ ...p, events: events.filter((e) => phaseOf(e) === p.key) })), [events]);
  const current = running ? [...phases].reverse().find((p) => p.events.length)?.key : undefined;

  const proposal = events.find((e) => e.type === "proposal")?.payload;
  const testStart = events.find((e) => e.type === "test_progress" && e.payload.stage === "start")?.payload;
  const decision = events.find((e) => e.type === "decision")?.payload;
  const candidate = Number(proposal?.candidateVersion ?? testStart?.version ?? decision?.version) || undefined;
  const baseVersion = Number(proposal?.baseVersion) || versions.find((v) => v.version === candidate)?.parentVersion || undefined;
  const base = versions.find((v) => v.version === baseVersion)?.config;
  const runs = events.filter((e) => e.type === "test_progress" && typeof e.payload.done === "number").map((e) => e.payload);
  const fatal = events.find((e) => e.type === "error" && e.payload.stage === "round")?.payload;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          <p className="eyebrow">Coach · recursive harness improvement</p>
          <h1 className="display mt-1 text-4xl">The coach rewrites the assistant&apos;s harness.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Goal (locked): {goal}</p>
        </div>
        <div className="ml-auto flex w-full max-w-md flex-col items-stretch gap-2">
          <label htmlFor="goal" className="eyebrow">
            Goal for this round (the judge turns it into a rubric)
          </label>
          <textarea
            id="goal"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            disabled={running}
            rows={3}
            className="rounded-xl border bg-card px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coach/40"
          />
          <label htmlFor="focus" className="eyebrow">
            Focus for this round (optional)
          </label>
          <input
            id="focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            disabled={running}
            placeholder="e.g. stop offering engineer calls to students"
            className="rounded-full border bg-card px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-coach/40"
          />
          <button
            onClick={start}
            disabled={starting || running}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-coach px-5 py-2.5 text-sm font-semibold text-white shadow-sm outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-coach/50 disabled:opacity-60"
          >
            <span className={cn("size-2 rounded-full bg-white", running && "pulse-dot")} />
            {running ? "Round in progress" : starting ? "Starting…" : `Run a round on v${liveVersion}`}
          </button>
          {error && <p className="text-xs text-fail">{error}</p>}
        </div>
      </header>

      {rounds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow mr-1">Rounds</span>
          {rounds.map((r) => {
            const done = r.types.includes("decision");
            return (
              <button
                key={r._id}
                onClick={() => setRound(r._id)}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-[11px] outline-none transition focus-visible:ring-2 focus-visible:ring-ring",
                  r._id === round ? "border-ink bg-ink text-white" : "bg-card hover:border-ink/40",
                )}
              >
                {new Date(r.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                {!done && <span className="ml-1.5 text-coach">● live</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="rounded-2xl border bg-card p-5">
          {!round && <Empty onStart={start} />}
          {fatal && <p className="mb-3 rounded-lg bg-fail-soft px-3 py-2 text-sm text-fail">Round stopped: {String(fatal.error)}</p>}
          <ol className="relative flex flex-col">
            {round &&
              phases.map((ph, i) => {
                const state = ph.events.length ? (current === ph.key ? "live" : "done") : "pending";
                return (
                  <li key={ph.key} className="relative grid grid-cols-[2rem_1fr] gap-3 pb-6 last:pb-0">
                    {i < phases.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border" />}
                    <span
                      className={cn(
                        "z-10 grid size-8 place-items-center rounded-full border font-mono text-xs font-semibold",
                        state === "done" && "border-coach bg-coach-soft text-coach",
                        state === "live" && "pulse-dot border-coach bg-coach text-white",
                        state === "pending" && "bg-card text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 pt-1">
                        <h2 className="text-base font-bold">{ph.title}</h2>
                        <span className="text-xs text-muted-foreground">{ph.blurb}</span>
                      </div>
                      {ph.events.map((e) => (
                        <EventRow key={e._id} e={e} />
                      ))}
                    </div>
                  </li>
                );
              })}
          </ol>
          <div ref={bottom} />
        </section>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border bg-card p-4">
            <p className="eyebrow">Proposed patch</p>
            {proposal ? (
              <div className="mt-2 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", AREA_DOT[String(proposal.area)])} />
                  <span className="text-sm font-semibold capitalize">{String(proposal.area)}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">targets {Object.values((proposal.targetFilter as Record<string, unknown>) ?? {}).join(", ")}</span>
                </div>
                <p className="text-sm leading-relaxed">{String(proposal.reason)}</p>
                <ConfigDiff base={base} ops={(proposal.ops as ChangeOp[]) ?? []} from={baseVersion} to={candidate} />
                {Array.isArray(proposal.evidenceConversationIds) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="eyebrow">Evidence</span>
                    {(proposal.evidenceConversationIds as string[]).map((id) => (
                      <Link key={id} href={`/conversations/${id}`} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-agent hover:underline">
                        {id.slice(0, 8)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{running ? "The coach is still investigating." : "No proposal in this round yet."}</p>
            )}
          </div>

          {(runs.length > 0 || testStart) && <Scoreboard runs={runs} planned={Number(testStart?.target ?? 0) + Number(testStart?.regression ?? 0)} />}
          {decision && <Verdict d={decision} />}
        </aside>
      </div>
    </div>
  );
}

function Empty({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <p className="text-lg font-semibold">No rounds yet.</p>
      <p className="max-w-md text-sm text-muted-foreground">A round runs practice visitors against the live config, finds where the goal fails, proposes one change, and tests it.</p>
      <button onClick={onStart} className="rounded-full bg-coach px-4 py-2 text-sm font-semibold text-white">
        Run the first round
      </button>
    </div>
  );
}

function Scoreboard({ runs, planned }: { runs: Record<string, unknown>[]; planned: number }) {
  const sets = ["target", "regression"] as const;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Test on practice visitors</p>
        <span className="font-mono text-[11px] text-muted-foreground">
          {runs.length}/{planned || "…"}
        </span>
      </div>
      {sets.map((set) => {
        const rs = runs.filter((r) => r.set === set);
        const ok = rs.filter((r) => r.success).length;
        return (
          <div key={set} className="mt-3">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="font-semibold">{set === "target" ? "Should now succeed" : "Must still succeed"}</span>
              <span className="font-mono">
                {ok}/{rs.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rs.map((r) => (
                <Link
                  key={String(r.conversationId)}
                  href={`/conversations/${String(r.conversationId)}`}
                  title={String(r.personaId)}
                  className={cn("rise rounded-md px-2 py-1 font-mono text-[10.5px]", r.success ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail")}
                >
                  {r.success ? "✓" : "✗"} {String(r.personaId).replace(/^p\d+_/, "").replace(/_/g, " ")}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Verdict({ d }: { d: Record<string, unknown> }) {
  if (d.decision === "no_proposal") return <div className="rounded-2xl border bg-card p-4 text-sm">The coach didn&apos;t propose a change this round.</div>;
  const ok = d.decision === "accepted";
  const t = (d.test ?? {}) as { target?: { after: number; n: number }; regression?: { after: number; n: number }; lockedViolations?: number; notes?: string };
  return (
    <div className={cn("rise rounded-2xl p-4 text-white", ok ? "bg-pass" : "bg-fail")}>
      <p className="font-mono text-[11px] uppercase tracking-widest opacity-80">Decision</p>
      <p className="display mt-1 text-2xl">{ok ? `Kept. v${String(d.version)} is live.` : `Rejected v${String(d.version)}.`}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs opacity-90">
        {t.target && <span>fixed {t.target.after}/{t.target.n}</span>}
        {t.regression && <span>kept {t.regression.after}/{t.regression.n}</span>}
        <span>locked-rule violations {t.lockedViolations ?? 0}</span>
      </div>
      {!ok && t.notes && <p className="mt-2 text-xs opacity-90">{t.notes}</p>}
    </div>
  );
}

function EventRow({ e }: { e: Ev }) {
  const p = e.payload;
  const time = <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{clock(e.ts)}</span>;

  if (e.type === "rubric") {
    const criteria = (p.criteria as Record<string, string>[]) ?? [];
    return (
      <div className="rise overflow-hidden rounded-xl border border-coach/40">
        <div className="flex flex-wrap items-center gap-2 bg-coach-soft px-3 py-1.5">
          <span className="rounded bg-coach px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-white">rubric</span>
          <span className="text-sm font-medium">{String(p.summary)}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">judge {String(p.model)} · frozen</span>
        </div>
        <ol className="flex flex-col divide-y">
          {criteria.map((c) => (
            <li key={c.id} className="grid grid-cols-[auto_1fr] gap-x-2 px-3 py-1.5 text-xs">
              <span className={cn("mt-0.5 rounded px-1 font-mono text-[10px]", c.kind === "event" ? "bg-ink text-white" : "bg-agent-soft text-agent")}>{c.kind === "event" ? "event" : "Jev"}</span>
              <div>
                <p className="font-medium">{c.kind === "event" ? String(c.event).replace(/_/g, " ") : c.question}{c.kind === "question" && c.passWhen === "no" ? " → pass if no" : ""}</p>
                {c.appliesWhen && <p className="text-muted-foreground">applies when: {c.appliesWhen}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (e.type === "grading")
    return (
      <div className="rise flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-[11px] text-white">Jev</span>
        <span>
          graded <b>{String(p.graded)}</b> conversations on v{String(p.version)} in {String(p.seconds)}s: <b className="text-pass">{String(p.success)} pass</b>, <b className="text-fail">{Number(p.graded) - Number(p.success)} fail</b>
        </span>
        <span className="text-xs text-muted-foreground">agrees with the practice ground truth {String(p.agreement)}%</span>
        <span className="ml-auto">{time}</span>
      </div>
    );

  if (e.type === "thinking" && p.focus)
    return (
      <div className="rise flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-coach-soft px-2 py-0.5 font-mono text-[11px] text-coach">focus</span>
        <span className="font-medium">{String(p.focus)}</span>
        <span className="ml-auto">{time}</span>
      </div>
    );

  if (e.type === "thinking")
    return (
      <div className="rise flex gap-2 text-sm text-muted-foreground">
        <div className="min-w-0 flex-1 italic">
          <Markdown text={String(p.text)} />
        </div>
        {time}
      </div>
    );

  if (e.type === "test_progress") {
    if (p.stage === "baseline")
      return (
        <div className="rise flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md bg-agent-soft px-2 py-0.5 font-mono text-[11px] text-agent">{String(p.missing)} conversations</span>
          <span className="text-muted-foreground">running on v{String(p.version)} through the real runtime</span>
          <span className="ml-auto">{time}</span>
        </div>
      );
    if (p.stage === "start")
      return (
        <div className="rise flex flex-wrap items-center gap-2 text-sm">
          <span>
            Testing <b>v{String(p.version)}</b> on {String(p.target)} visitors it should fix and {String(p.regression)} it must not break
          </span>
          <span className="ml-auto">{time}</span>
        </div>
      );
    return null;
  }

  if (e.type === "tool_call") return <ToolCall p={p} time={time} />;

  if (e.type === "proposal")
    return (
      <div className="rise flex items-center gap-2 rounded-lg border border-coach/40 bg-coach-soft px-3 py-2 text-sm">
        <span className="font-semibold text-coach">Proposal ready</span>
        <span className="truncate text-muted-foreground">
          {(p.ops as ChangeOp[])?.length ?? 0} changes to {String(p.area)}. The patch is on the right.
        </span>
        <span className="ml-auto">{time}</span>
      </div>
    );

  if (e.type === "decision") {
    const ok = p.decision === "accepted";
    return (
      <div className={cn("rise rounded-lg px-3 py-2 text-sm font-semibold", ok ? "bg-pass-soft text-pass" : p.decision === "no_proposal" ? "bg-muted" : "bg-fail-soft text-fail")}>
        {p.decision === "no_proposal" ? "No proposal this round." : ok ? `Accepted. v${String(p.version)} is now live.` : `Rejected v${String(p.version)}.`}
      </div>
    );
  }

  if (e.type === "error")
    return (
      <div className="rise rounded-lg bg-fail-soft px-3 py-2 font-mono text-xs text-fail">
        {String(p.stage)}: {JSON.stringify(p.errors ?? p.error)}
      </div>
    );
  return null;
}

function ToolCall({ p, time }: { p: Record<string, unknown>; time: React.ReactNode }) {
  const tool = String(p.tool);
  const input = (p.input ?? {}) as Record<string, unknown>;
  const out = p.output;
  const label =
    tool === "stats"
      ? `group by ${String(input.groupBy)}`
      : tool === "classify"
        ? `new label ${String(input.name)}: “${String(input.question)}”`
        : tool === "search"
          ? `“${String(input.query)}”`
          : tool === "read"
            ? `conversation ${String(input.conversationId).slice(0, 8)}`
            : "past experiments";
  return (
    <div className="rise overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5">
        <span className="rounded bg-coach px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-white">{tool}</span>
        <span className="min-w-0 truncate text-sm">{label}</span>
        <span className="ml-auto">{time}</span>
      </div>
      <div className="px-3 py-2">
        {tool === "stats" && Array.isArray(out) && <StatsBars rows={out as Record<string, unknown>[]} />}
        {tool === "classify" && out ? <ClassifyResult out={out as Record<string, unknown>} /> : null}
        {tool === "search" && <SearchHits out={(out ?? {}) as Record<string, unknown>} />}
        {tool === "read" && out ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{String((out as Record<string, unknown>).transcriptPreview ?? "")}</pre>
        ) : null}
        {tool === "list_experiments" && <p className="text-xs text-muted-foreground">{Array.isArray(out) && out.length ? `${out.length} past experiments` : "No past experiments yet."}</p>}
      </div>
    </div>
  );
}

function StatsBars({ rows }: { rows: Record<string, unknown>[] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.n)));
  return (
    <div className="grid grid-cols-[minmax(7rem,auto)_1fr_auto] items-center gap-x-3 gap-y-1.5">
      {rows.map((r) => {
        const n = Number(r.n);
        const ok = Number(r.success);
        return (
          <div key={String(r._id)} className="contents">
            <span className="truncate font-mono text-[11px]">{String(r._id ?? "unlabeled")}</span>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(12, (100 * n) / max)}%` }}>
              <div className="bg-pass" style={{ width: `${(100 * ok) / n}%` }} />
              <div className="bg-fail/80" style={{ width: `${(100 * (n - ok)) / n}%` }} />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {ok}/{n}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SearchHits({ out }: { out: Record<string, unknown> }) {
  const results = (out.results as Record<string, unknown>[]) ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white">{String(out.method ?? "search").replace(/^hybrid /, "hybrid · ")}</span>
        {Object.entries((out.filter as Record<string, unknown>) ?? {}).map(([k, v]) => (
          <span key={k} className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {k.replace(/^labels\./, "")}={String(v)}
          </span>
        ))}
        <span className="text-[11px] text-muted-foreground">{results.length} hits</span>
      </div>
      {results.map((r) => (
        <div key={String(r.id)} className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
          <span className={cn("mt-1 size-2 rounded-full", r.success ? "bg-pass" : "bg-fail")} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/conversations/${String(r.id)}`} className="font-mono text-[11px] text-agent hover:underline">
                {String(r.id).slice(0, 8)}
              </Link>
              {r.intent ? <span className="font-mono text-[10px] text-muted-foreground">{String(r.intent)}</span> : null}
              {r.failureType ? <span className="font-mono text-[10px] text-fail">{String(r.failureType)}</span> : null}
              {Array.isArray(r.foundBy) && <span className="font-mono text-[10px] text-muted-foreground">{(r.foundBy as string[]).join(" · ")}</span>}
            </div>
            <p className="line-clamp-2 text-muted-foreground">{String(r.summary ?? "")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClassifyResult({ out }: { out: Record<string, unknown> }) {
  if (out.error) return <p className="font-mono text-xs text-fail">{String(out.error)}</p>;
  const dist = (out.distribution as { value: string; n: number; success: number; examples: string[] }[]) ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[10px] text-white">Jev · on-demand label</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {String(out.classified)} conversations on v{String(out.version)} in {String(out.seconds)}s → saved as custom.{String(out.name)}
        </span>
      </div>
      <StatsBars rows={dist.map((d) => ({ _id: d.value, n: d.n, success: d.success }))} />
      {dist
        .filter((d) => d.examples.length)
        .map((d) => (
          <div key={d.value} className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">failed where {d.value}:</span>
            {d.examples.map((id) => (
              <Link key={id} href={`/conversations/${id}`} className="font-mono text-agent hover:underline">
                {id.slice(0, 8)}
              </Link>
            ))}
          </div>
        ))}
    </div>
  );
}
