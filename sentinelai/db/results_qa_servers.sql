CREATE TABLE qa_records_new (
    id               INTEGER PRIMARY KEY,
    kind             TEXT    NOT NULL CHECK (kind IN ('policy', 'logs', 'servers')),
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
INSERT INTO qa_records_new SELECT * FROM qa_records;
DROP TABLE qa_records;
ALTER TABLE qa_records_new RENAME TO qa_records;
CREATE INDEX qa_records_asker ON qa_records (asker_id, kind, asked_at);

CREATE TRIGGER qa_records_immutable BEFORE UPDATE ON qa_records
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
