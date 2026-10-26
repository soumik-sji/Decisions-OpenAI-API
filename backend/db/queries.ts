import type { Database } from "bun:sqlite";
import type { CreateEmailInput, ErrorKind, Provider } from "../schemas";

export type EmailRow = {
  id: string;
  from_address: string;
  to_address: string | null;
  subject: string;
  body: string;
  expected_label: string | null;
  notes: string | null;
  candidate_reply: string | null;
  created_at: string;
};

export type Email = {
  id: string;
  from: string;
  to: string | null;
  subject: string;
  body: string;
  expectedLabel: string | null;
  notes: string | null;
  candidateReply: string | null;
  createdAt: string;
};

export function toEmail(row: EmailRow): Email {
  return {
    id: row.id,
    from: row.from_address,
    to: row.to_address,
    subject: row.subject,
    body: row.body,
    expectedLabel: row.expected_label,
    notes: row.notes,
    candidateReply: row.candidate_reply,
    createdAt: row.created_at,
  };
}

export function insertEmail(db: Database, input: CreateEmailInput, id: string = crypto.randomUUID()): Email {
  const row = db
    .query<EmailRow, Record<string, string | null>>(
      `INSERT INTO emails (id, from_address, to_address, subject, body, expected_label, notes, candidate_reply, created_at)
       VALUES ($id, $from, $to, $subject, $body, $expected, $notes, $reply, $createdAt)
       RETURNING *`,
    )
    .get({
      id,
      from: input.from,
      to: input.to ?? null,
      subject: input.subject,
      body: input.body,
      expected: input.expectedLabel ?? null,
      notes: input.notes ?? null,
      reply: input.candidateReply ?? null,
      createdAt: new Date().toISOString(),
    });
  if (!row) throw new Error("Insert returned no row");
  return toEmail(row);
}

export function listEmails(db: Database): Email[] {
  return db
    .query<EmailRow, []>("SELECT * FROM emails ORDER BY created_at DESC, rowid DESC")
    .all()
    .map(toEmail);
}

export function getEmail(db: Database, id: string): Email | null {
  const row = db.query<EmailRow, [string]>("SELECT * FROM emails WHERE id = ?").get(id);
  return row ? toEmail(row) : null;
}

export type RunInsert = {
  id: string;
  emailId: string;
  useCase: string;
  provider: Provider;
  status: "completed" | "failed";
  inputSnapshot: unknown;
  output: unknown;
  latencyMs: number | null;
  errorKind: ErrorKind | null;
  errorMessage: string | null;
};

export function insertRun(db: Database, run: RunInsert): void {
  db.query(
    `INSERT INTO processing_runs (id, email_id, use_case, provider, status, input_snapshot, output_json, latency_ms, error_kind, error_message, created_at)
     VALUES ($id, $emailId, $useCase, $provider, $status, $input, $output, $latency, $errorKind, $error, $createdAt)`,
  ).run({
    id: run.id,
    emailId: run.emailId,
    useCase: run.useCase,
    provider: run.provider,
    status: run.status,
    input: JSON.stringify(run.inputSnapshot),
    output: run.output === null ? null : JSON.stringify(run.output),
    latency: run.latencyMs,
    errorKind: run.errorKind,
    error: run.errorMessage,
    createdAt: new Date().toISOString(),
  });
}

type RunRow = {
  id: string;
  email_id: string;
  use_case: string;
  provider: string;
  status: string;
  input_snapshot: string;
  output_json: string | null;
  latency_ms: number | null;
  error_kind: string | null;
  error_message: string | null;
  created_at: string;
};

export function listRuns(db: Database, emailId: string) {
  return db
    .query<RunRow, [string]>(
      "SELECT * FROM processing_runs WHERE email_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(emailId)
    .map((r) => ({
      id: r.id,
      emailId: r.email_id,
      useCase: r.use_case,
      provider: r.provider,
      status: r.status,
      input: JSON.parse(r.input_snapshot) as unknown,
      output: r.output_json === null ? null : (JSON.parse(r.output_json) as unknown),
      latencyMs: r.latency_ms,
      errorKind: r.error_kind,
      error: r.error_message,
      createdAt: r.created_at,
    }));
}

export type EvaluationInsert = {
  id: string;
  emailId: string;
  useCase: string;
  decisionsRunId: string;
  openaiRunId: string;
  agreement: boolean | null;
  expectedLabel: string | null;
  decisionsCorrect: boolean | null;
  openaiCorrect: boolean | null;
  benchmarkId: string | null;
};

const bool = (v: boolean | null) => (v === null ? null : v ? 1 : 0);

export function insertEvaluation(db: Database, e: EvaluationInsert): void {
  db.query(
    `INSERT INTO evaluation_results (id, email_id, use_case, decisions_run_id, openai_run_id, agreement, expected_label, decisions_correct, openai_correct, benchmark_id, created_at)
     VALUES ($id, $emailId, $useCase, $decisionsRunId, $openaiRunId, $agreement, $expected, $decisionsCorrect, $openaiCorrect, $benchmarkId, $createdAt)`,
  ).run({
    id: e.id,
    emailId: e.emailId,
    useCase: e.useCase,
    decisionsRunId: e.decisionsRunId,
    openaiRunId: e.openaiRunId,
    agreement: bool(e.agreement),
    expected: e.expectedLabel,
    decisionsCorrect: bool(e.decisionsCorrect),
    openaiCorrect: bool(e.openaiCorrect),
    benchmarkId: e.benchmarkId,
    createdAt: new Date().toISOString(),
  });
}

export type EvaluationJoinedRow = {
  id: string;
  use_case: string;
  benchmark_id: string | null;
  agreement: number | null;
  expected_label: string | null;
  decisions_correct: number | null;
  openai_correct: number | null;
  decisions_status: string;
  decisions_latency_ms: number | null;
  decisions_error_kind: string | null;
  openai_status: string;
  openai_latency_ms: number | null;
  openai_error_kind: string | null;
  created_at: string;
};

export function listEvaluations(
  db: Database,
  filter: { useCase?: string; benchmarkId?: string },
): EvaluationJoinedRow[] {
  return db
    .query<EvaluationJoinedRow, Record<string, string | null>>(
      `SELECT e.id, e.use_case, e.benchmark_id, e.agreement, e.expected_label, e.decisions_correct, e.openai_correct,
              j.status AS decisions_status, j.latency_ms AS decisions_latency_ms, j.error_kind AS decisions_error_kind,
              o.status AS openai_status, o.latency_ms AS openai_latency_ms, o.error_kind AS openai_error_kind,
              e.created_at
       FROM evaluation_results e
       JOIN processing_runs j ON j.id = e.decisions_run_id AND j.provider = 'decisions'
       JOIN processing_runs o ON o.id = e.openai_run_id
       WHERE ($useCase IS NULL OR e.use_case = $useCase)
         AND ($benchmarkId IS NULL OR e.benchmark_id = $benchmarkId)
       ORDER BY e.created_at`,
    )
    .all({ useCase: filter.useCase ?? null, benchmarkId: filter.benchmarkId ?? null });
}
