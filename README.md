# OpenAI Decisions vs. Baseline

A small demo that saves a simulated email, runs one AI workflow on it, and shows **OpenAI Decisions** (`POST /v1/decisions`) next to an **OpenAI baseline** (Chat Completions with structured outputs). Both sides see the same input. Neither sees the other's answer.

This is a learning demo. It does not send email, and a handful of runs is not a benchmark of either API.

The product spec in `docs/ROADMAP.md` still says "Jev". The demo now uses the OpenAI Decisions API in that role.

## What you can do

1. Save a simulated email (from, subject, body, optional expected label).
2. Open it and pick one use case.
3. Run both providers and compare the decision, latency, and status.
4. Rerun, or look at agreement and accuracy across labelled cases on the benchmarks page.

Failed calls stay on screen as errors. The app never fills in a guessed result.

## Prerequisites

- [Bun](https://bun.sh) 1.3 or newer (`frontend/package.json` pins `bun@1.3.5`)
- An OpenAI API key that can call Decisions and Chat Completions

## Run it

Use two terminals.

```bash
# API — http://localhost:4000
cd backend
bun install
cp .env.example .env          # set OPENAI_API_KEY and the model IDs
bun run spike:decisions       # one real Decisions call, to confirm the API
bun run seed                  # 8 fictional labelled emails (safe to run again)
bun run dev
```

```bash
# UI — http://localhost:3000
cd frontend
bun install
cp .env.example .env.local    # NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
bun run dev
```

`http://localhost:3000` redirects to `/dashboard`.

The frontend only talks to the Bun API. The API key stays in `backend/.env`.

## Pages

| Path | What it is |
|---|---|
| `/mail-sender` | Form that stores an email. Nothing is sent. |
| `/dashboard` | Inbox of saved and seeded emails. |
| `/comparison/[emailId]` | The demo: email, use-case picker, Decisions and baseline side by side, agreement, latency, rerun. |
| `/benchmarks` | Runs, accuracy on labelled emails, agreement, latency, and failures. |

## Use cases

One at a time. Both sides use the same instructions, options, and criteria from `backend/usecases/definitions.ts`.

| Use case | Decision | Outputs |
|---|---|---|
| Email Detector | Classify the email | Sales inquiry, Support request, Billing question, Spam / irrelevant, Other |
| Model Router | Pick a model tier | Fast / low-cost, Balanced, Higher-capability. Real model IDs come from env. |
| Response Quality Gate | Judge a candidate reply | Accept, Retry / improve, Human review, plus the failed criteria |

For the quality gate, the candidate reply comes from the request, then the stored email. If neither has one, the API drafts it once with `OPENAI_BALANCED_MODEL` and both providers judge that same text.

## How results are shown

- **Agreement** means the two sides returned the same decision. It is reported on its own. It is not treated as correctness.
- **Accuracy** is computed only for Email Detector when the email has an expected label.
- **Cost** appears only when usage and the matching per-million token prices are set in `backend/.env`. Otherwise the UI shows unavailable.
- Missing provider fields stay unavailable. They are never shown as `0`.

## Layout

```text
frontend/          Next.js 16 (App Router), React 19, Tailwind v4 — port 3000
backend/           Bun.serve API, bun:sqlite — port 4000
  providers/       Decisions and Chat Completions adapters
  usecases/        shared categories, tiers, criteria, and quality-gate policy
  db/              SQLite schema and queries
docs/ROADMAP.md    product spec (still worded as "Jev")
```

Provider-specific request and response shapes stay inside `backend/providers/`. The rest of the app uses one normalized result.

## Checks

```bash
cd backend && bun test          # validation, normalization, agreement, failures
cd backend && bun run typecheck
cd frontend && bun run lint && bun run build
```

API routes, env vars, and the compare response shape are documented in `backend/README.md`.

Optional Langfuse tracing turns on when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set. Leave them empty to skip it.
