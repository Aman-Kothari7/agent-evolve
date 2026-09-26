import type { AgentConfig, ChangeOp } from "@evolve/core";
import { cn } from "@/lib/utils";

export const AREA_DOT: Record<string, string> = {
  instructions: "bg-sky-500",
  state: "bg-violet-500",
  tools: "bg-agent",
  rules: "bg-fail",
  context: "bg-teal-500",
  widgets: "bg-pink-500",
  routing: "bg-zinc-500",
};

type Hunk = { path: string; op: ChangeOp["op"]; area: string; before: unknown; after: unknown };

const get = (root: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), root);

// Provenance fields are bookkeeping; hide them so the diff shows only behavior.
const strip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => k !== "introducedIn" && k !== "reason").map(([k, x]) => [k, strip(x)]));
  return v;
};

export function hunksFromOps(base: AgentConfig | undefined, ops: ChangeOp[]): Hunk[] {
  return ops.map((o) => {
    const before = base ? strip(get(base, o.path)) : undefined;
    const value = "value" in o ? strip(o.value) : undefined;
    const after = o.op === "remove" ? undefined : o.op === "add" && Array.isArray(before) ? value : value;
    return { path: o.path, op: o.op, area: o.path.split(".")[0], before: o.op === "add" && Array.isArray(before) ? undefined : before, after };
  });
}

const lines = (v: unknown): string[] => (v === undefined ? [] : typeof v === "string" ? [JSON.stringify(v)] : JSON.stringify(v, null, 2).split("\n"));

export function ConfigDiff({ base, ops, from, to, className }: { base?: AgentConfig; ops: ChangeOp[]; from?: number; to?: number; className?: string }) {
  const hunks = hunksFromOps(base, ops);
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="font-mono text-xs font-semibold">
          {from !== undefined ? `v${from}` : "base"} <span className="text-muted-foreground">→</span> {to !== undefined ? `v${to}` : "candidate"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {hunks.length} change{hunks.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-col divide-y">
        {hunks.map((h, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 px-3 pb-1 pt-2">
              <span className={cn("size-2 rounded-full", AREA_DOT[h.area] ?? "bg-zinc-400")} />
              <span className="font-mono text-[11.5px] font-medium">{h.path}</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{h.op === "add" ? "added" : h.op === "remove" ? "removed" : h.before === undefined ? "added" : "changed"}</span>
            </div>
            <div className="pb-2">
              {lines(h.before).map((l, j) => (
                <div key={`d${j}`} className="patch-line patch-del">
                  <span>−</span>
                  <span>{l}</span>
                </div>
              ))}
              {lines(h.after).map((l, j) => (
                <div key={`a${j}`} className="patch-line patch-add">
                  <span>+</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
