// Shared task definitions. Both providers receive exactly these instructions, options,
// and criteria, so the comparison is on equivalent input. Provider adapters translate
// them into their own request formats.

export const USE_CASES = ["email_detection", "model_routing", "response_quality"] as const;
export type UseCase = (typeof USE_CASES)[number];

export type Option = { id: string; label: string; description: string };

// ---- Email Detector ----

export const EMAIL_CATEGORIES = [
  {
    id: "sales_inquiry",
    label: "Sales inquiry",
    description: "The sender is interested in buying, pricing, a demo, a quote, or a partnership.",
  },
  {
    id: "support_request",
    label: "Support request",
    description: "The sender needs help with a product problem, bug, outage, or how to use something.",
  },
  {
    id: "billing_question",
    label: "Billing question",
    description: "The email is about invoices, charges, refunds, payment methods, or subscriptions.",
  },
  {
    id: "spam",
    label: "Spam / irrelevant",
    description: "Unsolicited advertising, phishing, scams, or content unrelated to the business.",
  },
  {
    id: "other",
    label: "Other",
    description: "A legitimate email that fits none of the other categories.",
  },
] as const satisfies readonly Option[];

export type EmailCategoryLabel = (typeof EMAIL_CATEGORIES)[number]["label"];
export const EMAIL_CATEGORY_LABELS = EMAIL_CATEGORIES.map((c) => c.label) as [
  EmailCategoryLabel,
  ...EmailCategoryLabel[],
];

export const EMAIL_DETECTION_INSTRUCTIONS =
  "Classify this incoming business email into exactly one category.";

// ---- Model Router ----

export const ROUTING_TIERS = [
  {
    id: "fast",
    label: "Fast / low-cost",
    description:
      "A short, routine, low-risk reply that a small, cheap model can write well (acknowledgements, simple FAQs, spam handling).",
  },
  {
    id: "balanced",
    label: "Balanced",
    description:
      "A typical business reply that needs some care or context but no deep reasoning or specialist knowledge.",
  },
  {
    id: "capable",
    label: "Higher-capability",
    description:
      "A complex, ambiguous, multi-part, technical, or high-stakes reply (legal, financial, angry customer, escalation) that needs the strongest model.",
  },
] as const satisfies readonly Option[];

export type RoutingTierId = (typeof ROUTING_TIERS)[number]["id"];
export type RoutingTierLabel = (typeof ROUTING_TIERS)[number]["label"];

export const MODEL_ROUTING_INSTRUCTIONS =
  "Choose the cheapest model tier that can write an adequate reply to this email.";

// ---- Response Quality Gate ----

export const QUALITY_CRITERIA = [
  {
    id: "addresses_request",
    label: "Addresses the request",
    statement: "The reply directly addresses the main question or request in the email.",
    critical: false,
  },
  {
    id: "accurate_and_grounded",
    label: "Grounded in the email",
    statement:
      "The reply contains no invented facts, prices, dates, policies, or promises that are not supported by the email.",
    critical: true,
  },
  {
    id: "professional_tone",
    label: "Professional tone",
    statement: "The reply is polite and professional.",
    critical: false,
  },
  {
    id: "safe_to_send",
    label: "Safe to send",
    statement:
      "The reply is safe to send without human review: no sensitive data exposure, legal or financial commitments, or harmful content.",
    critical: true,
  },
] as const;

export type QualityCriterionId = (typeof QUALITY_CRITERIA)[number]["id"];

export const QUALITY_OUTCOMES = ["Accept", "Retry / improve", "Human review"] as const;
export type QualityOutcome = (typeof QUALITY_OUTCOMES)[number];

export const RESPONSE_QUALITY_INSTRUCTIONS =
  "Evaluate the candidate reply to the email against the statement. Decide whether the statement is true.";

/**
 * The application policy, identical for both providers:
 * - every criterion passes          -> Accept
 * - a critical criterion fails      -> Human review
 * - only non-critical criteria fail -> Retry / improve
 */
export function qualityPolicy(results: Record<QualityCriterionId, boolean>): QualityOutcome {
  const failed = QUALITY_CRITERIA.filter((c) => !results[c.id]);
  if (failed.length === 0) return "Accept";
  if (failed.some((c) => c.critical)) return "Human review";
  return "Retry / improve";
}

/** Jev returns P(true) per criterion; the same 0.5 cut-off is applied to every criterion. */
export const NOUL_PASS_THRESHOLD = 0.5;

// ---- Shared input ----

export type EmailInput = { from: string; subject: string; body: string };

/** The exact email text both providers see. */
export function renderEmail(email: EmailInput): string {
  return `From: ${email.from}\nSubject: ${email.subject}\n\n${email.body}`;
}

/** The exact email + candidate reply text both providers see for the quality gate. */
export function renderEmailWithReply(email: EmailInput, reply: string): string {
  return `=== Incoming email ===\n${renderEmail(email)}\n\n=== Candidate reply ===\n${reply}`;
}
