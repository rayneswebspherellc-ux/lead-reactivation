-- Sign-in: Google and email codes. No passwords are ever stored.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

-- Only a SHA-256 hash of each session token is stored: a database leak
-- cannot be turned into a working login.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

-- One-time email sign-in codes, hashed, short-lived, limited attempts.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email, created_at);

-- AI reads per agent per hour, to stop abuse (limits sit far above real use).
CREATE TABLE IF NOT EXISTS ai_usage (
  owner_id TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (owner_id, bucket)
);
