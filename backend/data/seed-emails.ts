import type { CreateEmailInput } from "../schemas";

// Fictional senders and content only. Expected labels are ground truth for the
// Email Detector; candidate replies make the Response Quality Gate repeatable.
export const SEED_EMAILS: (CreateEmailInput & { id: string })[] = [
  {
    id: "seed-01",
    from: "maria@jev.com",
    subject: "Pricing for 50 seats?",
    body: "Hi, we're evaluating tools for our 50-person operations team. Could you send pricing for an annual plan and let me know if you offer a demo next week?\n\nThanks,\nMaria",
    expectedLabel: "Sales inquiry",
    notes: "Clear sales intent.",
    candidateReply:
      "Hi Maria,\n\nThanks for reaching out! I'd be happy to set up a demo next week. Could you share a couple of times that work for you? I'll also have our sales team send annual pricing for 50 seats.\n\nBest regards,\nAlex",
  },
  {
    id: "seed-02",
    from: "ridhita@example.org",
    subject: "Export button does nothing",
    body: "Since this morning the 'Export to CSV' button on the Reports page does nothing when I click it. No error, no download. I've tried Chrome and Firefox. Can someone take a look? We need this for an audit on Friday.",
    expectedLabel: "Support request",
    notes: "Bug report with a deadline.",
    candidateReply:
      "Hi Ridhita,\n\nSorry about that. Our engineers have already fixed the issue and deployed a patch, and we've also extended your subscription by three months free as an apology.\n\nCheers,\nSupport",
  },
  {
    id: "seed-03",
    from: "niki@contoso-example.net",
    subject: "Charged twice in September",
    body: "Hello, our card was charged twice for the September invoice (INV-2026-0912). Please refund the duplicate charge and confirm once done.",
    expectedLabel: "Billing question",
    notes: "Duplicate charge / refund.",
    candidateReply:
      "Hello,\n\nThank you for letting us know about the duplicate charge on invoice INV-2026-0912. I've passed this to our billing team to investigate, and we'll confirm by email once the duplicate has been reviewed.\n\nKind regards,\nBilling Support",
  },
  {
    id: "seed-04",
    from: "lucy@prize-claims.test",
    subject: "CONGRATULATIONS!!! You have been selected",
    body: "Dear valued customer, you have WON a $1,000 gift card! Click the link below and enter your bank details within 24 hours to claim your prize. Limited time only!!!",
    expectedLabel: "Spam / irrelevant",
    notes: "Phishing-style spam.",
  },
  {
    id: "seed-05",
    from: "emily.chen@tailspin-example.com",
    subject: "Interview request for our podcast",
    body: "Hi there, I host a small podcast about startup operations and would love to interview one of your founders sometime in November. Is there someone I could talk to about scheduling?",
    expectedLabel: "Other",
    notes: "Media request, not sales/support/billing.",
  },
  {
    id: "seed-06",
    from: "priya@adventure-works-example.com",
    subject: "Upgrade + invoice question",
    body: "We'd like to upgrade from the Starter plan to the Business plan for our team. Before we do, can you tell me whether the upgrade is prorated on our next invoice or charged immediately?",
    expectedLabel: "Billing question",
    notes: "Ambiguous: sales and billing signals. Labelled billing because the question asked is about invoicing.",
    candidateReply: "ok will check",
  },
  {
    id: "seed-07",
    from: "hannah@litware-example.com",
    subject: "Data processing agreement and breach notice",
    body: "Our legal team needs a signed DPA before renewal. Also, we received a report that some of our users' data may have been exposed through your API last month. Please confirm in writing whether any of our data was affected and what remediation was taken.",
    expectedLabel: "Support request",
    notes: "High-stakes, multi-part. Good Model Router test (expect higher-capability).",
    candidateReply:
      "Hi,\n\nI can confirm that none of your data was affected and our DPA is attached and signed. Let us know if you need anything else.\n\nThanks,\nSupport",
  },
  {
    id: "seed-08",
    from: "sophia@wingtip-example.io",
    subject: "Thanks!",
    body: "Just wanted to say thanks for the quick help yesterday — everything is working now.",
    expectedLabel: "Other",
    notes: "Simple acknowledgement. Good Model Router test (expect fast / low-cost).",
  },
];
