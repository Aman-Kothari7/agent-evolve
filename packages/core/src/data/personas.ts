import { needsMeeting, Persona, type SuccessCriteria } from "../types";

function make(p: Omit<Persona, "qualified">): Persona {
  return Persona.parse({ ...p, qualified: needsMeeting(p.success as SuccessCriteria) });
}

const ACCESS_LIST = ["access list|network access|allowlist|whitelist|0\\.0\\.0\\.0"];

// The demo visitors. Fixed openings so v1 and later versions are compared on the same input.
export const DEMO_PERSONAS: Persona[] = [
  make({
    _id: "demo_d2_migration", split: "demo", caseId: "D2", segment: "migration",
    opening: "We're moving a 4 TB fintech database from Postgres to MongoDB and need multi-region plus compliance. Can we talk to someone?",
    hidden: { name: "Priya Raman", role: "VP of Engineering", company: "Ledgerline", teamSize: 180, tier: "none",
      situation: "You want a call with a MongoDB engineer this week to plan the migration." },
    behavior: { maxUnhelpfulReplies: 2, maxSchedulingExchanges: 1, readiness: "ready" },
    success: { kind: "meeting" },
  }),
  make({
    _id: "demo_d3_index_limit", split: "demo", caseId: "D3", segment: "limits_question",
    opening: "How many vector search indexes can I create on the free tier?",
    hidden: { name: "Leo Martins", role: "Indie developer", company: "Side project", teamSize: 1, tier: "free",
      situation: "You're planning a small RAG app on a Free cluster and need 4 vector indexes. You don't know the limit." },
    behavior: { maxUnhelpfulReplies: 2, maxSchedulingExchanges: 2, readiness: "browsing" },
    success: { kind: "mentions", all: ["\\b3\\b"], forbid: ["unlimited", "no (hard |fixed )?limit", "as many as"] },
  }),
];

// ---------- Practice visitors: 8 segments x 4 behaviors ----------

type Segment = {
  id: string;
  roles: string[];
  tier: Persona["hidden"]["tier"];
  sizes: number[];
  openings: string[];
  situation: string;
  rootCause?: string;
  success: SuccessCriteria;
};

const SEGMENTS: Segment[] = [
  { id: "connection_issue", roles: ["Backend developer", "DevOps engineer"], tier: "dedicated", sizes: [8, 25, 40, 15],
    openings: ["Getting 'MongoServerSelectionError: connection timed out' from my laptop. Worked fine at the office.", "Our new CI runner can't reach the cluster, ECONNRESET on every build."],
    situation: "Your credentials are fine; you're connecting from a new network or machine.",
    rootCause: "The new machine's IP isn't on the Atlas IP access list.",
    success: { kind: "mentions", all: ACCESS_LIST, forbid: [] } },
  { id: "index_limit_free", roles: ["Student developer", "Indie hacker"], tier: "free", sizes: [1, 2, 1, 3],
    openings: ["I tried to add a 4th vector index on my free cluster and it failed. Is there a limit?", "What's the max number of search indexes on an M0 free cluster?"],
    situation: "You're on a Free cluster and want several search/vector indexes. You don't know the limit.",
    success: { kind: "mentions", all: ["\\b3\\b"], forbid: ["unlimited", "no (hard |fixed )?limit", "as many as"] } },
  { id: "index_limit_flex", roles: ["Full-stack developer", "Startup CTO"], tier: "flex", sizes: [5, 10, 4, 8],
    openings: ["How many vector search indexes can a Flex cluster have?", "We're on Flex. Can we have 12 search indexes?"],
    situation: "You're on a Flex cluster planning several indexes. You don't know the limit.",
    success: { kind: "mentions", all: ["\\b10\\b"], forbid: ["unlimited", "no (hard |fixed )?limit", "as many as"] } },
  { id: "rerank_version", roles: ["ML engineer", "Search engineer"], tier: "dedicated", sizes: [20, 60, 35, 90],
    openings: ["$rerank gives me 'Unrecognized pipeline stage name'. What am I doing wrong?", "Is native reranking available on my cluster? The $rerank stage errors out."],
    situation: "Your dedicated cluster runs MongoDB 8.0.",
    rootCause: "$rerank requires MongoDB 8.3 or later; the cluster must be upgraded.",
    success: { kind: "mentions", all: ["8\\.3"], forbid: [] } },
  { id: "autoembed_setup", roles: ["AI engineer", "Backend developer"], tier: "dedicated", sizes: [12, 30, 18, 45],
    openings: ["Can Atlas create embeddings for me so I don't need my own embedding pipeline?", "What's the easiest way to get vector embeddings into Atlas without calling an embedding API myself?"],
    situation: "You want Atlas to handle embeddings for your product catalog.",
    rootCause: "Use Automated Embedding: a Vector Search index with an autoEmbed field.",
    success: { kind: "mentions", all: ["auto ?embed|automated embedding"], forbid: [] } },
  { id: "migration", roles: ["Head of Platform", "Data architect"], tier: "none", sizes: [120, 300, 80, 500],
    openings: ["We're planning to move 2 TB from MySQL to MongoDB across two regions. Can we get time with an expert?", "Our bank wants to migrate a regulated Oracle workload to Atlas. Who can we talk to?"],
    situation: "You need a call with a MongoDB engineer to plan a large, regulated, or multi-region migration.",
    success: { kind: "meeting" } },
  { id: "production_incident", roles: ["SRE lead", "CTO"], tier: "dedicated", sizes: [60, 150, 40, 220],
    openings: ["Our production M30 cluster CPU is pegged and checkout requests are timing out. We need help now.", "Write latency on our production cluster jumped 10x after yesterday's deploy. Can an engineer look?"],
    situation: "A paying production customer with an incident the docs won't solve; you want a call with an engineer as soon as possible.",
    success: { kind: "meeting" } },
  { id: "learner", roles: ["Student", "Bootcamp student"], tier: "none", sizes: [1, 1, 2, 1],
    openings: ["I'm doing a class project with MongoDB. Can I get a call with someone to help me set up?", "Can someone from MongoDB walk me through creating my first database for a hackathon?"],
    situation: "You're a learner. A free cluster and a getting-started guide are exactly what you need.",
    success: { kind: "signup" } },
];

const BEHAVIORS: { id: string; b: Persona["behavior"] }[] = [
  { id: "gives_up_fast", b: { maxUnhelpfulReplies: 1, maxSchedulingExchanges: 2, readiness: "evaluating" } },
  { id: "impatient_scheduler", b: { maxUnhelpfulReplies: 2, maxSchedulingExchanges: 1, readiness: "ready" } },
  { id: "patient", b: { maxUnhelpfulReplies: 3, maxSchedulingExchanges: 3, readiness: "evaluating" } },
  { id: "ready", b: { maxUnhelpfulReplies: 2, maxSchedulingExchanges: 2, readiness: "ready" } },
];

const NAMES = [
  "Ava Patel", "Noah Kim", "Sofia Rossi", "Ethan Brooks", "Lina Haddad", "Marcus Webb", "Hana Sato", "Diego Alvarez",
  "Chloe Martin", "Omar Farouk", "Grace Liu", "Ben Adler", "Zara Ahmed", "Lucas Silva", "Mia Novak", "Samir Gupta",
  "Elena Popova", "Jack Turner", "Aisha Bello", "Ryan O'Neill", "Yuki Tanaka", "Carmen Diaz", "Felix Wagner", "Nora Lindqvist",
  "Kwame Mensah", "Isla Murray", "Arjun Rao", "Leah Cohen", "Tomás Herrera", "Ingrid Berg", "Victor Chen", "Amara Obi",
];
const COMPANIES = ["Orbitly", "Fernbank Health", "Tradewind", "Pixelforge", "Northwave Bank", "Brightpath", "Cobalt Labs", "Uni project"];

export function generatePracticePersonas(): Persona[] {
  const out: Persona[] = [];
  let i = 0;
  SEGMENTS.forEach((seg, si) => {
    BEHAVIORS.forEach((beh, bi) => {
      out.push(
        make({
          _id: `p${String(i + 1).padStart(2, "0")}_${seg.id}_${beh.id}`,
          split: i % 4 === 3 ? "heldout" : "train",
          segment: seg.id,
          opening: seg.openings[(si + bi) % seg.openings.length],
          hidden: {
            name: NAMES[i % NAMES.length],
            role: seg.roles[bi % seg.roles.length],
            company: seg.id === "learner" ? "Student" : COMPANIES[(si + bi) % COMPANIES.length],
            teamSize: seg.sizes[bi % seg.sizes.length],
            tier: seg.tier,
            situation: seg.situation,
            ...(seg.rootCause ? { rootCause: seg.rootCause } : {}),
          },
          behavior: beh.b,
          success: seg.success,
        }),
      );
      i++;
    });
  });
  return out;
}
