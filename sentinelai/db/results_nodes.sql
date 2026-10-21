ALTER TABLE server_snapshots ADD COLUMN node TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX server_snapshots_node ON server_snapshots (node, collected_at) WHERE node <> '';

CREATE TABLE node_findings (
    id          INTEGER PRIMARY KEY,
    node        TEXT    NOT NULL,
    snapshot_id INTEGER NOT NULL REFERENCES server_snapshots (id),
    host        TEXT    NOT NULL DEFAULT '',
    ip          TEXT    NOT NULL DEFAULT '',
    state       TEXT    NOT NULL DEFAULT '{}',
    matched     TEXT    NOT NULL DEFAULT '',
    level       TEXT    CHECK (level IN ('정상', '주의', '위험')),
    summary     TEXT    NOT NULL DEFAULT '',
    gaps        TEXT    NOT NULL DEFAULT '[]',
    unjudged    TEXT    NOT NULL DEFAULT '[]',
    sources     TEXT    NOT NULL DEFAULT '[]',
    failed      INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error       TEXT,
    elapsed_sec REAL,
    model       TEXT    NOT NULL DEFAULT '',
    created_at  TEXT    NOT NULL,
    CHECK (failed = 1 OR level IS NOT NULL)
);
CREATE INDEX node_findings_node ON node_findings (node, id);

CREATE TRIGGER node_findings_immutable BEFORE UPDATE ON node_findings
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
