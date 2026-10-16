// Minimal live check of the Jev API: lists the account's models, then classifies one
// fictional email through the real adapter. Usage: bun run spike:jev
import { loadConfig } from "../config";
import { createJevProvider } from "../providers/jev";

const config = loadConfig();
const jev = createJevProvider(config);

const { models } = await jev.listModels();
console.log("Models available to this account:");
for (const m of models) console.log(`  ${m.name}  (${m.release_date})  ${m.description}`);

if (!config.jev.model) {
  console.log("\nSet JEV_MODEL to one of the names above, then rerun.");
  process.exit(0);
}

const start = performance.now();
const result = await jev.classifyEmail({
  from: "accounts@contoso-example.net",
  subject: "Charged twice in September",
  body: "Our card was charged twice for the September invoice. Please refund the duplicate.",
});
console.log(`\nclassifyEmail (${Math.round(performance.now() - start)} ms):`);
console.log(JSON.stringify({ ...result, raw: undefined }, null, 2));
