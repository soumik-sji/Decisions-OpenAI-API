// Minimal live check of the OpenAI Decisions API: classifies one fictional email
// through the real adapter and prints the raw response. Usage: bun run spike:decisions
import { loadConfig } from "../config";
import { createDecisionsProvider } from "../providers/decisions";

const config = loadConfig();
const decisions = createDecisionsProvider(config);

const start = performance.now();
const result = await decisions.classifyEmail({
  from: "accounts@contoso-example.net",
  subject: "Charged twice in September",
  body: "Our card was charged twice for the September invoice. Please refund the duplicate.",
});
console.log(`classifyEmail (${Math.round(performance.now() - start)} ms):`);
console.log(JSON.stringify(result, null, 2));
