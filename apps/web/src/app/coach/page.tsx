import { getActiveConfig, getActiveVersion, listConfigDocs } from "@evolve/core";
import { plain } from "@/lib/ui";
import { CoachClient } from "./coach-client";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const [config, active, versions] = await Promise.all([getActiveConfig(), getActiveVersion(), listConfigDocs()]);
  return <CoachClient goal={config.goal.description} active={active} initialVersions={plain(versions)} />;
}
