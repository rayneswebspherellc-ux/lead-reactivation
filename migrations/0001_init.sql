-- Lead Reactivation: saved data (Cloudflare D1 / SQLite).
-- Raw chat exports are never stored. Only what the agent chooses to keep
-- (lead name, platforms, outcome, AI read), encrypted per agent in `payload`.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_leads (
  owner_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  -- The owner is part of the key: the same lead id under two agents is two rows.
  PRIMARY KEY (owner_id, lead_id)
);

CREATE INDEX IF NOT EXISTS saved_leads_owner_updated ON saved_leads (owner_id, updated_at);
