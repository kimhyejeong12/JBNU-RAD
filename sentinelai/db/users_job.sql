ALTER TABLE users ADD COLUMN job TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN left_on TEXT NOT NULL DEFAULT '';
ALTER TABLE access_requests ADD COLUMN requester_job TEXT NOT NULL DEFAULT '';

CREATE TRIGGER access_requests_job_frozen
BEFORE UPDATE OF requester_job ON access_requests
BEGIN
    SELECT RAISE(ABORT, '제출한 신청 내용은 고칠 수 없습니다');
END;

CREATE TABLE user_moves (
    id              INTEGER PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users (id),
    from_department TEXT    NOT NULL DEFAULT '',
    from_job        TEXT    NOT NULL DEFAULT '',
    to_department   TEXT    NOT NULL DEFAULT '',
    to_job          TEXT    NOT NULL DEFAULT '',
    moved_on        TEXT    NOT NULL,
    recorded_at     TEXT    NOT NULL,
    recorded_by     INTEGER NOT NULL REFERENCES users (id)
);
CREATE INDEX user_moves_user ON user_moves (user_id, id);

CREATE TRIGGER user_moves_immutable_update BEFORE UPDATE ON user_moves
BEGIN
    SELECT RAISE(ABORT, '이동 기록은 고칠 수 없습니다');
END;

CREATE TRIGGER user_moves_immutable_delete BEFORE DELETE ON user_moves
BEGIN
    SELECT RAISE(ABORT, '이동 기록은 지울 수 없습니다');
END;

CREATE TABLE grant_reviews (
    id             INTEGER PRIMARY KEY,
    request_id     INTEGER NOT NULL REFERENCES access_requests (id),
    move_id        INTEGER NOT NULL REFERENCES user_moves (id),
    level          TEXT    CHECK (level IN ('정상', '주의', '위험')),
    reason         TEXT    NOT NULL DEFAULT '',
    recommendation TEXT    NOT NULL DEFAULT '',
    sources        TEXT    NOT NULL DEFAULT '[]',
    failed         INTEGER NOT NULL DEFAULT 0 CHECK (failed IN (0, 1)),
    error          TEXT,
    model          TEXT    NOT NULL DEFAULT '',
    elapsed_sec    REAL,
    judged_at      TEXT    NOT NULL,
    CHECK (failed = 1 OR level IS NOT NULL)
);
CREATE INDEX grant_reviews_request ON grant_reviews (request_id, move_id, id);

CREATE TRIGGER grant_reviews_immutable BEFORE UPDATE ON grant_reviews
BEGIN
    SELECT RAISE(ABORT, 'AI 결과는 고칠 수 없습니다');
END;
