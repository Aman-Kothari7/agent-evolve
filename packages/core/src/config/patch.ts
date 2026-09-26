import { AgentConfig, type ChangeOp, EDITABLE_PATHS, type Proposal } from "./schema";

type Json = Record<string, unknown> | unknown[];

const isIndex = (s: string) => /^\d+$/.test(s);

function parentOf(root: Json, segs: string[], create: boolean): { parent: Json; key: string } {
  let cur: Json = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    const nextIsIndex = isIndex(segs[i + 1]);
    const container = cur as Record<string, unknown>;
    let child = Array.isArray(cur) ? cur[Number(s)] : container[s];
    if (child === undefined || child === null) {
      if (!create) throw new Error(`Path segment "${s}" not found`);
      child = nextIsIndex ? [] : {};
      if (Array.isArray(cur)) cur[Number(s)] = child;
      else container[s] = child;
    }
    if (typeof child !== "object") throw new Error(`Path segment "${s}" is not an object`);
    cur = child as Json;
  }
  return { parent: cur, key: segs[segs.length - 1] };
}

// The config element a path belongs to, e.g. "tools.book_meeting.description" -> "tools.book_meeting".
function elementPath(path: string): string | null {
  const segs = path.split(".");
  if (segs[0] === "instructions") return segs[1] === "sections" && segs[2] ? segs.slice(0, 3).join(".") : null;
  if (["state", "tools", "widgets", "rules", "context"].includes(segs[0]) && segs[1]) return segs.slice(0, 2).join(".");
  return null;
}

function get(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, s) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[s] : undefined), root);
}

export type ApplyResult = { ok: true; config: AgentConfig } | { ok: false; errors: string[] };

/** Applies change ops to a config, enforcing the editable-path whitelist and locked rules, then re-validates. */
export function applyProposal(base: AgentConfig, proposal: Pick<Proposal, "ops" | "reason">, newVersion: number): ApplyResult {
  const draft = structuredClone(base) as unknown as Record<string, unknown>;
  const errors: string[] = [];
  const touched = new Set<string>();

  for (const op of proposal.ops as ChangeOp[]) {
    if (!EDITABLE_PATHS.some((re) => re.test(op.path))) {
      errors.push(`Path "${op.path}" is not editable`);
      continue;
    }
    const segs = op.path.split(".");
    if (segs[0] === "rules" && segs[1] !== undefined) {
      const rule = (draft.rules as { locked?: boolean }[])[Number(segs[1])];
      if (rule?.locked) {
        errors.push(`Rule at "${op.path}" is locked`);
        continue;
      }
    }
    try {
      const { parent, key } = parentOf(draft, segs, op.op !== "remove");
      const target = Array.isArray(parent) ? parent[Number(key)] : (parent as Record<string, unknown>)[key];
      if (op.op === "remove") {
        if (Array.isArray(parent)) parent.splice(Number(key), 1);
        else delete (parent as Record<string, unknown>)[key];
      } else if (op.op === "add" && Array.isArray(target)) {
        target.push(op.value);
        const el = elementPath(`${op.path}.${target.length - 1}`);
        if (el) touched.add(el);
      } else {
        if (Array.isArray(parent)) parent[Number(key)] = op.value;
        else (parent as Record<string, unknown>)[key] = op.value;
      }
      const el = elementPath(op.path);
      if (el && op.op !== "remove") touched.add(el);
    } catch (e) {
      errors.push(`${op.op} ${op.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) return { ok: false, errors };

  // Stamp provenance on every element this change created or modified.
  for (const el of touched) {
    const obj = get(draft, el);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) Object.assign(obj, { introducedIn: newVersion, reason: proposal.reason });
  }
  draft.version = newVersion;

  const parsed = AgentConfig.safeParse(draft);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };

  // Cross-reference checks the schema can't express.
  const cfg = parsed.data;
  const baseTools = Object.keys(base.tools).sort().join(",");
  if (Object.keys(cfg.tools).sort().join(",") !== baseTools)
    errors.push("Tools can't be created or removed. Turn existing tools on or off with tools.<name>.enabled instead.");
  for (const [key, t] of Object.entries(cfg.tools)) {
    if (base.tools[key] && t.kind !== base.tools[key].kind) errors.push(`tools.${key}: a tool's implementation can't change`);
    if (t.kind === "template" && base.tools[key]?.kind === "template" && JSON.stringify({ ...t, name: 0, description: 0, enabled: 0, requires: 0, maxUses: 0, introducedIn: 0, reason: 0 }) !== JSON.stringify({ ...base.tools[key], name: 0, description: 0, enabled: 0, requires: 0, maxUses: 0, introducedIn: 0, reason: 0 }))
      errors.push(`tools.${key}: a tool's implementation can't change`);
  }
  const exposed = Object.entries(cfg.tools).map(([k, t]) => t.name ?? k);
  if (new Set(exposed).size !== exposed.length || exposed.includes("render_widget")) errors.push("Tool names must be unique and can't be render_widget");
  const toolNames = new Set(Object.keys(cfg.tools));
  const stateNames = new Set(Object.keys(cfg.state));
  for (const [name, t] of Object.entries(cfg.tools)) {
    for (const r of t.requires) if (!stateNames.has(r)) errors.push(`tools.${name}.requires references unknown state field "${r}"`);
  }
  for (const [name, w] of Object.entries(cfg.widgets)) {
    if (w.dataFrom && !toolNames.has(w.dataFrom)) errors.push(`widgets.${name}.dataFrom references unknown tool "${w.dataFrom}"`);
    for (const r of w.requires) if (!stateNames.has(r)) errors.push(`widgets.${name}.requires references unknown state field "${r}"`);
  }
  for (const r of cfg.rules) {
    if (r.type === "tool_order") for (const t of [r.require, r.before]) if (!toolNames.has(t)) errors.push(`rule ${r.id} references unknown tool "${t}"`);
    if (r.type === "limit" && !toolNames.has(r.tool)) errors.push(`rule ${r.id} references unknown tool "${r.tool}"`);
  }
  for (const c of cfg.context) {
    if ("stateField" in c.when && !stateNames.has(c.when.stateField)) errors.push(`context ${c.id} references unknown state field "${c.when.stateField}"`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: cfg };
}
