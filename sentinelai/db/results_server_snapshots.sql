CREATE TABLE server_snapshots (
    id           INTEGER PRIMARY KEY,
    host         TEXT    NOT NULL,
    ip           TEXT    NOT NULL DEFAULT '',
    collected_at TEXT    NOT NULL,
    collected_by TEXT    NOT NULL DEFAULT '',
    file         TEXT    NOT NULL DEFAULT '',
    modules      TEXT    NOT NULL DEFAULT '{}',
    sections     TEXT    NOT NULL DEFAULT '{}',
    changes      TEXT    NOT NULL DEFAULT '[]',
    loaded_at    TEXT    NOT NULL,
    UNIQUE (host, collected_at)
);
CREATE INDEX server_snapshots_latest ON server_snapshots (host, collected_at);

CREATE TRIGGER server_snapshots_immutable BEFORE UPDATE ON server_snapshots
BEGIN
    SELECT RAISE(ABORT, '수집 기록은 고칠 수 없습니다');
END;

ALTER TABLE server_findings ADD COLUMN snapshot TEXT NOT NULL DEFAULT '{}';
