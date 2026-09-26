"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/chat", label: "Chat", hint: "Talk to the assistant" },
  { href: "/coach", label: "Coach", hint: "Watch it improve the harness" },
  { href: "/versions", label: "Evolution", hint: "Every version and its diff" },
  { href: "/replay", label: "Replay", hint: "Same visitor, two versions" },
];

export function SideNav({ active, kept, rejected }: { active: number | null; kept: number; rejected: number }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between bg-sidebar px-4 py-5 text-sidebar-foreground md:flex">
      <div className="flex flex-col gap-7">
        <Link href="/chat" className="flex flex-col gap-1">
          <span className="text-lg font-extrabold tracking-tight text-white">Agent Evolve</span>
          <span className="text-xs leading-snug text-sidebar-foreground/70">A MongoDB Atlas assistant that rewrites its own harness.</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => {
            const on = path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "group flex flex-col rounded-lg px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  on ? "bg-sidebar-accent text-white" : "hover:bg-sidebar-accent/60 hover:text-white",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("size-1.5 rounded-full", on ? "bg-agent" : "bg-transparent")} />
                  {n.label}
                </span>
                <span className="pl-3.5 text-[11px] text-sidebar-foreground/60">{n.hint}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-sidebar-border p-3">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow !text-sidebar-foreground/60">Live config</span>
          <span className="font-mono text-2xl font-semibold text-white">v{active ?? "–"}</span>
        </div>
        <div className="flex gap-3 font-mono text-[11px]">
          <span><span className="text-pass">●</span> {kept} kept</span>
          <span><span className="text-fail">●</span> {rejected} rejected</span>
        </div>
        <p className="text-[10.5px] leading-snug text-sidebar-foreground/50">Hackathon demo. Not an official MongoDB assistant.</p>
      </div>
    </aside>
  );
}
