CREATE TABLE request_verdicts (
    id             INTEGER PRIMARY KEY,
    request_no     TEXT    NOT NULL,
    level          TEXT CHECK (level IN ('정상', '주의', '위험')),
    reason         TEXT    NOT NULL DEFAULT '',
    recommendation TEXT    NOT NULL DEFAULT '',
    sources        TEXT    NOT NULL DEFAULT '[]',
    failed         INTEGER NOT NULL DEFAULT 0,
    error          TEXT,
    model          TEXT    NOT NULL,
    elapsed_sec    REAL,
    created_at     TEXT    NOT NULL,
    CHECK (failed = 1 OR level IS NOT NULL)
);
CREATE INDEX request_verdicts_request ON request_verdicts (request_no, created_at);
