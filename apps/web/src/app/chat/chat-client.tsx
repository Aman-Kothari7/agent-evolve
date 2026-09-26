"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConfigDoc, Rule, RunTurnResult, Turn } from "@evolve/core";
import { Transcript, type ChangeInfo } from "@/components/transcript";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { label: "Migration, needs an engineer", text: "We're moving a 4 TB fintech database from Postgres to MongoDB and need multi-region plus compliance. Can we talk to someone?" },
  { label: "Free-tier limit question", text: "How many vector search indexes can I create on the free tier?" },
  { label: "Connection error", text: "My app can't connect to Atlas anymore. I keep getting ECONNRESET. It worked yesterday." },
  { label: "Student wants a call", text: "I'm doing a class project with MongoDB. Can I get a call with someone to help me set up?" },
];

export function ChatClient({ versions, active }: { versions: ConfigDoc[]; active: number }) {
  const [version, setVersion] = useState(active);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [last, setLast] = useState<RunTurnResult | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [inspect, setInspect] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);

  const doc = versions.find((v) => v.version === version) ?? versions[versions.length - 1];
  const config = doc?.config;
  const changes: ChangeInfo = useMemo(
    () => Object.fromEntries(versions.map((v) => [v.version, { area: v.change?.area, reason: v.change?.reason }])),
    [versions],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, pending]);

  function reset(v = version) {
    setVersion(v);
    setTurns([]);
    setConversationId(undefined);
    setLast(null);
    setError(null);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    setInput("");
    setPending(message);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, configVersion: version, message }),
      });
      const r = (await res.json()) as RunTurnResult & { error?: string };
      if (!res.ok) throw new Error(r.error ?? res.statusText);
      setConversationId(r.conversationId);
      setLast(r);
      const now = new Date();
      setTurns((t) => [
        ...t,
        { role: "customer", text: message, ts: now },
        {
          role: "agent",
          text: r.reply,
          widgets: r.widgets,
          toolCalls: r.toolCalls,
          ruleEvents: r.ruleEvents,
          stateAfter: r.state,
          provenance: r.provenance,
          toolsAvailable: r.toolsAvailable,
          contextLoaded: r.contextLoaded,
          ts: now,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const state = last?.state ?? {};
  const allRuleEvents = turns.flatMap((t) => t.ruleEvents ?? []).filter((e) => e.action !== "passed");
  const available = new Set(last?.toolsAvailable ?? []);
  const usedNow = new Set((last?.toolCalls ?? []).filter((c) => !c.blockedBy).map((c) => c.tool));
  const empty = turns.length === 0 && !pending;

  const composer = (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        send(input);
      }}
    >
      <div className="rounded-[26px] border bg-card px-4 pb-3 pt-3.5 shadow-[0_2px_12px_rgba(21,21,19,0.06)] focus-within:border-foreground/30">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={Math.min(6, Math.max(1, input.split("\n").length))}
          placeholder="Message the Atlas assistant as a website visitor"
          aria-label="Message"
          disabled={!!pending}
          className="w-full resize-none bg-transparent px-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:bg-muted"
          >
            ＋ New chat
          </button>
          <label className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm transition hover:bg-muted" title={doc?.change?.reason ?? "The weak starting config"}>
            <span className="sr-only">Config version</span>
            <select value={version} onChange={(e) => reset(Number(e.target.value))} className="cursor-pointer appearance-none bg-transparent font-semibold outline-none">
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === active ? " · live" : v.version === 1 ? " · starting point" : ""}
                </option>
              ))}
            </select>
            <span aria-hidden className="text-xs text-muted-foreground">▾</span>
          </label>
          <button
            type="submit"
            disabled={!!pending || !input.trim()}
            aria-label="Send"
            className="grid size-9 place-items-center rounded-full bg-ink text-white outline-none transition hover:bg-agent focus-visible:ring-2 focus-visible:ring-agent/40 disabled:bg-muted-foreground/40"
          >
            ↑
          </button>
        </div>
      </div>
    </form>
  );

  return (
    <div className="-mx-5 -my-6 flex h-screen lg:-mx-8">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="text-sm font-semibold">MongoDB Atlas assistant</span>
          <span className="label text-muted-foreground">v{version}</span>
          <button
            onClick={() => setInspect((x) => !x)}
            className={cn("ml-auto rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-agent/40", inspect ? "bg-ink text-white" : "bg-card hover:bg-muted")}
          >
            {inspect ? "Hide harness" : "Inspect harness"}
          </button>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-7 px-5 pb-16">
            <h1 className="display text-center text-4xl">How can I help with Atlas?</h1>
            <div className="w-full max-w-3xl">{composer}</div>
            <div className="grid w-full max-w-3xl gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left outline-none transition hover:bg-card focus-visible:ring-2 focus-visible:ring-agent/40"
                >
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="line-clamp-1 text-[13px] text-muted-foreground">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-5 py-8">
                <Transcript turns={turns} config={config} changes={changes} onAction={send} pending={pending} />
                {error && <p className="mt-4 rounded-lg bg-fail-soft px-3 py-2 text-sm text-fail">Something went wrong: {error}</p>}
                <div ref={bottom} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-5 pb-2">{composer}</div>
          </>
        )}
        <p className="pb-3 pt-1 text-center text-[11px] text-muted-foreground">Hackathon demo, not an official MongoDB assistant.</p>
      </div>

      {inspect && (
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-card lg:flex">
          <Panel n="01" title="What it knows">
            {config &&
              Object.entries(config.state).map(([name, f]) => {
                const v = state[name];
                return (
                  <div key={name} className="flex items-start justify-between gap-3">
                    <p className="text-[13px] leading-snug text-muted-foreground">
                      {f.question}
                      {f.introducedIn > 1 && <AddedIn v={f.introducedIn} />}
                    </p>
                    <span className={cn("shrink-0 text-[13px]", v == null ? "text-muted-foreground" : "font-semibold text-pass")}>{v == null ? "—" : humanize(v)}</span>
                  </div>
                );
              })}
          </Panel>

          <Panel n="02" title="Tools">
            {config &&
              Object.entries(config.tools).map(([name, t]) => {
                const status = !t.enabled ? "off" : usedNow.has(name) ? "used" : last && !available.has(name) ? "waiting" : "ready";
                return (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className={cn("font-mono text-xs", status === "off" && "text-muted-foreground line-through")}>
                      {name}
                      {t.introducedIn > 1 && <AddedIn v={t.introducedIn} />}
                    </span>
                    <span
                      className={cn(
                        "label shrink-0",
                        status === "used" && "text-agent",
                        status === "ready" && "text-pass",
                        status === "waiting" && "text-muted-foreground",
                        status === "off" && "text-muted-foreground",
                      )}
                      title={status === "waiting" ? `needs ${t.requires.join(", ")}` : undefined}
                    >
                      {status === "used" ? "● used" : status}
                    </span>
                  </div>
                );
              })}
          </Panel>

          <Panel n="03" title="Guardrails">
            {config?.rules.map((r) => (
              <p key={r.id} className="text-[13px] leading-snug text-muted-foreground">
                {r.locked ? "🔒 " : ""}
                {ruleText(r)}
                {r.introducedIn > 1 && <AddedIn v={r.introducedIn} />}
              </p>
            ))}
            {allRuleEvents.map((e, i) => (
              <p key={i} className="rounded-md bg-fail-soft px-2 py-1.5 text-xs text-fail">
                {e.action === "blocked" ? "Blocked a reply" : "Rewrote a reply"} · {e.ruleId}
              </p>
            ))}
          </Panel>

          {(last?.contextLoaded?.length ?? 0) > 0 && (
            <Panel n="04" title="Docs pulled in">
              <p className="font-mono text-xs">{last!.contextLoaded!.join(", ")}</p>
            </Panel>
          )}
        </aside>
      )}
    </div>
  );
}

function Panel({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b px-5 py-4">
      <h2 className="label flex justify-between text-muted-foreground">
        <span>{title}</span>
        <span>[{n}]</span>
      </h2>
      {children}
    </section>
  );
}

function AddedIn({ v }: { v: number }) {
  return <span className="ml-1.5 whitespace-nowrap rounded bg-agent-soft px-1 py-px font-mono text-[10px] font-semibold text-agent">added v{v}</span>;
}

const humanize = (v: string | boolean) => (typeof v === "boolean" ? (v ? "yes" : "no") : v.replace(/_/g, " "));

function ruleText(r: Rule): string {
  if (r.type === "check") return r.question;
  if (r.type === "tool_order") return `Must use ${r.require} before ${r.before}.`;
  return `Use ${r.tool} at most ${r.max}×.`;
}
