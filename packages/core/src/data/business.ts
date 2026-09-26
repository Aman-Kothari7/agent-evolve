// Domain data for the demo: a support/sales assistant for MongoDB Atlas.
// Facts come from the public MongoDB docs (downloaded 2026-09-25). This is a hackathon demo,
// not an official MongoDB assistant.

export const SIGNUP_URL = "https://www.mongodb.com/cloud/atlas/register";
export const GET_STARTED_URL = "https://www.mongodb.com/docs/get-started/";

export const KNOWLEDGE = [
  { _id: "network_access", title: "Connection errors and the IP access list", url: "https://www.mongodb.com/docs/atlas/security/ip-access-list/",
    text: "Atlas only accepts client connections from IP addresses on the project's IP access list. If an app gets ECONNRESET, 'server selection timed out', or connection refused errors, add the machine's current public IP under Security → Network Access → Add IP Address (for short-lived testing, 'Allow access from anywhere' adds 0.0.0.0/0). VPNs, new Wi-Fi networks, and cloud hosts with changing IPs are the most common cause of connections that worked yesterday and fail today." },
  { _id: "connection_string", title: "Connection strings and database users", url: "https://www.mongodb.com/docs/manual/reference/connection-string/",
    text: "Copy the SRV connection string from the cluster's Connect dialog. The database user must exist under Database Access, and special characters in the password must be URL-encoded. Authentication errors mention 'bad auth'; network errors (timeouts, ECONNRESET) point to the IP access list instead." },
  { _id: "search_index_limits", title: "Search and Vector Search index limits", url: "https://www.mongodb.com/docs/vector-search/deployment/compatibility-limitations/",
    text: "You cannot create more than 3 indexes (search and vector combined) on Free clusters, and no more than 10 on Flex clusters. Dedicated clusters (M10 and up) have no fixed count, but every index adds load, so start small and monitor resource usage." },
  { _id: "rerank", title: "Native reranking with $rerank", url: "https://www.mongodb.com/docs/vector-search/query/aggregation-stages/rerank/",
    text: "The $rerank aggregation stage reorders results with Voyage AI reranker models. It requires MongoDB 8.3 or later; on older versions the stage is not recognized. Related version requirements: creating vector indexes on views needs 8.0+, and querying views directly with $vectorSearch needs 8.1+." },
  { _id: "automated_embedding", title: "Automated Embedding", url: "https://www.mongodb.com/docs/vector-search/crud-embeddings/automated-embedding/",
    text: "Automated Embedding lets Atlas generate and maintain embeddings for you. Create a Vector Search index with a field of type autoEmbed (modality text, model such as voyage-4). Atlas embeds documents at index time and query text at query time, so there's no separate embedding pipeline. On dedicated clusters (M10+) storage auto-scaling must be enabled." },
  { _id: "mcp_server", title: "Connecting AI coding tools with the MongoDB MCP Server", url: "https://www.mongodb.com/docs/mcp-server/get-started/",
    text: "The MongoDB MCP Server lets AI clients such as Claude Code, Codex, and Cursor query and manage your data. Local MCP: run `npx mongodb-mcp-server@latest setup` and paste your connection string; it works with any cluster. Atlas Managed MCP Server: hosted by MongoDB at mcp.mongodb.com; an organization owner must enable AI Clients first." },
  { _id: "tiers", title: "Choosing a cluster tier", url: "https://www.mongodb.com/docs/atlas/",
    text: "Free clusters are for learning and prototyping. Flex clusters suit development and low-traffic apps. Dedicated clusters (M10 and up) are for production: dedicated resources, auto-scaling, and multi-region or multi-cloud deployments." },
  { _id: "migration", title: "Migrating to MongoDB", url: "https://www.mongodb.com/docs/relational-migrator/",
    text: "Relational Migrator moves schemas and data from Postgres, MySQL, SQL Server, and Oracle to MongoDB. mongosync migrates between MongoDB clusters. Large, regulated, or multi-region migrations usually start with a call with a MongoDB solutions architect." },
  { _id: "change_streams", title: "Change streams", url: "https://www.mongodb.com/docs/manual/changestreams/",
    text: "Change streams let applications subscribe to real-time data changes on a collection, a database, or a whole deployment, without polling." },
  { _id: "get_started", title: "Getting started on Atlas", url: GET_STARTED_URL,
    text: `Start free: create an account at ${SIGNUP_URL}, deploy a Free cluster, load the sample data, and connect with a driver or mongosh. Free clusters are ideal for class projects and prototypes.` },
];

// Facts a coach-created lookup tool can query (collection "limits").
export const LIMITS = [
  { _id: "tier_free", kind: "tier", tier: "free", maxSearchIndexes: 3, multiRegion: false, forProduction: false, bestFor: "learning and prototyping" },
  { _id: "tier_flex", kind: "tier", tier: "flex", maxSearchIndexes: 10, multiRegion: false, forProduction: false, bestFor: "development and low-traffic apps" },
  { _id: "tier_dedicated", kind: "tier", tier: "dedicated", maxSearchIndexes: null, multiRegion: true, forProduction: true, bestFor: "production (M10 and up); index count depends on cluster size and workload" },
  { _id: "feature_rerank", kind: "feature", feature: "$rerank", minVersion: "8.3" },
  { _id: "feature_view_vector_query", kind: "feature", feature: "$vectorSearch on views", minVersion: "8.1" },
  { _id: "feature_view_vector_index", kind: "feature", feature: "vector indexes on views", minVersion: "8.0" },
];

// Next 5 business days, 3 slots each, New York time, for calls with a MongoDB engineer.
export function makeSlots(from = new Date()) {
  const slots: { _id: string; slotId: string; label: string; start: Date; booked: boolean }[] = [];
  const d = new Date(from);
  while (slots.length < 15) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    for (const hour of [10, 13, 16]) {
      const start = new Date(d);
      start.setHours(hour, 0, 0, 0);
      const label = start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
      const slotId = `slot_${start.toISOString().slice(0, 13).replace(/[-T:]/g, "")}`;
      slots.push({ _id: slotId, slotId, label, start, booked: false });
    }
  }
  return slots;
}
