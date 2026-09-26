"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentConfig, ChangeArea, Turn } from "@evolve/core";
import { AREA_DOT } from "@/components/config-diff";
import { cn } from "@/lib/utils";

export type ChangeInfo = Record<number, { area?: ChangeArea; reason?: string }>;
type Tag = { label: string; version: number; area: ChangeArea };

const ACTION = "action:send?text=";

export function Markdown({ text, onAction }: { text: string; onAction?: (text: string) => void }) {
  return (
    <div className="prose-chat text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(ACTION)) {
              const t = decodeURIComponent(href.slice(ACTION.length));
              return (
                <button
                  type="button"
                  disabled={!onAction}
                  onClick={() => onAction?.(t)}
                  className="my-1 mr-1.5 inline-flex rounded-full border border-agent/40 bg-card px-3 py-1.5 text-xs font-semibold text-agent outline-none transition hover:bg-agent hover:text-white focus-visible:ring-2 focus-visible:ring-agent/40 disabled:opacity-70 disabled:hover:bg-card disabled:hover:text-agent"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="font-medium text-agent underline decoration-agent/40 underline-offset-2">
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// Which evolved config elements (introduced after v1) visibly shaped this agent turn.
export function turnTags(turn: Turn, config?: AgentConfig): Tag[] {
  if (!config) return [];
  const tags: Tag[] = [];
  const add = (label: string, version: number | undefined, area: ChangeArea) => {
    if (version && version > 1 && !tags.some((t) => t.label === label)) tags.push({ label, version, area });
  };
  for (const c of turn.toolCalls ?? []) if (config.tools[c.tool]) add(`tool ${c.tool}`, config.tools[c.tool].introducedIn, "tools");
  for (const w of turn.widgets ?? []) add(`widget ${w.name}`, w.introducedIn, "widgets");
  for (const e of turn.ruleEvents ?? []) {
    const r = config.rules.find((x) => x.id === e.ruleId);
    if (r && (e.action !== "passed" || r.type !== "check")) add(`rule ${r.id}`, r.introducedIn, "rules");
  }
  for (const id of turn.contextLoaded ?? []) {
    const c = config.context.find((x) => x.load === id);
    if (c) add(`context ${id}`, c.introducedIn, "context");
  }
  for (const [name, f] of Object.entries(config.state)) if (turn.stateAfter?.[name] != null) add(`state ${name}`, f.introducedIn, "state");
  for (const s of config.instructions.sections) add(`instructions: ${s.title}`, s.introducedIn, "instructions");
  return tags.sort((a, b) => b.version - a.version);
}

export function Transcript({
  turns,
  config,
  changes = {},
  onAction,
  pending,
  compact,
}: {
  turns: Turn[];
  config?: AgentConfig;
  changes?: ChangeInfo;
  onAction?: (text: string) => void;
  pending?: string | null;
  compact?: boolean;
}) {
  const lastAgent = turns.map((t) => t.role).lastIndexOf("agent");
  return (
    <div className="flex flex-col gap-3">
      {turns.map((t, i) =>
        t.role === "customer" ? (
          <div key={i} className="rise ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">
            {t.text}
          </div>
        ) : (
          <AgentBubble key={i} turn={t} config={config} changes={changes} onAction={i === lastAgent ? onAction : undefined} compact={compact} />
        ),
      )}
      {pending && (
        <>
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-ink/70 px-4 py-2.5 text-sm text-white">{pending}</div>
          <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border bg-card px-4 py-2.5 text-sm text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-agent" />Updating state, checking rules, drafting a reply…</div>
        </>
      )}
    </div>
  );
}

function AgentBubble({ turn, config, changes, onAction, compact }: { turn: Turn; config?: AgentConfig; changes: ChangeInfo; onAction?: (text: string) => void; compact?: boolean }) {
  const tags = turnTags(turn, config);
  const blocked = (turn.ruleEvents ?? []).filter((e) => e.action !== "passed");
  const tools = (turn.toolCalls ?? []).filter((c) => c.tool !== "render_widget");
  return (
    <div className="rise flex max-w-[88%] flex-col gap-1.5">
      <div className="rounded-2xl rounded-bl-md border border-l-[3px] border-l-agent bg-card px-4 py-2.5 shadow-[0_1px_0_rgba(18,21,28,0.04)]">
        {turn.text && <Markdown text={turn.text} />}
        {(turn.widgets ?? []).map((w, i) => (
          <div key={i} className="mt-2.5 rounded-xl border bg-paper p-3">
            <p className="eyebrow mb-1 !text-[10px]">widget · {w.name}{w.introducedIn > 1 ? ` · added in v${w.introducedIn}` : ""}</p>
            <Markdown text={w.markdown} onAction={onAction} />
          </div>
        ))}
      </div>
      {!compact && (tools.length > 0 || blocked.length > 0) && (
        <div className="flex flex-wrap gap-1 px-1">
          {tools.map((c, i) => (
            <span key={i} className={cn("rounded-md px-1.5 py-0.5 font-mono text-[10.5px]", c.blockedBy ? "bg-fail-soft text-fail line-through" : (c.output as { error?: string } | undefined)?.error ? "bg-fail-soft text-fail" : "bg-agent-soft text-agent")}>
              {c.tool}(){(c.output as { error?: string } | undefined)?.error ? " ✗" : ""}
            </span>
          ))}
          {blocked.map((e, i) => (
            <span key={`r${i}`} title={e.detail} className="rounded-md bg-fail-soft px-1.5 py-0.5 font-mono text-[10.5px] text-fail">
              {e.action === "blocked" ? "⛔" : "✏️"} {e.ruleId} {e.action}
            </span>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {tags.map((t) => (
            <span key={t.label} title={changes[t.version]?.reason} className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", AREA_DOT[t.area])} />
              v{t.version} · {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
