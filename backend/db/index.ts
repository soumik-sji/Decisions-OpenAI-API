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
  jev_run_id TEXT NOT NULL REFERENCES processing_runs(id),
  openai_run_id TEXT NOT NULL REFERENCES processing_runs(id),
  agreement INTEGER,
  expected_label TEXT,
  jev_correct INTEGER,
  openai_correct INTEGER,
  benchmark_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_eval_use_case ON evaluation_results(use_case, created_at);
`;

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  return db;
}
