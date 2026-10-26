import type {
  CompareResponse,
  CreateEmailRequest,
  Email,
  ProcessingRun,
  Provider,
  ProviderResult,
  ProviderStatus,
  UseCase,
} from "./types";

// The browser only ever talks to our backend. Provider keys never reach here.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  // Null when the backend could not be reached at all.
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      `Can't reach the backend at ${API_BASE_URL}. Is it running?`,
      null,
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(
        `Backend returned a non-JSON response (HTTP ${res.status}).`,
        res.status,
      );
    }
  }

  if (!res.ok) {
    const message =
      data !== null &&
      typeof data === "object" &&
      "error" in data
        ? backendErrorMessage(data.error)
        : null;
    throw new ApiError(message ?? `Request failed (HTTP ${res.status}).`, res.status);
  }

  return data as T;
}

// The backend wraps errors as { error: { code, message } }.
function backendErrorMessage(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return null;
}

/* ---- Backend wire format (backend/schemas/index.ts, backend/db/queries.ts) ----
 * Mapped here into the UI's types so components never see the raw shape. */

type BackendEmail = {
  id: string;
  from: string;
  subject: string;
  body: string;
  expectedLabel: string | null;
  createdAt: string;
};

type BackendErrorKind = "config" | "timeout" | "network" | "http" | "invalid_output";

type BackendDecision = {
  label?: string;
  tier?: string;
  model?: string | null;
  outcome?: string;
  reason?: string | null;
  failedCriteria?: string[];
};

type BackendProviderResult = {
  provider: Provider;
  status: "completed" | "failed";
  decision: BackendDecision | null;
  probabilities: Record<string, number> | null;
  latencyMs: number | null;
  model: string | null;
  usage: { inputTokens: number; outputTokens: number | null } | null;
  costUsd: number | null;
  error: string | null;
  errorKind: BackendErrorKind | null;
};

type BackendCompareResponse = {
  emailId: string;
  useCase: UseCase;
  results: Record<Provider, BackendProviderResult>;
  comparison: {
    agreement: boolean | null;
    groundTruthCorrectness: {
      expected: string;
      decisions: boolean | null;
      openai: boolean | null;
    } | null;
  };
};

type BackendRun = {
  id: string;
  emailId: string;
  useCase: UseCase;
  provider: Provider;
  status: "completed" | "failed";
  output: { decision: BackendDecision | null } | null;
  latencyMs: number | null;
  error: string | null;
  errorKind: BackendErrorKind | null;
  createdAt: string;
};

function toEmail(e: BackendEmail): Email {
  return {
    id: e.id,
    fromAddress: e.from,
    subject: e.subject,
    body: e.body,
    expectedLabel: e.expectedLabel,
    createdAt: e.createdAt,
  };
}

function toStatus(
  status: "completed" | "failed",
  kind: BackendErrorKind | null,
): ProviderStatus {
  if (status === "completed") return "success";
  if (kind === "timeout" || kind === "invalid_output") return kind;
  return "error";
}

/** The single display value for each use case's decision. */
function decisionText(useCase: UseCase, d: BackendDecision | null): string | null {
  if (!d) return null;
  switch (useCase) {
    case "email_detection":
      return d.label ?? null;
    case "model_routing":
      return d.tier ?? null;
    case "response_quality":
      return d.outcome ?? null;
  }
}

function toProviderResult(useCase: UseCase, r: BackendProviderResult): ProviderResult {
  return {
    provider: r.provider,
    status: toStatus(r.status, r.errorKind),
    decision: decisionText(useCase, r.decision),
    reason: r.decision?.reason ?? null,
    failedCriteria:
      useCase === "response_quality" ? (r.decision?.failedCriteria ?? null) : null,
    probabilities: r.probabilities,
    routedModel: useCase === "model_routing" ? (r.decision?.model ?? null) : null,
    model: r.model,
    latencyMs: r.latencyMs,
    usage: r.usage ?? null,
    costUsd: r.costUsd ?? null,
    error: r.error,
  };
}

function toCompareResponse(r: BackendCompareResponse): CompareResponse {
  const truth = r.comparison.groundTruthCorrectness;
  return {
    emailId: r.emailId,
    useCase: r.useCase,
    results: {
      decisions: toProviderResult(r.useCase, r.results.decisions),
      openai: toProviderResult(r.useCase, r.results.openai),
    },
    comparison: {
      agreement: r.comparison.agreement,
      expected: truth?.expected ?? null,
      decisionsMatchesExpected: truth?.decisions ?? null,
      openaiMatchesExpected: truth?.openai ?? null,
    },
  };
}

function toRun(r: BackendRun): ProcessingRun {
  return {
    id: r.id,
    emailId: r.emailId,
    useCase: r.useCase,
    provider: r.provider,
    status: toStatus(r.status, r.errorKind),
    decision: decisionText(r.useCase, r.output?.decision ?? null),
    latencyMs: r.latencyMs,
    error: r.error,
    createdAt: r.createdAt,
  };
}


export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error.";
}

export const api = {
  listEmails: async () =>
    (await request<{ emails: BackendEmail[] }>("/api/emails")).emails.map(toEmail),

  getEmail: async (id: string) =>
    toEmail(
      (await request<{ email: BackendEmail }>(`/api/emails/${encodeURIComponent(id)}`))
        .email,
    ),

  createEmail: async (body: CreateEmailRequest) =>
    toEmail(
      (
        await request<{ email: BackendEmail }>("/api/emails", {
          method: "POST",
          body: JSON.stringify({
            from: body.fromAddress,
            subject: body.subject,
            body: body.body,
            expectedLabel: body.expectedLabel,
          }),
        })
      ).email,
    ),

  compare: async (id: string, useCase: UseCase) =>
    toCompareResponse(
      await request<BackendCompareResponse>(
        `/api/emails/${encodeURIComponent(id)}/compare`,
        { method: "POST", body: JSON.stringify({ useCase }) },
      ),
    ),

  listRuns: async (id: string) =>
    (
      await request<{ runs: BackendRun[] }>(
        `/api/emails/${encodeURIComponent(id)}/runs`,
      )
    ).runs.map(toRun),
};
