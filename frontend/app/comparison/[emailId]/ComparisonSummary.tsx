import type { CompareResponse, ProviderResult } from "@/lib/types";
import { Card, Unavailable, formatCost, formatLatency } from "@/components/ui";

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

// Differences under this are within normal run-to-run network noise.
const SIMILAR_LATENCY_MS = 100;

/** Measured difference for this run only. Shown only when both calls succeeded. */
function LatencyDelta({ decisions, openai }: { decisions: ProviderResult; openai: ProviderResult }) {
  if (
    decisions.status !== "success" ||
    openai.status !== "success" ||
    decisions.latencyMs === null ||
    openai.latencyMs === null
  ) {
    return null;
  }
  const diff = Math.round(openai.latencyMs - decisions.latencyMs);
  if (Math.abs(diff) < SIMILAR_LATENCY_MS) {
    return <p className="mt-1 font-medium text-zinc-700">About the same (Δ {Math.abs(diff)} ms)</p>;
  }
  const faster = diff > 0 ? "Decisions" : "Baseline";
  const slow = Math.max(decisions.latencyMs, openai.latencyMs);
  const fast = Math.min(decisions.latencyMs, openai.latencyMs);
  const ratio = fast > 0 ? ` (${(slow / fast).toFixed(1)}×)` : "";
  return (
    <p className="mt-1 font-medium text-zinc-700">
      {faster} faster by {Math.abs(diff).toLocaleString()} ms{ratio}
    </p>
  );
}

/** Shown only when both sides have a real cost. */
function CostDelta({ decisions, openai }: { decisions: number | null; openai: number | null }) {
  if (decisions === null || openai === null) return null;
  if (decisions === openai) return <p className="mt-1 font-medium text-zinc-700">Same cost</p>;
  const cheaper = decisions < openai ? "Decisions" : "Baseline";
  const low = Math.min(decisions, openai);
  const high = Math.max(decisions, openai);
  const ratio = low > 0 ? ` (${(high / low).toFixed(1)}×)` : "";
  return (
    <p className="mt-1 font-medium text-zinc-700">
      {cheaper} cheaper by {formatCost(high - low)}
      {ratio}
    </p>
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
      <div className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
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
            <LatencyDelta decisions={results.decisions} openai={results.openai} />
          </div>
        </Stat>

        <Stat label="Cost (single run)">
          <div className="text-sm tabular-nums">
            <p>Decisions: {formatCost(results.decisions.costUsd) ?? <Unavailable />}</p>
            <p>Baseline: {formatCost(results.openai.costUsd) ?? <Unavailable />}</p>
            <CostDelta decisions={results.decisions.costUsd} openai={results.openai.costUsd} />
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
