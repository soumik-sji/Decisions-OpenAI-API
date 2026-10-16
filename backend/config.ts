import { resolve } from "node:path";

// Bun loads backend/.env automatically. Secrets are read here and passed only to the
// provider adapters; they are never logged, persisted, or returned in responses.

export type Config = {
  port: number;
  databasePath: string;
  frontendOrigin: string;
  providerTimeoutMs: number;
  jev: { apiKey: string | null; model: string | null; baseUrl: string };
  openai: {
    apiKey: string | null;
    baseUrl: string;
    baselineModel: string | null;
    tierModels: { fast: string | null; balanced: string | null; capable: string | null };
  };
};

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
    jev: {
      apiKey: optional("TYPESAFE_API_KEY"),
      model: optional("JEV_MODEL"),
      baseUrl: optional("TYPESAFE_BASE_URL") ?? "https://api.typesafe.ai",
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
