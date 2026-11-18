// Minimal live check of TypeSafe Jev: classifies one fictional email through the
// real adapter and prints the raw response. Usage: bun run spike:jev  (requires JEV=true)
import { loadConfig } from "../config";
import { createJevProvider } from "../providers/jev";

const config = loadConfig();
const jev = createJevProvider({ ...config, decisionEngine: "jev" });

const start = performance.now();
const result = await jev.classifyEmail({
  from: "accounts@contoso-example.net",
  subject: "Charged twice in September",
  body: "Our card was charged twice for the September invoice. Please refund the duplicate.",
});
console.log(`classifyEmail (${Math.round(performance.now() - start)} ms):`);
console.log(JSON.stringify(result, null, 2));
