CREATE TABLE review_decisions (
    id                 INTEGER PRIMARY KEY,
    kind               TEXT    NOT NULL CHECK (kind IN ('policy', 'event')),
    item_key           TEXT    NOT NULL,
    subject            TEXT    NOT NULL DEFAULT '',
    action             TEXT    NOT NULL CHECK (
                           (kind = 'policy' AND action IN ('approve', 'cond', 'reject', 'cancel'))
                           OR (kind = 'event' AND action IN ('clear', 'act', 'cancel'))),
    comment            TEXT    NOT NULL DEFAULT '',
    ai_level           TEXT CHECK (ai_level IN ('정상', '주의', '위험')),
    decider_id         INTEGER NOT NULL REFERENCES users (id),
    decider_name       TEXT    NOT NULL,
    decider_department TEXT    NOT NULL DEFAULT '',
    decided_at         TEXT    NOT NULL
);
CREATE INDEX review_decisions_item ON review_decisions (kind, item_key, id);

CREATE TRIGGER review_decisions_check
BEFORE INSERT ON review_decisions
BEGIN
    SELECT RAISE(ABORT, '정책 · 로그 결정은 중간관리자 · 최상급자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.decider_id AND role IN ('manager', 'top') AND is_active = 1);
END;

CREATE TRIGGER review_decisions_immutable_update BEFORE UPDATE ON review_decisions
BEGIN
    SELECT RAISE(ABORT, '결정 기록은 고칠 수 없습니다');
END;

CREATE TRIGGER review_decisions_immutable_delete BEFORE DELETE ON review_decisions
BEGIN
    SELECT RAISE(ABORT, '결정 기록은 지울 수 없습니다');
END;
