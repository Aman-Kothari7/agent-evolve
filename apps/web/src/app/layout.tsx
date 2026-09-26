import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agent Evolve",
  description: "A website chat agent that evolves its own harness toward a goal.",
};

const NAV = [
  { href: "/chat", label: "Chat" },
  { href: "/replay", label: "Replay" },
  { href: "/versions", label: "Versions" },
  { href: "/coach", label: "Coach" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 font-sans text-foreground dark:bg-zinc-950">
        <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-4">
            <Link href="/" className="font-semibold tracking-tight">
              Agent Evolve <span className="font-normal text-muted-foreground">· Acme Analytics</span>
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
