"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ConfigDoc, Conversation, Persona } from "@evolve/core";
import { Transcript, type ChangeInfo } from "@/components/transcript";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CASE_TITLES: Record<string, string> = {
  D2: "Migration → engineer call",
  D3: "Free-tier index limit",
};

export function ReplayClient({ personas, versions, conversations, active }: { personas: Persona[]; versions: ConfigDoc[]; conversations: Conversation[]; active: number }) {
  const router = useRouter();
  const [personaId, setPersonaId] = useState(personas[0]?._id);
  const [left, setLeft] = useState(1);
  const [right, setRight] = useState(active);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persona = personas.find((p) => p._id === personaId);
  const changes: ChangeInfo = useMemo(() => Object.fromEntries(versions.map((v) => [v.version, { area: v.change?.area, reason: v.change?.reason }])), [versions]);
  // Latest finished conversation for this persona on a version; replays win over sims.
  const pick = (v: number) =>
    conversations
      .filter((c) => c.personaId === personaId && c.configVersion === v)
      .sort((a, b) => Number(b.source === "replay") - Number(a.source === "replay") || +new Date(b.createdAt) - +new Date(a.createdAt))[0];

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Replay</h1>
          <p className="text-sm text-muted-foreground">The same customer, same opening message, same seed, temperature 0. Only the config differs.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={rerun} disabled={running}>
            {running ? "Running both versions… (~1 min)" : `Re-run v${left} vs v${right}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {personas.map((p) => (
          <button
            key={p._id}
            onClick={() => setPersonaId(p._id)}
            className={cn("rounded-lg border px-3 py-2 text-left text-sm", p._id === personaId ? "border-primary bg-background shadow-sm" : "bg-background/60 hover:bg-background")}
          >
            <div className="font-medium">
              {p.caseId} · {CASE_TITLES[p.caseId ?? ""] ?? p.segment}
            </div>
            <div className="text-xs text-muted-foreground">
              {p.hidden.role}, {p.hidden.company} · {p.qualified ? "needs a call" : "self-serve"}
            </div>
          </button>
        ))}
      </div>

      {persona && (
        <p className="text-sm">
          <span className="text-muted-foreground">Opening:</span> “{persona.opening}”
        </p>
      )}
      {error && <p className="text-sm text-destructive">Error: {error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { v: left, set: setLeft },
          { v: right, set: setRight },
        ].map(({ v, set }, i) => {
          const convo = pick(v);
          const doc = versions.find((d) => d.version === v);
          const o = convo?.outcome;
          return (
            <Card key={i} className="gap-3">
              <CardHeader className="flex flex-row items-center gap-2">
                <CardTitle>
                  <select value={v} onChange={(e) => set(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm font-medium">
                    {versions.map((d) => (
                      <option key={d.version} value={d.version}>
                        v{d.version}
                        {d.version === active ? " (latest)" : ""}
                        {d.version === 1 ? " · baseline" : ""}
                      </option>
                    ))}
                  </select>
                </CardTitle>
                {o && (
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Badge className={cn("border-0", o.success ? "bg-emerald-600 text-white" : "bg-rose-600 text-white")}>{o.success ? "✓ goal met" : "✗ goal missed"}</Badge>
                    {o.booked && <Badge variant="outline">booked</Badge>}
                    {o.trialSent && <Badge variant="outline">signup link sent</Badge>}
                    {o.left && <Badge variant="outline">customer left</Badge>}
                    {o.quoteCorrect === false && <Badge variant="destructive">wrong or missing fact</Badge>}
                    {o.quoteCorrect === true && <Badge variant="outline">facts correct</Badge>}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {convo ? (
                  <Transcript turns={convo.turns} config={doc?.config} changes={changes} />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">No run of this case on v{v} yet. Press “Re-run”.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
