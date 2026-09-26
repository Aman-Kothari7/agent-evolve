// Fills a widget's Markdown template from the latest output of its dataFrom tool.
//   {field} or {a.b}      -> value
//   {items:button}        -> one clickable [label](action:send?text=label) link per item
//   {items:list}          -> bulleted list
//   {items:table}         -> Markdown table of the rows
import type { Widget } from "../config/schema";

const get = (data: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), data);

const labelOf = (item: unknown): string => {
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return String(o.label ?? o.name ?? o.title ?? o.plan ?? JSON.stringify(o));
  }
  return String(item);
};

const fmt = (v: unknown): string =>
  typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

export const buttonLink = (label: string) => `[${label}](action:send?text=${encodeURIComponent(label)})`;

function table(rows: unknown[]): string {
  const objs = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (!objs.length) return "";
  const cols = [...new Set(objs.flatMap((o) => Object.keys(o)))].filter((c) => typeof objs[0][c] !== "object");
  return [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...objs.map((o) => `| ${cols.map((c) => fmt(o[c])).join(" | ")} |`)].join("\n");
}

export function renderWidget(w: Widget, data: unknown): string {
  return w.template.replace(/\{([\w.]+)(?::(button|list|table))?\}/g, (m, path: string, mode?: string) => {
    const v = get(data, path);
    if (v === undefined) return m;
    if (mode) {
      const items = Array.isArray(v) ? v : [v];
      if (mode === "button") return items.map((i) => buttonLink(labelOf(i))).join("\n");
      if (mode === "list") return items.map((i) => `- ${labelOf(i)}`).join("\n");
      return table(items);
    }
    return fmt(v);
  });
}
