"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", hint: "How it works, in one page" },
  { href: "/chat", label: "Chat", hint: "Talk to the assistant" },
  { href: "/coach", label: "Coach", hint: "Watch it improve the harness" },
  { href: "/versions", label: "Evolution", hint: "Every version and its diff" },
  { href: "/replay", label: "Replay", hint: "Same visitor, two versions" },
];

export function SideNav({ active, kept, rejected }: { active: number | null; kept: number; rejected: number }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col justify-between border-r bg-sidebar px-5 py-6 md:flex">
      <div className="flex flex-col gap-10">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center bg-agent font-mono text-sm font-bold text-white">AE</span>
          <span className="display text-xl">Agent Evolve</span>
        </Link>

        <nav className="flex flex-col">
          {NAV.map((n, i) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.hint}
                className={cn(
                  "group flex items-center gap-3 border-t py-2.5 outline-none last:border-b focus-visible:bg-muted",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="label w-7 text-muted-foreground">[{String(i + 1).padStart(2, "0")}]</span>
                <span className="text-sm font-semibold uppercase tracking-wide">{n.label}</span>
                <span className={cn("ml-auto size-1.5", on ? "bg-agent" : "bg-transparent group-hover:bg-border")} />
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex items-baseline justify-between">
          <span className="label text-muted-foreground">Live config</span>
          <span className="display text-3xl">v{active ?? "–"}</span>
        </div>
        <div className="label flex gap-3 text-muted-foreground">
          <span><span className="text-pass">■</span> {kept} kept</span>
          <span><span className="text-fail">■</span> {rejected} rejected</span>
        </div>
        <p className="mt-2 text-[10.5px] leading-snug text-muted-foreground">Hackathon demo. Not an official MongoDB assistant.</p>
      </div>
    </aside>
  );
}
