import type { UseCase } from "./types";

export const EMAIL_CATEGORIES = [
  "Sales inquiry",
  "Support request",
  "Billing question",
  "Spam / irrelevant",
  "Other",
] as const;

type UseCaseInfo = {
  label: string;
  question: string;
  explanation: string;
  outputs: readonly string[];
};

// Plain-language copy so the presenter can teach each decision without raw payloads.
export const USE_CASE_INFO: Record<UseCase, UseCaseInfo> = {
  email_detection: {
    label: "Email Detector",
    question: "What kind of email is this?",
    explanation:
      "Each system reads the same email and puts it into exactly one category. This is the first step in routing mail to the right team.",
    outputs: EMAIL_CATEGORIES,
  },
  model_routing: {
    label: "Model Router",
    question: "How capable a model does this request need?",
    explanation:
      "Each system picks a model tier for handling this email. Simple requests can go to a fast, cheap model, and harder ones to a more capable one. Both sides follow the same routing policy.",
    outputs: ["Fast / low-cost", "Balanced", "Higher-capability"],
  },
  response_quality: {
    label: "Response Quality Gate",
    question: "Is this draft reply good enough to send?",
    explanation:
      "Each system checks the same candidate reply against the same simple criteria and decides whether to accept it, ask for a better one, or send it to a person. A gate lowers risk but does not guarantee correctness.",
    outputs: ["Accept", "Retry / improve", "Human review"],
  },
};
