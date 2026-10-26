import { createRoutes } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { createDecisionsProvider } from "./providers/decisions";
import { createOpenAIProvider } from "./providers/openai";

const config = loadConfig();
const db = openDatabase(config.databasePath);

const server = Bun.serve({
  port: config.port,
  routes: createRoutes({
    db,
    config,
    decisions: createDecisionsProvider(config),
    openai: createOpenAIProvider(config),
  }),
  fetch: () => Response.json({ error: { code: "not_found", message: "Route not found" } }, { status: 404 }),
});

console.log(`Backend listening on ${server.url} (CORS origin: ${config.frontendOrigin})`);
if (!config.openai.apiKey) console.warn("OpenAI Decisions is not configured: set OPENAI_API_KEY");
if (!config.openai.apiKey || !config.openai.baselineModel) {
  console.warn("OpenAI is not configured: set OPENAI_API_KEY and OPENAI_BASELINE_MODEL");
}
