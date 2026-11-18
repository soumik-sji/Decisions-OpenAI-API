import { DECISION_ENGINE_META } from "@/lib/api";
import type {
  DecisionEngine,
  Provider,
  ProviderResult,
  ProviderStatus,
  UseCase,
} from "@/lib/types";
import {
  Card,
  Spinner,
  Unavailable,
  formatCost,
  formatLatency,
} from "@/components/ui";

const SIMILAR_LATENCY_MS = 100;

export type PanelPhase = "idle" | "preparing" | "waiting" | "done" | "error";

function providerMeta(provider: Provider, engine: DecisionEngine) {
  if (provider === "openai") {
    return {
      name: "OpenAI baseline",
      subtitle: "Chat Completions",
      accent: "border-t-emerald-500",
      barColor: "bg-emerald-500",
      arriveClass: "card-arrive-emerald",
      speedBadge: "bg-emerald-50 text-emerald-700",
    };
  }
  const left = DECISION_ENGINE_META[engine];
  return {
    name: left.name,
    subtitle: left.subtitle,
    accent: "border-t-indigo-500",
    barColor: "bg-indigo-500",
    arriveClass: "card-arrive-indigo",
    speedBadge: "bg-indigo-50 text-indigo-700",
  };
}

const STATUS_STYLE: Record<ProviderStatus, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Error", className: "bg-red-50 text-red-700" },
  timeout: { label: "Timed out", className: "bg-amber-50 text-amber-800" },
  invalid_output: { label: "Invalid output", className: "bg-amber-50 text-amber-800" },
};

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-100 py-3">
      <p className="text-xs font-medium text-zinc-500">
        {label}
        {hint && <span className="font-normal text-zinc-400"> · {hint}</span>}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function ProviderPanel({
  provider,
  engine,
  useCase,
  phase,
  elapsedMs,
  result,
  peerResult,
  revealKey,
}: {
  provider: Provider;
  engine: DecisionEngine;
  useCase: UseCase;
  phase: PanelPhase;
  elapsedMs: number;
  result: ProviderResult | null;
  peerResult: ProviderResult | null;
  revealKey: number;
}) {
  const meta = providerMeta(provider, engine);
  const peerMeta = providerMeta(provider === "decisions" ? "openai" : "decisions", engine);

  const peerWaiting = result !== null && peerResult === null && phase === "waiting";
  const speedRatio =
    result?.status === "success" &&
    peerResult?.status === "success" &&
    result.latencyMs !== null &&
    peerResult.latencyMs !== null &&
    peerResult.latencyMs - result.latencyMs >= SIMILAR_LATENCY_MS
      ? (peerResult.latencyMs / Math.max(1, result.latencyMs)).toFixed(1)
      : null;

  return (
    <Card
      key={result ? `revealed-${revealKey}` : "pending"}
      className={`border-t-4 ${meta.accent} flex flex-col ${
        result && revealKey > 0 ? meta.arriveClass : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{meta.name}</p>
          <p className="text-xs text-zinc-500">
            {meta.subtitle}
            {result?.model && <> · {result.model}</>}
          </p>
        </div>
        {result ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {peerWaiting && result.status === "success" && result.latencyMs !== null && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${meta.speedBadge}`}
              >
                ⚡ 1st · {formatLatency(result.latencyMs)}
              </span>
            )}
            {!peerWaiting && speedRatio && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${meta.speedBadge}`}
              >
                ⚡ {speedRatio}× faster
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[result.status].className}`}
            >
              {STATUS_STYLE[result.status].label}
            </span>
          </div>
        ) : phase === "waiting" || phase === "preparing" ? (
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
            Running…
          </span>
        ) : null}
      </div>

      {phase === "preparing" && !result ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-14 text-sm text-zinc-500">
          <div className="flex items-center gap-2.5">
            <Spinner /> Preparing shared candidate reply…
          </div>
        </div>
      ) : phase === "waiting" && !result ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="flex items-center gap-2.5 text-sm text-zinc-500">
            <Spinner /> Waiting for {meta.name}…
          </div>
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-zinc-800">
            {formatLatency(elapsedMs)}
          </p>
          {peerResult &&
            peerResult.status === "success" &&
            peerResult.latencyMs !== null &&
            elapsedMs >= peerResult.latencyMs && (
              <p className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                {peerMeta.name} already finished in {formatLatency(peerResult.latencyMs)} ·{" "}
                <span className="font-mono tabular-nums">
                  +{Math.max(0, Math.round(elapsedMs - peerResult.latencyMs)).toLocaleString()} ms
                </span>{" "}
                elapsed since
              </p>
            )}
        </div>
      ) : !result ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-zinc-400">
          {phase === "error" ? "No result. The request failed." : "Not run yet"}
        </div>
      ) : (
        <div className={revealKey > 0 ? "panel-reveal" : undefined}>
          <PanelBody
            provider={provider}
            useCase={useCase}
            result={result}
            peerResult={peerResult}
            peerName={peerMeta.name}
            barColor={meta.barColor}
          />
        </div>
      )}
    </Card>
  );
}

function PanelBody({
  provider,
  useCase,
  result,
  peerResult,
  peerName,
  barColor,
}: {
  provider: Provider;
  useCase: UseCase;
  result: ProviderResult;
  peerResult: ProviderResult | null;
  peerName: string;
  barColor: string;
}) {
  const probs = result.probabilities
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
    : null;

  const canCompareLatency =
    result.status === "success" &&
    peerResult?.status === "success" &&
    result.latencyMs !== null &&
    peerResult.latencyMs !== null;

  const latencyDiff =
    canCompareLatency && result.latencyMs !== null && peerResult?.latencyMs != null
      ? Math.round(result.latencyMs - peerResult.latencyMs)
      : null;

  const maxLatency =
    canCompareLatency && result.latencyMs !== null && peerResult?.latencyMs != null
      ? Math.max(result.latencyMs, peerResult.latencyMs, 1)
      : null;

  return (
    <div>
      <Row
        label="Decision"
        hint={provider === "decisions" ? "Actual API output" : "Validated output"}
      >
        {result.decision ? (
          <p className="text-2xl font-semibold tracking-tight">{result.decision}</p>
        ) : (
          <Unavailable>No valid decision</Unavailable>
        )}
      </Row>

      {result.error && (
        <Row label="Error">
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-800">{result.error}</p>
        </Row>
      )}

      {useCase === "model_routing" && (
        <Row label="Routed to model">
          {result.routedModel ? (
            <p className="font-mono text-sm">{result.routedModel}</p>
          ) : (
            <Unavailable />
          )}
        </Row>
      )}

      <Row label="Reason">
        {result.reason ? (
          <p className="text-sm leading-relaxed text-zinc-700">{result.reason}</p>
        ) : (
          <Unavailable>Not returned</Unavailable>
        )}
      </Row>

      {useCase === "response_quality" && (
        <Row label="Failed criteria">
          {result.failedCriteria && result.failedCriteria.length > 0 ? (
            <ul className="list-inside list-disc text-sm text-zinc-700">
              {result.failedCriteria.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : result.failedCriteria ? (
            <p className="text-sm text-zinc-700">None</p>
          ) : (
            <Unavailable>Not returned</Unavailable>
          )}
        </Row>
      )}

      <Row
        label={provider === "decisions" ? "Probabilities" : "Confidence"}
        hint={provider === "decisions" ? "If returned by the API" : "Only if supported"}
      >
        {probs && probs.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {probs.map(([label, p]) => (
              <li key={label} className="text-sm">
                <div className="flex justify-between">
                  <span>{label}</span>
                  <span className="tabular-nums text-zinc-600">{(p * 100).toFixed(1)}%</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-zinc-100">
                  <div
                    className="h-1.5 rounded-full bg-indigo-500"
                    style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Unavailable>Unavailable. Not returned by this provider.</Unavailable>
        )}
      </Row>

      <Row label="Latency" hint="Measured by the backend">
        {formatLatency(result.latencyMs) ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-base font-semibold tabular-nums">
                {formatLatency(result.latencyMs)}
              </p>
              {latencyDiff !== null && Math.abs(latencyDiff) >= SIMILAR_LATENCY_MS && (
                <span
                  className={`text-xs font-medium tabular-nums ${
                    latencyDiff < 0 ? "text-emerald-700" : "text-zinc-500"
                  }`}
                >
                  {latencyDiff < 0
                    ? `${Math.abs(latencyDiff).toLocaleString()} ms faster than ${peerName}`
                    : `${latencyDiff.toLocaleString()} ms slower than ${peerName}`}
                </span>
              )}
            </div>
            {maxLatency !== null && result.latencyMs !== null && (
              <div className="h-1.5 rounded-full bg-zinc-100">
                <div
                  className={`h-1.5 rounded-full ${barColor}`}
                  style={{
                    width: `${Math.max(2, Math.min(100, (result.latencyMs / maxLatency) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <Unavailable />
        )}
      </Row>

      <Row label="Tokens" hint="Reported by the API">
        {result.usage ? (
          <p className="text-sm tabular-nums">
            {result.usage.inputTokens.toLocaleString()} in ·{" "}
            {result.usage.outputTokens === null
              ? "output unavailable"
              : `${result.usage.outputTokens.toLocaleString()} out`}
          </p>
        ) : (
          <Unavailable />
        )}
      </Row>

      <Row label="Cost" hint="Tokens × configured price">
        {formatCost(result.costUsd) ? (
          <p className="text-sm tabular-nums">{formatCost(result.costUsd)}</p>
        ) : (
          <Unavailable>Unavailable. Pricing not configured or usage not returned.</Unavailable>
        )}
      </Row>
    </div>
  );
}
