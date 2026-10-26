// OpenAI Decisions adapter. All Decisions request/response specifics live here.
// Contract from https://developers.openai.com/api/docs/guides/decisions:
//   POST /v1/decisions  { model, input, questions: [{ type, name, instructions, choices? }] }
//     -> { answers: [{ type, name, ... }], usage: { input_tokens, ... } }
//   choice    answer: { choice, probabilities: [{ value, probability }], confidence }
//   predicate answer: { probability }
//   refusal   answer: { type: "refusal", name }
// The guide does not document a `model` echo or output token counts. A live call
// (2026-10-26) returned both (`output_tokens: 0`); they stay optional here and are
// reported as unavailable if ever absent.
// Auth: Authorization: Bearer <OPENAI_API_KEY>.

import { z } from "zod";
import type { Config } from "../config";
import {
  EMAIL_CATEGORIES,
  EMAIL_DETECTION_INSTRUCTIONS,
  MODEL_ROUTING_INSTRUCTIONS,
  PREDICATE_PASS_THRESHOLD,
  QUALITY_CRITERIA,
  RESPONSE_QUALITY_INSTRUCTIONS,
  ROUTING_TIERS,
  qualityPolicy,
  renderEmail,
  renderEmailWithReply,
  type EmailInput,
  type Option,
  type QualityCriterionId,
} from "../usecases/definitions";
import type { EmailDetectionDecision, ResponseQualityDecision, Usage } from "../schemas";
import { requestJson } from "./http";
import { ProviderError, type DecisionProvider, type ProviderOutput, type RawRoutingDecision } from "./types";

const choiceAnswer = z.object({
  type: z.literal("choice"),
  name: z.string(),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.array(z.object({ value: z.string(), probability: z.number().min(0).max(1) })),
});
const predicateAnswer = z.object({
  type: z.literal("predicate"),
  name: z.string(),
  probability: z.number().min(0).max(1),
});
const refusalAnswer = z.object({ type: z.literal("refusal"), name: z.string() });
// Score questions are not used by this demo; accept them loosely so an unexpected one
// surfaces as "missing answer" rather than a schema failure.
const otherAnswer = z.object({ type: z.literal("score"), name: z.string() }).loose();
const answer = z.discriminatedUnion("type", [choiceAnswer, predicateAnswer, refusalAnswer, otherAnswer]);

export const decisionsResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.array(answer),
  usage: z
    .object({ input_tokens: z.number().int(), output_tokens: z.number().int().optional() })
    .loose()
    .optional(),
});
export type DecisionsResponse = z.infer<typeof decisionsResponseSchema>;

type Question =
  | { type: "choice"; name: string; instructions: string; choices: { value: string; description: string }[] }
  | { type: "predicate"; name: string; instructions: string };

function choiceQuestion(name: string, instructions: string, options: readonly Option[]): Question {
  // Stable option IDs are the choice values; the adapter maps them back to display labels.
  return {
    type: "choice",
    name,
    instructions,
    choices: options.map((o) => ({ value: o.id, description: `${o.label}: ${o.description}` })),
  };
}

function usage(r: DecisionsResponse): Usage | null {
  return r.usage ? { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens ?? null } : null;
}

function parseResponse(response: unknown): DecisionsResponse {
  const parsed = decisionsResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ProviderError("invalid_output", "OpenAI Decisions response did not match the expected schema");
  }
  return parsed.data;
}

function findAnswer(r: DecisionsResponse, name: string) {
  const a = r.answers.find((x) => x.name === name);
  if (!a) throw new ProviderError("invalid_output", `OpenAI Decisions response is missing answer "${name}"`);
  if (a.type === "refusal") throw new ProviderError("invalid_output", `OpenAI Decisions refused to answer "${name}"`);
  return a;
}

export function parseChoice<T extends Option>(
  response: unknown,
  questionName: string,
  options: readonly T[],
  requestedModel: string,
): { option: T; confidence: number; probabilities: Record<string, number>; parsed: DecisionsResponse; model: string } {
  const parsed = parseResponse(response);
  const a = findAnswer(parsed, questionName);
  if (a.type !== "choice") {
    throw new ProviderError("invalid_output", `OpenAI Decisions answer "${questionName}" is not a choice`);
  }
  const option = options.find((o) => o.id === a.choice);
  if (!option) throw new ProviderError("invalid_output", `OpenAI Decisions returned an unknown choice "${a.choice}"`);

  // Probabilities are keyed by display label so both panels read the same way.
  const probabilities: Record<string, number> = {};
  for (const p of a.probabilities) {
    const o = options.find((x) => x.id === p.value);
    if (o) probabilities[o.label] = p.probability;
  }
  return { option, confidence: a.confidence, probabilities, parsed, model: parsed.model ?? requestedModel };
}

export function parseQuality(response: unknown, requestedModel: string): ProviderOutput<ResponseQualityDecision> {
  const parsed = parseResponse(response);

  const passed = {} as Record<QualityCriterionId, boolean>;
  const criteria = QUALITY_CRITERIA.map((c) => {
    const a = findAnswer(parsed, c.id);
    if (a.type !== "predicate") {
      throw new ProviderError("invalid_output", `OpenAI Decisions answer "${c.id}" is not a predicate`);
    }
    passed[c.id] = a.probability >= PREDICATE_PASS_THRESHOLD;
    return { id: c.id, label: c.label, critical: c.critical, passed: passed[c.id], probability: a.probability };
  });

  return {
    decision: {
      outcome: qualityPolicy(passed),
      criteria,
      failedCriteria: criteria.filter((c) => !c.passed).map((c) => c.label),
      reason: null,
    },
    probabilities: Object.fromEntries(criteria.map((c) => [c.label, c.probability])),
    confidence: null,
    model: parsed.model ?? requestedModel,
    usage: usage(parsed),
    raw: parsed,
  };
}

export function createDecisionsProvider(config: Config): DecisionProvider {
  const { apiKey, baseUrl } = config.openai;
  const { model } = config.decisions;

  function credentials(): { apiKey: string; model: string } {
    if (!apiKey) throw new ProviderError("config", "OPENAI_API_KEY is not set on the backend");
    if (!model) throw new ProviderError("config", "OPENAI_DECISIONS_MODEL is not set on the backend");
    return { apiKey, model };
  }

  async function ask(input: string, questions: Question[]): Promise<{ res: unknown; model: string }> {
    const c = credentials();
    const res = await requestJson(`${baseUrl}/decisions`, {
      label: "OpenAI Decisions",
      apiKey: c.apiKey,
      body: { model: c.model, input, questions },
      timeoutMs: config.providerTimeoutMs,
    });
    return { res, model: c.model };
  }

  return {
    async classifyEmail(email: EmailInput): Promise<ProviderOutput<EmailDetectionDecision>> {
      const { res, model: m } = await ask(renderEmail(email), [
        choiceQuestion("category", EMAIL_DETECTION_INSTRUCTIONS, EMAIL_CATEGORIES),
      ]);
      const r = parseChoice(res, "category", EMAIL_CATEGORIES, m);
      return {
        decision: { label: r.option.label },
        probabilities: r.probabilities,
        confidence: r.confidence,
        model: r.model,
        usage: usage(r.parsed),
        raw: r.parsed,
      };
    },

    async routeEmail(email: EmailInput): Promise<ProviderOutput<RawRoutingDecision>> {
      const { res, model: m } = await ask(renderEmail(email), [
        choiceQuestion("tier", MODEL_ROUTING_INSTRUCTIONS, ROUTING_TIERS),
      ]);
      const r = parseChoice(res, "tier", ROUTING_TIERS, m);
      return {
        decision: { tier: r.option.label, tierId: r.option.id, reason: null },
        probabilities: r.probabilities,
        confidence: r.confidence,
        model: r.model,
        usage: usage(r.parsed),
        raw: r.parsed,
      };
    },

    async evaluateReply(email: EmailInput, reply: string): Promise<ProviderOutput<ResponseQualityDecision>> {
      const questions = QUALITY_CRITERIA.map(
        (c): Question => ({
          type: "predicate",
          name: c.id,
          instructions: `${RESPONSE_QUALITY_INSTRUCTIONS}\nStatement: ${c.statement}`,
        }),
      );
      const { res, model: m } = await ask(renderEmailWithReply(email, reply), questions);
      return parseQuality(res, m);
    },
  };
}
