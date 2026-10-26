import { resolve } from "node:path";

// Bun loads backend/.env automatically. Secrets are read here and passed only to the
// provider adapters; they are never logged, persisted, or returned in responses.

export type Pricing = { inputPer1M: number; outputPer1M: number };

export type Config = {
  port: number;
  databasePath: string;
  frontendOrigin: string;
  providerTimeoutMs: number;
  /** USD per 1M tokens per side, from env. Null when not configured: cost is then unavailable. */
  pricing: { decisions: Pricing | null; openai: Pricing | null };
  decisions: { model: string | null };
  openai: {
    apiKey: string | null;
    baseUrl: string;
    baselineModel: string | null;
    tierModels: { fast: string | null; balanced: string | null; capable: string | null };
  };
};

/** Both prices must be set and valid; a partial price would produce a misleading cost. */
function pricing(prefix: string): Pricing | null {
  const input = Number(optional(`${prefix}_PRICE_INPUT_PER_1M`));
  const output = Number(optional(`${prefix}_PRICE_OUTPUT_PER_1M`));
  if (!optional(`${prefix}_PRICE_INPUT_PER_1M`) || !optional(`${prefix}_PRICE_OUTPUT_PER_1M`)) return null;
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return { inputPer1M: input, outputPer1M: output };
}

function optional(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(): Config {
  const databaseUrl = optional("DATABASE_URL") ?? "./data/demo.sqlite";
  return {
    port: Number(optional("PORT") ?? 4000),
    databasePath: databaseUrl === ":memory:" ? databaseUrl : resolve(import.meta.dir, databaseUrl),
    frontendOrigin: optional("FRONTEND_ORIGIN") ?? "http://localhost:3000",
    providerTimeoutMs: Number(optional("PROVIDER_TIMEOUT_MS") ?? 30_000),
    pricing: { decisions: pricing("DECISIONS"), openai: pricing("BASELINE") },
    decisions: {
      // OpenAI Decisions shares OPENAI_API_KEY and OPENAI_BASE_URL with the baseline.
      model: optional("OPENAI_DECISIONS_MODEL") ?? "gpt-6-luna",
    },
    openai: {
      apiKey: optional("OPENAI_API_KEY"),
      baseUrl: optional("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
      baselineModel: optional("OPENAI_BASELINE_MODEL"),
      tierModels: {
        fast: optional("OPENAI_FAST_MODEL"),
        balanced: optional("OPENAI_BALANCED_MODEL"),
        capable: optional("OPENAI_CAPABLE_MODEL"),
      },
    },
  };
}
