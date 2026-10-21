CREATE TABLE policy_reviews (
    id          INTEGER PRIMARY KEY,
    source      TEXT    NOT NULL DEFAULT '',
    load_issues TEXT    NOT NULL DEFAULT '[]',
    rules       TEXT    NOT NULL DEFAULT '[]',
    summary     TEXT    NOT NULL DEFAULT '',
    failed      INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error       TEXT,
    model       TEXT    NOT NULL,
    elapsed_sec REAL,
    created_at  TEXT    NOT NULL
);

CREATE TABLE policy_issues (
    id             INTEGER PRIMARY KEY,
    review_id      INTEGER NOT NULL REFERENCES policy_reviews (id),
    seq            INTEGER NOT NULL,
    kind           TEXT    NOT NULL,
    level          TEXT    NOT NULL CHECK (level IN ('정상', '주의', '위험')),
    policy_ids     TEXT    NOT NULL DEFAULT '[]',
    reason         TEXT    NOT NULL DEFAULT '',
    recommendation TEXT    NOT NULL DEFAULT '',
    UNIQUE (review_id, seq)
);

CREATE TABLE monitor_runs (
    id            INTEGER PRIMARY KEY,
    source        TEXT    NOT NULL DEFAULT '',
    load_issues   TEXT    NOT NULL DEFAULT '[]',
    since         TEXT,
    until         TEXT,
    last_event_at TEXT,
    model         TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);

CREATE TABLE event_findings (
    id             INTEGER PRIMARY KEY,
    run_id         INTEGER NOT NULL REFERENCES monitor_runs (id),
    user           TEXT    NOT NULL,
    subject        TEXT    NOT NULL DEFAULT '',
    first_event_at TEXT    NOT NULL,
    last_event_at  TEXT    NOT NULL,
    events         TEXT    NOT NULL,
    level          TEXT    CHECK (level IN ('정상', '주의', '위험')),
    reason         TEXT    NOT NULL DEFAULT '',
    recommendation TEXT    NOT NULL DEFAULT '',
    sources        TEXT    NOT NULL DEFAULT '[]',
    failed         INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error          TEXT,
    elapsed_sec    REAL,
    CHECK (failed = 1 OR level IS NOT NULL)
);
CREATE INDEX event_findings_run ON event_findings (run_id);
CREATE INDEX event_findings_user ON event_findings (user, last_event_at);

CREATE TABLE qa_records (
    id               INTEGER PRIMARY KEY,
    kind             TEXT    NOT NULL CHECK (kind IN ('policy', 'logs')),
    question         TEXT    NOT NULL,
    answer           TEXT    NOT NULL DEFAULT '',
    sources          TEXT    NOT NULL DEFAULT '[]',
    criteria         TEXT    NOT NULL DEFAULT '{}',
    facts            TEXT,
    evidence         TEXT    NOT NULL DEFAULT '[]',
    failed           INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error            TEXT,
    model            TEXT    NOT NULL,
    elapsed_sec      REAL,
    asker_id         INTEGER NOT NULL,
    asker_name       TEXT    NOT NULL,
    asker_department TEXT    NOT NULL DEFAULT '',
    asked_at         TEXT    NOT NULL
);
CREATE INDEX qa_records_asker ON qa_records (asker_id, kind, asked_at);

CREATE TRIGGER policy_reviews_immutable BEFORE UPDATE ON policy_reviews
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;

CREATE TRIGGER policy_issues_immutable BEFORE UPDATE ON policy_issues
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;

CREATE TRIGGER monitor_runs_immutable BEFORE UPDATE ON monitor_runs
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;

CREATE TRIGGER event_findings_immutable BEFORE UPDATE ON event_findings
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;

CREATE TRIGGER qa_records_immutable BEFORE UPDATE ON qa_records
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
