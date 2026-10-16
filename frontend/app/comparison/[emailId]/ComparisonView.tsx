"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import {
  USE_CASES,
  type CompareResponse,
  type Email,
  type ProcessingRun,
  type UseCase,
} from "@/lib/types";
import { USE_CASE_INFO } from "@/lib/usecases";
import {
  Card,
  ErrorBox,
  Spinner,
  buttonPrimary,
  formatDate,
  formatLatency,
} from "@/components/ui";
import { ProviderPanel } from "./ProviderPanel";
import { ComparisonSummary } from "./ComparisonSummary";

type EmailState =
  | { kind: "loading" }
  | { kind: "error"; message: string; notFound: boolean }
  | { kind: "ready"; email: Email };

export type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "error"; message: string }
  | { kind: "done"; data: CompareResponse };

const IDLE: RunState = { kind: "idle" };

export function ComparisonView({ emailId }: { emailId: string }) {
  const [emailState, setEmailState] = useState<EmailState>({ kind: "loading" });
  const [useCase, setUseCase] = useState<UseCase>("email_detection");
  // Kept per use case so switching tabs doesn't throw away a finished run.
  const [runs, setRuns] = useState<Partial<Record<UseCase, RunState>>>({});
  const [history, setHistory] = useState<ProcessingRun[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadEmail = useCallback(async () => {
    setEmailState({ kind: "loading" });
    try {
      setEmailState({ kind: "ready", email: await api.getEmail(emailId) });
    } catch (err) {
      const notFound =
        err !== null && typeof err === "object" && "status" in err && err.status === 404;
      setEmailState({ kind: "error", message: errorMessage(err), notFound });
    }
  }, [emailId]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.listRuns(emailId));
      setHistoryError(null);
    } catch (err) {
      setHistoryError(errorMessage(err));
    }
  }, [emailId]);

  useEffect(() => {
    loadEmail();
    loadHistory();
  }, [loadEmail, loadHistory]);

  async function run(target: UseCase) {
    setRuns((r) => ({ ...r, [target]: { kind: "running" } }));
    try {
      const data = await api.compare(emailId, target);
      setRuns((r) => ({ ...r, [target]: { kind: "done", data } }));
    } catch (err) {
      setRuns((r) => ({
        ...r,
        [target]: { kind: "error", message: errorMessage(err) },
      }));
    }
    loadHistory();
  }

  if (emailState.kind === "loading") {
    return (
      <Card className="flex items-center gap-3 text-sm text-zinc-600">
        <Spinner /> Loading email…
      </Card>
    );
  }

  if (emailState.kind === "error") {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <ErrorBox
          title={emailState.notFound ? "Email not found" : "Couldn't load email"}
          message={emailState.message}
          onRetry={emailState.notFound ? undefined : loadEmail}
        />
        <Link href="/dashboard" className="text-sm font-medium underline">
          Back to inbox
        </Link>
      </div>
    );
  }

  const { email } = emailState;
  const info = USE_CASE_INFO[useCase];
  const current = runs[useCase] ?? IDLE;
  const running = current.kind === "running";
  const result = current.kind === "done" ? current.data : null;
  const caseHistory = history?.filter((r) => r.useCase === useCase) ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Inbox
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Jev vs. OpenAI</h1>
        </div>
        <span className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
          Same input for both systems
        </span>
      </div>

      {/* 1. Selected email */}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Selected email
        </p>
        <p className="mt-2 text-lg font-semibold">{email.subject}</p>
        <p className="text-sm text-zinc-500">
          From {email.fromAddress} · {formatDate(email.createdAt)}
        </p>
        <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
          {email.body}
        </p>
      </Card>

      {/* 2. Use-case selector + plain-language explanation + run button */}
      <Card className="flex flex-col gap-4">
        <div role="tablist" aria-label="Use case" className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {USE_CASES.map((uc) => (
            <button
              key={uc}
              role="tab"
              type="button"
              aria-selected={uc === useCase}
              onClick={() => setUseCase(uc)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                uc === useCase
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {USE_CASE_INFO[uc].label}
            </button>
          ))}
        </div>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="font-medium">{info.question}</p>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">{info.explanation}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Possible answers: {info.outputs.join(" · ")}
            </p>
          </div>
          <button
            type="button"
            className={`${buttonPrimary} shrink-0`}
            disabled={running}
            onClick={() => run(useCase)}
          >
            {running && <Spinner />}
            {running ? "Running…" : result ? "Rerun comparison" : "Run comparison"}
          </button>
        </div>
      </Card>

      {current.kind === "error" && (
        <ErrorBox
          title="Comparison failed"
          message={`${current.message} No results are shown. Nothing was substituted.`}
          onRetry={() => run(useCase)}
        />
      )}

      {/* 3–4. Both panels, always visible together */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ProviderPanel
          provider="jev"
          useCase={useCase}
          state={current}
          result={result?.results.jev ?? null}
        />
        <ProviderPanel
          provider="openai"
          useCase={useCase}
          state={current}
          result={result?.results.openai ?? null}
        />
      </div>

      {/* 5–8. Agreement, correctness, validity, latency */}
      {result && <ComparisonSummary data={result} />}

      <Card>
        <p className="text-sm font-semibold">Previous runs · {info.label}</p>
        {historyError ? (
          <p className="mt-2 text-sm text-red-700">Couldn&apos;t load run history: {historyError}</p>
        ) : history === null ? (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        ) : caseHistory.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No runs yet for this use case.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-medium">When</th>
                <th className="py-1 font-medium">Provider</th>
                <th className="py-1 font-medium">Status</th>
                <th className="py-1 font-medium">Decision</th>
                <th className="py-1 text-right font-medium">Latency</th>
              </tr>
            </thead>
            <tbody>
              {caseHistory.slice(0, 10).map((r) => (
                <tr key={r.id} className="border-t border-zinc-100">
                  <td className="py-1.5 text-zinc-600">{formatDate(r.createdAt)}</td>
                  <td className="py-1.5">{r.provider === "jev" ? "Jev" : "OpenAI"}</td>
                  <td className="py-1.5">{r.status.replace("_", " ")}</td>
                  <td className="py-1.5">{r.decision ?? r.error ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {formatLatency(r.latencyMs) ?? "unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
