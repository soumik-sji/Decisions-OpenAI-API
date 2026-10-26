// Shapes returned by our own backend (see AGENTS.md "Backend API contract").
// These are the normalized internal contract, not native OpenAI Decisions or Chat Completions formats.

export const USE_CASES = [
  "email_detection",
  "model_routing",
  "response_quality",
] as const;

export type UseCase = (typeof USE_CASES)[number];

export type Provider = "decisions" | "openai";

export type Email = {
  id: string;
  fromAddress: string;
  subject: string;
  body: string;
  expectedLabel: string | null;
  createdAt: string;
};

export type CreateEmailRequest = {
  fromAddress: string;
  subject: string;
  body: string;
  expectedLabel: string | null;
};

export type CompareRequest = {
  useCase: UseCase;
};

export type ProviderStatus = "success" | "error" | "timeout" | "invalid_output";

export type ProviderResult = {
  provider: Provider;
  status: ProviderStatus;
  // Normalized decision, e.g. "Billing question". Null when the call failed.
  decision: string | null;
  // Short explanation, only if the provider returned one.
  reason: string | null;
  // Response Quality Gate only: criteria the candidate reply failed.
  failedCriteria: string[] | null;
  // Only if the provider API actually returns them. Never invented.
  probabilities: Record<string, number> | null;
  // Model Router only: the concrete model ID the chosen tier maps to.
  routedModel: string | null;
  // Model that produced this result, if known.
  model: string | null;
  latencyMs: number | null;
  // Safe, user-facing error message. Never contains secrets.
  error: string | null;
};

export type Comparison = {
  // Null when either side has no valid decision.
  agreement: boolean | null;
  // Expected result for this email and use case, if one was supplied.
  expected: string | null;
  decisionsMatchesExpected: boolean | null;
  openaiMatchesExpected: boolean | null;
};

export type CompareResponse = {
  emailId: string;
  useCase: UseCase;
  results: Record<Provider, ProviderResult>;
  comparison: Comparison;
};

export type ProcessingRun = {
  id: string;
  emailId: string;
  useCase: UseCase;
  provider: Provider;
  status: ProviderStatus;
  decision: string | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
};
