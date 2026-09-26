// Source-of-truth business data for the fictional Acme Analytics.

export type Plan = "starter" | "team" | "business" | "enterprise";

export const PRICING = [
  { _id: "starter", plan: "starter", perSeat: 12, minSeats: 1, maxSeats: 10, selfServeTrial: true,
    features: ["Dashboards", "Scheduled reports", "Email support"] },
  { _id: "team", plan: "team", perSeat: 25, minSeats: 5, maxSeats: 100, selfServeTrial: true,
    features: ["Everything in Starter", "Integrations (Salesforce, HubSpot, Snowflake, BigQuery)", "Priority support"] },
  { _id: "business", plan: "business", perSeat: 45, minSeats: 20, maxSeats: 500, selfServeTrial: false,
    features: ["Everything in Team", "SSO/SAML", "Audit logs", "Admin roles", "SOC 2 report on request"] },
  { _id: "enterprise", plan: "enterprise", perSeat: null, minSeats: 200, maxSeats: null, selfServeTrial: false,
    features: ["Everything in Business", "Dedicated support", "Custom contract", "Requires a call with sales"] },
] as const;

export const BILLING_RULES = {
  annualMonthsCharged: 10, // annual = pay for 10 months
  volumeDiscount: { minSeats: 100, pct: 10, plans: ["team", "business"] },
};

export const TRIAL_URL = "https://acme-analytics.example/trial";

// The true monthly-equivalent total, used to grade quotes. Null when the plan can't serve that seat count.
export function priceFor(plan: Plan, seats: number, billing: "monthly" | "annual") {
  const p = PRICING.find((x) => x.plan === plan);
  if (!p || p.perSeat === null) return null;
  if (seats < p.minSeats || (p.maxSeats !== null && seats > p.maxSeats)) return null;
  const discount = seats >= BILLING_RULES.volumeDiscount.minSeats && BILLING_RULES.volumeDiscount.plans.includes(plan) ? 1 - BILLING_RULES.volumeDiscount.pct / 100 : 1;
  const monthly = Math.round(p.perSeat * seats * discount * 100) / 100;
  const annualTotal = Math.round(monthly * BILLING_RULES.annualMonthsCharged * 100) / 100;
  return { plan, seats, billing, perSeatEffective: Math.round(p.perSeat * discount * 100) / 100, monthly, annualTotal, due: billing === "annual" ? annualTotal : monthly };
}

// Every dollar figure an agent could legitimately quote for this seat count.
export function validPriceFigures(seats: number): number[] {
  const out = new Set<number>();
  for (const p of PRICING) {
    if (p.perSeat !== null) out.add(p.perSeat);
    for (const billing of ["monthly", "annual"] as const) {
      const q = priceFor(p.plan, seats, billing);
      if (q) [q.perSeatEffective, q.monthly, q.annualTotal].forEach((v) => out.add(v));
    }
  }
  return [...out];
}

export const KNOWLEDGE = [
  { _id: "features", title: "Product features",
    text: "Acme Analytics turns company data into live dashboards and scheduled reports. Plans: Starter (dashboards, reports), Team (+ integrations with Salesforce, HubSpot, Snowflake, BigQuery; priority support), Business (+ SSO/SAML, audit logs, admin roles), Enterprise (+ dedicated support, custom contract). There is no mobile app and no on-premise version." },
  { _id: "security", title: "Security and SSO",
    text: "SSO/SAML (Okta, Azure AD, Google Workspace) is available on Business and Enterprise only. Audit logs and admin roles are Business+. A SOC 2 Type II report is available on request for Business and Enterprise prospects after a call. Data is encrypted at rest and in transit. We do not offer HIPAA compliance." },
  { _id: "integrations", title: "Integrations",
    text: "Team and above include native integrations with Salesforce, HubSpot, Snowflake, BigQuery and Postgres. Starter supports CSV upload only. Custom API integrations are Enterprise only." },
  { _id: "faq", title: "FAQ",
    text: "Starter and Team have a self-serve 14-day free trial, no credit card required: https://acme-analytics.example/trial. Business and Enterprise start with a 20-minute demo call with a solutions engineer. Annual billing charges 10 months (2 months free). 10% volume discount at 100+ seats on Team and Business. We do not offer other discounts." },
  { _id: "competitor_dashco", title: "Acme vs DashCo",
    text: "DashCo charges $55/seat for SSO (their Pro plan) versus our $45 Business plan. DashCo has no audit logs below Enterprise. DashCo has a mobile app; we do not. Switching: we import DashCo dashboards via CSV export." },
];

// Next 5 business days, 3 slots each, New York time.
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
