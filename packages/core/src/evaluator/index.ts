import type { AgentConfig, Proposal, TemplateTool } from "../config/schema";
import { executeTemplateTool, sampleInputs } from "../config/template";
import { pool, runConversation, type AgentTurnFn } from "../simulator/run";
import {
  activateVersion, findConversations, insertConfigDoc, insertExperiment, listPersonas, logCoachEvent, setConfigStatus,
  type TestResult,
} from "../store";

const MAX_TARGET = 8;
const MAX_REGRESSION = 5;

export type Decision = "accepted" | "rejected";

async function testTemplateTools(base: AgentConfig, candidate: AgentConfig): Promise<string | null> {
  for (const [name, t] of Object.entries(candidate.tools)) {
    if (t.kind !== "template") continue;
    if (JSON.stringify(base.tools[name]) === JSON.stringify(t)) continue;
    let anyRows = false;
    for (const input of sampleInputs(t as TemplateTool)) {
      try {
        const rows = await executeTemplateTool(t as TemplateTool, input);
        if (rows.length) anyRows = true;
      } catch (e) {
        return `template tool ${name} failed on ${JSON.stringify(input)}: ${e instanceof Error ? e.message : e}`;
      }
    }
    if (!anyRows) return `template tool ${name} returned no rows for any sample input`;
  }
  return null;
}

export async function evaluateProposal(opts: {
  round: string;
  baseVersion: number;
  base: AgentConfig;
  candidate: AgentConfig;
  proposal: Proposal;
  agentTurn: AgentTurnFn;
}): Promise<{ decision: Decision; test: TestResult }> {
  const { round, baseVersion, base, candidate, proposal, agentTurn } = opts;
  const version = candidate.version;
  await insertConfigDoc({ version, parentVersion: baseVersion, status: "candidate", config: candidate, change: { ...proposal } });

  const finish = async (decision: Decision, test: TestResult) => {
    await setConfigStatus(version, decision, test);
    if (decision === "accepted") await activateVersion(version);
    await insertExperiment({ round, baseVersion, candidateVersion: version, proposal, results: test, decision });
    await logCoachEvent(round, "decision", { version, decision, test });
    return { decision, test };
  };
  const empty = (notes: string): TestResult => ({ target: { before: 0, after: 0, n: 0 }, regression: { before: 0, after: 0, n: 0 }, lockedViolations: 0, costUsd: 0, notes });

  const toolError = await testTemplateTools(base, candidate);
  if (toolError) return finish("rejected", empty(toolError));

  const train = new Map((await listPersonas("train")).map((p) => [p._id, p]));
  const pick = (rows: { personaId?: string; seed?: number }[], max: number) => {
    const seen = new Set<string>();
    const out: { personaId: string; seed: number }[] = [];
    for (const r of rows) {
      if (!r.personaId || !train.has(r.personaId)) continue;
      const key = `${r.personaId}:${r.seed ?? 1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ personaId: r.personaId, seed: r.seed ?? 1 });
      if (out.length >= max) break;
    }
    return out;
  };

  const failed = await findConversations({ configVersion: baseVersion, source: "sim", "outcome.success": false, ...proposal.targetFilter } as never, 200);
  const target = pick(failed, MAX_TARGET);
  const targetIds = new Set(target.map((t) => t.personaId));
  const succeeded = await findConversations({ configVersion: baseVersion, source: "sim", "outcome.success": true } as never, 200);
  const regression = pick(succeeded.filter((c) => !targetIds.has(c.personaId ?? "")), MAX_REGRESSION);

  if (!target.length) return finish("rejected", empty(`No failed conversations on v${baseVersion} match ${JSON.stringify(proposal.targetFilter)}`));
  await logCoachEvent(round, "test_progress", { stage: "start", version, target: target.length, regression: regression.length });

  const jobs = [...target.map((t) => ({ ...t, set: "target" as const })), ...regression.map((t) => ({ ...t, set: "regression" as const }))];
  let done = 0;
  const results = await pool(jobs, 12, async (j) => {
    try {
      const r = await runConversation({ persona: train.get(j.personaId)!, configVersion: version, seed: j.seed, runId: `test_${round}`, agentTurn });
      await logCoachEvent(round, "test_progress", { done: ++done, of: jobs.length, set: j.set, personaId: j.personaId, success: r.outcome.success, conversationId: r.conversationId });
      return { ...j, outcome: r.outcome };
    } catch (e) {
      await logCoachEvent(round, "error", { stage: "simulate", personaId: j.personaId, error: e instanceof Error ? e.message : String(e) });
      return { ...j, outcome: null };
    }
  });

  const tRes = results.filter((r) => r.set === "target");
  const rRes = results.filter((r) => r.set === "regression");
  const test: TestResult = {
    target: { before: 0, after: tRes.filter((r) => r.outcome?.success).length, n: tRes.length },
    regression: { before: rRes.length, after: rRes.filter((r) => r.outcome?.success).length, n: rRes.length },
    lockedViolations: results.reduce((s, r) => s + (r.outcome?.lockedViolations ?? 0), 0),
    costUsd: 0,
  };
  const targetOk = test.target.after >= Math.max(1, Math.ceil(0.4 * test.target.n));
  const regressionOk = test.regression.after >= test.regression.before - (test.regression.n >= 4 ? 1 : 0);
  const safe = test.lockedViolations === 0;
  test.notes = `target ${test.target.after}/${test.target.n} (need ${Math.max(1, Math.ceil(0.4 * test.target.n))}), regression ${test.regression.after}/${test.regression.n}, locked violations ${test.lockedViolations}`;
  return finish(targetOk && regressionOk && safe ? "accepted" : "rejected", test);
}
