import type { Document } from "mongodb";
import { runToolPipeline } from "../store";
import type { TemplateTool } from "./schema";

/** Validates and coerces tool input against the template's param schema. */
export function validateTemplateInput(tool: TemplateTool, input: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, spec] of Object.entries(tool.params)) {
    const raw = input[name];
    if (spec.type === "number") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new Error(`Parameter "${name}" must be a number`);
      if (spec.min !== undefined && n < spec.min) throw new Error(`Parameter "${name}" must be >= ${spec.min}`);
      if (spec.max !== undefined && n > spec.max) throw new Error(`Parameter "${name}" must be <= ${spec.max}`);
      out[name] = n;
    } else {
      const s = String(raw ?? "").toLowerCase();
      if (!spec.values.map((v) => v.toLowerCase()).includes(s)) throw new Error(`Parameter "${name}" must be one of ${spec.values.join(", ")}`);
      out[name] = s;
    }
  }
  return out;
}

/** Replaces "{{param}}" inside string values only (never keys). A string that is exactly "{{param}}" becomes the typed value. */
export function renderPipeline(pipeline: Document[], params: Record<string, string | number>): Document[] {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const whole = v.match(/^\{\{(\w+)\}\}$/);
      if (whole && whole[1] in params) return params[whole[1]];
      return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in params ? String(params[k]) : m));
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(pipeline) as Document[];
}

export async function executeTemplateTool(tool: TemplateTool, input: Record<string, unknown>) {
  const params = validateTemplateInput(tool, input);
  return runToolPipeline(tool.collection, renderPipeline(tool.pipeline as Document[], params));
}

/** Sample inputs for testing a template tool before it's accepted. */
export function sampleInputs(tool: TemplateTool): Record<string, string | number>[] {
  const base: Record<string, string | number> = {};
  for (const [name, spec] of Object.entries(tool.params)) base[name] = spec.type === "number" ? Math.max(spec.min ?? 1, Math.min(spec.max ?? 40, 40)) : spec.values[0];
  const variants = [base];
  for (const [name, spec] of Object.entries(tool.params)) {
    if (spec.type === "enum") for (const v of spec.values.slice(1)) variants.push({ ...base, [name]: v });
    if (spec.type === "number") variants.push({ ...base, [name]: Math.max(spec.min ?? 1, Math.min(spec.max ?? 120, 120)) });
  }
  return variants.slice(0, 6);
}
