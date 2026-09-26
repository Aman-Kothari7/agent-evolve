import { runCoach } from "../coach";
import { evaluateProposal } from "../evaluator";
import { calibrationFeedback, gradeVersion, writeRubric } from "../judge";
import { labelPending } from "../labeler";
import { loadRunTurn, pool, runConversation, type AgentTurnFn } from "../simulator/run";
import { acquireCoachLock, findConversations, getActiveVersion, getConfig, listPersonas, logCoachEvent, nextVersionNumber, releaseCoachLock } from "../store";

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

export async function runRound(opts: { agentTurn?: AgentTurnFn; round?: string; focus?: string; goal?: string } = {}) {
  const agentTurn = opts.agentTurn ?? (await loadRunTurn());
  const round = opts.round ?? `r_${Date.now()}`;
  if (!(await acquireCoachLock(round))) throw new Error("Another coach round is already running (pnpm evolve or the web app). Try again when it finishes.");
  try {
    return await runRoundLocked(round, agentTurn, opts.focus?.trim() || undefined, opts.goal?.trim() || undefined);
  } finally {
    await releaseCoachLock(round);
  }
}

async function runRoundLocked(round: string, agentTurn: AgentTurnFn, focus?: string, goalOverride?: string) {
  const baseVersion = await getActiveVersion();
  const base = await getConfig(baseVersion);

  await logCoachEvent(round, "thinking", { text: `Round started on v${baseVersion}. Preparing baseline conversations.`, focus });
  await ensureBaseline(baseVersion, agentTurn, round);

  // An independent judge turns the goal (+ focus) into a frozen rubric; Jev grades every baseline conversation with it.
  const goal = goalOverride ?? base.goal.description;
  let rubric = await writeRubric({ round, goal, focus });
  await logCoachEvent(round, "rubric", { rubricId: rubric._id, goal, focus, summary: rubric.summary, criteria: rubric.criteria, model: rubric.model });
  let graded = await gradeVersion(baseVersion, rubric, round);
  // Calibrate: if the rubric disagrees too often with the practice set's known outcomes, the judge revises it once.
  if (graded.agreement < 75) {
    const feedback = await calibrationFeedback(baseVersion, rubric);
    const revised = await writeRubric({ round, goal, focus, feedback });
    await logCoachEvent(round, "rubric", { rubricId: revised._id, goal, focus, summary: revised.summary, criteria: revised.criteria, model: revised.model, revised: true, previousAgreement: graded.agreement });
    const regraded = await gradeVersion(baseVersion, revised, round);
    if (regraded.agreement >= graded.agreement) {
      rubric = revised;
      graded = regraded;
    } else {
      await gradeVersion(baseVersion, rubric, round); // keep the better rubric's grades on the conversations
    }
  }

  const newVersion = await nextVersionNumber();
  const { proposal, newConfig } = await runCoach({ round, config: base, newVersion, focus, rubric });
  if (!proposal || !newConfig) {
    await logCoachEvent(round, "decision", { version: null, decision: "no_proposal" });
    return { round, baseVersion, decision: "no_proposal" as const };
  }
  const { decision, test } = await evaluateProposal({ round, baseVersion, base, candidate: newConfig, proposal, agentTurn, rubric });
  // Finish the new version's baseline now, so the next round (including a live one) starts straight at diagnosis.
  if (decision === "accepted") await ensureBaseline(newVersion, agentTurn, round);
  return { round, baseVersion, candidateVersion: newVersion, decision, test, proposal };
}
