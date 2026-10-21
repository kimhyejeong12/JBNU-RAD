CREATE TABLE access_catalog (
    id          INTEGER PRIMARY KEY,
    code        TEXT    NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 64 AND code NOT GLOB '*[^A-Za-z0-9_.-]*'),
    name        TEXT    NOT NULL CHECK (trim(name) IS NOT ''),
    system      TEXT    NOT NULL DEFAULT '',
    category    TEXT    NOT NULL DEFAULT '',
    description TEXT    NOT NULL DEFAULT '',
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_by  INTEGER NOT NULL REFERENCES users (id),
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TRIGGER access_catalog_by_top
BEFORE INSERT ON access_catalog
BEGIN
    SELECT RAISE(ABORT, '권한 목록은 보안 총책임자만 관리할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'top' AND is_active = 1);
END;

CREATE TRIGGER access_catalog_code_frozen BEFORE UPDATE OF code ON access_catalog
BEGIN
    SELECT RAISE(ABORT, '권한 코드는 바꿀 수 없습니다');
END;

CREATE TRIGGER access_catalog_no_delete BEFORE DELETE ON access_catalog
BEGIN
    SELECT RAISE(ABORT, '권한은 지우지 않고 끕니다');
END;

ALTER TABLE access_requests ADD COLUMN access_code TEXT REFERENCES access_catalog (code);

CREATE TRIGGER access_requests_from_catalog
BEFORE INSERT ON access_requests
BEGIN
    SELECT RAISE(ABORT, '권한 목록에 있는 권한만 신청할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM access_catalog WHERE code = NEW.access_code AND is_active = 1);
END;

DROP TRIGGER access_requests_fields_frozen;
CREATE TRIGGER access_requests_fields_frozen
BEFORE UPDATE OF request_no, requester_id, requester_name, requester_department, access_code,
                 requested_access, current_access, reason, period_start, period_end, submitted_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '제출한 신청 내용은 고칠 수 없습니다');
END;
