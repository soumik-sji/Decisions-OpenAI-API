import type { CompareResponse, ProviderResult } from "@/lib/types";
import { Card, Unavailable, formatLatency } from "@/components/ui";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function correctness(match: boolean | null) {
  if (match === null) return <Unavailable />;
  return match ? (
    <span className="text-emerald-700">Correct</span>
  ) : (
    <span className="text-red-700">Incorrect</span>
  );
}

function validity(r: ProviderResult) {
  if (r.status === "success") return <span className="text-emerald-700">Valid</span>;
  if (r.status === "invalid_output") return <span className="text-amber-700">Invalid</span>;
  return <span className="text-red-700">No output ({r.status})</span>;
}

export function ComparisonSummary({ data }: { data: CompareResponse }) {
  const { comparison: c, results } = data;

  return (
    <Card>
      <p className="text-sm font-semibold">Comparison summary</p>
      <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Agreement">
          {c.agreement === null ? (
            <Unavailable>Unavailable (a side has no valid decision)</Unavailable>
          ) : c.agreement ? (
            <p className="text-lg font-semibold text-emerald-700">Agree</p>
          ) : (
            <p className="text-lg font-semibold text-amber-700">Differ</p>
          )}
        </Stat>

        <Stat label="Correctness vs. expected">
          {c.expected === null ? (
            <Unavailable>No expected result. Not measured.</Unavailable>
          ) : (
            <div className="text-sm">
              <p className="mb-1 text-zinc-600">
                Expected: <span className="font-medium text-zinc-900">{c.expected}</span>
              </p>
              <p>Decisions: {correctness(c.decisionsMatchesExpected)}</p>
              <p>Baseline: {correctness(c.openaiMatchesExpected)}</p>
            </div>
          )}
        </Stat>

        <Stat label="Output validity">
          <div className="text-sm">
            <p>Decisions: {validity(results.decisions)}</p>
            <p>Baseline: {validity(results.openai)}</p>
          </div>
        </Stat>

        <Stat label="Latency (single run)">
          <div className="text-sm tabular-nums">
            <p>Decisions: {formatLatency(results.decisions.latencyMs) ?? <Unavailable />}</p>
            <p>Baseline: {formatLatency(results.openai.latencyMs) ?? <Unavailable />}</p>
          </div>
        </Stat>
      </div>
      <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        Agreement only means both systems gave the same answer. It does not mean
        the answer is right. Correctness is measured only against an expected
        result. A single run is a demonstration, not a benchmark.
      </p>
    </Card>
  );
}
