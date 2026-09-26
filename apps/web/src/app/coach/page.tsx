import { getActiveConfig, getActiveVersion } from "@evolve/core";
import { CoachClient } from "./coach-client";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const [config, active] = await Promise.all([getActiveConfig(), getActiveVersion()]);
  return <CoachClient goal={config.goal.description} active={active} />;
}
