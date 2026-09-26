"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentConfig, ChangeArea, Turn } from "@evolve/core";
import { Badge } from "@/components/ui/badge";
import { AREA_STYLE } from "@/lib/ui";
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
                  className="my-0.5 mr-1.5 inline-flex rounded-md border border-primary/30 bg-background px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-70 disabled:hover:bg-background disabled:hover:text-primary"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
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
          <div key={i} className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
            {t.text}
          </div>
        ) : (
          <AgentBubble key={i} turn={t} config={config} changes={changes} onAction={i === lastAgent ? onAction : undefined} compact={compact} />
        ),
      )}
      {pending && (
        <>
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary/70 px-3.5 py-2 text-sm text-primary-foreground">{pending}</div>
          <div className="w-fit animate-pulse rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2 text-sm text-muted-foreground">Thinking…</div>
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
    <div className="flex max-w-[88%] flex-col gap-1.5">
      <div className="rounded-2xl rounded-bl-sm border bg-background px-3.5 py-2 shadow-xs">
        {turn.text && <Markdown text={turn.text} />}
        {(turn.widgets ?? []).map((w, i) => (
          <div key={i} className="mt-2 rounded-lg border border-pink-200 bg-pink-50/60 p-2.5 dark:border-pink-900 dark:bg-pink-950/30">
            <Markdown text={w.markdown} onAction={onAction} />
          </div>
        ))}
      </div>
      {!compact && (tools.length > 0 || blocked.length > 0) && (
        <div className="flex flex-wrap gap-1 px-1">
          {tools.map((c, i) => (
            <span key={i} className={cn("rounded px-1.5 py-0.5 font-mono text-[11px]", c.blockedBy ? "bg-rose-100 text-rose-700 line-through dark:bg-rose-950 dark:text-rose-300" : "bg-muted text-muted-foreground")}>
              {c.tool}()
            </span>
          ))}
          {blocked.map((e, i) => (
            <span key={`r${i}`} title={e.detail} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {e.action === "blocked" ? "⛔" : "✏️"} {e.ruleId} {e.action}
            </span>
          ))}
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {tags.map((t) => (
            <Badge key={t.label} title={changes[t.version]?.reason} className={cn("h-auto border-0 px-1.5 py-0 text-[11px] font-normal", AREA_STYLE[t.area])}>
              v{t.version} · {t.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
