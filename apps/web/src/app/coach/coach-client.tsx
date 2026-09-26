"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeArea, ChangeOp } from "@evolve/core";
import { Markdown } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AREA_STYLE } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Ev = { _id: string; round: string; type: string; ts: string; payload: Record<string, unknown> };
type RoundInfo = { _id: string; start: string; end: string; n: number; types: string[] };

const isDone = (evs: Ev[]) => evs.some((e) => e.type === "decision" || (e.type === "error" && e.payload.stage === "round"));

export function CoachClient({ goal, active }: { goal: string; active: number }) {
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [round, setRound] = useState<string | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [starting, setStarting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadRounds = useCallback(async () => {
    const r = await fetch("/api/coach/events").then((x) => x.json());
    setRounds(r.rounds);
    return r.rounds as RoundInfo[];
  }, []);

  useEffect(() => {
    fetch("/api/coach/events")
      .then((x) => x.json())
      .then((r: { rounds: RoundInfo[] }) => {
        setRounds(r.rounds);
        if (r.rounds[0]) setRound((cur) => cur ?? r.rounds[0]._id);
      });
  }, []);

  // Poll the selected round until it has a decision.
  useEffect(() => {
    if (!round) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const r = await fetch(`/api/coach/events?round=${round}`).then((x) => x.json());
      if (stop) return;
      setEvents(r.events);
      if (!isDone(r.events)) timer = setTimeout(tick, 1500);
      else loadRounds();
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [round, loadRounds]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length]);

  async function start() {
    setStarting(true);
    try {
      const r = await fetch("/api/coach/round", { method: "POST" }).then((x) => x.json());
      setEvents([]);
      setRound(r.round);
      loadRounds();
    } finally {
      setStarting(false);
    }
  }

  const running = !!round && events.length > 0 && !isDone(events);
  const progress = [...events].reverse().find((e) => e.type === "test_progress" && typeof e.payload.of === "number");

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Goal</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">{goal}</p>
            <p className="text-xs text-muted-foreground">Locked: the coach can&apos;t edit the goal, turn limits, or the no-invented-discounts / no-invented-features rules.</p>
            <Button onClick={start} disabled={starting || running}>
              {running ? "Round in progress…" : starting ? "Starting…" : `Run one round on v${active}`}
            </Button>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent rounds</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {rounds.length === 0 && <p className="text-xs text-muted-foreground">No rounds yet.</p>}
            {rounds.map((r) => (
              <button
                key={r._id}
                onClick={() => setRound(r._id)}
                className={cn("flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted", r._id === round && "bg-muted font-medium")}
              >
                <span>{new Date(r.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
                <span className="text-muted-foreground">
                  {r.n} events{r.types.includes("decision") ? "" : " · running"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[70vh]">
        <CardHeader className="flex flex-row items-center">
          <CardTitle>Live round {round && <span className="font-mono text-xs text-muted-foreground">{round}</span>}</CardTitle>
          {progress && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              testing {String(progress.payload.done)}/{String(progress.payload.of)}
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${(100 * Number(progress.payload.done)) / Number(progress.payload.of)}%` }} />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!round && <p className="text-sm text-muted-foreground">Press “Run one round” to watch the coach diagnose, propose, and test a change.</p>}
          {events.map((e) => (
            <EventRow key={e._id} e={e} />
          ))}
          {running && <div className="animate-pulse text-sm text-muted-foreground">…</div>}
          <div ref={bottom} />
        </CardContent>
      </Card>
    </div>
  );
}

function EventRow({ e }: { e: Ev }) {
  const p = e.payload;
  const time = new Date(e.ts).toLocaleTimeString("en-US", { minute: "2-digit", second: "2-digit" });
  const shell = (icon: string, body: React.ReactNode, cls?: string) => (
    <div className={cn("flex gap-2.5 rounded-md px-2.5 py-2 text-sm", cls)}>
      <span className="w-5 shrink-0 text-center">{icon}</span>
      <div className="min-w-0 flex-1">{body}</div>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{time}</span>
    </div>
  );

  switch (e.type) {
    case "thinking":
      return shell("💭", <Markdown text={String(p.text)} />);
    case "tool_call":
      return shell(
        "🔎",
        <span>
          <span className="font-mono text-xs font-medium">{String(p.tool)}</span>{" "}
          <span className="break-all font-mono text-xs text-muted-foreground">{JSON.stringify(p.input)}</span>
        </span>,
      );
    case "proposal": {
      const ops = (p.ops as ChangeOp[]) ?? [];
      return shell(
        "💡",
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">Proposal</span>
            <Badge className={cn("border-0", AREA_STYLE[p.area as ChangeArea])}>{String(p.area)}</Badge>
          </div>
          <p>{String(p.reason)}</p>
          <div className="flex flex-col gap-1">
            {ops.map((o, i) => (
              <details key={i} className="rounded border bg-background px-2 py-1 font-mono text-xs">
                <summary className="cursor-pointer">
                  {o.op} {o.path}
                </summary>
                {"value" in o && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(o.value, null, 2)}</pre>}
              </details>
            ))}
          </div>
        </div>,
        "bg-sky-50 dark:bg-sky-950/40",
      );
    }
    case "test_progress":
      if (p.stage === "baseline") return shell("⏳", <span className="text-muted-foreground">Running {String(p.missing)} baseline practice conversations on v{String(p.version)}…</span>);
      if (p.stage === "start")
        return shell("🧪", <span>Testing v{String(p.version)} on {String(p.target)} customers it should fix + {String(p.regression)} it must not break</span>);
      return shell(
        p.success ? "✅" : "❌",
        <span className="text-xs">
          {String(p.set)} · {String(p.personaId)}{" "}
          {typeof p.conversationId === "string" && (
            <Link href={`/conversations/${p.conversationId}`} className="text-primary hover:underline">
              view
            </Link>
          )}
        </span>,
      );
    case "decision": {
      if (p.decision === "no_proposal") return shell("🤷", <span>No proposal this round.</span>);
      const t = p.test as { target: { before: number; after: number; n: number }; regression: { before: number; after: number; n: number }; lockedViolations: number; notes?: string } | undefined;
      const ok = p.decision === "accepted";
      return shell(
        ok ? "🎉" : "🚫",
        <div className="flex flex-col gap-1">
          <span className="font-semibold">
            v{String(p.version)} {ok ? "accepted and activated" : "rejected"}
          </span>
          {t && (
            <span className="text-xs">
              target {t.target.before}/{t.target.n} → {t.target.after}/{t.target.n} · regression {t.regression.before}/{t.regression.n} → {t.regression.after}/{t.regression.n} · locked violations {t.lockedViolations}
            </span>
          )}
          {t?.notes && <span className="text-xs text-muted-foreground">{t.notes}</span>}
        </div>,
        ok ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-rose-50 dark:bg-rose-950/40",
      );
    }
    case "error":
      return shell("⚠️", <span className="break-all text-xs text-destructive">{JSON.stringify(p)}</span>, "bg-rose-50/50 dark:bg-rose-950/20");
    default:
      return shell("•", <span className="font-mono text-xs">{JSON.stringify(p)}</span>);
  }
}
