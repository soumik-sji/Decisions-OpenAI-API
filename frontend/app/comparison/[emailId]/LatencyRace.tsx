import { DECISION_ENGINE_META } from "@/lib/api";
import type { DecisionEngine, ProviderResult } from "@/lib/types";
import { Card, Spinner, formatLatency } from "@/components/ui";

const SIMILAR_LATENCY_MS = 100;

export type RaceMode = "preparing" | "live" | "replay" | "done";

export function LatencyRace({
  engine,
  mode,
  pacingRate,
  elapsedMs,
  scaleHintMs,
  decisions,
  openai,
  canReplay,
  canSkip,
  onReplay,
  onSkip,
}: {
  engine: DecisionEngine;
  mode: RaceMode;
  pacingRate: number;
  elapsedMs: number;
  scaleHintMs: number | null;
  decisions: ProviderResult | null;
  openai: ProviderResult | null;
  canReplay: boolean;
  canSkip: boolean;
  onReplay: (rate: number) => void;
  onSkip: () => void;
}) {
  const left = DECISION_ENGINE_META[engine];

  const dMs = decisions ? decisions.latencyMs : mode === "preparing" ? 0 : elapsedMs;
  const oMs = openai ? openai.latencyMs : mode === "preparing" ? 0 : elapsedMs;

  const scaleMs =
    scaleHintMs !== null && scaleHintMs > 0
      ? Math.max(scaleHintMs, dMs ?? 0, oMs ?? 0, 100)
      : Math.max(2000, dMs ?? 0, oMs ?? 0, 100);

  const bothSucceeded =
    decisions?.status === "success" &&
    openai?.status === "success" &&
    decisions.latencyMs !== null &&
    openai.latencyMs !== null;

  const diffMs =
    bothSucceeded && decisions?.latencyMs != null && openai?.latencyMs != null
      ? Math.round(openai.latencyMs - decisions.latencyMs)
      : null;

  const decisionsFirst =
    (decisions?.status === "success" &&
      decisions.latencyMs !== null &&
      openai === null) ||
    (diffMs !== null && diffMs >= SIMILAR_LATENCY_MS);

  const openaiFirst =
    (openai?.status === "success" &&
      openai.latencyMs !== null &&
      decisions === null) ||
    (diffMs !== null && diffMs <= -SIMILAR_LATENCY_MS);

  // Live mid-race callout when one finished and the other is still in flight
  const finishedSide =
    decisions && !openai && decisions.status === "success" && decisions.latencyMs !== null
      ? {
          winner: left.name,
          winnerMs: decisions.latencyMs,
          waitingOn: "OpenAI baseline",
        }
      : openai && !decisions && openai.status === "success" && openai.latencyMs !== null
        ? {
            winner: "OpenAI baseline",
            winnerMs: openai.latencyMs,
            waitingOn: left.name,
          }
        : null;

  return (
    <Card className="flex flex-col gap-3.5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          {mode === "preparing" ? (
            <span className="inline-flex items-center gap-2 font-medium text-zinc-700">
              <Spinner /> Preparing shared candidate reply before starting the race…
            </span>
          ) : mode === "live" || mode === "replay" ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                <span className="size-2 animate-pulse rounded-full bg-indigo-500" />
                {mode === "replay"
                  ? pacingRate < 1
                    ? "Slow-mo replay (3× slower)"
                    : "Replay (1× real-time)"
                  : pacingRate < 1
                    ? "Slow-mo reveal (3× slower)"
                    : "Live race"}
              </span>
              {finishedSide ? (
                <span className="text-zinc-700">
                  <span className="font-semibold text-zinc-900">
                    {finishedSide.winner} finished in {formatLatency(finishedSide.winnerMs)}
                  </span>{" "}
                  · waiting{" "}
                  <span className="font-mono font-medium tabular-nums text-amber-700">
                    +{Math.max(0, Math.round(elapsedMs - finishedSide.winnerMs)).toLocaleString()} ms
                  </span>{" "}
                  for {finishedSide.waitingOn}…
                </span>
              ) : (
                <span className="text-zinc-600">
                  Both providers running concurrently on the same input…
                </span>
              )}
            </>
          ) : diffMs !== null && Math.abs(diffMs) >= SIMILAR_LATENCY_MS ? (
            <>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  diffMs > 0
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                ⚡ {diffMs > 0 ? left.name : "OpenAI baseline"}{" "}
                {(
                  Math.max(decisions!.latencyMs!, openai!.latencyMs!) /
                  Math.max(1, Math.min(decisions!.latencyMs!, openai!.latencyMs!))
                ).toFixed(1)}
                × faster
              </span>
              <span className="text-zinc-600">
                Arrived{" "}
                <span className="font-semibold tabular-nums text-zinc-900">
                  {Math.abs(diffMs).toLocaleString()} ms
                </span>{" "}
                earlier ({formatLatency(decisions!.latencyMs)} vs.{" "}
                {formatLatency(openai!.latencyMs)})
              </span>
            </>
          ) : diffMs !== null ? (
            <span className="font-medium text-zinc-700">
              Nearly identical response time (Δ {Math.abs(diffMs)} ms)
            </span>
          ) : (
            <span className="font-medium text-zinc-700">
              Head-to-head response time · Measured on the backend
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Skip animation
            </button>
          )}
          {mode === "done" && canReplay && (
            <>
              <button
                type="button"
                onClick={() => onReplay(1)}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                title="Replay the exact measured arrival times at real-time speed"
              >
                ↻ Replay 1×
              </button>
              <button
                type="button"
                onClick={() => onReplay(1 / 3)}
                className="rounded-md border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                title="Replay the measured arrival times 3× slower so the latency difference is easy to feel"
              >
                ↻ Slow-mo (3× slower)
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <RaceLane
          name={left.name}
          barColor="bg-indigo-500"
          badgeColor="bg-indigo-50 text-indigo-700"
          result={decisions}
          currentMs={dMs}
          scaleMs={scaleMs}
          isWinner={decisionsFirst}
          preparing={mode === "preparing"}
        />
        <RaceLane
          name="OpenAI baseline"
          barColor="bg-emerald-500"
          badgeColor="bg-emerald-50 text-emerald-700"
          result={openai}
          currentMs={oMs}
          scaleMs={scaleMs}
          isWinner={openaiFirst}
          preparing={mode === "preparing"}
        />
      </div>
    </Card>
  );
}

function RaceLane({
  name,
  barColor,
  badgeColor,
  result,
  currentMs,
  scaleMs,
  isWinner,
  preparing,
}: {
  name: string;
  barColor: string;
  badgeColor: string;
  result: ProviderResult | null;
  currentMs: number | null;
  scaleMs: number;
  isWinner: boolean;
  preparing: boolean;
}) {
  const finished = result !== null;
  const failed = result !== null && result.status !== "success";
  const pct =
    currentMs !== null && scaleMs > 0
      ? Math.max(finished && currentMs > 0 ? 2 : 0, Math.min(100, (currentMs / scaleMs) * 100))
      : 0;

  return (
    <div className="grid grid-cols-[140px_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[160px_1fr_auto]">
      <div className="flex items-center gap-1.5 truncate font-medium text-zinc-800">
        <span className="truncate">{name}</span>
        {finished && !failed && isWinner && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeColor}`}>
            1st
          </span>
        )}
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
        {failed && currentMs === null ? (
          <div className="h-full w-full bg-red-200" />
        ) : (
          <div
            className={`h-full rounded-full ${
              failed ? "bg-red-400" : barColor
            } ${!finished && !preparing ? "opacity-80" : ""}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>

      <div className="w-24 text-right font-mono tabular-nums text-zinc-700">
        {preparing ? (
          <span className="text-zinc-400">—</span>
        ) : finished ? (
          failed && result.latencyMs === null ? (
            <span className="font-sans text-red-700">error</span>
          ) : (
            <span className={failed ? "text-red-700" : "font-semibold text-zinc-900"}>
              {formatLatency(result.latencyMs) ?? "—"}
            </span>
          )
        ) : (
          <span className="text-zinc-500">{formatLatency(currentMs ?? 0)}</span>
        )}
      </div>
    </div>
  );
}
