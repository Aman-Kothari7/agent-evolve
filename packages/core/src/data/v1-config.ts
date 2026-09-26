import type { AgentConfig } from "../config/schema";

// Deliberately weak but realistic starting point: a generic "capture the lead" bot.
// It asks for email early, has no calendar access, does price math in its head,
// and books anyone who asks. The coach has to discover and fix each of these.
export const V1_CONFIG: AgentConfig = {
  version: 1,
  goal: { description: "Book demos with qualified buyers (20+ seats with an SSO, security, integrations or enterprise need, or 200+ seats). Send everyone else to the self-serve free trial." },
  instructions: {
    persona: "You are the website assistant for Acme Analytics, a B2B analytics dashboard product. Be friendly and helpful.",
    sections: [
      { id: "general", title: "How to help", introducedIn: 1,
        text: "Answer questions about Acme Analytics. Try to get the visitor's work email so our sales team can follow up, and offer to book a demo with sales." },
    ],
  },
  state: {
    need: { question: "What does the visitor mainly need?", type: "choice", extractor: "jev", introducedIn: 1,
      options: ["sso", "security_review", "integrations", "enterprise", "dashboards", "price_only", "other"] },
  },
  tools: {
    get_price: { kind: "builtin", description: "Returns the price list.", enabled: true, requires: [], introducedIn: 1 },
    ask_email: { kind: "builtin", description: "Ask the visitor for their email address.", enabled: true, requires: [], introducedIn: 1 },
    book_meeting: { kind: "builtin", description: "Books a meeting.", enabled: true, requires: [], introducedIn: 1 },
    send_trial_link: { kind: "builtin", description: "Sends a link to the free trial.", enabled: true, requires: [], introducedIn: 1 },
    get_slots: { kind: "builtin", description: "Returns open meeting slots.", enabled: false, requires: [], introducedIn: 1 },
  },
  rules: [
    { type: "check", id: "no_invented_discounts", locked: true, onViolation: "block", introducedIn: 1,
      question: "Does the reply offer a discount, promotion, or price that is not in the official pricing (only a 10% volume discount at 100+ seats on Team/Business and 2 months free on annual billing exist)?" },
    { type: "check", id: "no_invented_features", locked: true, onViolation: "block", introducedIn: 1,
      question: "Does the reply claim Acme Analytics has a feature it does not have (a mobile app, on-premise hosting, HIPAA compliance, or SSO below the Business plan)?" },
  ],
  context: [],
  widgets: {},
  limits: { maxTurns: 10 },
};
