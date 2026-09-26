// Chat with the agent from the terminal, or run scripted lines.
//   pnpm chat                                  -> interactive, active version
//   pnpm chat -- --version 2 "hi" "40 seats"   -> scripted, prints each turn
import { createInterface } from "node:readline/promises";
import { runTurn } from "../runtime";
import { closeDb } from "../store";

const vi = process.argv.indexOf("--version");
const configVersion = vi >= 0 ? Number(process.argv[vi + 1]) : undefined;
const scripted = process.argv.slice(2).filter((a, i, all) => a !== "--version" && all[i - 1] !== "--version");

let conversationId: string | undefined;
async function send(message: string) {
  const t0 = Date.now();
  const r = await runTurn({ conversationId, configVersion, message, source: "live" });
  conversationId = r.conversationId;
  console.log(`\nagent> ${r.reply}`);
  for (const w of r.widgets) console.log(`  [widget ${w.name}]\n${w.markdown}`);
  console.log(`  state: ${JSON.stringify(r.state)}`);
  console.log(`  tools: ${r.toolCalls.map((c) => `${c.tool}${c.blockedBy ? ` (blocked by ${c.blockedBy})` : ""}`).join(", ") || "-"}  available: ${r.toolsAvailable?.join(", ")}`);
  console.log(`  rules: ${r.ruleEvents.filter((e) => e.action !== "passed").map((e) => `${e.ruleId}:${e.action}`).join(", ") || "all passed"}  provenance: v${r.provenance.join(", v")}  ${Date.now() - t0} ms`);
  return r.ended;
}

if (scripted.length) {
  for (const m of scripted) {
    console.log(`\nyou> ${m}`);
    if (await send(m)) break;
  }
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  while (true) {
    const m = (await rl.question("\nyou> ")).trim();
    if (!m || m === "exit") break;
    if (await send(m)) break;
  }
  rl.close();
}
console.log(`\nconversation ${conversationId}`);
await closeDb();
