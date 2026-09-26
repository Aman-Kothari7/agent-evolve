"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ConfigDoc, RunTurnResult, Turn } from "@evolve/core";
import { Transcript, type ChangeInfo } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AREA_STYLE } from "@/lib/ui";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "How much would Acme cost for a team of about 40 people?",
  "We have 120 people, need SSO, and would pay annually. What's the yearly price?",
  "We use Snowflake and HubSpot and want a demo this week.",
  "I'm a solo founder. Can I talk to someone?",
];

export function ChatClient({ versions, active }: { versions: ConfigDoc[]; active: number }) {
  const [version, setVersion] = useState(active);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [last, setLast] = useState<RunTurnResult | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="flex h-[calc(100vh-7.5rem)] flex-col gap-0 py-0">
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <div className="text-sm font-medium">Acme Analytics · pricing page chat</div>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="version">
              Config
            </label>
            <select
              id="version"
              value={version}
              onChange={(e) => reset(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                  {v.version === active ? " (active)" : ""}
                  {v.change ? ` · ${v.change.area}` : " · baseline"}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => reset()}>
              New chat
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {turns.length === 0 && !pending ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Play a website visitor. Try one of these:</p>
              <div className="flex max-w-lg flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-muted">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Transcript turns={turns} config={config} changes={changes} onAction={send} pending={pending} />
          )}
          {error && <p className="mt-3 text-sm text-destructive">Error: {error}</p>}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type as a visitor…" disabled={!!pending} className="h-9" />
          <Button type="submit" disabled={!!pending || !input.trim()} className="h-9 px-4">
            Send
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4 lg:h-[calc(100vh-7.5rem)] lg:overflow-y-auto">
        <Card size="sm">
          <CardHeader>
            <CardTitle>What the bot knows</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {config &&
              Object.entries(config.state).map(([name, f]) => {
                const v = state[name];
                return (
                  <div key={name} className="flex items-start justify-between gap-2 text-sm">
                    <div>
                      <div className="font-mono text-xs">{name}</div>
                      <div className="text-xs text-muted-foreground">{f.question}</div>
                    </div>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", v == null ? "text-muted-foreground" : "bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>
                      {v == null ? "unknown" : String(v)}
                    </span>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Tools</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {config &&
              Object.entries(config.tools).map(([name, t]) => {
                const status = !t.enabled ? "disabled" : last ? (available.has(name) ? "unlocked" : "locked") : t.requires.length ? "locked" : "unlocked";
                return (
                  <div key={name} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-xs">
                      {name}
                      {t.kind === "template" && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">coach-built</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      {t.introducedIn > 1 && <Badge className={cn("h-auto border-0 px-1 py-0 text-[10px]", AREA_STYLE.tools)}>v{t.introducedIn}</Badge>}
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[11px]",
                          status === "unlocked" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                          status === "locked" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
                          status === "disabled" && "bg-muted text-muted-foreground",
                        )}
                        title={t.requires.length ? `needs ${t.requires.join(", ")}` : undefined}
                      >
                        {status}
                        {status === "locked" && t.requires.length ? ` · needs ${t.requires.join(", ")}` : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Rule events</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {allRuleEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {config?.rules.length ?? 0} rules watching. Nothing blocked or rewritten yet.
              </p>
            ) : (
              allRuleEvents.map((e, i) => (
                <div key={i} className="rounded-md bg-rose-50 px-2 py-1.5 text-xs dark:bg-rose-950/40">
                  <span className="font-medium">
                    {e.action === "blocked" ? "⛔" : "✏️"} {e.ruleId}
                  </span>{" "}
                  {e.action}
                  {e.detail && <div className="mt-0.5 line-clamp-3 text-muted-foreground">{e.detail}</div>}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {(last?.contextLoaded?.length ?? 0) > 0 && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Knowledge loaded this turn</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1">
              {last!.contextLoaded!.map((id) => (
                <Badge key={id} className={cn("border-0", AREA_STYLE.context)}>
                  {id}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
