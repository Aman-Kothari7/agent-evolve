import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { getActiveVersion, listConfigDocs } from "@evolve/core";
import { SideNav } from "@/components/side-nav";
import "./globals.css";

const ui = Archivo({ variable: "--font-ui", subsets: ["latin"], axes: ["wdth"] });
const code = IBM_Plex_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Agent Evolve",
  description: "Goal-driven harness optimization: agents defined as config, improved by a coach, graded against the goal.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [active, docs] = await Promise.all([getActiveVersion().catch(() => null), listConfigDocs().catch(() => [])]);
  const kept = docs.filter((d) => d.status === "accepted" || d.status === "active").length;
  const rejected = docs.filter((d) => d.status === "rejected").length;
  return (
    <html lang="en" className={`${ui.variable} ${code.variable} h-full antialiased`}>
      <body className="flex min-h-full bg-paper font-sans text-foreground">
        <SideNav active={active} kept={kept} rejected={rejected} />
        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
      </body>
    </html>
  );
}
