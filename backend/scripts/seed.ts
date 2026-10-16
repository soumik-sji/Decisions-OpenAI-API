// Inserts the curated, labelled demo emails. Safe to run repeatedly: existing seed IDs are skipped.
import { loadConfig } from "../config";
import { openDatabase } from "../db";
import { getEmail, insertEmail } from "../db/queries";
import { SEED_EMAILS } from "../data/seed-emails";

const db = openDatabase(loadConfig().databasePath);
let inserted = 0;
for (const { id, ...email } of SEED_EMAILS) {
  if (getEmail(db, id)) continue;
  insertEmail(db, email, id);
  inserted++;
}
console.log(`Seeded ${inserted} email(s); ${SEED_EMAILS.length - inserted} already present.`);
