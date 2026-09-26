"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ConfigDoc, Conversation, Outcome, Persona } from "@evolve/core";
import { ComparePanel } from "@/components/compare-panel";
import { AREA_DOT } from "@/components/config-diff";
import { Transcript, type ChangeInfo } from "@/components/transcript";
import { cn } from "@/lib/utils";

const CASE_TITLES: Record<string, string> = {
  D2: "Migration · needs an engineer",
  D3: "Free-tier index limit",
};

function successText(p: Persona): string {
  const s = p.success;
  if (s.kind === "meeting") return "a call with an engineer gets booked";
  if (s.kind === "signup") return "they get the free-tier signup link, not a call";
  const facts = s.all.map((re) => re.replace(/\\b/g, "").replace(/\\/g, "")).join(", ");
  return `the answer states the right fact (${facts})`;
}

function verdict(o: Outcome | undefined, p: Persona): string {
  if (!o) return "Not run yet";
  if (p.success.kind === "meeting") return o.booked ? "Call booked" : o.left ? "Visitor gave up, no call" : "No call booked";
  if (p.success.kind === "signup") return o.booked ? "Booked a call it shouldn't have" : o.trialSent ? "Sent to the free tier" : "No signup link sent";
  return o.success ? "Gave the right answer" : o.left ? "Visitor gave up" : "Wrong or missing answer";
}

export function ReplayClient({ personas, versions, conversations, active }: { personas: Persona[]; versions: ConfigDoc[]; conversations: Conversation[]; active: number }) {
  const router = useRouter();
  const [personaId, setPersonaId] = useState(personas[0]?._id);
  const [left, setLeft] = useState(1);
  const [right, setRight] = useState(active);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persona = personas.find((p) => p._id === personaId);
  const changes: ChangeInfo = useMemo(() => Object.fromEntries(versions.map((v) => [v.version, { area: v.change?.area, reason: v.change?.reason }])), [versions]);
  const between = versions.filter((v) => v.change && v.version > Math.min(left, right) && v.version <= Math.max(left, right));

  // Latest finished conversation for this persona on a version; replays win over practice runs.
  const pick = (v: number) =>
    conversations
      .filter((c) => c.personaId === personaId && c.configVersion === v)
      .sort((a, b) => Number(b.source === "replay") - Number(a.source === "replay") || +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  const sides = [
    { v: left, set: setLeft, convo: pick(left) },
    { v: right, set: setRight, convo: pick(right) },
  ];

  async function rerun() {
    if (!personaId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/replay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaId, versions: [left, right] }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? res.statusText);
      const failed = (r.results as { error?: string }[]).find((x) => x.error);
      if (failed) setError(failed.error!);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const versionSelect = (v: number, set: (n: number) => void, label: string) => (
    <label className="flex items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold">
      <span className="sr-only">{label}</span>
      <select value={v} onChange={(e) => set(Number(e.target.value))} className="cursor-pointer appearance-none bg-transparent outline-none">
        {versions.map((d) => (
          <option key={d.version} value={d.version}>
            v{d.version}
            {d.version === active ? " · live" : d.version === 1 ? " · start" : ""}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-xs text-muted-foreground">▾</span>
    </label>
  );

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-4">
        <h1 className="display text-3xl">Replay</h1>
        <div className="flex rounded-full border bg-card p-1" role="tablist" aria-label="Demo visitor">
          {personas.map((p) => (
            <button
              key={p._id}
              role="tab"
              aria-selected={p._id === personaId}
              onClick={() => setPersonaId(p._id)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-agent/40",
                p._id === personaId ? "bg-ink text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CASE_TITLES[p.caseId ?? ""] ?? p.segment}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {versionSelect(left, setLeft, "Left version")}
          <span className="text-sm text-muted-foreground">vs</span>
          {versionSelect(right, setRight, "Right version")}
          <button
            onClick={rerun}
            disabled={running}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white outline-none transition hover:bg-agent focus-visible:ring-2 focus-visible:ring-agent/40 disabled:opacity-60"
          >
            {running ? "Running…" : "↻ Re-run"}
          </button>
        </div>
      </div>

      {persona && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-muted-foreground">
            Success = <span className="font-medium text-foreground">{successText(persona)}</span>
          </span>
          {between.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">Changed in between:</span>
              {between.map((v) => (
                <span key={v._id} title={v.change!.reason} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 font-mono text-[11px]">
                  <span className={cn("size-1.5 rounded-full", AREA_DOT[v.change!.area])} />v{v.version} {v.change!.area}
                </span>
              ))}
              <Link href="/versions" className="text-[13px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                details
              </Link>
            </span>
          )}
        </div>
      )}
      {error && <p className="rounded-lg bg-fail-soft px-3 py-2 text-sm text-fail">Replay failed: {error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {sides.map(({ v, convo }, i) => {
          const doc = versions.find((d) => d.version === v);
          const o = convo?.outcome;
          return (
            <section key={i} className="flex flex-col rounded-2xl border bg-card">
              <div className="flex items-center gap-3 border-b px-5 py-3">
                <span className="display text-2xl">v{v}</span>
                <span className="text-xs text-muted-foreground">{v === active ? "live" : v === 1 ? "starting point" : ""}</span>
                {persona && (
                  <span
                    className={cn(
                      "ml-auto rounded-full px-3 py-1 text-sm font-semibold",
                      !o ? "bg-muted text-muted-foreground" : o.success ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail",
                    )}
                  >
                    {o ? (o.success ? "✓ " : "✗ ") : ""}
                    {verdict(o, persona)}
                  </span>
                )}
              </div>
              <div className="px-5 py-5">
                {convo ? (
                  <Transcript turns={convo.turns} config={doc?.config} changes={changes} dense />
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">Not run on v{v} yet. Press Re-run.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="border-t pt-6">
        <ComparePanel versions={versions} changes={changes} initial={[left, right]} />
      </div>
    </div>
  );
}
