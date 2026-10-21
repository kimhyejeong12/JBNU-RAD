CREATE TABLE nodes (
    id                INTEGER PRIMARY KEY,
    name              TEXT    NOT NULL UNIQUE,
    key_hash          TEXT,
    host              TEXT    NOT NULL DEFAULT '',
    ip                TEXT    NOT NULL DEFAULT '',
    agent_version     TEXT    NOT NULL DEFAULT '',
    interval_min      INTEGER NOT NULL DEFAULT 0,
    enabled           INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    registered_at     TEXT    NOT NULL,
    last_seen_at      TEXT,
    last_collected_at TEXT
);
