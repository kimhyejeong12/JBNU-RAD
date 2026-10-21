CREATE TABLE users (
    id                   INTEGER PRIMARY KEY,
    login_id             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash        TEXT    NOT NULL,
    display_name         TEXT    NOT NULL,
    department           TEXT    NOT NULL DEFAULT '',
    role                 TEXT    NOT NULL CHECK (role IN ('top', 'manager', 'user')),
    is_root              INTEGER NOT NULL DEFAULT 0 CHECK (is_root IN (0, 1)),
    is_active            INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    failed_logins        INTEGER NOT NULL DEFAULT 0,
    locked_until         TEXT,
    password_changed_at  TEXT,
    last_login_at        TEXT,
    created_at           TEXT    NOT NULL,
    created_by           INTEGER REFERENCES users (id),
    CHECK (is_root = 0 OR role = 'top'),
    CHECK (is_root = 1 OR created_by IS NOT NULL)
);
CREATE UNIQUE INDEX users_single_root ON users (is_root) WHERE is_root = 1;

CREATE TRIGGER users_created_by_root
BEFORE INSERT ON users
WHEN NEW.created_by IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND is_root = 1 AND is_active = 1)
BEGIN
    SELECT RAISE(ABORT, '계정은 루트만 만들 수 있습니다');
END;

CREATE TABLE sessions (
    id           INTEGER PRIMARY KEY,
    token_hash   TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users (id),
    created_at   TEXT    NOT NULL,
    last_seen_at TEXT    NOT NULL,
    expires_at   TEXT    NOT NULL,
    revoked_at   TEXT,
    ip           TEXT,
    user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY,
    at          TEXT    NOT NULL,
    user_id     INTEGER REFERENCES users (id),
    login_id    TEXT,
    action      TEXT    NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    detail      TEXT    NOT NULL DEFAULT '{}',
    ip          TEXT
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_user ON audit_log (user_id, at);

CREATE TABLE access_requests (
    id                   INTEGER PRIMARY KEY,
    request_no           TEXT    NOT NULL UNIQUE
                                 CHECK (request_no GLOB 'REQ-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]'
                                        AND date(substr(request_no, 5, 4) || '-' || substr(request_no, 9, 2) || '-' || substr(request_no, 11, 2))
                                            IS substr(request_no, 5, 4) || '-' || substr(request_no, 9, 2) || '-' || substr(request_no, 11, 2)),
    requester_id         INTEGER NOT NULL REFERENCES users (id),
    requester_name       TEXT    NOT NULL,
    requester_department TEXT    NOT NULL DEFAULT '',
    requested_access     TEXT    NOT NULL,
    current_access       TEXT    NOT NULL DEFAULT '',
    reason               TEXT    NOT NULL DEFAULT '',
    period_start         TEXT    NOT NULL DEFAULT '',
    period_end           TEXT    NOT NULL DEFAULT '',
    stage                TEXT    NOT NULL DEFAULT 'manager'
                                 CHECK (stage IN ('manager', 'top', 'approved', 'rejected', 'withdrawn', 'revoked')),
    submitted_at         TEXT    NOT NULL,
    closed_at            TEXT,

    ai_level             TEXT    CHECK (ai_level IN ('정상', '주의', '위험')),
    ai_reason            TEXT    NOT NULL DEFAULT '',
    ai_recommendation    TEXT    NOT NULL DEFAULT '',
    ai_sources           TEXT    NOT NULL DEFAULT '[]',
    ai_failed            INTEGER NOT NULL DEFAULT 0 CHECK (ai_failed IN (0, 1)),
    ai_error             TEXT,
    ai_model             TEXT,
    ai_elapsed_sec       REAL,
    ai_judged_at         TEXT,

    manager_action       TEXT    CHECK (manager_action IN ('approve', 'reject')),
    manager_comment      TEXT    NOT NULL DEFAULT '',
    manager_id           INTEGER REFERENCES users (id),
    manager_name         TEXT,
    manager_department   TEXT,
    manager_decided_at   TEXT,

    top_action           TEXT    CHECK (top_action IN ('approve', 'reject')),
    top_comment          TEXT    NOT NULL DEFAULT '',
    top_id               INTEGER REFERENCES users (id),
    top_name             TEXT,
    top_department       TEXT,
    top_decided_at       TEXT,

    revoke_reason        TEXT,
    revoker_id           INTEGER REFERENCES users (id),
    revoker_name         TEXT,
    revoker_department   TEXT,
    revoked_at           TEXT,

    CHECK (ai_judged_at IS NULL OR ai_failed = 1 OR ai_level IS NOT NULL),
    CHECK ((manager_action IS NULL) = (manager_id IS NULL) AND (manager_action IS NULL) = (manager_decided_at IS NULL)),
    CHECK ((top_action IS NULL) = (top_id IS NULL) AND (top_action IS NULL) = (top_decided_at IS NULL)),
    CHECK ((revoked_at IS NULL) = (revoker_id IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)),
    CHECK (revoke_reason IS NULL OR trim(revoke_reason) IS NOT ''),
    CHECK (top_action IS NULL OR manager_action IS 'approve'),
    CHECK (revoked_at IS NULL OR top_action IS 'approve')
);
CREATE INDEX access_requests_stage ON access_requests (stage, submitted_at);
CREATE INDEX access_requests_requester ON access_requests (requester_id, submitted_at);

CREATE TRIGGER access_requests_by_user
BEFORE INSERT ON access_requests
BEGIN
    SELECT RAISE(ABORT, '권한 신청은 일반사용자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.requester_id AND role = 'user' AND is_active = 1);
    SELECT RAISE(ABORT, '신청은 결재 대기로만 넣을 수 있습니다')
    WHERE NEW.stage IS NOT 'manager' OR NEW.manager_action IS NOT NULL OR NEW.top_action IS NOT NULL OR NEW.revoked_at IS NOT NULL;
END;

CREATE TRIGGER access_requests_fields_frozen
BEFORE UPDATE OF request_no, requester_id, requester_name, requester_department,
                 requested_access, current_access, reason, period_start, period_end, submitted_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '제출한 신청 내용은 고칠 수 없습니다');
END;

CREATE TRIGGER access_requests_no_delete BEFORE DELETE ON access_requests
BEGIN
    SELECT RAISE(ABORT, '신청 기록은 지울 수 없습니다');
END;

CREATE TRIGGER access_requests_ai_before_first_decision
BEFORE UPDATE OF ai_level, ai_reason, ai_recommendation, ai_sources, ai_failed, ai_error, ai_model, ai_elapsed_sec, ai_judged_at
ON access_requests
WHEN OLD.stage IS NOT 'manager' OR OLD.manager_action IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, '1차 결재 뒤에는 AI 판정을 바꿀 수 없습니다');
END;

CREATE TRIGGER access_requests_manager_step
BEFORE UPDATE OF manager_action, manager_comment, manager_id, manager_name, manager_department, manager_decided_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '이미 결재한 단계입니다') WHERE OLD.manager_action IS NOT NULL;
    SELECT RAISE(ABORT, '지금 결재 단계가 아닙니다') WHERE OLD.stage IS NOT 'manager';
    SELECT RAISE(ABORT, '이 단계를 결재할 역할이 아닙니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.manager_id AND role = 'manager' AND is_active = 1);
END;

CREATE TRIGGER access_requests_top_step
BEFORE UPDATE OF top_action, top_comment, top_id, top_name, top_department, top_decided_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '이미 결재한 단계입니다') WHERE OLD.top_action IS NOT NULL;
    SELECT RAISE(ABORT, '지금 결재 단계가 아닙니다') WHERE OLD.stage IS NOT 'top';
    SELECT RAISE(ABORT, '이 단계를 결재할 역할이 아닙니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.top_id AND role = 'top' AND is_active = 1);
END;

CREATE TRIGGER access_requests_revoke_step
BEFORE UPDATE OF revoke_reason, revoker_id, revoker_name, revoker_department, revoked_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '이미 회수한 권한입니다') WHERE OLD.revoked_at IS NOT NULL;
    SELECT RAISE(ABORT, '승인된 권한만 회수할 수 있습니다') WHERE OLD.stage IS NOT 'approved';
    SELECT RAISE(ABORT, '권한 회수는 중간관리자 · 최상급자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.revoker_id AND role IN ('manager', 'top') AND is_active = 1);
END;

CREATE TRIGGER access_requests_manager_advance
AFTER UPDATE OF manager_action ON access_requests
WHEN OLD.manager_action IS NULL AND NEW.manager_action IS NOT NULL
BEGIN
    UPDATE access_requests
    SET stage = CASE NEW.manager_action WHEN 'approve' THEN 'top' ELSE 'rejected' END,
        closed_at = CASE NEW.manager_action WHEN 'reject' THEN NEW.manager_decided_at END
    WHERE id = NEW.id;
END;

CREATE TRIGGER access_requests_top_advance
AFTER UPDATE OF top_action ON access_requests
WHEN OLD.top_action IS NULL AND NEW.top_action IS NOT NULL
BEGIN
    UPDATE access_requests
    SET stage = CASE NEW.top_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END, closed_at = NEW.top_decided_at
    WHERE id = NEW.id;
END;

CREATE TRIGGER access_requests_revoke_apply
AFTER UPDATE OF revoked_at ON access_requests
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
    UPDATE access_requests SET stage = 'revoked', closed_at = NEW.revoked_at WHERE id = NEW.id;
END;

CREATE TRIGGER access_requests_stage_path
BEFORE UPDATE OF stage ON access_requests
WHEN NEW.stage IS NOT OLD.stage
 AND NOT (   (OLD.stage = 'manager'  AND NEW.stage = 'top'       AND NEW.manager_action IS 'approve')
          OR (OLD.stage = 'manager'  AND NEW.stage = 'rejected'  AND NEW.manager_action IS 'reject')
          OR (OLD.stage = 'manager'  AND NEW.stage = 'withdrawn' AND NEW.manager_action IS NULL)
          OR (OLD.stage = 'top'      AND NEW.stage = 'approved'  AND NEW.top_action IS 'approve')
          OR (OLD.stage = 'top'      AND NEW.stage = 'rejected'  AND NEW.top_action IS 'reject')
          OR (OLD.stage = 'approved' AND NEW.stage = 'revoked'   AND NEW.revoked_at IS NOT NULL))
BEGIN
    SELECT RAISE(ABORT, '허용되지 않은 상태 변경입니다');
END;

CREATE VIEW active_grants AS
SELECT r.*
FROM access_requests r
WHERE r.stage = 'approved'
  AND (r.period_end = '' OR r.period_end >= strftime('%Y-%m-%d', 'now'));
