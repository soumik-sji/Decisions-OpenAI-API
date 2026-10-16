import { ProviderError } from "./types";

const MAX_ERROR_LENGTH = 300;

/** Removes anything that looks like a credential before an error message leaves the backend. */
export function sanitizeError(message: string, secrets: (string | null)[] = []): string {
  let clean = message;
  for (const secret of secrets) {
    if (secret) clean = clean.split(secret).join("[redacted]");
  }
  clean = clean.replace(/\b(sk|ts)[-_][A-Za-z0-9_-]{6,}/g, "[redacted]");
  clean = clean.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return clean.length > MAX_ERROR_LENGTH ? `${clean.slice(0, MAX_ERROR_LENGTH)}…` : clean;
}

function errorDetail(body: unknown): string | null {
  if (typeof body === "string") return body || null;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error;
    if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
    if (typeof err === "string") return err;
    if (b.detail !== undefined) return JSON.stringify(b.detail);
  }
  return null;
}

type RequestOptions = {
  label: string;
  method?: "GET" | "POST";
  apiKey: string;
  body?: unknown;
  timeoutMs: number;
};

/** JSON request with timeout and typed errors. Never includes request headers in errors. */
export async function requestJson(url: string, opts: RequestOptions): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: opts.method ?? "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ProviderError("timeout", `${opts.label} did not respond within ${opts.timeoutMs} ms`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new ProviderError("network", sanitizeError(`${opts.label} request failed: ${message}`, [opts.apiKey]));
  }

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

  if (!response.ok) {
    const detail = errorDetail(parsed);
    throw new ProviderError(
      "http",
      sanitizeError(`${opts.label} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`, [opts.apiKey]),
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ProviderError("invalid_output", `${opts.label} returned a non-JSON response`);
  }
  return parsed;
}
