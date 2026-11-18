// TypeSafe Jev adapter. All System One request/response specifics live here.
// Contract from https://docs.typesafe.ai/api/system-one:
//   POST /v1/systemone  { model, state, questions: { [id]: { type, instructions, criteria? } } }
//     -> { model, answers: { [id]: { type, ... } }, usage: { input_tokens, output_tokens } }
//   choice answer: { choice, probabilities: { [option]: number }, confidence }
//   noul   answer: { noul }  // P(true), 0–1; OpenAI Decisions calls this "predicate"
// Auth: Authorization: Bearer <TYPESAFE_API_KEY>.

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
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});
const noulAnswer = z.object({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});
const scoreAnswer = z.object({ type: z.literal("score") }).loose();
const boxAnswer = z.object({ type: z.literal("box") }).loose();
const answer = z.discriminatedUnion("type", [choiceAnswer, noulAnswer, scoreAnswer, boxAnswer]);

export const jevResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), answer),
  usage: z
    .object({ input_tokens: z.number().int(), output_tokens: z.number().int().optional() })
    .loose()
    .optional(),
});
export type JevResponse = z.infer<typeof jevResponseSchema>;

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };

function choiceQuestion(instructions: string, options: readonly Option[]): Question {
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(options.map((o) => [o.id, `${o.label}: ${o.description}`])),
  };
}

function usage(r: JevResponse): Usage | null {
  return r.usage ? { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens ?? null } : null;
}

function parseResponse(response: unknown): JevResponse {
  const parsed = jevResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new ProviderError("invalid_output", "Jev response did not match the expected schema");
  }
  return parsed.data;
}

function findAnswer(r: JevResponse, name: string) {
  const a = r.answers[name];
  if (!a) throw new ProviderError("invalid_output", `Jev response is missing answer "${name}"`);
  return a;
}

export function parseChoice<T extends Option>(
  response: unknown,
  questionName: string,
  options: readonly T[],
  requestedModel: string,
): { option: T; confidence: number; probabilities: Record<string, number>; parsed: JevResponse; model: string } {
  const parsed = parseResponse(response);
  const a = findAnswer(parsed, questionName);
  if (a.type !== "choice") {
    throw new ProviderError("invalid_output", `Jev answer "${questionName}" is not a choice`);
  }
  const option = options.find((o) => o.id === a.choice);
  if (!option) throw new ProviderError("invalid_output", `Jev returned an unknown choice "${a.choice}"`);

  const probabilities: Record<string, number> = {};
  for (const [value, probability] of Object.entries(a.probabilities)) {
    const o = options.find((x) => x.id === value);
    if (o) probabilities[o.label] = probability;
  }
  return { option, confidence: a.confidence, probabilities, parsed, model: parsed.model ?? requestedModel };
}

export function parseQuality(response: unknown, requestedModel: string): ProviderOutput<ResponseQualityDecision> {
  const parsed = parseResponse(response);

  const passed = {} as Record<QualityCriterionId, boolean>;
  const criteria = QUALITY_CRITERIA.map((c) => {
    const a = findAnswer(parsed, c.id);
    if (a.type !== "noul") {
      throw new ProviderError("invalid_output", `Jev answer "${c.id}" is not a noul`);
    }
    passed[c.id] = a.noul >= PREDICATE_PASS_THRESHOLD;
    return { id: c.id, label: c.label, critical: c.critical, passed: passed[c.id], probability: a.noul };
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

export function createJevProvider(config: Config): DecisionProvider {
  const { apiKey, baseUrl, model } = config.jev;

  function credentials(): { apiKey: string; model: string } {
    if (!apiKey) throw new ProviderError("config", "TYPESAFE_API_KEY is not set on the backend");
    if (!model) throw new ProviderError("config", "JEV_MODEL is not set on the backend");
    return { apiKey, model };
  }

  async function ask(state: string, questions: Record<string, Question>): Promise<{ res: unknown; model: string }> {
    const c = credentials();
    const res = await requestJson(`${baseUrl}/systemone`, {
      label: "Jev",
      apiKey: c.apiKey,
      body: { model: c.model, state, questions },
      timeoutMs: config.providerTimeoutMs,
    });
    return { res, model: c.model };
  }

  return {
    async classifyEmail(email: EmailInput): Promise<ProviderOutput<EmailDetectionDecision>> {
      const { res, model: m } = await ask(renderEmail(email), {
        category: choiceQuestion(EMAIL_DETECTION_INSTRUCTIONS, EMAIL_CATEGORIES),
      });
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
      const { res, model: m } = await ask(renderEmail(email), {
        tier: choiceQuestion(MODEL_ROUTING_INSTRUCTIONS, ROUTING_TIERS),
      });
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
      const questions: Record<string, Question> = Object.fromEntries(
        QUALITY_CRITERIA.map((c) => [
          c.id,
          { type: "noul" as const, instructions: `${RESPONSE_QUALITY_INSTRUCTIONS}\nStatement: ${c.statement}` },
        ]),
      );
      const { res, model: m } = await ask(renderEmailWithReply(email, reply), questions);
      return parseQuality(res, m);
    },
  };
}
