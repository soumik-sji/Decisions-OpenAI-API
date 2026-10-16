// OpenAI baseline adapter. All OpenAI request/response specifics live here.
// Uses Chat Completions with strict JSON-schema structured outputs; every reply is
// re-validated with Zod. OpenAI returns no calibrated probabilities, so those fields
// are reported as unavailable (null), never estimated.

import { z } from "zod";
import type { Config } from "../config";
import {
  EMAIL_CATEGORIES,
  EMAIL_DETECTION_INSTRUCTIONS,
  MODEL_ROUTING_INSTRUCTIONS,
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
import {
  ProviderError,
  type DecisionProvider,
  type ProviderOutput,
  type RawRoutingDecision,
  type ReplyGenerator,
} from "./types";

export const chatCompletionSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
          refusal: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number().int(), completion_tokens: z.number().int() }).optional(),
});
type ChatCompletion = z.infer<typeof chatCompletionSchema>;

function optionList(options: readonly Option[]): string {
  return options.map((o) => `- "${o.label}": ${o.description}`).join("\n");
}

const classificationSchema = z.object({
  category: z.enum(EMAIL_CATEGORIES.map((c) => c.label) as [string, ...string[]]),
});
const routingSchema = z.object({
  tier: z.enum(ROUTING_TIERS.map((t) => t.label) as [string, ...string[]]),
  reason: z.string(),
});
const qualitySchema = z.object({
  criteria: z.object(
    Object.fromEntries(QUALITY_CRITERIA.map((c) => [c.id, z.boolean()])) as Record<QualityCriterionId, z.ZodBoolean>,
  ),
  reason: z.string(),
});

const JSON_SCHEMAS = {
  classification: {
    type: "object",
    additionalProperties: false,
    required: ["category"],
    properties: { category: { type: "string", enum: EMAIL_CATEGORIES.map((c) => c.label) } },
  },
  routing: {
    type: "object",
    additionalProperties: false,
    required: ["tier", "reason"],
    properties: {
      tier: { type: "string", enum: ROUTING_TIERS.map((t) => t.label) },
      reason: { type: "string", description: "One short sentence." },
    },
  },
  quality: {
    type: "object",
    additionalProperties: false,
    required: ["criteria", "reason"],
    properties: {
      criteria: {
        type: "object",
        additionalProperties: false,
        required: QUALITY_CRITERIA.map((c) => c.id),
        properties: Object.fromEntries(
          QUALITY_CRITERIA.map((c) => [c.id, { type: "boolean", description: c.statement }]),
        ),
      },
      reason: { type: "string", description: "One short sentence." },
    },
  },
} as const;

export function parseStructured<T>(response: unknown, schema: z.ZodType<T>): { value: T; completion: ChatCompletion } {
  const completion = chatCompletionSchema.safeParse(response);
  if (!completion.success) {
    throw new ProviderError("invalid_output", "OpenAI response did not match the expected schema");
  }
  const message = completion.data.choices[0]!.message;
  if (message.refusal) throw new ProviderError("invalid_output", `OpenAI refused: ${message.refusal}`);
  if (!message.content) throw new ProviderError("invalid_output", "OpenAI returned an empty message");

  let json: unknown;
  try {
    json = JSON.parse(message.content);
  } catch {
    throw new ProviderError("invalid_output", "OpenAI returned content that is not valid JSON");
  }
  const value = schema.safeParse(json);
  if (!value.success) throw new ProviderError("invalid_output", "OpenAI output did not match the task schema");
  return { value: value.data, completion: completion.data };
}

function usage(c: ChatCompletion) {
  return c.usage ? { inputTokens: c.usage.prompt_tokens, outputTokens: c.usage.completion_tokens } : null;
}

export function parseQuality(response: unknown): ProviderOutput<ResponseQualityDecision> {
  const { value, completion } = parseStructured(response, qualitySchema);
  const criteria = QUALITY_CRITERIA.map((c) => ({
    id: c.id,
    label: c.label,
    critical: c.critical,
    passed: value.criteria[c.id],
    probability: null,
  }));
  return {
    decision: {
      outcome: qualityPolicy(value.criteria),
      criteria,
      failedCriteria: criteria.filter((c) => !c.passed).map((c) => c.label),
      reason: value.reason,
    },
    probabilities: null,
    confidence: null,
    model: completion.model,
    usage: usage(completion),
    raw: completion,
  };
}

export function createOpenAIProvider(config: Config): DecisionProvider & ReplyGenerator {
  const { apiKey, baseUrl, baselineModel } = config.openai;

  function requireKey(): string {
    if (!apiKey) throw new ProviderError("config", "OPENAI_API_KEY is not set on the backend");
    return apiKey;
  }

  async function complete(
    model: string | null,
    system: string,
    user: string,
    format?: { name: string; schema: object },
  ): Promise<unknown> {
    const key = requireKey();
    if (!model) throw new ProviderError("config", "OPENAI_BASELINE_MODEL is not set on the backend");
    return requestJson(`${baseUrl}/chat/completions`, {
      label: "OpenAI",
      apiKey: key,
      timeoutMs: config.providerTimeoutMs,
      body: {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(format && {
          response_format: {
            type: "json_schema",
            json_schema: { name: format.name, strict: true, schema: format.schema },
          },
        }),
      },
    });
  }

  return {
    async classifyEmail(email: EmailInput): Promise<ProviderOutput<EmailDetectionDecision>> {
      const system = `${EMAIL_DETECTION_INSTRUCTIONS}\n\nCategories:\n${optionList(EMAIL_CATEGORIES)}`;
      const res = await complete(baselineModel, system, renderEmail(email), {
        name: "email_classification",
        schema: JSON_SCHEMAS.classification,
      });
      const { value, completion } = parseStructured(res, classificationSchema);
      const label = EMAIL_CATEGORIES.find((c) => c.label === value.category)!.label;
      return {
        decision: { label },
        probabilities: null,
        confidence: null,
        model: completion.model,
        usage: usage(completion),
        raw: completion,
      };
    },

    async routeEmail(email: EmailInput): Promise<ProviderOutput<RawRoutingDecision>> {
      const system = `${MODEL_ROUTING_INSTRUCTIONS}\n\nTiers:\n${optionList(ROUTING_TIERS)}`;
      const res = await complete(baselineModel, system, renderEmail(email), {
        name: "model_routing",
        schema: JSON_SCHEMAS.routing,
      });
      const { value, completion } = parseStructured(res, routingSchema);
      const tier = ROUTING_TIERS.find((t) => t.label === value.tier)!;
      return {
        decision: { tier: tier.label, tierId: tier.id, reason: value.reason },
        probabilities: null,
        confidence: null,
        model: completion.model,
        usage: usage(completion),
        raw: completion,
      };
    },

    async evaluateReply(email: EmailInput, reply: string): Promise<ProviderOutput<ResponseQualityDecision>> {
      const statements = QUALITY_CRITERIA.map((c) => `- ${c.id}: ${c.statement}`).join("\n");
      const system = `${RESPONSE_QUALITY_INSTRUCTIONS}\nEvaluate each statement independently and return true or false for each.\n\nStatements:\n${statements}`;
      const res = await complete(baselineModel, system, renderEmailWithReply(email, reply), {
        name: "response_quality",
        schema: JSON_SCHEMAS.quality,
      });
      return parseQuality(res);
    },

    async generateReply(email: EmailInput, model: string) {
      const system =
        "You are a customer-facing team member at a small software company. Write a concise reply to the email below. Return only the reply text.";
      const res = await complete(model, system, renderEmail(email));
      const completion = chatCompletionSchema.safeParse(res);
      const text = completion.success ? completion.data.choices[0]!.message.content?.trim() : null;
      if (!completion.success || !text) {
        throw new ProviderError("invalid_output", "OpenAI returned no draft reply");
      }
      return { text, model: completion.data.model };
    },
  };
}
