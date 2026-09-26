"use client";

import { useState } from "react";
import type { ConfigDoc, Turn } from "@evolve/core";
import { Transcript, type ChangeInfo } from "@/components/transcript";
import { cn } from "@/lib/utils";

type Side = { version: number; conversationId?: string; turns: Turn[] };

// Type one visitor message and send it to two config versions side by side.
export function ComparePanel({ versions, changes, initial }: { versions: ConfigDoc[]; changes: ChangeInfo; initial: [number, number] }) {
  const [sides, setSides] = useState<[Side, Side]>([
    { version: initial[0], turns: [] },
    { version: initial[1], turns: [] },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<{ text: string; only?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string, only?: 0 | 1) {
    if (!text.trim() || pending) return;
    setPending({ text, only });
    setError(null);
    const targets = only === undefined ? [0, 1] : [only];
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sides: targets.map((i) => ({ version: sides[i].version, conversationId: sides[i].conversationId })) }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? res.statusText);
      setSides((cur) => {
        const next = [...cur] as [Side, Side];
        (r.results as { conversationId: string; turns: Turn[] }[]).forEach((x, k) => {
          next[targets[k]] = { ...next[targets[k]], conversationId: x.conversationId, turns: x.turns };
        });
        return next;
      });
      if (only === undefined) setInput("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }

  const reset = (i: 0 | 1, version: number) =>
    setSides((cur) => {
      const next = [...cur] as [Side, Side];
      next[i] = { version, turns: [] };
      if (i === 0) next[1] = { ...next[1], conversationId: undefined, turns: [] };
      else next[0] = { ...next[0], conversationId: undefined, turns: [] };
      return next;
    });

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="eyebrow">Your message, two versions</p>
          <h2 className="text-xl font-bold tracking-tight">Send the same message to both configs</h2>
        </div>
        {sides.some((s) => s.turns.length) && (
          <button onClick={() => reset(0, sides[0].version)} className="ml-auto rounded-full border px-3 py-1 text-xs hover:border-ink/40">
            Start over
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          id="compare-message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type as a website visitor, e.g. We're migrating 4 TB from Postgres and need multi-region. Can we talk to someone?"
          className="min-w-0 flex-1 rounded-full border bg-paper px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-agent/40"
        />
        <button type="submit" disabled={!!pending || !input.trim()} className="rounded-full bg-agent px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {pending && pending.only === undefined ? "Sending to both…" : "Send to both"}
        </button>
      </form>
      {error && <p className="text-xs text-fail">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {sides.map((s, i) => {
          const cfg = versions.find((v) => v.version === s.version)?.config;
          return (
            <div key={i} className={cn("flex min-h-64 flex-col gap-3 rounded-xl border p-4", i === 1 ? "bg-agent-soft/40" : "bg-paper")}>
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Version for ${i === 0 ? "left" : "right"} side`}
                  value={s.version}
                  onChange={(e) => reset(i as 0 | 1, Number(e.target.value))}
                  className="rounded-full border bg-card px-3 py-1 font-mono text-sm font-semibold"
                >
                  {versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version}
                      {v.change ? ` · ${v.change.area}` : " · baseline"}
                    </option>
                  ))}
                </select>
                <span className="truncate text-xs text-muted-foreground">{versions.find((v) => v.version === s.version)?.change?.reason ?? "The starting config."}</span>
              </div>
              {s.turns.length === 0 && !pending && <p className="text-sm text-muted-foreground">Nothing sent yet.</p>}
              <Transcript
                dense
                turns={s.turns}
                config={cfg}
                changes={changes}
                onAction={(t) => send(t, i as 0 | 1)}
                pending={pending && (pending.only === undefined || pending.only === i) ? pending.text : null}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
