// The long-running improvement loop: baseline → coach proposes one change → test → keep or reject.
//   pnpm evolve -- --rounds 10
import { runRound } from "../evolve";
import { loadRunTurn } from "../simulator/run";
import { closeDb } from "../store";

const i = process.argv.indexOf("--rounds");
const rounds = i >= 0 ? Number(process.argv[i + 1]) : 5;
const f = process.argv.indexOf("--focus");
const focus = f >= 0 ? process.argv[f + 1] : undefined;
const gi = process.argv.indexOf("--goal");
const goal = gi >= 0 ? process.argv[gi + 1] : undefined;
const agentTurn = await loadRunTurn();

for (let n = 1; n <= rounds; n++) {
  const t0 = Date.now();
  try {
    const r = await runRound({ agentTurn, focus, goal });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (r.decision === "no_proposal") console.log(`Round ${n}: v${r.baseVersion} no proposal (${secs}s)`);
    else console.log(`Round ${n}: v${r.baseVersion} → v${r.candidateVersion} ${r.decision.toUpperCase()} [${r.proposal?.area}] ${r.proposal?.reason}\n         ${r.test?.notes} (${secs}s)`);
  } catch (e) {
    console.log(`Round ${n} failed: ${e instanceof Error ? e.stack : e}`);
  }
}
await closeDb();
