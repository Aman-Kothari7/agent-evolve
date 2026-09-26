import type { AgentConfig } from "../config/schema";

// Deliberately weak but realistic starting point: a friendly generalist with no docs search,
// no calendar, no limits lookup, and a meeting tool anyone can trigger. The coach has to
// discover and fix each gap from conversation evidence.
export const V1_CONFIG: AgentConfig = {
  version: 1,
  goal: {
    description:
      "Resolve MongoDB Atlas support questions correctly. Book a call with a MongoDB engineer only when a customer has a production workload that needs one (a large or regulated migration, or a production incident the docs can't solve). Send learners and prototypes to the free tier.",
  },
  instructions: {
    persona: "You are the MongoDB Atlas website assistant. Be friendly and helpful.",
    sections: [
      { id: "general", title: "How to help", introducedIn: 1,
        text: "Answer questions about MongoDB Atlas. If a visitor wants to talk to someone, offer to book a meeting with our team." },
    ],
  },
  state: {
    need: { question: "What does the visitor mainly need?", type: "choice", extractor: "jev", introducedIn: 1,
      options: ["connection_issue", "limits_question", "feature_setup", "migration", "production_incident", "learning", "other"] },
  },
  tools: {
    search_docs: { kind: "builtin", description: "Searches the documentation.", enabled: false, requires: [], introducedIn: 1 },
    get_slots: { kind: "builtin", description: "Returns open meeting times.", enabled: false, requires: [], introducedIn: 1 },
    lookup_limits: { kind: "builtin", description: "Looks up limits.", enabled: false, requires: [], introducedIn: 1 },
    book_meeting: { kind: "builtin", description: "Books a meeting.", enabled: true, requires: [], introducedIn: 1 },
    send_signup_link: { kind: "builtin", description: "Sends a signup link.", enabled: true, requires: [], introducedIn: 1 },
  },
  rules: [
    { type: "check", id: "no_credits_or_discounts", locked: true, onViolation: "block", introducedIn: 1,
      question: "Does the reply promise free credits, discounts, or special pricing?" },
    { type: "check", id: "no_guarantees", locked: true, onViolation: "block", introducedIn: 1,
      question: "Does the reply guarantee uptime, a fix for an outage, or a specific support response time?" },
  ],
  context: [],
  widgets: {},
  limits: { maxTurns: 8 },
};
