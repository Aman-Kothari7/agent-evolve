import type { ChangeArea } from "@evolve/core";

export const AREA_STYLE: Record<ChangeArea, string> = {
  instructions: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  state: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  tools: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  rules: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  context: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  widgets: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  routing: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

export const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-600 text-white",
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  candidate: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

// Mongo documents carry Dates and other non-plain values; this makes them safe to pass to client components.
export const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
