import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { createRoutes } from "../app";
import type { Config } from "../config";
import { openDatabase } from "../db";
import { insertEmail } from "../db/queries";
import { ProviderError, type DecisionProvider, type ReplyGenerator } from "../providers/types";
import { latencyStats } from "../services/benchmarks";
import { computeCostUsd, type ComparisonResponse } from "../schemas";

// Test doubles for the provider adapters. These exist only in tests and are never
// reachable from the running app.

const config: Config = {
  port: 0,
  databasePath: ":memory:",
  frontendOrigin: "http://localhost:3000",
  providerTimeoutMs: 1000,
  pricing: { decisions: null, openai: null },
  decisions: { model: "decisions-test" },
  openai: {
    apiKey: "test",
    baseUrl: "http://unused",
    baselineModel: "gpt-test",
    tierModels: { fast: "fast-model", balanced: "balanced-model", capable: null },
  },
};

const fakeOutput = <D>(decision: D, model: string) => ({
  decision,
  probabilities: null,
  confidence: null,
  model,
  usage: null,
  raw: {},
});

function fakeProvider(name: string, label: string, opts: { fail?: ProviderError } = {}): DecisionProvider & ReplyGenerator {
  const maybeFail = () => {
    if (opts.fail) throw opts.fail;
  };
  return {
    async classifyEmail() {
      maybeFail();
      return fakeOutput({ label: label as "Other" }, name);
    },
    async routeEmail() {
      maybeFail();
      return fakeOutput({ tier: "Fast / low-cost" as const, tierId: "fast" as const, reason: null }, name);
    },
    async evaluateReply() {
      maybeFail();
      return fakeOutput(
        { outcome: "Accept" as const, criteria: [], failedCriteria: [], reason: null },
        name,
      );
    },
    async generateReply() {
      return { text: "generated draft", model: "balanced-model" };
    },
  };
}

let db: Database;
let routes: ReturnType<typeof createRoutes>;
let server: ReturnType<typeof Bun.serve>;

function start(decisions: DecisionProvider, openai: DecisionProvider & ReplyGenerator) {
  server?.stop(true);
  db = openDatabase(":memory:");
  routes = createRoutes({ db, config, decisions, openai });
  server = Bun.serve({ port: 0, routes });
}

const api = (path: string, init?: RequestInit) => fetch(new URL(path, server.url), init);
const post = (path: string, body: unknown) =>
  api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

afterAll(() => server?.stop(true));

describe("emails API", () => {
  beforeEach(() => start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Other")));

  test("health reports configuration without secrets", async () => {
    const res = await api("/api/health");
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('"test"');
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  test("creates, lists, and gets an email", async () => {
    const created = await post("/api/emails", {
      from: "a@example.com",
      subject: "Hi",
      body: "Hello",
      expectedLabel: "Other",
    });
    expect(created.status).toBe(201);
    const { email } = await created.json() as any;
    expect(email.expectedLabel).toBe("Other");

    const list = await (await api("/api/emails")).json() as any;
    expect(list.emails).toHaveLength(1);
    expect((await api(`/api/emails/${email.id}`)).status).toBe(200);
    expect((await api("/api/emails/missing")).status).toBe(404);
  });

  test("rejects invalid payloads with a consistent error shape", async () => {
    const missing = await post("/api/emails", { from: "a@example.com", subject: "" });
    expect(missing.status).toBe(400);
    expect((await missing.json() as any).error.code).toBe("validation_error");

    const badLabel = await post("/api/emails", { from: "a", subject: "s", body: "b", expectedLabel: "Marketing" });
    expect(badLabel.status).toBe(400);

    const badJson = await api("/api/emails", { method: "POST", body: "{" });
    expect((await badJson.json() as any).error.code).toBe("invalid_json");
  });

  test("CORS preflight allows only the configured origin", async () => {
    const res = await api("/api/emails", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});

describe("compare", () => {
  test("agreement and ground-truth correctness are computed separately", async () => {
    start(fakeProvider("decisions", "Billing question"), fakeProvider("openai", "Sales inquiry"));
    const email = insertEmail(db, { from: "a", subject: "s", body: "b", expectedLabel: "Billing question" });
    const res = await post(`/api/emails/${email.id}/compare`, { useCase: "email_detection" });
    const body = (await res.json() as any) as ComparisonResponse;
    expect(res.status).toBe(200);
    expect(body.comparison.agreement).toBe(false);
    expect(body.comparison.groundTruthCorrectness).toEqual({ expected: "Billing question", decisions: true, openai: false });
    expect(body.results.decisions.status).toBe("completed");
    expect(body.results.decisions.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("a failed provider is reported as failed, never replaced", async () => {
    start(
      fakeProvider("decisions", "Other", { fail: new ProviderError("timeout", "OpenAI Decisions did not respond within 1000 ms") }),
      fakeProvider("openai", "Other"),
    );
    const email = insertEmail(db, { from: "a", subject: "s", body: "b", expectedLabel: "Other" });
    const body = (await (await post(`/api/emails/${email.id}/compare`, { useCase: "email_detection" })).json() as any) as ComparisonResponse;
    expect(body.results.decisions.status).toBe("failed");
    expect(body.results.decisions.decision).toBeNull();
    expect(body.results.decisions.errorKind).toBe("timeout");
    expect(body.results.openai.status).toBe("completed");
    expect(body.comparison.agreement).toBeNull();
    expect(body.comparison.groundTruthCorrectness).toEqual({ expected: "Other", decisions: null, openai: true });

    const runs = (await (await api(`/api/emails/${email.id}/runs`)).json() as any).runs;
    expect(runs).toHaveLength(2);
    expect(runs.find((r: { provider: string }) => r.provider === "decisions").error).toContain("did not respond");
  });

  test("config errors report no latency", async () => {
    start(
      fakeProvider("decisions", "Other", { fail: new ProviderError("config", "OPENAI_DECISIONS_MODEL is not set on the backend") }),
      fakeProvider("openai", "Other"),
    );
    const email = insertEmail(db, { from: "a", subject: "s", body: "b" });
    const body = (await (await post(`/api/emails/${email.id}/compare`, { useCase: "email_detection" })).json() as any) as ComparisonResponse;
    expect(body.results.decisions.latencyMs).toBeNull();
    expect(body.comparison.groundTruthCorrectness).toBeNull();
  });

  test("model routing resolves the tier to the configured model", async () => {
    start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Other"));
    const email = insertEmail(db, { from: "a", subject: "s", body: "b" });
    const body = (await (await post(`/api/emails/${email.id}/compare`, { useCase: "model_routing" })).json() as any) as ComparisonResponse;
    expect(body.results.decisions.decision).toMatchObject({ tierId: "fast", model: "fast-model" });
    expect(body.comparison.agreement).toBe(true);
  });

  test("quality gate uses one shared candidate reply for both providers", async () => {
    start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Other"));
    const email = insertEmail(db, { from: "a", subject: "s", body: "b" });
    const body = (await (await post(`/api/emails/${email.id}/compare`, { useCase: "response_quality" })).json() as any) as ComparisonResponse;
    expect(body.input.candidateReply).toBe("generated draft");
    expect(body.input.candidateSource).toBe("generated by balanced-model");

    const withOverride = (await (
      await post(`/api/emails/${email.id}/compare`, { useCase: "response_quality", candidateReply: "custom" })
    ).json() as any) as ComparisonResponse;
    expect(withOverride.input.candidateSource).toBe("request");
  });

  test("unknown use case is rejected", async () => {
    start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Other"));
    const email = insertEmail(db, { from: "a", subject: "s", body: "b" });
    expect((await post(`/api/emails/${email.id}/compare`, { useCase: "nope" })).status).toBe(400);
    expect((await post(`/api/emails/missing/compare`, { useCase: "email_detection" })).status).toBe(404);
  });
});

describe("cost", () => {
  const price = { inputPer1M: 2, outputPer1M: 8 };

  test("computed from real usage and configured pricing", () => {
    expect(computeCostUsd({ inputTokens: 1_000, outputTokens: 500 }, price)).toBeCloseTo(0.006);
  });

  test("unavailable without usage or pricing, never zero", () => {
    expect(computeCostUsd(null, price)).toBeNull();
    expect(computeCostUsd({ inputTokens: 1_000, outputTokens: 10 }, null)).toBeNull();
  });

  test("unavailable when output tokens are unreported but output is priced", () => {
    expect(computeCostUsd({ inputTokens: 1_000, outputTokens: null }, price)).toBeNull();
    expect(computeCostUsd({ inputTokens: 1_000, outputTokens: null }, { inputPer1M: 2, outputPer1M: 0 })).toBeCloseTo(0.002);
  });

  test("compare returns null cost when pricing is not configured", async () => {
    start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Other"));
    const email = insertEmail(db, { from: "a", subject: "s", body: "b" });
    const res = await post(`/api/emails/${email.id}/compare`, { useCase: "email_detection" });
    const body = (await res.json()) as ComparisonResponse;
    expect(body.results.decisions.costUsd).toBeNull();
    expect(body.results.openai.costUsd).toBeNull();
  });
});

describe("benchmarks", () => {
  test("accuracy uses labelled cases only; agreement is separate", async () => {
    start(fakeProvider("decisions", "Other"), fakeProvider("openai", "Sales inquiry"));
    insertEmail(db, { from: "a", subject: "1", body: "b", expectedLabel: "Other" });
    insertEmail(db, { from: "a", subject: "2", body: "b", expectedLabel: "Sales inquiry" });
    insertEmail(db, { from: "a", subject: "3", body: "b" }); // unlabelled: skipped by default

    const res = await post("/api/benchmarks/run", { useCase: "email_detection", repeats: 2 });
    const summary = await res.json() as any;
    expect(res.status).toBe(200);
    expect(summary.evaluations).toBe(4);
    expect(summary.decisions.accuracy).toEqual({ correct: 2, evaluated: 4, rate: 0.5 });
    expect(summary.openai.accuracy).toEqual({ correct: 2, evaluated: 4, rate: 0.5 });
    expect(summary.agreement).toEqual({ agreed: 0, comparable: 4, rate: 0 });
    expect(summary.cost).toBeNull();

    const all = await (await api("/api/benchmarks/results?useCase=model_routing")).json() as any;
    expect(all.results[0].evaluations).toBe(0);
    expect(all.results[0].agreement.rate).toBeNull();
    expect(all.results[0].decisions.accuracy).toBeNull();
  });

  test("latency stats", () => {
    expect(latencyStats([])).toEqual({ samples: 0, medianMs: null, meanMs: null });
    expect(latencyStats([30, 10, 20, 40])).toEqual({ samples: 4, medianMs: 25, meanMs: 25 });
  });
});
