import type {
  CompareResponse,
  CreateEmailRequest,
  Email,
  ProcessingRun,
  UseCase,
} from "./types";

// The browser only ever talks to our backend. Provider keys never reach here.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed (HTTP ${res.status}).`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error.";
}

export const api = {
  listEmails: () => request<Email[]>("/api/emails"),

  getEmail: (id: string) =>
    request<Email>(`/api/emails/${encodeURIComponent(id)}`),

  createEmail: (body: CreateEmailRequest) =>
    request<Email>("/api/emails", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  compare: (id: string, useCase: UseCase) =>
    request<CompareResponse>(`/api/emails/${encodeURIComponent(id)}/compare`, {
      method: "POST",
      body: JSON.stringify({ useCase }),
    }),

  listRuns: (id: string) =>
    request<ProcessingRun[]>(`/api/emails/${encodeURIComponent(id)}/runs`),
};
