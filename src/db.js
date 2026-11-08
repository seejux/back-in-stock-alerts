import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
const dir = process.env.DATA_DIR || './data';
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(`${dir}/alerts.db`);
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL, sku TEXT NOT NULL, product_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',      -- open | sending | notified
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  claimed_at TEXT, notified_at TEXT, email_id TEXT);
-- one live (not yet notified) request per email+sku, enforced by the database
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live ON requests(email, sku) WHERE status != 'notified';
CREATE INDEX IF NOT EXISTS idx_sku_status ON requests(sku, status);
CREATE TABLE IF NOT EXISTS events(event_id TEXT PRIMARY KEY, sku TEXT, received_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
`);
