# Jev Demonstration Product Roadmap

**Project type:** Concept demonstration / proof of concept\
**Target timeline:** 1 week, with a small buffer\
**Primary objective:** Help people understand the Jev concept through a
clear, working demonstration---not build a production-ready application.

------------------------------------------------------------------------

## 1. Product North Star

Build a lightweight web application that demonstrates how Jev can be
used in an AI workflow and lets an audience compare Jev with a
conventional OpenAI implementation using the **same input, one use case
at a time, on the same screen**.

The product succeeds when a viewer can understand: - What decision is
being made. - How Jev handles that decision. - How the OpenAI baseline
handles the same input. - Where the results agree or differ. - What the
demonstration does---and does not---prove.

**Keep the scope focused on learning, visibility, and a fair
comparison.**

## 2. Product Principles

1.  **Demonstrate, don't overbuild.** Implement only what is needed to
    explain the concept.
2.  **Same input, fair comparison.** Jev and OpenAI must receive
    equivalent inputs and comparable instructions for each selected use
    case.
3.  **One use case at a time.** The audience should be able to focus on
    a single decision before moving to the next.
4.  **Show real outputs.** Display actual provider responses, errors,
    and measured latency. Do not fabricate results or imply that
    unsupported metrics were measured.
5.  **Keep the workflow understandable.** Use a simulated email workflow
    instead of integrating a real mailbox or sending real email.
6.  **Separate the pages by purpose.** Keep Mail Sender separate from
    the Jev System and Comparison pages.
7.  **Make limitations visible.** Label the comparison as a
    demonstration and distinguish observed results from assumptions or
    conclusions.

## 3. MVP Scope

### Included

-   A simple simulated Mail Sender page.
-   A small inbox/list of submitted sample emails.
-   A main Jev System / Comparison page.
-   Side-by-side Jev and OpenAI results for the same email.
-   A selector to switch between the use cases below.
-   Basic workflow decision visibility.
-   A small set of labelled test emails for repeatable demonstrations.
-   Basic latency, outcome, error, and agreement reporting where
    supported.
-   API keys kept on the backend and loaded from environment variables.

### Explicitly out of scope

-   Real email delivery or mailbox integration.
-   Production authentication, roles, and permissions.
-   Enterprise-grade observability or distributed tracing.
-   Complex workflow builders or user-defined rules.
-   Large-scale benchmarking infrastructure.
-   Automatic retries or human-review operations beyond a simple demo
    outcome.
-   Production deployment hardening, high availability, or scaling.
-   Claims that Jev is universally better based on a small
    demonstration.

**Scope rule:** If a feature does not help the audience understand Jev
or compare it with the OpenAI baseline, defer it.

## 4. Core Demonstration Use Cases

Implement the use cases as separate selectable demonstrations. Start
with Email Detector because it is the easiest to explain, then add Model
Router and Response Quality Gate.

### Use Case 1 --- Email Detector

**Question demonstrated:** Can the system classify an incoming email
into a useful category?

Example categories: - Sales inquiry - Support request - Billing
question - Spam / irrelevant - Other

**Display:** - Input email. - Jev's classification. - OpenAI's
classification. - Whether the two outputs agree. - Optional expected
label for a curated test email. - Latency and errors for each run.

**MVP acceptance:** Both implementations process the same email and
produce a visible, normalized classification result.

### Use Case 2 --- Model Router

**Question demonstrated:** Can a system select an appropriate model tier
for a request?

For the demonstration, define a small and transparent set of routing
targets, such as: - Fast / low-cost model. - Balanced model. -
Higher-capability model.

The exact model names should be configured based on models available to
the project. Do not assume Jev exposes a specific model or routing field
until its current API documentation confirms it.

**Display:** - Input email or task. - Routing decision from Jev. -
Routing decision from the OpenAI baseline. - Short reason or structured
explanation, if returned. - Whether the decisions match. - Latency and
errors.

**MVP acceptance:** Both implementations return a routing decision using
the same agreed routing policy and input.

### Use Case 3 --- Response Quality Gate

**Question demonstrated:** Can a generated response be checked before it
is used?

Use a simple set of outcomes: - Accept - Retry / improve - Human review

**Display:** - The source email and candidate response. - Jev's
quality-gate decision. - OpenAI's quality-gate decision. - The reason or
failed criteria, if available. - Whether the decisions match.

**MVP acceptance:** Both implementations evaluate the same candidate
response against the same simple criteria. The demo shows the decision
and reason without implying that the gate guarantees correctness.

## 5. Page Structure

### Page A --- Mail Sender (`/mail-sender`)

Purpose: Create a simulated email that can be used in the demonstration.

Minimum fields: - From name or address (sample text is sufficient). -
Subject. - Email body. - Optional use-case notes or expected label for
test data.

Actions: - Submit / Save Email. - Open the saved email in the comparison
view.

This page **does not send a real email**. Its job is to create demo
inputs.

### Page B --- Jev System / Comparison (`/comparison/:emailId`)

Purpose: Run and explain one selected use case.

Minimum layout: 1. Selected email and its content. 2. Use-case selector.
3. **Jev result panel.** 4. **OpenAI baseline result panel.** 5.
Agreement / difference summary. 6. Latency and execution status for both
sides. 7. Run / rerun action. 8. Optional expected result for curated
test emails.

Both panels should remain visible together so the audience does not need
to switch pages to compare them.

### Page C --- Inbox / Demo Cases (`/dashboard`)

Purpose: Find a submitted email or select a prepared example.

Minimum features: - List of saved emails. - Subject and short preview. -
Optional expected category / test label. - Open in comparison action.

### Optional Page D --- Results Summary (`/benchmarks`)

Build only after the core comparison works.

Show a small summary for a curated test set: - Number of completed
runs. - Accuracy where expected labels exist. - Agreement rate between
Jev and OpenAI. - Median or average latency, clearly labelled. - Failed
runs and invalid outputs.

Do not treat agreement as correctness. Accuracy requires a ground-truth
label, and cost should be shown only when reliable usage and pricing
data are available.

## 6. Recommended Architecture

### Frontend

-   React
-   TypeScript
-   Vite
-   Simple routing
-   Minimal component structure

### Backend

-   Node.js
-   TypeScript
-   Express or a similarly small HTTP framework
-   SQLite for local demonstration data
-   Jev API adapter
-   OpenAI API adapter

### Data flow

1.  User creates a simulated email in the frontend.
2.  Frontend sends the email to the backend.
3.  Backend saves the email.
4.  User opens the comparison page and selects a use case.
5.  Backend runs the Jev and OpenAI implementations against equivalent
    inputs.
6.  Backend normalizes provider results into a common response format.
7.  Frontend displays both outputs, execution status, and measured
    latency.
8.  Results are saved so the demo can be repeated and reviewed.

**Important:** Keep provider API keys on the backend. Do not put secrets
in frontend environment variables or browser code.

## 7. Phase-by-Phase Roadmap

### Phase 0 --- Confirm the Demonstration Contract

**Goal:** Remove uncertainty before building.

Tasks: - \[ \] Review the current Jev documentation and verify how to
call the API. - \[ \] Confirm available Jev capabilities and the actual
request/response format. - \[ \] Confirm the available OpenAI models. -
\[ \] Define the input and expected output for each use case. - \[ \]
Select 5--10 sample emails, including expected labels for Email
Detector. - \[ \] Agree on the exact comparison metrics to display. - \[
\] Create `.env.example` with variable names only, never real secrets.

**Deliverable:** A short implementation contract and a small labelled
test set.

**Exit criteria:** The team knows what will be called, what each use
case returns, and what will be shown on screen.

### Phase 1 --- Minimal App and Backend Foundation

**Goal:** Get the app running end to end at a basic level.

Frontend: - \[ \] Create the React + TypeScript app. - \[ \] Add the
Mail Sender, Dashboard, and Comparison routes. - \[ \] Add basic
navigation and a simple visual layout.

Backend: - \[ \] Create the Node.js + TypeScript server. - \[ \] Add a
health-check endpoint. - \[ \] Configure environment variables. - \[ \]
Add SQLite and the minimum tables for emails and processing runs. - \[
\] Add consistent error handling.

**Deliverable:** The frontend can communicate with the backend, and the
application starts locally.

### Phase 2 --- Simulated Mail Sender and Inbox

**Goal:** Create reusable inputs for the demo.

Frontend: - \[ \] Build the simulated Mail Sender form. - \[ \] Add
basic required-field validation. - \[ \] Build the inbox / demo-case
list. - \[ \] Add an action to open an email in Comparison.

Backend: - \[ \] Implement create email. - \[ \] Implement list
emails. - \[ \] Implement get email by ID. - \[ \] Save optional
expected labels for curated cases.

**Deliverable:** A user can create an email and open it on the
comparison page.

### Phase 3 --- Provider Integrations

**Goal:** Prove that both sides can return real results.

Backend: - \[ \] Implement a small Jev adapter using the verified
current API contract. - \[ \] Implement an OpenAI adapter. - \[ \] Keep
provider-specific request formats inside their adapters. - \[ \]
Normalize responses into a shared internal result shape. - \[ \] Capture
elapsed time, status, and safe error messages. - \[ \] Handle timeouts
and invalid provider outputs. - \[ \] Never silently replace a failed
live call with fabricated output.

Frontend: - \[ \] Add loading, completed, and failed states. - \[ \]
Display raw or structured results in a readable form.

**Deliverable:** A simple test can call each provider and display its
real result.

**Exit criteria:** Both providers work independently before comparison
orchestration is added.

### Phase 4 --- Email Detector Comparison

**Goal:** Complete one fully working use case first.

Backend: - \[ \] Define the shared Email Detector input and output
schema. - \[ \] Run Jev and OpenAI against the same email. - \[ \]
Normalize category names consistently. - \[ \] Compare outputs and
compute agreement. - \[ \] Store both run results.

Frontend: - \[ \] Add the Email Detector selector. - \[ \] Show Jev and
OpenAI side by side. - \[ \] Show agreement / difference. - \[ \] Show
latency and errors separately. - \[ \] Show expected label for curated
cases.

**Deliverable:** A complete, repeatable end-to-end comparison for Email
Detector.

**Priority:** This is the first major demo milestone. Do not begin
polishing charts before this works.

### Phase 5 --- Model Router and Response Quality Gate

**Goal:** Add the remaining two use cases without overengineering.

Backend: - \[ \] Implement the shared routing policy and output
schema. - \[ \] Implement Model Router evaluation for Jev and OpenAI. -
\[ \] Implement the candidate-response and quality criteria schema. - \[
\] Implement Response Quality Gate evaluation for both. - \[ \] Save
each use case as a separate processing run. - \[ \] Validate outputs
before displaying them.

Frontend: - \[ \] Add the Model Router option. - \[ \] Add the Response
Quality Gate option. - \[ \] Keep the same side-by-side layout for all
use cases. - \[ \] Explain each decision in short, understandable
language. - \[ \] Show unavailable fields as unavailable rather than
inventing values.

**Deliverable:** All three use cases can be demonstrated from the same
comparison interface.

### Phase 6 --- Small Benchmark and Demo Readiness

**Goal:** Make the demonstration credible, repeatable, and easy to
present.

Tasks: - \[ \] Run the curated sample set several times. - \[ \] Verify
that both providers receive equivalent inputs. - \[ \] Report completion
and failure counts. - \[ \] Calculate accuracy only for labelled
examples. - \[ \] Calculate agreement separately from accuracy. - \[ \]
Report latency using a clearly identified measurement method. - \[ \]
Avoid cost comparisons unless actual usage and pricing data are
available. - \[ \] Add a clear empty state and readable provider
errors. - \[ \] Test the demo from a fresh application start. - \[ \]
Prepare 3--5 sample scenarios and a short presentation sequence.

**Deliverable:** A stable demonstration that can be run live without
relying on pre-filled fake results.

### Phase 7 --- Buffer and Final Rehearsal

**Goal:** Fix demo blockers, not expand scope.

Tasks: - \[ \] Fix critical bugs in the three core use cases. - \[ \]
Verify the `.env` setup on the demo machine. - \[ \] Confirm that no API
keys appear in frontend bundles or logs. - \[ \] Check the page flow and
comparison readability. - \[ \] Rehearse the full demonstration. - \[ \]
Document known limitations.

**Deliverable:** A presentation-ready demo and a short list of
limitations.

## 8. Suggested One-Week Schedule

  -----------------------------------------------------------------------
  Day                     Main focus              Expected outcome
  ----------------------- ----------------------- -----------------------
  Day 1                   Confirm Jev API, define App starts and
                          contracts, scaffold     contracts are clear
                          frontend/backend        

  Day 2                   Mail Sender, inbox,     Reusable demo inputs
                          email APIs              work

  Day 3                   Jev and OpenAI adapters Both providers return
                                                  real results
                                                  independently

  Day 4                   Email Detector          First complete
                          comparison              side-by-side use case

  Day 5                   Model Router and        Three use cases
                          Quality Gate            available

  Day 6                   Curated tests, basic    Repeatable and credible
                          metrics, error handling results

  Day 7                   QA, polish, rehearsal,  Demo ready to present
                          documentation           
  -----------------------------------------------------------------------

Keep a small buffer after Day 7 if available. If the Jev API integration
takes longer than expected, reduce optional reporting and UI polish
before cutting the core comparison.

## 9. Suggested Frontend and Backend Work Split

### Frontend workstream

1.  App scaffold, routes, and navigation.
2.  Simulated Mail Sender form.
3.  Inbox / demo-case list.
4.  Shared side-by-side comparison layout.
5.  Use-case selector and decision visualization.
6.  Loading, errors, latency, and status display.
7.  Optional benchmark summary.
8.  End-to-end QA and presentation polish.

### Backend workstream

1.  Server, environment configuration, and SQLite.
2.  Email create/list/get APIs.
3.  Jev API adapter.
4.  OpenAI API adapter.
5.  Shared result schemas and validation.
6.  Email Detector orchestration and persistence.
7.  Model Router orchestration.
8.  Response Quality Gate orchestration.
9.  Basic benchmark calculations.
10. Error handling, security checks, and QA.

**Integration checkpoint:** Agree on the API contract before the
frontend and backend implement the comparison flow. Use a documented
sample response for early UI development, but label it as mock data and
replace it with real provider results before the final demo.

## 10. Minimum Data Model

Use the smallest data model that supports the demo.

### `emails`

-   `id`
-   `from_name` or `from_address`
-   `subject`
-   `body`
-   `expected_label` (optional)
-   `created_at`

### `processing_runs`

-   `id`
-   `email_id`
-   `use_case`
-   `provider`
-   `status`
-   `input_snapshot`
-   `output_json`
-   `latency_ms`
-   `error_message` (safe, non-sensitive)
-   `created_at`

### `evaluation_results` (optional for the first version)

-   `id`
-   `email_id`
-   `use_case`
-   `jev_run_id`
-   `openai_run_id`
-   `agreement`
-   `ground_truth_correctness`
-   `created_at`

Keep the schema flexible enough for different use-case outputs, but
avoid building a generic workflow engine.

## 11. API Contract --- MVP

Suggested endpoints:

-   `GET /api/health`
-   `POST /api/emails`
-   `GET /api/emails`
-   `GET /api/emails/:id`
-   `POST /api/emails/:id/compare`
-   `GET /api/emails/:id/runs`
-   `POST /api/benchmarks/run` (optional)
-   `GET /api/benchmarks/results` (optional)

Example comparison request:

``` json
{
  "useCase": "email_detection"
}
```

Allowed `useCase` values: - `email_detection` - `model_routing` -
`response_quality`

The backend should return normalized results for both providers, plus
comparison metadata. Treat this as an internal application contract, not
a claim about the native Jev or OpenAI API response format. Verify the
real Jev request and response fields against current documentation
before implementing the adapter.

## 12. Demo Success Criteria

The MVP is ready when:

-   [ ] The Mail Sender is a separate page and does not send real email.
-   [ ] A user can create and select a sample email.
-   [ ] The comparison page displays Jev and OpenAI together.
-   [ ] The user can select one use case at a time.
-   [ ] Both sides process equivalent inputs.
-   [ ] Results are based on real provider calls in the final demo.
-   [ ] Provider errors are visible and not disguised as successful
    output.
-   [ ] Latency is measured consistently and labelled.
-   [ ] Expected labels are used for accuracy only when supplied.
-   [ ] Agreement is not presented as proof of correctness.
-   [ ] The three use cases can be explained in a few minutes.
-   [ ] The app can be started and demonstrated from documented setup
    steps.

## 13. What to Cut First if Time Runs Short

Cut in this order:

1.  Fancy charts and animations.
2.  Dedicated benchmark page.
3.  Persistent history beyond the current demo session.
4.  Advanced filtering and extra email fields.
5.  Detailed explanations beyond the core decision.
6.  Additional use cases beyond the three agreed ones, if needed.

Do **not** cut: - The real Jev integration. - The OpenAI baseline. - The
same-input comparison. - The separate Mail Sender page. - The first
complete end-to-end use case. - Clear errors and honest reporting.

If necessary, finish Email Detector completely first, then add
simplified versions of Model Router and Response Quality Gate.

## 14. Risks and Mitigations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Jev API details or capabilities     Verify official docs and run a
  differ from assumptions             minimal API spike on Day 1

  Provider outputs have different     Normalize through separate provider
  structures                          adapters and shared internal
                                      schemas

  Results vary between runs           Save run inputs/outputs and use a
                                      fixed curated test set

  A small sample gives misleading     Label the work as a demonstration;
  conclusions                         avoid broad performance claims

  One provider call fails             Show the failure clearly and allow
                                      a rerun

  API keys leak into the browser      Keep all provider calls and secrets
                                      on the backend

  Scope expands into a production     Use the explicit out-of-scope list
  application                         and cut optional features first

  Metrics are unavailable or not      Omit them or label them as
  comparable                          unavailable; do not fabricate
                                      values
  -----------------------------------------------------------------------

## 15. Final Product Definition

**The deliverable is a small, presentation-ready web app that lets an
audience create a simulated email, choose one of three AI workflow use
cases, and compare Jev with an OpenAI baseline side by side using the
same input.**

The app should make the underlying idea easy to understand, show actual
outcomes transparently, and support a short live demonstration. It is a
learning artifact and proof of concept---not a production email system,
a full workflow platform, or a definitive benchmark of either
technology.
