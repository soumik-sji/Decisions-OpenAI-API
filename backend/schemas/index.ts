import { z } from "zod";
import {
  EMAIL_CATEGORY_LABELS,
  QUALITY_OUTCOMES,
  ROUTING_TIERS,
  USE_CASES,
  type QualityCriterionId,
} from "../usecases/definitions";

// ---- Request bodies ----

export const createEmailSchema = z.object({
  from: z.string().trim().min(1).max(320),
  to: z.string().trim().max(320).optional(),
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(20_000),
  expectedLabel: z.enum(EMAIL_CATEGORY_LABELS).nullish(),
  notes: z.string().trim().max(2_000).nullish(),
  candidateReply: z.string().trim().min(1).max(20_000).nullish(),
});
export type CreateEmailInput = z.infer<typeof createEmailSchema>;

export const useCaseSchema = z.enum(USE_CASES);

export const compareRequestSchema = z.object({
  useCase: useCaseSchema,
  // Response Quality Gate only: overrides the email's stored candidate reply.
  candidateReply: z.string().trim().min(1).max(20_000).optional(),
});

export const benchmarkRunSchema = z.object({
  useCase: useCaseSchema,
  emailIds: z.array(z.string().min(1)).min(1).max(50).optional(),
  repeats: z.number().int().min(1).max(5).default(1),
});

// ---- Normalized result shape (internal contract, not a native provider format) ----

export type Provider = "jev" | "openai";

export type EmailDetectionDecision = { label: (typeof EMAIL_CATEGORY_LABELS)[number] };

export type ModelRoutingDecision = {
  tier: (typeof ROUTING_TIERS)[number]["label"];
  tierId: (typeof ROUTING_TIERS)[number]["id"];
  /** The configured model ID this tier routes to; null when not configured. */
  model: string | null;
  /** Free-text reason. Jev returns typed values only, so this is null (unavailable) for Jev. */
  reason: string | null;
};

export type CriterionResult = {
  id: QualityCriterionId;
  label: string;
  critical: boolean;
  passed: boolean;
  /** Jev's P(true). Null (unavailable) for OpenAI, which returns booleans only. */
  probability: number | null;
};

export type ResponseQualityDecision = {
  outcome: (typeof QUALITY_OUTCOMES)[number];
  criteria: CriterionResult[];
  failedCriteria: string[];
  reason: string | null;
};

export type Decision = EmailDetectionDecision | ModelRoutingDecision | ResponseQualityDecision;

export type ErrorKind = "config" | "timeout" | "network" | "http" | "invalid_output";

export type Usage = { inputTokens: number; outputTokens: number };

export type ProviderResult = {
  runId: string;
  provider: Provider;
  status: "completed" | "failed";
  decision: Decision | null;
  /** Probability per option, as returned by the provider. Null when unavailable. */
  probabilities: Record<string, number> | null;
  /** Provider-reported confidence. Null when unavailable; never invented. */
  confidence: number | null;
  latencyMs: number | null;
  model: string | null;
  usage: Usage | null;
  error: string | null;
  errorKind: ErrorKind | null;
};

export type Comparison = {
  /** Null when either side failed: agreement cannot be computed. */
  agreement: boolean | null;
  /** Only for email_detection with an expected label. Null otherwise. */
  groundTruthCorrectness: { expected: string; jev: boolean | null; openai: boolean | null } | null;
  latencyMethod: string;
};

export type ComparisonResponse = {
  emailId: string;
  useCase: z.infer<typeof useCaseSchema>;
  evaluationId: string;
  input: Record<string, unknown>;
  results: { jev: ProviderResult; openai: ProviderResult };
  comparison: Comparison;
};
