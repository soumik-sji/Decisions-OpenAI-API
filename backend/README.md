# backend

Bun API for the Jev vs. OpenAI demo. Runs both providers on the same simulated email, normalizes their results, and stores every run. No real email is ever sent.

## Setup

```bash
bun install
cp .env.example .env        # fill in keys and model IDs
bun run spike:jev           # lists your Jev models and makes one real call
bun run seed                # 8 fictional, labelled demo emails (idempotent)
bun run dev                 # http://localhost:4000
bun test                    # unit + API tests (provider test doubles, no network)
```

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Shows whether each provider is configured. Never returns secrets. |
| POST | `/api/emails` | `{ from, subject, body, to?, expectedLabel?, notes?, candidateReply? }` |
| GET | `/api/emails` | Newest first |
| GET | `/api/emails/:id` | |
| POST | `/api/emails/:id/compare` | `{ useCase, candidateReply? }`, see below |
| GET | `/api/emails/:id/runs` | Full decision trace: input snapshot, validated raw output, latency, errors |
| POST | `/api/benchmarks/run` | `{ useCase, emailIds?, repeats? }`, runs sequentially |
| GET | `/api/benchmarks/results` | `?useCase=&benchmarkId=` |

Errors always look like `{ "error": { "code", "message", "details"? } }`.

### Compare response

`{ emailId, useCase, evaluationId, input, results: { jev, openai }, comparison }`. Each provider result has `status`, `decision`, `probabilities`, `confidence`, `latencyMs`, `model`, `usage`, `error`, and `errorKind` (`config | timeout | network | http | invalid_output`). A `null` value means the provider didn't supply it. It is never a guess.

| useCase | Jev request | OpenAI request | `decision` |
|---|---|---|---|
| `email_detection` | one `choice` question | strict JSON schema, enum | `{ label }` |
| `model_routing` | one `choice` question | strict JSON schema, enum + reason | `{ tier, tierId, model, reason }` (`model` is the configured `OPENAI_*_MODEL` for that tier) |
| `response_quality` | one `noul` per criterion (pass when P ≥ 0.5) | one boolean per criterion | `{ outcome, criteria[], failedCriteria, reason }` |

Both sides get the same instructions, options, and criteria from `usecases/definitions.ts`. The quality gate's final outcome comes from one shared policy: everything passes → Accept, a critical criterion fails → Human review, otherwise → Retry / improve. The candidate reply comes from the request, then the stored email, and is otherwise generated once with `OPENAI_BALANCED_MODEL`. Both providers judge the same text.

Agreement is `null` when either side failed. Accuracy is only computed for `email_detection` emails that have an `expectedLabel`. Cost is not computed, because there is no verified pricing data. Token usage is stored per run.

## Layout

```
index.ts              Bun.serve entry
app.ts                routes, CORS (FRONTEND_ORIGIN only), error envelope
config.ts             env loading
db/                   bun:sqlite schema + queries
providers/            jev.ts, openai.ts (all provider-specific formats), http.ts (timeouts, redaction)
usecases/definitions.ts  shared categories, tiers, criteria, policy
services/             compare.ts (orchestration + persistence), benchmarks.ts (metrics)
data/seed-emails.ts   curated labelled emails
scripts/              seed, Jev spike
```
