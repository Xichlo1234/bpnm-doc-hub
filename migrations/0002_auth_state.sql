-- Migration 0002: auth state shared by all Worker isolates (was isolate-local memory).

-- Sessions ended by logout. Rows are pruned once the token would have expired anyway.
CREATE TABLE auth_revoked_sessions (
  sid TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_revoked_sessions_expires_at ON auth_revoked_sessions(expires_at);

-- Failed login counters per (IP, username) for throttling password guessing.
CREATE TABLE auth_login_failures (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);
