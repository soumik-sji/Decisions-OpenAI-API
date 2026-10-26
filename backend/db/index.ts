import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  expected_label TEXT,
  notes TEXT,
  candidate_reply TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processing_runs (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  input_snapshot TEXT NOT NULL,
  output_json TEXT,
  latency_ms REAL,
  error_kind TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_email ON processing_runs(email_id, created_at);

CREATE TABLE IF NOT EXISTS evaluation_results (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  use_case TEXT NOT NULL,
  decisions_run_id TEXT NOT NULL REFERENCES processing_runs(id),
  openai_run_id TEXT NOT NULL REFERENCES processing_runs(id),
  agreement INTEGER,
  expected_label TEXT,
  decisions_correct INTEGER,
  openai_correct INTEGER,
  benchmark_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_use_case ON evaluation_results(use_case, created_at);
`;

/**
 * Databases created before the switch from Jev to OpenAI Decisions have jev_* columns.
 * Rename them in place. Old runs keep provider = 'jev' so they are never shown or
 * counted as OpenAI Decisions results.
 */
function migrateFromJev(db: Database): void {
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(evaluation_results)").all();
  if (!cols.some((c) => c.name === "jev_run_id")) return;
  db.run("ALTER TABLE evaluation_results RENAME COLUMN jev_run_id TO decisions_run_id");
  db.run("ALTER TABLE evaluation_results RENAME COLUMN jev_correct TO decisions_correct");
}

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  migrateFromJev(db);
  db.run(SCHEMA);
  return db;
}
