"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentConfig, ChangeArea, Turn } from "@evolve/core";
import { AREA_DOT } from "@/components/config-diff";
import { cn } from "@/lib/utils";

export type ChangeInfo = Record<number, { area?: ChangeArea; reason?: string }>;
type Tag = { label: string; version: number; area: ChangeArea };

const ACTION = "action:send?text=";

export function Markdown({ text, onAction, dense }: { text: string; onAction?: (text: string) => void; dense?: boolean }) {
  return (
    <div className={cn("prose-chat", dense ? "text-sm leading-relaxed" : "text-[15px] leading-7")}>
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
  for (const c of turn.toolCalls ?? []) if (config.tools[c.tool]) add(`${c.tool} tool`, config.tools[c.tool].introducedIn, "tools");
  for (const w of turn.widgets ?? []) add(`${w.name} widget`, w.introducedIn, "widgets");
  for (const e of turn.ruleEvents ?? []) {
    const r = config.rules.find((x) => x.id === e.ruleId);
    if (r && (e.action !== "passed" || r.type !== "check")) add(`${r.id} rule`, r.introducedIn, "rules");
  }
  for (const id of turn.contextLoaded ?? []) {
    const c = config.context.find((x) => x.load === id);
    if (c) add(`${id} doc`, c.introducedIn, "context");
  }
  for (const [name, f] of Object.entries(config.state)) if (turn.stateAfter?.[name] != null) add(`remembers ${name}`, f.introducedIn, "state");
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
  dense,
}: {
  turns: Turn[];
  config?: AgentConfig;
  changes?: ChangeInfo;
  onAction?: (text: string) => void;
  pending?: string | null;
  compact?: boolean;
  dense?: boolean;
}) {
  const lastAgent = turns.map((t) => t.role).lastIndexOf("agent");
  const bubble = cn("rise ml-auto max-w-[80%] whitespace-pre-wrap rounded-[20px] bg-ink px-4 py-2.5 text-white", dense ? "text-sm leading-relaxed" : "text-[15px] leading-7");
  return (
    <div className={cn("flex flex-col", dense ? "gap-5" : "gap-8")}>
      {turns.map((t, i) =>
        t.role === "customer" ? (
          <div key={i} className={bubble}>
            {t.text}
          </div>
        ) : (
          <AgentMessage key={i} turn={t} config={config} changes={changes} onAction={i === lastAgent ? onAction : undefined} compact={compact} dense={dense} />
        ),
      )}
      {pending && (
        <>
          <div className={cn(bubble, "opacity-70")}>{pending}</div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-agent" />
            Reading what it knows, checking guardrails, writing a reply…
          </div>
        </>
      )}
    </div>
  );
}

function AgentMessage({ turn, config, changes, onAction, compact, dense }: { turn: Turn; config?: AgentConfig; changes: ChangeInfo; onAction?: (text: string) => void; compact?: boolean; dense?: boolean }) {
  const tags = turnTags(turn, config);
  const blocked = (turn.ruleEvents ?? []).filter((e) => e.action !== "passed");
  const tools = (turn.toolCalls ?? []).filter((c) => c.tool !== "render_widget");
  const failed = (c: (typeof tools)[number]) => !!c.blockedBy || !!(c.output as { error?: string } | undefined)?.error;
  return (
    <div className="rise flex flex-col gap-2.5">
      {turn.text && <Markdown text={turn.text} dense={dense} />}
      {(turn.widgets ?? []).map((w, i) => (
        <div key={i} className="max-w-md rounded-xl border bg-card p-3.5">
          <Markdown text={w.markdown} onAction={onAction} dense />
        </div>
      ))}
      {blocked.map((e, i) => (
        <p key={i} title={e.detail} className="w-fit rounded-md bg-fail-soft px-2 py-1 text-xs text-fail">
          {e.action === "blocked" ? "Guardrail blocked a draft" : "Guardrail rewrote a draft"} · {e.ruleId}
        </p>
      ))}
      {!compact && (tools.length > 0 || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
          {tools.map((c, i) => (
            <span key={i} className={cn(failed(c) && "text-fail line-through")}>
              ⚙ {c.tool}
            </span>
          ))}
          {tags.map((t) => (
            <span key={t.label} title={changes[t.version]?.reason} className="inline-flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", AREA_DOT[t.area])} />
              v{t.version} · {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
