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
    closed_at            TEXT
);
CREATE INDEX access_requests_stage ON access_requests (stage, submitted_at);
CREATE INDEX access_requests_requester ON access_requests (requester_id, submitted_at);

CREATE TRIGGER access_requests_by_user
BEFORE INSERT ON access_requests
WHEN NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.requester_id AND role = 'user' AND is_active = 1)
BEGIN
    SELECT RAISE(ABORT, '권한 신청은 일반사용자만 할 수 있습니다');
END;

CREATE TRIGGER access_requests_stage_path
BEFORE UPDATE OF stage ON access_requests
WHEN NEW.stage IS NOT OLD.stage
 AND NOT (   (OLD.stage = 'manager' AND NEW.stage IN ('top', 'rejected', 'withdrawn'))
          OR (OLD.stage = 'top'     AND NEW.stage IN ('approved', 'rejected'))
          OR (OLD.stage = 'approved' AND NEW.stage = 'revoked'))
BEGIN
    SELECT RAISE(ABORT, '허용되지 않은 상태 변경입니다');
END;

CREATE TRIGGER access_requests_fields_frozen
BEFORE UPDATE OF request_no, requester_id, requester_name, requester_department,
                 requested_access, current_access, reason, period_start, period_end, submitted_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '제출한 신청 내용은 고칠 수 없습니다');
END;

CREATE TABLE approvals (
    id                  INTEGER PRIMARY KEY,
    request_id          INTEGER NOT NULL REFERENCES access_requests (id),
    step                TEXT    NOT NULL CHECK (step IN ('manager', 'top')),
    action              TEXT    NOT NULL CHECK (action IN ('approve', 'reject')),
    comment             TEXT    NOT NULL DEFAULT '',
    approver_id         INTEGER NOT NULL REFERENCES users (id),
    approver_name       TEXT    NOT NULL,
    approver_department TEXT    NOT NULL DEFAULT '',
    ai_verdict_ref      TEXT,
    ai_level            TEXT CHECK (ai_level IN ('정상', '주의', '위험')),
    decided_at          TEXT    NOT NULL,
    UNIQUE (request_id, step)
);
CREATE INDEX approvals_approver ON approvals (approver_id, decided_at);

CREATE TRIGGER approvals_check
BEFORE INSERT ON approvals
BEGIN
    SELECT RAISE(ABORT, '지금 결재 단계가 아닙니다')
    WHERE (SELECT stage FROM access_requests WHERE id = NEW.request_id) IS NOT NEW.step;
    SELECT RAISE(ABORT, '이 단계를 결재할 역할이 아닙니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.approver_id AND role = NEW.step AND is_active = 1);
END;

CREATE TRIGGER approvals_advance
AFTER INSERT ON approvals
BEGIN
    UPDATE access_requests
    SET stage = CASE
            WHEN NEW.action = 'reject' THEN 'rejected'
            WHEN NEW.step = 'manager' THEN 'top'
            ELSE 'approved'
        END,
        closed_at = CASE WHEN NEW.action = 'reject' OR NEW.step = 'top' THEN NEW.decided_at END
    WHERE id = NEW.request_id;
END;

CREATE TRIGGER approvals_immutable_update BEFORE UPDATE ON approvals
BEGIN
    SELECT RAISE(ABORT, '결재 기록은 고칠 수 없습니다');
END;

CREATE TRIGGER approvals_immutable_delete BEFORE DELETE ON approvals
BEGIN
    SELECT RAISE(ABORT, '결재 기록은 지울 수 없습니다');
END;

CREATE TABLE revocations (
    id                 INTEGER PRIMARY KEY,
    request_id         INTEGER NOT NULL UNIQUE REFERENCES access_requests (id),
    reason             TEXT    NOT NULL,
    revoker_id         INTEGER NOT NULL REFERENCES users (id),
    revoker_name       TEXT    NOT NULL,
    revoker_department TEXT    NOT NULL DEFAULT '',
    revoked_at         TEXT    NOT NULL
);

CREATE TRIGGER revocations_check
BEFORE INSERT ON revocations
BEGIN
    SELECT RAISE(ABORT, '승인된 권한만 회수할 수 있습니다')
    WHERE (SELECT stage FROM access_requests WHERE id = NEW.request_id) IS NOT 'approved';
    SELECT RAISE(ABORT, '권한 회수는 중간관리자 · 최상급자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.revoker_id AND role IN ('manager', 'top') AND is_active = 1);
END;

CREATE TRIGGER revocations_apply
AFTER INSERT ON revocations
BEGIN
    UPDATE access_requests SET stage = 'revoked', closed_at = NEW.revoked_at WHERE id = NEW.request_id;
END;

CREATE TRIGGER revocations_immutable_update BEFORE UPDATE ON revocations
BEGIN
    SELECT RAISE(ABORT, '회수 기록은 고칠 수 없습니다');
END;

CREATE TRIGGER revocations_immutable_delete BEFORE DELETE ON revocations
BEGIN
    SELECT RAISE(ABORT, '회수 기록은 지울 수 없습니다');
END;

CREATE VIEW active_grants AS
SELECT r.*
FROM access_requests r
WHERE r.stage = 'approved'
  AND (r.period_end = '' OR r.period_end >= strftime('%Y-%m-%d', 'now'));
