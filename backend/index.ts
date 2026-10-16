import { createRoutes } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { createJevProvider } from "./providers/jev";
import { createOpenAIProvider } from "./providers/openai";

const config = loadConfig();
const db = openDatabase(config.databasePath);

const server = Bun.serve({
  port: config.port,
  routes: createRoutes({
    db,
    config,
    jev: createJevProvider(config),
    openai: createOpenAIProvider(config),
  }),
  fetch: () => Response.json({ error: { code: "not_found", message: "Route not found" } }, { status: 404 }),
});

console.log(`Backend listening on ${server.url} (CORS origin: ${config.frontendOrigin})`);
if (!config.jev.apiKey || !config.jev.model) console.warn("Jev is not configured: set TYPESAFE_API_KEY and JEV_MODEL");
if (!config.openai.apiKey || !config.openai.baselineModel) {
  console.warn("OpenAI is not configured: set OPENAI_API_KEY and OPENAI_BASELINE_MODEL");
}
