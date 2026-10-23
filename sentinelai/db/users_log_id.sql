ALTER TABLE users ADD COLUMN log_id TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX users_log_id ON users (log_id) WHERE log_id <> '';
