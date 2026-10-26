import type { Provider, ProviderResult, ProviderStatus, UseCase } from "@/lib/types";
import { Card, Spinner, Unavailable, formatLatency } from "@/components/ui";
import type { RunState } from "./ComparisonView";

const PROVIDER_META: Record<Provider, { name: string; subtitle: string; accent: string }> = {
  decisions: { name: "OpenAI Decisions", subtitle: "Decisions API", accent: "border-t-indigo-500" },
  openai: { name: "OpenAI baseline", subtitle: "Chat Completions", accent: "border-t-emerald-500" },
};

const STATUS_STYLE: Record<ProviderStatus, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Error", className: "bg-red-50 text-red-700" },
  timeout: { label: "Timed out", className: "bg-amber-50 text-amber-800" },
  invalid_output: { label: "Invalid output", className: "bg-amber-50 text-amber-800" },
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
  useCase,
  state,
  result,
}: {
  provider: Provider;
  useCase: UseCase;
  state: RunState;
  result: ProviderResult | null;
}) {
  const meta = PROVIDER_META[provider];

  return (
    <Card className={`border-t-4 ${meta.accent} flex flex-col`}>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold">{meta.name}</p>
          <p className="text-xs text-zinc-500">
            {meta.subtitle}
            {result?.model && <> · {result.model}</>}
          </p>
        </div>
        {result && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[result.status].className}`}
          >
            {STATUS_STYLE[result.status].label}
          </span>
        )}
      </div>

      {state.kind === "running" ? (
        <div className="flex flex-1 items-center justify-center gap-3 py-12 text-sm text-zinc-500">
          <Spinner /> Waiting for {meta.name}…
        </div>
      ) : !result ? (
        <div className="flex flex-1 items-center justify-center py-12 text-sm text-zinc-400">
          {state.kind === "error" ? "No result. The request failed." : "Not run yet"}
        </div>
      ) : (
        <PanelBody provider={provider} useCase={useCase} result={result} />
      )}
    </Card>
  );
}

function PanelBody({
  provider,
  useCase,
  result,
}: {
  provider: Provider;
  useCase: UseCase;
  result: ProviderResult;
}) {
  const probs = result.probabilities
    ? Object.entries(result.probabilities).sort((a, b) => b[1] - a[1])
    : null;

  return (
    <div>
      <Row label="Decision" hint={provider === "decisions" ? "Actual API output" : "Validated output"}>
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
          <p className="text-sm tabular-nums">{formatLatency(result.latencyMs)}</p>
        ) : (
          <Unavailable />
        )}
      </Row>
    </div>
  );
}
