import { createRoutes } from "./app";
import { decisionEngineName, loadConfig, typedDecisionConfigured } from "./config";
import { openDatabase } from "./db";
import { initTracing, shutdownTracing } from "./lib/tracing";
import { createTypedDecisionProvider } from "./providers/engine";
import { createOpenAIProvider } from "./providers/openai";

initTracing();

const config = loadConfig();
const db = openDatabase(config.databasePath);

const server = Bun.serve({
  port: config.port,
  routes: createRoutes({
    db,
    config,
    decisions: createTypedDecisionProvider(config),
    openai: createOpenAIProvider(config),
  }),
  fetch: () => Response.json({ error: { code: "not_found", message: "Route not found" } }, { status: 404 }),
});

console.log(`Backend listening on ${server.url} (CORS origin: ${config.frontendOrigin})`);
console.log(`Left-side engine: ${decisionEngineName(config.decisionEngine)} (JEV=${config.decisionEngine === "jev"})`);
if (!typedDecisionConfigured(config)) {
  if (config.decisionEngine === "jev") {
    console.warn("Jev is not configured: set TYPESAFE_API_KEY and JEV_MODEL");
  } else {
    console.warn("OpenAI Decisions is not configured: set OPENAI_API_KEY");
  }
}
if (!config.openai.apiKey || !config.openai.baselineModel) {
  console.warn("OpenAI is not configured: set OPENAI_API_KEY and OPENAI_BASELINE_MODEL");
}

process.on("SIGINT", async () => {
  try { await shutdownTracing(); } catch {}
  process.exit(0);
});
process.on("SIGTERM", async () => {
  try { await shutdownTracing(); } catch {}
  process.exit(0);
});
