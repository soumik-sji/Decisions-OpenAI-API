# AGENTS.md — OpenAI Decisions vs. OpenAI Baseline Demo

Instructions for any coding agent working in this repo. Full product spec: `docs/ROADMAP.md` (source of truth for scope, phases, and success criteria). Read it before starting a new phase.

## What this is

A small, presentation-ready web app that lets an audience create a **simulated** email, pick **one** of three AI workflow use cases, and compare **OpenAI Decisions** (`POST /v1/decisions`) with an **OpenAI baseline** (Chat Completions + structured outputs) side by side on the **same input**.

It is a learning artifact / proof of concept, not a production email system, a workflow platform, or a definitive benchmark. Timeline is 1 week.

> **Provider change:** the demo originally compared Jev (TypeSafe API). Jev has been replaced by the OpenAI Decisions API, which has the same typed-question model (`choice` / `predicate` / `score` with probabilities). `docs/ROADMAP.md` still says "Jev"; read it as "OpenAI Decisions".

**Scope rule:** If a feature doesn't help the audience understand OpenAI Decisions or compare it with the OpenAI baseline, don't build it. Defer it.

## Non-negotiable rules

1. **No fabricated results.** Show only real provider outputs, errors, and measured latency. A failed live call must never be silently replaced with a mock or guessed output. Show the error and allow a rerun.
2. **Same input, fair comparison.** Decisions and the baseline get equivalent inputs and comparable instructions. Neither side ever sees the other's answer.
3. **Secrets stay on the backend.** Never put API keys in `NEXT_PUBLIC_*` vars, browser code, logs, SQLite, or responses. The frontend never calls OpenAI directly.
4. **No real email.** Mail Sender only creates a database record. No SMTP, Gmail, Outlook, or IMAP.
5. **Honest metrics.** Agreement is not accuracy. Compute accuracy only against `expected_label`. Show cost only when real usage and pricing data exist. Show missing fields as "unavailable", never as `0` or an invented value. Never invent confidence scores for OpenAI.
6. **Verify the Decisions API before coding against it.** Don't assume model IDs, question types, or response fields. Check https://developers.openai.com/api/docs/guides/decisions and run `bun run spike:decisions` first. The guide does not document a `model` echo or output token counts, so those are optional and shown as unavailable when absent.
7. **Mock data must be labelled.** Mock data is OK for early UI work only if it is visibly marked as mock, and it must be removed before the final demo.

## Actual stack (overrides the roadmap's suggestions)

The roadmap suggests React + Vite and Node + Express. The repo is actually scaffolded differently, so **follow the repo**:

| Area | Roadmap said | Use this instead |
|---|---|---|
| Frontend | React + Vite | **Next.js 16 (App Router) + React 19 + Tailwind v4**, in `frontend/` |
| Backend runtime | Node.js | **Bun**, in `backend/` |
| HTTP server | Express | **`Bun.serve()` with `routes`** |
| SQLite | any | **`bun:sqlite`** (not `better-sqlite3`) |
| Tests | Vitest | **`bun test`** |
| Env loading | dotenv | Bun loads `.env` automatically |
| Package manager | npm | **bun** (`bun install`, `bun run`, `bunx`) |

Sub-project agent files also apply:
- `frontend/AGENTS.md`: this Next.js version has breaking changes. Read `frontend/node_modules/next/dist/docs/` before writing Next code. Don't rely on memory.
- `backend/CLAUDE.md`: Bun conventions.

Validation: use Zod (or similar) for request bodies and **all provider outputs**.

## Repo layout (target)

```text
jev/
├── AGENTS.md            # this file
├── CLAUDE.md            # imports AGENTS.md
├── docs/ROADMAP.md      # product roadmap (spec)
├── frontend/            # Next.js app (port 3000)
│   └── app/
│       ├── mail-sender/page.tsx
│       ├── dashboard/page.tsx
│       ├── comparison/[emailId]/page.tsx
│       └── benchmarks/page.tsx      # optional, build last
└── backend/             # Bun API (port 4000)
    ├── index.ts         # Bun.serve routes
    ├── db/              # bun:sqlite setup + queries
    ├── providers/
    │   ├── decisions.ts # OpenAI Decisions adapter: all Decisions request/response specifics live here
    │   └── openai.ts    # OpenAI adapter
    ├── usecases/        # email_detection, model_routing, response_quality
    ├── schemas/         # shared Zod schemas + normalized result shape
    └── data/            # demo.sqlite, seed sample emails
```

Keep provider-specific formats **inside their adapter**. Everything else works with the normalized result shape. Don't build a generic workflow engine.

## Pages

- **`/mail-sender`**: form with from, subject, body, and an optional expected label/notes. Save the email, then link to its comparison page. Sends nothing.
- **`/dashboard`**: inbox / demo-case list showing subject, preview, optional expected label, and an "Open in comparison" link.
- **`/comparison/[emailId]`**: the main demo screen, in this order: selected email, use-case selector, **Decisions panel and baseline panel side by side (both always visible)**, agreement/difference summary, latency and status for each side, a run/rerun button, and the expected result if one exists.
- **`/benchmarks`** (optional, only after the core works): runs, accuracy (labelled cases only), agreement, latency (with the method labelled), and failures/invalid outputs.

## Use cases (one at a time, same layout)

| `useCase` | Decision | Allowed outputs |
|---|---|---|
| `email_detection` | Classify the email | Sales inquiry, Support request, Billing question, Spam / irrelevant, Other |
| `model_routing` | Pick a model tier | Fast / low-cost, Balanced, Higher-capability. Real model IDs come from env config. |
| `response_quality` | Gate a candidate reply | Accept, Retry / improve, Human review, plus a reason or the failed criteria |

Build order: **Email Detector fully end to end first** (the first major milestone), then Model Router, then Quality Gate. Don't polish charts before Email Detector works.

## Backend API contract

```text
GET  /api/health
POST /api/emails
GET  /api/emails
GET  /api/emails/:id
POST /api/emails/:id/compare      body: { "useCase": "email_detection" | "model_routing" | "response_quality" }
GET  /api/emails/:id/runs
POST /api/benchmarks/run          (optional)
GET  /api/benchmarks/results      (optional)
```

The compare endpoint runs both providers, normalizes the results, computes agreement, saves both runs, and returns `{ emailId, useCase, results: { decisions, openai }, comparison }`. Each provider result includes `status`, `decision`, `latencyMs`, and `error`. This is our internal contract, not a native OpenAI format.

Enable CORS for `FRONTEND_ORIGIN` only.

## Data model (minimum)

- `emails`: id, from_address, subject, body, expected_label (nullable), created_at
- `processing_runs`: id, email_id, use_case, provider, status, input_snapshot, output_json, latency_ms, error_message (safe, no secrets), created_at
- `evaluation_results` (optional): id, email_id, use_case, decisions_run_id, openai_run_id, agreement, ground_truth_correctness, created_at

## Environment

`backend/.env` (gitignored). Keep `backend/.env.example` with variable names only:

```dotenv
PORT=4000
DATABASE_URL=./data/demo.sqlite
FRONTEND_ORIGIN=http://localhost:3000
OPENAI_API_KEY=             # used by both Decisions and the baseline
OPENAI_DECISIONS_MODEL=gpt-6-luna
OPENAI_BASELINE_MODEL=
OPENAI_FAST_MODEL=
OPENAI_BALANCED_MODEL=
OPENAI_CAPABLE_MODEL=
```

`frontend/.env.local`: only `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`.

## Commands

```bash
# backend
cd backend && bun install && bun --hot ./index.ts
cd backend && bun test

# frontend
cd frontend && bun install && bun run dev
cd frontend && bun run lint && bun run build
```

## Working style

- Follow the phases in `docs/ROADMAP.md` §7. Finish a phase's exit criteria before starting the next.
- Make small changes that match the surrounding code. Use strict TypeScript and avoid `any` at provider boundaries.
- Test the important logic with `bun test`: payload validation, output normalization, agreement and accuracy math, and failure/timeout handling.
- Use fictional addresses and content in sample data. Keep 5–10 curated labelled emails in a seed file.
- If time runs short, cut in this order: charts/animation → benchmark page → persistent history → extra filters/fields → long explanations. **Never cut:** the real Decisions call, the OpenAI baseline, the same-input comparison, the separate Mail Sender page, honest errors.
