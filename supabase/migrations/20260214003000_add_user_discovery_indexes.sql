-- Improve latency for home user discovery queries.
-- Search endpoints use case-insensitive substring matching and frequent-recipient lookups.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Supports /users/search ranking and filtering on username/full_name.
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users ((lower(username)));
CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops);

-- Supports /users/frequent lookups by sender/type/status with recent ordering.
CREATE INDEX IF NOT EXISTS idx_transactions_sender_type_status_created
  ON transactions (sender_id, type, status, created_at DESC);
