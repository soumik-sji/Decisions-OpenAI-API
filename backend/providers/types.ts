import type {
  EmailDetectionDecision,
  ErrorKind,
  ModelRoutingDecision,
  ResponseQualityDecision,
  Usage,
} from "../schemas";
import type { EmailInput } from "../usecases/definitions";

export class ProviderError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ProviderOutput<D> = {
  decision: D;
  probabilities: Record<string, number> | null;
  confidence: number | null;
  model: string;
  usage: Usage | null;
  /** The provider's validated response body, kept for the decision trace. */
  raw: unknown;
};

/** Routing decision before the tier is resolved to a configured model ID. */
export type RawRoutingDecision = Omit<ModelRoutingDecision, "model">;

export interface DecisionProvider {
  classifyEmail(email: EmailInput): Promise<ProviderOutput<EmailDetectionDecision>>;
  routeEmail(email: EmailInput): Promise<ProviderOutput<RawRoutingDecision>>;
  evaluateReply(email: EmailInput, reply: string): Promise<ProviderOutput<ResponseQualityDecision>>;
}

export interface ReplyGenerator {
  generateReply(email: EmailInput, model: string): Promise<{ text: string; model: string }>;
}
