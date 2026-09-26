// Runs practice customers against a config version.
//   pnpm simulate                      -> train + heldout personas, 2 seeds, active version
//   pnpm simulate -- --split demo --seeds 1 --version 3 --persona demo_c1_email_gate
import { closeDb, getActiveVersion, listPersonas } from "../store";
import { loadRunTurn, pool, runConversation } from "../simulator/run";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const version = arg("version") ? Number(arg("version")) : await getActiveVersion();
const split = arg("split") ?? "practice";
const seeds = Number(arg("seeds") ?? 2);
const concurrency = Number(arg("concurrency") ?? 12);
const only = arg("persona");

let personas = await listPersonas();
personas = personas.filter((p) => (only ? p._id === only : split === "practice" ? p.split !== "demo" : split === "all" ? true : p.split === split));
const jobs = personas.flatMap((p) => Array.from({ length: seeds }, (_, s) => ({ p, seed: s + 1 })));
const runId = `run_${Date.now()}`;
console.log(`Simulating ${jobs.length} conversations (${personas.length} personas x ${seeds} seeds) on v${version}, runId ${runId}`);

const agentTurn = await loadRunTurn();
const t0 = Date.now();
let done = 0;
const results = await pool(jobs, concurrency, async ({ p, seed }) => {
  try {
    const r = await runConversation({ persona: p, configVersion: version, seed, runId, agentTurn });
    done++;
    console.log(`  [${done}/${jobs.length}] ${p._id} s${seed}: ${r.outcome.success ? "✅" : "❌"} booked=${r.outcome.booked} trial=${r.outcome.trialSent} left=${r.outcome.left} quote=${r.outcome.quoteCorrect ?? "-"}`);
    return r;
  } catch (e) {
    done++;
    console.log(`  [${done}/${jobs.length}] ${p._id} s${seed}: ERROR ${e instanceof Error ? e.message : e}`);
    return null;
  }
});

const ok = results.filter((r): r is NonNullable<typeof r> => !!r);
const rate = (xs: typeof ok) => (xs.length ? `${xs.filter((r) => r.outcome.success).length}/${xs.length}` : "-");
console.log(`\nv${version}: success ${rate(ok)} | qualified ${rate(ok.filter((r) => r.outcome.qualified))} | unqualified ${rate(ok.filter((r) => !r.outcome.qualified))} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await closeDb();
