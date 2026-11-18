"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, DECISION_ENGINE_META, errorMessage } from "@/lib/api";
import {
  USE_CASES,
  type CompareResponse,
  type DecisionEngine,
  type Email,
  type ProcessingRun,
  type Provider,
  type ProviderResult,
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
import { ProviderPanel, type PanelPhase } from "./ProviderPanel";
import { ComparisonSummary } from "./ComparisonSummary";
import { LatencyRace, type RaceMode } from "./LatencyRace";

type EmailState =
  | { kind: "loading" }
  | { kind: "error"; message: string; notFound: boolean }
  | { kind: "ready"; email: Email };

type PacingMode = "live" | "slow";

const SLOW_MO_RATE = 1 / 3;

export type RunState =
  | { kind: "idle" }
  | {
      kind: "running";
      stage: "starting" | "generating_reply" | "racing";
      startedAt: number | null;
      rate: number;
      partial: Partial<Record<Provider, ProviderResult>>;
      fullData: CompareResponse | null;
      decisionEngine?: DecisionEngine;
      revealSeq: number;
    }
  | { kind: "error"; message: string }
  | { kind: "done"; data: CompareResponse; revealSeq: number };

type ReplayState = {
  startedAt: number;
  rate: number;
  durationMs: number;
  revealSeq: number;
};

const IDLE: RunState = { kind: "idle" };

export function ComparisonView({ emailId }: { emailId: string }) {
  const [emailState, setEmailState] = useState<EmailState>({ kind: "loading" });
  const [useCase, setUseCase] = useState<UseCase>("email_detection");
  const [pacing, setPacing] = useState<PacingMode>("live");
  // Kept per use case so switching tabs doesn't throw away a finished run.
  const [runs, setRuns] = useState<Partial<Record<UseCase, RunState>>>({});
  const [replays, setReplays] = useState<Partial<Record<UseCase, ReplayState>>>({});
  const [nowMs, setNowMs] = useState<number>(0);
  const [history, setHistory] = useState<ProcessingRun[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [engine, setEngine] = useState<DecisionEngine>("openai_decisions");

  const abortRef = useRef<Partial<Record<UseCase, AbortController>>>({});
  const revealCounterRef = useRef(1);

  const loadEmail = useCallback(async () => {
    setEmailState({ kind: "loading" });
    try {
      setEmailState({ kind: "ready", email: await api.getEmail(emailId) });
    } catch (err) {
      const notFound =
        err !== null &&
        typeof err === "object" &&
        "status" in err &&
        err.status === 404;
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
    api
      .getHealth()
      .then((h) => setEngine(h.providers.decisions.engine))
      .catch(() => {
        // Keep the default label if health is unreachable; compare still reports the engine.
      });
  }, [loadEmail, loadHistory]);

  useEffect(() => {
    const controllers = abortRef.current;
    return () => {
      for (const ctrl of Object.values(controllers)) {
        ctrl?.abort();
      }
    };
  }, []);

  // Drive smooth live stopwatches, slow-mo live reveals, and replays at 60fps.
  const hasActiveAnimation =
    Object.values(runs).some((r) => r?.kind === "running") ||
    Object.values(replays).some(Boolean);

  useEffect(() => {
    if (!hasActiveAnimation) return;
    let rafId = 0;

    const tick = () => {
      const now = performance.now();
      setNowMs(now);

      // Complete any slow-mo live run whose visual clock has reached both measured latencies.
      setRuns((prev) => {
        let next: Partial<Record<UseCase, RunState>> | null = null;
        for (const uc of USE_CASES) {
          const st = prev[uc];
          if (st?.kind === "running" && st.fullData && st.startedAt !== null) {
            const simElapsed = (now - st.startedAt) * st.rate;
            const target = Math.max(
              st.fullData.results.decisions.latencyMs ?? 0,
              st.fullData.results.openai.latencyMs ?? 0,
            );
            if (simElapsed >= target) {
              next = next ?? { ...prev };
              next[uc] = {
                kind: "done",
                data: st.fullData,
                revealSeq: st.revealSeq,
              };
            }
          }
        }
        return next ?? prev;
      });

      // Finish any completed replay.
      setReplays((prev) => {
        let next: Partial<Record<UseCase, ReplayState>> | null = null;
        for (const uc of USE_CASES) {
          const rep = prev[uc];
          if (rep && (now - rep.startedAt) * rep.rate >= rep.durationMs) {
            next = next ?? { ...prev };
            delete next[uc];
          }
        }
        return next ?? prev;
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hasActiveAnimation]);

  async function run(target: UseCase) {
    abortRef.current[target]?.abort();
    const controller = new AbortController();
    abortRef.current[target] = controller;

    const selectedRate = pacing === "slow" ? SLOW_MO_RATE : 1;
    const seq = ++revealCounterRef.current;

    setReplays((prev) => {
      if (!prev[target]) return prev;
      const copy = { ...prev };
      delete copy[target];
      return copy;
    });

    setNowMs(performance.now());
    setRuns((r) => ({
      ...r,
      [target]: {
        kind: "running",
        stage: "starting",
        startedAt: performance.now(),
        rate: selectedRate,
        partial: {},
        fullData: null,
        revealSeq: seq,
      },
    }));

    try {
      const data = await api.compareStream(emailId, target, {
        signal: controller.signal,
        onPreparing: () => {
          setRuns((r) => {
            const cur = r[target];
            if (cur?.kind !== "running") return r;
            return {
              ...r,
              [target]: { ...cur, stage: "generating_reply", startedAt: null },
            };
          });
        },
        onStarted: (decisionEngine) => {
          const startedAt = performance.now();
          setNowMs(startedAt);
          setRuns((r) => {
            const cur = r[target];
            if (cur?.kind !== "running") return r;
            return {
              ...r,
              [target]: {
                ...cur,
                stage: "racing",
                startedAt,
                decisionEngine,
              },
            };
          });
        },
        onProvider: (provider, providerResult, decisionEngine) => {
          setRuns((r) => {
            const cur = r[target];
            if (cur?.kind !== "running") return r;
            return {
              ...r,
              [target]: {
                ...cur,
                stage: "racing",
                startedAt: cur.startedAt ?? performance.now(),
                decisionEngine,
                partial: { ...cur.partial, [provider]: providerResult },
              },
            };
          });
        },
      });

      if (controller.signal.aborted) return;

      setRuns((r) => {
        const cur = r[target];
        if (cur?.kind === "running" && cur.rate < 1) {
          const startedAt = cur.startedAt ?? performance.now();
          const simElapsed = (performance.now() - startedAt) * cur.rate;
          const maxLatency = Math.max(
            data.results.decisions.latencyMs ?? 0,
            data.results.openai.latencyMs ?? 0,
          );
          if (simElapsed < maxLatency) {
            return {
              ...r,
              [target]: { ...cur, startedAt, fullData: data },
            };
          }
        }
        return {
          ...r,
          [target]: { kind: "done", data, revealSeq: seq },
        };
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      setRuns((r) => ({
        ...r,
        [target]: { kind: "error", message: errorMessage(err) },
      }));
    }
    loadHistory();
  }

  function startReplay(target: UseCase, rate: number) {
    const cur = runs[target];
    if (cur?.kind !== "done") return;
    const durationMs = Math.max(
      cur.data.results.decisions.latencyMs ?? 0,
      cur.data.results.openai.latencyMs ?? 0,
    );
    if (durationMs <= 0) return;

    const now = performance.now();
    setNowMs(now);
    setReplays((prev) => ({
      ...prev,
      [target]: {
        startedAt: now,
        rate,
        durationMs,
        revealSeq: ++revealCounterRef.current,
      },
    }));
  }

  function skipAnimation(target: UseCase) {
    setReplays((prev) => {
      if (!prev[target]) return prev;
      const copy = { ...prev };
      delete copy[target];
      return copy;
    });
    setRuns((prev) => {
      const cur = prev[target];
      if (cur?.kind === "running" && cur.fullData) {
        return {
          ...prev,
          [target]: {
            kind: "done",
            data: cur.fullData,
            revealSeq: cur.revealSeq,
          },
        };
      }
      return prev;
    });
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
  const replay = replays[useCase] ?? null;
  const running = current.kind === "running";
  const completedData = current.kind === "done" ? current.data : null;

  const activeEngine =
    completedData?.decisionEngine ??
    (current.kind === "running" ? current.decisionEngine : undefined) ??
    engine;
  const left = DECISION_ENGINE_META[activeEngine];

  // Compute what each panel and the speed race strip should show on this frame.
  let visibleDecisions: ProviderResult | null = null;
  let visibleOpenai: ProviderResult | null = null;
  let panelPhase: PanelPhase = "idle";
  let raceMode: RaceMode | null = null;
  let displayElapsedMs = 0;
  let activeRate = pacing === "slow" ? SLOW_MO_RATE : 1;
  let scaleHintMs: number | null = null;
  let revealKey = 0;

  if (current.kind === "running") {
    revealKey = current.revealSeq;
    activeRate = current.rate;

    if (current.stage === "generating_reply") {
      panelPhase = "preparing";
      raceMode = "preparing";
      displayElapsedMs = 0;
    } else {
      panelPhase = "waiting";
      raceMode = "live";
      const wallElapsed =
        current.startedAt !== null ? Math.max(0, nowMs - current.startedAt) : 0;

      if (current.rate === 1) {
        visibleDecisions = current.partial.decisions ?? null;
        visibleOpenai = current.partial.openai ?? null;
        const finishedFloor = Math.max(
          visibleDecisions?.latencyMs ?? 0,
          visibleOpenai?.latencyMs ?? 0,
        );
        displayElapsedMs = Math.max(Math.round(wallElapsed), finishedFloor);
      } else {
        const simElapsed = wallElapsed * current.rate;
        displayElapsedMs = Math.round(simElapsed);
        const dSource =
          current.fullData?.results.decisions ?? current.partial.decisions ?? null;
        const oSource =
          current.fullData?.results.openai ?? current.partial.openai ?? null;
        visibleDecisions =
          dSource && simElapsed >= (dSource.latencyMs ?? 0) ? dSource : null;
        visibleOpenai =
          oSource && simElapsed >= (oSource.latencyMs ?? 0) ? oSource : null;
        if (current.fullData) {
          scaleHintMs = Math.max(
            current.fullData.results.decisions.latencyMs ?? 0,
            current.fullData.results.openai.latencyMs ?? 0,
          );
        }
      }
    }
  } else if (current.kind === "done" && replay) {
    revealKey = replay.revealSeq;
    activeRate = replay.rate;
    raceMode = "replay";
    const simElapsed = Math.max(0, (nowMs - replay.startedAt) * replay.rate);
    displayElapsedMs = Math.round(simElapsed);
    const dSource = current.data.results.decisions;
    const oSource = current.data.results.openai;
    visibleDecisions = simElapsed >= (dSource.latencyMs ?? 0) ? dSource : null;
    visibleOpenai = simElapsed >= (oSource.latencyMs ?? 0) ? oSource : null;
    panelPhase = visibleDecisions && visibleOpenai ? "done" : "waiting";
    scaleHintMs = replay.durationMs;
  } else if (current.kind === "done") {
    revealKey = current.revealSeq;
    visibleDecisions = current.data.results.decisions;
    visibleOpenai = current.data.results.openai;
    panelPhase = "done";
    raceMode = "done";
    scaleHintMs = Math.max(
      visibleDecisions.latencyMs ?? 0,
      visibleOpenai.latencyMs ?? 0,
    );
    displayElapsedMs = scaleHintMs;
  } else if (current.kind === "error") {
    panelPhase = "error";
  }

  const canReplay =
    completedData !== null &&
    ((completedData.results.decisions.latencyMs ?? 0) > 0 ||
      (completedData.results.openai.latencyMs ?? 0) > 0);

  const canSkip =
    replay !== null ||
    (current.kind === "running" && current.fullData !== null);

  const showSummary = completedData !== null && replay === null;
  const caseHistory = history?.filter((r) => r.useCase === useCase) ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-800">
            ← Inbox
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {left.short} vs. Baseline
          </h1>
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

      {/* 2. Use-case selector + plain-language explanation + pacing + run button */}
      <Card className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Use case"
          className="flex gap-1 rounded-lg bg-zinc-100 p-1"
        >
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-medium">{info.question}</p>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">{info.explanation}</p>
            <p className="mt-2 text-xs text-zinc-500">
              Possible answers: {info.outputs.join(" · ")}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Reveal speed"
              className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs"
            >
              <button
                type="button"
                onClick={() => setPacing("live")}
                disabled={running}
                title="Show each panel the instant its real API call finishes"
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors disabled:opacity-50 ${
                  pacing === "live"
                    ? "bg-white text-zinc-900 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Live 1×
              </button>
              <button
                type="button"
                onClick={() => setPacing("slow")}
                disabled={running}
                title="Play out the real measured latencies 3× slower so sub-second differences are easy to feel"
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors disabled:opacity-50 ${
                  pacing === "slow"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Slow-mo 3×
              </button>
            </div>
            <button
              type="button"
              className={`${buttonPrimary} shrink-0`}
              disabled={running}
              onClick={() => run(useCase)}
            >
              {running && <Spinner />}
              {running
                ? "Running…"
                : completedData
                  ? "Rerun comparison"
                  : "Run comparison"}
            </button>
          </div>
        </div>
      </Card>

      {current.kind === "error" && (
        <ErrorBox
          title="Comparison failed"
          message={`${current.message} No results are shown. Nothing was substituted.`}
          onRetry={() => run(useCase)}
        />
      )}

      {/* Live / replay / completed head-to-head latency race bar */}
      {raceMode !== null && (
        <LatencyRace
          engine={activeEngine}
          mode={raceMode}
          pacingRate={activeRate}
          elapsedMs={displayElapsedMs}
          scaleHintMs={scaleHintMs}
          decisions={visibleDecisions}
          openai={visibleOpenai}
          canReplay={canReplay}
          canSkip={canSkip}
          onReplay={(rate) => startReplay(useCase, rate)}
          onSkip={() => skipAnimation(useCase)}
        />
      )}

      {/* 3–4. Both panels, always visible together */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ProviderPanel
          provider="decisions"
          engine={activeEngine}
          useCase={useCase}
          phase={panelPhase}
          elapsedMs={displayElapsedMs}
          result={visibleDecisions}
          peerResult={visibleOpenai}
          revealKey={revealKey}
        />
        <ProviderPanel
          provider="openai"
          engine={activeEngine}
          useCase={useCase}
          phase={panelPhase}
          elapsedMs={displayElapsedMs}
          result={visibleOpenai}
          peerResult={visibleDecisions}
          revealKey={revealKey}
        />
      </div>

      {/* 5–8. Agreement, correctness, validity, latency */}
      {showSummary && <ComparisonSummary data={completedData} />}

      <Card>
        <p className="text-sm font-semibold">Previous runs · {info.label}</p>
        {historyError ? (
          <p className="mt-2 text-sm text-red-700">
            Couldn&apos;t load run history: {historyError}
          </p>
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
                  <td className="py-1.5">
                    {r.provider === "decisions"
                      ? left.name
                      : r.provider === "openai"
                        ? "OpenAI baseline"
                        : r.provider}
                  </td>
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
