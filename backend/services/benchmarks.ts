import { getEmail, listEmails, listEvaluations, type Email, type EvaluationJoinedRow } from "../db/queries";
import { USE_CASES, type UseCase } from "../usecases/definitions";
import { AppError, compare, LATENCY_METHOD, type Deps } from "./compare";

type LatencyStats = { samples: number; medianMs: number | null; meanMs: number | null };

type ProviderSummary = {
  completed: number;
  failed: number;
  invalidOutputs: number;
  timeouts: number;
  /** Completed runs only; failed runs have no comparable latency. */
  latency: LatencyStats;
  /** Email Detector with expected labels only. Null when no labelled, completed run exists. */
  accuracy: { correct: number; evaluated: number; rate: number | null } | null;
};

export type BenchmarkSummary = {
  useCase: UseCase;
  benchmarkId: string | null;
  evaluations: number;
  jev: ProviderSummary;
  openai: ProviderSummary;
  /** How often both providers made the same decision. Not a measure of correctness. */
  agreement: { agreed: number; comparable: number; rate: number | null };
  latencyMethod: string;
  cost: null;
  costNote: string;
};

export function latencyStats(values: number[]): LatencyStats {
  if (values.length === 0) return { samples: 0, medianMs: null, meanMs: null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return { samples: sorted.length, medianMs: Math.round(median), meanMs: Math.round(mean) };
}

function providerSummary(rows: EvaluationJoinedRow[], p: "jev" | "openai", useCase: UseCase): ProviderSummary {
  const status = (r: EvaluationJoinedRow) => (p === "jev" ? r.jev_status : r.openai_status);
  const kind = (r: EvaluationJoinedRow) => (p === "jev" ? r.jev_error_kind : r.openai_error_kind);
  const latency = (r: EvaluationJoinedRow) => (p === "jev" ? r.jev_latency_ms : r.openai_latency_ms);
  const correct = (r: EvaluationJoinedRow) => (p === "jev" ? r.jev_correct : r.openai_correct);

  const completed = rows.filter((r) => status(r) === "completed");
  const graded = rows.filter((r) => correct(r) !== null);
  const numCorrect = graded.filter((r) => correct(r) === 1).length;

  return {
    completed: completed.length,
    failed: rows.length - completed.length,
    invalidOutputs: rows.filter((r) => kind(r) === "invalid_output").length,
    timeouts: rows.filter((r) => kind(r) === "timeout").length,
    latency: latencyStats(completed.map(latency).filter((v): v is number => v !== null)),
    accuracy:
      useCase === "email_detection"
        ? {
            correct: numCorrect,
            evaluated: graded.length,
            rate: graded.length ? numCorrect / graded.length : null,
          }
        : null,
  };
}

export function summarize(useCase: UseCase, rows: EvaluationJoinedRow[], benchmarkId: string | null): BenchmarkSummary {
  const comparable = rows.filter((r) => r.agreement !== null);
  const agreed = comparable.filter((r) => r.agreement === 1).length;
  return {
    useCase,
    benchmarkId,
    evaluations: rows.length,
    jev: providerSummary(rows, "jev", useCase),
    openai: providerSummary(rows, "openai", useCase),
    agreement: { agreed, comparable: comparable.length, rate: comparable.length ? agreed / comparable.length : null },
    latencyMethod: LATENCY_METHOD,
    cost: null,
    costNote: "Unavailable: no verified per-model pricing is configured. Token usage is stored per run.",
  };
}

export function results(deps: Deps, filter: { useCase?: UseCase; benchmarkId?: string }): BenchmarkSummary[] {
  const useCases = filter.useCase ? [filter.useCase] : USE_CASES;
  return useCases.map((u) =>
    summarize(u, listEvaluations(deps.db, { useCase: u, benchmarkId: filter.benchmarkId }), filter.benchmarkId ?? null),
  );
}

function defaultEmails(deps: Deps, useCase: UseCase): Email[] {
  const all = listEmails(deps.db);
  if (useCase === "email_detection") return all.filter((e) => e.expectedLabel);
  // Stored candidate replies keep the quality gate repeatable across runs.
  if (useCase === "response_quality") return all.filter((e) => e.candidateReply);
  return all;
}

/** Runs the curated set sequentially (to stay within provider rate limits) and summarizes it. */
export async function runBenchmark(
  deps: Deps,
  req: { useCase: UseCase; emailIds?: string[]; repeats: number },
): Promise<BenchmarkSummary> {
  const emails = req.emailIds
    ? req.emailIds.map((id) => {
        const e = getEmail(deps.db, id);
        if (!e) throw new AppError(404, "not_found", `Email ${id} not found`);
        return e;
      })
    : defaultEmails(deps, req.useCase);
  if (emails.length === 0) {
    throw new AppError(400, "no_emails", "No suitable emails to benchmark. Run `bun run seed` first.");
  }

  const benchmarkId = crypto.randomUUID();
  for (let i = 0; i < req.repeats; i++) {
    for (const email of emails) {
      await compare(deps, email.id, req.useCase, { benchmarkId });
    }
  }
  return summarize(req.useCase, listEvaluations(deps.db, { useCase: req.useCase, benchmarkId }), benchmarkId);
}
