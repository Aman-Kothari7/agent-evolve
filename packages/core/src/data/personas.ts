import { isQualified, Persona } from "../types";

type Hidden = Persona["hidden"];
type Behavior = Persona["behavior"];

function make(p: Omit<Persona, "qualified">): Persona {
  return Persona.parse({ ...p, qualified: isQualified(p.hidden) });
}

// The four demo cases (docs/ARCHITECTURE.md section 1). Fixed openings so replays are comparable.
export const DEMO_PERSONAS: Persona[] = [
  make({
    _id: "demo_c1_email_gate", split: "demo", caseId: "C1", segment: "qualified_sso",
    opening: "Hi, how much would Acme cost for a team of about 40 people?",
    hidden: { name: "Maya Chen", role: "Head of Operations", teamSize: 40, need: "sso", billing: "monthly", timeline: "deciding this month" },
    behavior: { leavesIfContactBeforePrice: true, maxSchedulingExchanges: 3, checksMath: false, readiness: "evaluating" },
  }),
  make({
    _id: "demo_c2_wrong_math", split: "demo", caseId: "C2", segment: "security_review",
    opening: "We have 120 people and would pay annually. What would the Business plan come to for the year?",
    hidden: { name: "Daniel Okafor", role: "IT Lead", teamSize: 120, need: "security_review", billing: "annual", timeline: "budget approval next week" },
    behavior: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 3, checksMath: true, readiness: "evaluating" },
  }),
  make({
    _id: "demo_c3_scheduling", split: "demo", caseId: "C3", segment: "qualified_integrations",
    opening: "We use Snowflake and HubSpot and want to see a demo this week. Can we set something up?",
    hidden: { name: "Priya Raman", role: "VP of Data", teamSize: 60, need: "integrations", billing: "annual", timeline: "this week" },
    behavior: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 1, checksMath: false, readiness: "ready" },
  }),
  make({
    _id: "demo_c4_unqualified", split: "demo", caseId: "C4", segment: "solo",
    opening: "I'm a solo founder working on a small startup. Can I talk to someone about whether this fits me?",
    hidden: { name: "Leo Martins", role: "Founder", teamSize: 3, need: "dashboards", billing: "monthly", timeline: "just exploring" },
    behavior: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 3, checksMath: false, readiness: "browsing" },
  }),
];

// ---------- Generated practice personas: 8 segments x 4 behaviors ----------

type Segment = {
  id: string;
  sizes: number[];
  need: Hidden["need"];
  roles: string[];
  openings: string[];
  competitor?: string;
};

const SEGMENTS: Segment[] = [
  { id: "qualified_sso", sizes: [25, 45, 70, 35], need: "sso", roles: ["Head of Operations", "IT Manager"],
    openings: ["What does Acme cost for around {n} people?", "Do you support SSO? We're a team of {n}."] },
  { id: "qualified_integrations", sizes: [30, 55, 90, 40], need: "integrations", roles: ["Data Lead", "RevOps Manager"],
    openings: ["Does Acme connect to Salesforce? We'd have about {n} users.", "Pricing for {n} seats with Snowflake integration?"] },
  { id: "enterprise", sizes: [220, 350, 600, 260], need: "enterprise", roles: ["Director of BI", "VP Engineering"],
    openings: ["We're looking at a rollout for about {n} people. How does pricing work at that size?", "Do you do custom contracts? We'd be {n}+ seats."] },
  { id: "security_review", sizes: [40, 150, 65, 110], need: "security_review", roles: ["Security Lead", "CTO"],
    openings: ["Before anything else: do you have a SOC 2 report and audit logs? We're {n} people.", "What's the price for {n} users on the plan with audit logs?"] },
  { id: "small_team", sizes: [4, 8, 12, 6], need: "dashboards", roles: ["Marketing Lead", "Ops Associate"],
    openings: ["How much for a small team of {n}?", "Is there a free trial? We're only {n} people."] },
  { id: "solo", sizes: [1, 2, 3, 1], need: "price_only", roles: ["Freelancer", "Student"],
    openings: ["How much is it for just me?", "Is there a cheap plan for {n} users?"] },
  { id: "price_shopper", sizes: [15, 30, 50, 20], need: "price_only", roles: ["Finance Analyst", "Office Manager"],
    openings: ["Just need a quick price for {n} seats, no calls please.", "What's your cheapest option for {n} people?"] },
  { id: "competitor_switcher", sizes: [30, 60, 45, 80], need: "sso", roles: ["Head of Analytics", "IT Director"], competitor: "DashCo",
    openings: ["We're on DashCo and it's getting expensive for {n} seats. How do you compare?", "Thinking of switching from DashCo. We need SSO for {n} people."] },
];

const BEHAVIORS: { id: string; b: Behavior }[] = [
  { id: "contact_averse", b: { leavesIfContactBeforePrice: true, maxSchedulingExchanges: 3, checksMath: false, readiness: "evaluating" } },
  { id: "impatient_scheduler", b: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 1, checksMath: false, readiness: "ready" } },
  { id: "math_checker", b: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 3, checksMath: true, readiness: "evaluating" } },
  { id: "ready_buyer", b: { leavesIfContactBeforePrice: false, maxSchedulingExchanges: 2, checksMath: false, readiness: "ready" } },
];

const NAMES = [
  "Ava Patel", "Noah Kim", "Sofia Rossi", "Ethan Brooks", "Lina Haddad", "Marcus Webb", "Hana Sato", "Diego Alvarez",
  "Chloe Martin", "Omar Farouk", "Grace Liu", "Ben Adler", "Zara Ahmed", "Lucas Silva", "Mia Novak", "Samir Gupta",
  "Elena Popova", "Jack Turner", "Aisha Bello", "Ryan O'Neill", "Yuki Tanaka", "Carmen Diaz", "Felix Wagner", "Nora Lindqvist",
  "Kwame Mensah", "Isla Murray", "Arjun Rao", "Leah Cohen", "Tomás Herrera", "Ingrid Berg", "Victor Chen", "Amara Obi",
];

const TIMELINES = ["this quarter", "next month", "just exploring", "within two weeks"];

export function generatePracticePersonas(): Persona[] {
  const out: Persona[] = [];
  let i = 0;
  SEGMENTS.forEach((seg, si) => {
    BEHAVIORS.forEach((beh, bi) => {
      const n = seg.sizes[bi % seg.sizes.length];
      const opening = seg.openings[(si + bi) % seg.openings.length].replace("{n}", String(n));
      out.push(
        make({
          _id: `p${String(i + 1).padStart(2, "0")}_${seg.id}_${beh.id}`,
          split: i % 4 === 3 ? "heldout" : "train",
          segment: seg.id,
          opening,
          hidden: {
            name: NAMES[i % NAMES.length],
            role: seg.roles[bi % seg.roles.length],
            teamSize: n,
            need: seg.need,
            billing: bi % 2 === 0 ? "monthly" : "annual",
            timeline: TIMELINES[(si + bi) % TIMELINES.length],
            ...(seg.competitor ? { competitor: seg.competitor } : {}),
          },
          behavior: beh.b,
        }),
      );
      i++;
    });
  });
  return out;
}
