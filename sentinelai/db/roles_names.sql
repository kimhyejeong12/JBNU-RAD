DROP TRIGGER access_requests_by_user;
CREATE TRIGGER access_requests_by_user
BEFORE INSERT ON access_requests
BEGIN
    SELECT RAISE(ABORT, '권한 신청은 일반 사용자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.requester_id AND role = 'user' AND is_active = 1);
    SELECT RAISE(ABORT, '신청은 결재 대기로만 넣을 수 있습니다')
    WHERE NEW.stage IS NOT 'manager' OR NEW.manager_action IS NOT NULL OR NEW.top_action IS NOT NULL OR NEW.revoked_at IS NOT NULL;
END;

DROP TRIGGER access_requests_revoke_step;
CREATE TRIGGER access_requests_revoke_step
BEFORE UPDATE OF revoke_reason, revoker_id, revoker_name, revoker_department, revoked_at
ON access_requests
BEGIN
    SELECT RAISE(ABORT, '이미 회수한 권한입니다') WHERE OLD.revoked_at IS NOT NULL;
    SELECT RAISE(ABORT, '승인된 권한만 회수할 수 있습니다') WHERE OLD.stage IS NOT 'approved';
    SELECT RAISE(ABORT, '권한 회수는 보안 운영자 · 보안 총책임자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.revoker_id AND role IN ('manager', 'top') AND is_active = 1);
END;

DROP TRIGGER users_created_by_top;
CREATE TRIGGER users_created_by_top
BEFORE INSERT ON users
WHEN NEW.created_by IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'top' AND is_active = 1)
BEGIN
    SELECT RAISE(ABORT, '계정은 보안 총책임자만 만들 수 있습니다');
END;

DROP TRIGGER review_decisions_check;
CREATE TRIGGER review_decisions_check
BEFORE INSERT ON review_decisions
BEGIN
    SELECT RAISE(ABORT, '정책 · 로그 결정은 보안 운영자 · 보안 총책임자만 할 수 있습니다')
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.decider_id AND role IN ('manager', 'top') AND is_active = 1);
END;
