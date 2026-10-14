ALTER TABLE policy_reviews ADD COLUMN servers_source TEXT NOT NULL DEFAULT '';
ALTER TABLE policy_reviews ADD COLUMN servers_load_issues TEXT NOT NULL DEFAULT '[]';

CREATE TABLE server_findings (
    id             INTEGER PRIMARY KEY,
    review_id      INTEGER NOT NULL REFERENCES policy_reviews (id),
    seq            INTEGER NOT NULL,
    host           TEXT    NOT NULL,
    ip             TEXT    NOT NULL DEFAULT '',
    state          TEXT    NOT NULL DEFAULT '{}',
    matched        TEXT    NOT NULL DEFAULT '',
    level          TEXT    CHECK (level IN ('정상', '주의', '위험')),
    reason         TEXT    NOT NULL DEFAULT '',
    recommendation TEXT    NOT NULL DEFAULT '',
    sources        TEXT    NOT NULL DEFAULT '[]',
    failed         INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error          TEXT,
    elapsed_sec    REAL,
    UNIQUE (review_id, seq),
    CHECK (failed = 1 OR level IS NOT NULL)
);
CREATE INDEX server_findings_host ON server_findings (host, review_id);

CREATE TRIGGER server_findings_immutable BEFORE UPDATE ON server_findings
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
