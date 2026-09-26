import { getActiveVersion, listConfigDocs } from "@evolve/core";
import { plain } from "@/lib/ui";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [docs, active] = await Promise.all([listConfigDocs(), getActiveVersion()]);
  const versions = plain(docs.filter((d) => d.status === "active" || d.status === "accepted" || d.version === 1));
  return <ChatClient versions={versions} active={active} />;
}
