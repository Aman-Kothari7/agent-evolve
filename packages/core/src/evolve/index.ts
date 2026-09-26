import { runCoach } from "../coach";
import { evaluateProposal } from "../evaluator";
import { labelPending } from "../labeler";
import { loadRunTurn, pool, runConversation, type AgentTurnFn } from "../simulator/run";
import { findConversations, getActiveVersion, getConfig, listPersonas, logCoachEvent, nextVersionNumber } from "../store";

/** Makes sure every train persona has a finished, labeled seed-1 conversation on this version. */
export async function ensureBaseline(version: number, agentTurn: AgentTurnFn, round?: string) {
  const train = await listPersonas("train");
  const have = new Set(
    (await findConversations({ configVersion: version, source: "sim", seed: 1, outcome: { $exists: true } } as never, 500)).map((c) => c.personaId),
  );
  const missing = train.filter((p) => !have.has(p._id));
  if (missing.length) {
    if (round) await logCoachEvent(round, "test_progress", { stage: "baseline", version, missing: missing.length });
    await pool(missing, 12, (p) =>
      runConversation({ persona: p, configVersion: version, seed: 1, runId: `baseline_v${version}`, agentTurn }).catch((e) => {
        console.log(`  baseline ${p._id} failed: ${e instanceof Error ? e.message : e}`);
        return null;
      }),
    );
  }
  await labelPending(500, 10);
}

export async function runRound(opts: { agentTurn?: AgentTurnFn; round?: string } = {}) {
  const agentTurn = opts.agentTurn ?? (await loadRunTurn());
  const round = opts.round ?? `r_${Date.now()}`;
  const baseVersion = await getActiveVersion();
  const base = await getConfig(baseVersion);

  await logCoachEvent(round, "thinking", { text: `Round started on v${baseVersion}. Preparing baseline conversations.` });
  await ensureBaseline(baseVersion, agentTurn, round);

  const newVersion = await nextVersionNumber();
  const { proposal, newConfig } = await runCoach({ round, config: base, newVersion });
  if (!proposal || !newConfig) {
    await logCoachEvent(round, "decision", { version: null, decision: "no_proposal" });
    return { round, baseVersion, decision: "no_proposal" as const };
  }
  const { decision, test } = await evaluateProposal({ round, baseVersion, base, candidate: newConfig, proposal, agentTurn });
  return { round, baseVersion, candidateVersion: newVersion, decision, test, proposal };
}
