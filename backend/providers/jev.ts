// Jev (TypeSafe System One) adapter. All Jev request/response specifics live here.
// Contract verified against https://api.typesafe.ai/openapi.json (v0.2.0):
//   POST /v1/systemone  { model, state, questions: { <name>: Question } }
//     -> { model, answers: { <name>: Answer }, usage: { input_tokens, output_tokens } }
//   GET  /v1/models     -> { models: [{ name, description, release_date }] }
// Auth: Authorization: Bearer <TYPESAFE_API_KEY>.

import { z } from "zod";
import type { Config } from "../config";
import {
  EMAIL_CATEGORIES,
  EMAIL_DETECTION_INSTRUCTIONS,
  MODEL_ROUTING_INSTRUCTIONS,
  NOUL_PASS_THRESHOLD,
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
import type { EmailDetectionDecision, ResponseQualityDecision } from "../schemas";
import { requestJson } from "./http";
import { ProviderError, type DecisionProvider, type ProviderOutput, type RawRoutingDecision } from "./types";

const choiceAnswer = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number()),
});
const noulAnswer = z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) });
const scoreAnswer = z.object({
  type: z.literal("score"),
  score: z.number(),
  confidence: z.number(),
  legend: z.record(z.string(), z.unknown()),
  probabilities: z.record(z.string(), z.number()),
});
const answer = z.discriminatedUnion("type", [choiceAnswer, noulAnswer, scoreAnswer]);

export const systemOneResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), answer),
  usage: z.object({ input_tokens: z.number().int(), output_tokens: z.number().int() }),
});
export type SystemOneResponse = z.infer<typeof systemOneResponseSchema>;

export const modelListSchema = z.object({
  models: z.array(z.object({ name: z.string(), description: z.string(), release_date: z.string() })),
});

type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };

function choiceQuestion(instructions: string, options: readonly Option[]): Question {
  // Option labels are the choice names, so probabilities come back keyed by display label.
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(options.map((o) => [o.label, o.description])),
  };
}

function usage(r: SystemOneResponse) {
  return { inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}

export function parseChoice<T extends Option>(
  response: unknown,
  questionName: string,
  options: readonly T[],
): { option: T; confidence: number; probabilities: Record<string, number>; parsed: SystemOneResponse } {
  const parsed = systemOneResponseSchema.safeParse(response);
  if (!parsed.success) throw new ProviderError("invalid_output", "Jev response did not match the expected schema");
  const a = parsed.data.answers[questionName];
  if (!a || a.type !== "choice") {
    throw new ProviderError("invalid_output", `Jev response is missing choice answer "${questionName}"`);
  }
  const option = options.find((o) => o.label === a.choice);
  if (!option) throw new ProviderError("invalid_output", `Jev returned an unknown choice "${a.choice}"`);
  return { option, confidence: a.confidence, probabilities: a.probabilities, parsed: parsed.data };
}

export function parseQuality(response: unknown): ProviderOutput<ResponseQualityDecision> {
  const parsed = systemOneResponseSchema.safeParse(response);
  if (!parsed.success) throw new ProviderError("invalid_output", "Jev response did not match the expected schema");

  const passed = {} as Record<QualityCriterionId, boolean>;
  const criteria = QUALITY_CRITERIA.map((c) => {
    const a = parsed.data.answers[c.id];
    if (!a || a.type !== "noul") {
      throw new ProviderError("invalid_output", `Jev response is missing yes/no answer "${c.id}"`);
    }
    passed[c.id] = a.noul >= NOUL_PASS_THRESHOLD;
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
    model: parsed.data.model,
    usage: usage(parsed.data),
    raw: parsed.data,
  };
}

export function createJevProvider(config: Config): DecisionProvider & {
  listModels(): Promise<z.infer<typeof modelListSchema>>;
} {
  const { apiKey, model, baseUrl } = config.jev;

  function credentials(): { apiKey: string; model: string } {
    if (!apiKey) throw new ProviderError("config", "TYPESAFE_API_KEY is not set on the backend");
    if (!model) throw new ProviderError("config", "JEV_MODEL is not set on the backend");
    return { apiKey, model };
  }

  async function ask(state: string, questions: Record<string, Question>): Promise<unknown> {
    const c = credentials();
    return requestJson(`${baseUrl}/v1/systemone`, {
      label: "Jev",
      apiKey: c.apiKey,
      body: { model: c.model, state, questions },
      timeoutMs: config.providerTimeoutMs,
    });
  }

  return {
    async listModels() {
      if (!apiKey) throw new ProviderError("config", "TYPESAFE_API_KEY is not set on the backend");
      const res = await requestJson(`${baseUrl}/v1/models`, {
        label: "Jev",
        method: "GET",
        apiKey,
        timeoutMs: config.providerTimeoutMs,
      });
      const parsed = modelListSchema.safeParse(res);
      if (!parsed.success) throw new ProviderError("invalid_output", "Jev model list did not match the expected schema");
      return parsed.data;
    },

    async classifyEmail(email: EmailInput): Promise<ProviderOutput<EmailDetectionDecision>> {
      const res = await ask(renderEmail(email), {
        category: choiceQuestion(EMAIL_DETECTION_INSTRUCTIONS, EMAIL_CATEGORIES),
      });
      const r = parseChoice(res, "category", EMAIL_CATEGORIES);
      return {
        decision: { label: r.option.label },
        probabilities: r.probabilities,
        confidence: r.confidence,
        model: r.parsed.model,
        usage: usage(r.parsed),
        raw: r.parsed,
      };
    },

    async routeEmail(email: EmailInput): Promise<ProviderOutput<RawRoutingDecision>> {
      const res = await ask(renderEmail(email), {
        tier: choiceQuestion(MODEL_ROUTING_INSTRUCTIONS, ROUTING_TIERS),
      });
      const r = parseChoice(res, "tier", ROUTING_TIERS);
      return {
        decision: { tier: r.option.label, tierId: r.option.id, reason: null },
        probabilities: r.probabilities,
        confidence: r.confidence,
        model: r.parsed.model,
        usage: usage(r.parsed),
        raw: r.parsed,
      };
    },

    async evaluateReply(email: EmailInput, reply: string): Promise<ProviderOutput<ResponseQualityDecision>> {
      const questions = Object.fromEntries(
        QUALITY_CRITERIA.map((c): [string, Question] => [
          c.id,
          { type: "noul", instructions: `${RESPONSE_QUALITY_INSTRUCTIONS}\nStatement: ${c.statement}` },
        ]),
      );
      return parseQuality(await ask(renderEmailWithReply(email, reply), questions));
    },
  };
}
