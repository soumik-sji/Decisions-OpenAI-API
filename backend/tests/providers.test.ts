import { afterAll, describe, expect, test } from "bun:test";
import { requestJson, sanitizeError } from "../providers/http";
import { parseChoice, parseQuality as parseDecisionsQuality } from "../providers/decisions";
import { parseQuality as parseOpenAIQuality, parseStructured } from "../providers/openai";
import { ProviderError } from "../providers/types";
import { EMAIL_CATEGORIES, qualityPolicy } from "../usecases/definitions";
import { z } from "zod";

const decisionsChoice = (choice: string) => ({
  answers: [
    {
      type: "choice",
      name: "category",
      choice,
      confidence: 0.8,
      probabilities: [
        { value: "billing_question", probability: 0.8 },
        { value: "support_request", probability: 0.2 },
      ],
    },
  ],
  usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
});

function expectProviderError(fn: () => unknown, kind: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe(kind as ProviderError["kind"]);
    return;
  }
  throw new Error("expected a ProviderError");
}

describe("OpenAI Decisions normalization", () => {
  test("maps a choice answer to the shared category", () => {
    const r = parseChoice(decisionsChoice("billing_question"), "category", EMAIL_CATEGORIES, "gpt-6-luna");
    expect(r.option.label).toBe("Billing question");
    expect(r.confidence).toBe(0.8);
    expect(r.probabilities).toEqual({ "Billing question": 0.8, "Support request": 0.2 });
    // No model echo in the response: falls back to the requested model.
    expect(r.model).toBe("gpt-6-luna");
  });

  test("rejects a choice outside the allowed set", () => {
    expectProviderError(
      () => parseChoice(decisionsChoice("marketing"), "category", EMAIL_CATEGORIES, "m"),
      "invalid_output",
    );
  });

  test("rejects a response missing the expected answer", () => {
    const res = { ...decisionsChoice("other"), answers: [{ type: "predicate", name: "wrong", probability: 0.4 }] };
    expectProviderError(() => parseChoice(res, "category", EMAIL_CATEGORIES, "m"), "invalid_output");
  });

  test("reports a refusal as invalid output instead of guessing", () => {
    const res = { answers: [{ type: "refusal", name: "category" }] };
    expectProviderError(() => parseChoice(res, "category", EMAIL_CATEGORIES, "m"), "invalid_output");
  });

  test("rejects a malformed response", () => {
    expectProviderError(() => parseChoice({ answers: "nope" }, "category", EMAIL_CATEGORIES, "m"), "invalid_output");
  });

  test("quality gate applies the 0.5 threshold and shared policy", () => {
    const res = {
      answers: [
        { type: "predicate", name: "addresses_request", probability: 0.9 },
        { type: "predicate", name: "accurate_and_grounded", probability: 0.2 },
        { type: "predicate", name: "professional_tone", probability: 0.95 },
        { type: "predicate", name: "safe_to_send", probability: 0.7 },
      ],
      usage: { input_tokens: 200 },
    };
    const out = parseDecisionsQuality(res, "gpt-6-luna");
    expect(out.decision.outcome).toBe("Human review");
    expect(out.decision.failedCriteria).toEqual(["Grounded in the email"]);
    expect(out.decision.criteria.find((c) => c.id === "accurate_and_grounded")?.probability).toBe(0.2);
    expect(out.confidence).toBeNull();
    expect(out.decision.reason).toBeNull();
    // Output tokens are not reported by Decisions: unavailable, not 0.
    expect(out.usage).toEqual({ inputTokens: 200, outputTokens: null });
  });
});

const completion = (content: string | null, refusal: string | null = null) => ({
  model: "gpt-test",
  choices: [{ message: { content, refusal }, finish_reason: "stop" }],
  usage: { prompt_tokens: 50, completion_tokens: 10 },
});

describe("OpenAI normalization", () => {
  const schema = z.object({ category: z.enum(["Other", "Sales inquiry"]) });

  test("parses valid structured output", () => {
    const { value } = parseStructured(completion('{"category":"Other"}'), schema);
    expect(value.category).toBe("Other");
  });

  test("refusal, empty, non-JSON, and off-schema outputs are invalid", () => {
    expectProviderError(() => parseStructured(completion(null, "I can't help"), schema), "invalid_output");
    expectProviderError(() => parseStructured(completion(null), schema), "invalid_output");
    expectProviderError(() => parseStructured(completion("not json"), schema), "invalid_output");
    expectProviderError(() => parseStructured(completion('{"category":"Marketing"}'), schema), "invalid_output");
  });

  test("quality gate has no probabilities and keeps the reason", () => {
    const out = parseOpenAIQuality(
      completion(
        JSON.stringify({
          criteria: {
            addresses_request: false,
            accurate_and_grounded: true,
            professional_tone: true,
            safe_to_send: true,
          },
          reason: "Does not answer the question.",
        }),
      ),
    );
    expect(out.decision.outcome).toBe("Retry / improve");
    expect(out.probabilities).toBeNull();
    expect(out.decision.criteria.every((c) => c.probability === null)).toBe(true);
    expect(out.usage).toEqual({ inputTokens: 50, outputTokens: 10 });
  });
});

describe("quality policy", () => {
  const all = { addresses_request: true, accurate_and_grounded: true, professional_tone: true, safe_to_send: true };
  test("all pass -> Accept", () => expect(qualityPolicy(all)).toBe("Accept"));
  test("non-critical failure -> Retry / improve", () =>
    expect(qualityPolicy({ ...all, professional_tone: false })).toBe("Retry / improve"));
  test("critical failure -> Human review", () =>
    expect(qualityPolicy({ ...all, professional_tone: false, safe_to_send: false })).toBe("Human review"));
});

const unexpected = (): never => {
  throw new Error("expected the request to fail");
};

describe("HTTP helper", () => {
  const server = Bun.serve({
    port: 0,
    routes: {
      "/slow": async () => {
        await Bun.sleep(500);
        return Response.json({ ok: true });
      },
      "/401": () => Response.json({ error: { message: "Incorrect API key provided: sk-proj-abcdef123456" } }, { status: 401 }),
      "/html": () => new Response("<html>oops</html>"),
    },
  });
  afterAll(() => server.stop(true));

  test("times out and reports a timeout error", async () => {
    const err = await requestJson(`${server.url}slow`, { label: "Test", apiKey: "k", timeoutMs: 50 }).then(unexpected, (e: ProviderError) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("timeout");
  });

  test("HTTP errors are reported with secrets redacted", async () => {
    const err = await requestJson(`${server.url}401`, { label: "Test", apiKey: "k", timeoutMs: 1000 }).then(unexpected, (e: ProviderError) => e);
    expect(err.kind).toBe("http");
    expect(err.message).toContain("HTTP 401");
    expect(err.message).not.toContain("sk-proj-abcdef123456");
  });

  test("non-JSON success is invalid output", async () => {
    const err = await requestJson(`${server.url}html`, { label: "Test", apiKey: "k", timeoutMs: 1000 }).then(unexpected, (e: ProviderError) => e);
    expect(err.kind).toBe("invalid_output");
  });

  test("sanitizeError redacts configured secrets and bearer tokens", () => {
    const out = sanitizeError("failed with my-secret-value and Bearer abc.def", ["my-secret-value"]);
    expect(out).not.toContain("my-secret-value");
    expect(out).not.toContain("abc.def");
  });
});
