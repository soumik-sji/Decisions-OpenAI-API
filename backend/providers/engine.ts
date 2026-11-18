import type { Config } from "../config";
import { createDecisionsProvider } from "./decisions";
import { createJevProvider } from "./jev";
import type { DecisionProvider } from "./types";

/** Left-side provider: TypeSafe Jev when `JEV=true`, otherwise OpenAI Decisions. */
export function createTypedDecisionProvider(config: Config): DecisionProvider {
  return config.decisionEngine === "jev" ? createJevProvider(config) : createDecisionsProvider(config);
}
