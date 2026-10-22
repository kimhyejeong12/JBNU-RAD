CREATE TABLE suspect_scores (
    id          INTEGER PRIMARY KEY,
    person      TEXT    NOT NULL,
    subject     TEXT    NOT NULL DEFAULT '',
    log_id      TEXT    NOT NULL DEFAULT '',
    login_id    TEXT,
    score       INTEGER CHECK (score BETWEEN 0 AND 100),
    level       TEXT    CHECK (level IN ('낮음', '보통', '높음')),
    reason      TEXT    NOT NULL DEFAULT '',
    watch       TEXT    NOT NULL DEFAULT '',
    signals     TEXT    NOT NULL DEFAULT '{}',
    records     TEXT    NOT NULL DEFAULT '{}',
    failed      INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error       TEXT,
    elapsed_sec REAL,
    model       TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL,
    CHECK (failed = 1 OR (score IS NOT NULL AND level IS NOT NULL))
);
CREATE INDEX suspect_scores_person ON suspect_scores (person, id);

CREATE TRIGGER suspect_scores_immutable BEFORE UPDATE ON suspect_scores
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
