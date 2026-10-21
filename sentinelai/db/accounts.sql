DROP TRIGGER users_created_by_root;

CREATE TRIGGER users_created_by_top
BEFORE INSERT ON users
WHEN NEW.created_by IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'top' AND is_active = 1)
BEGIN
    SELECT RAISE(ABORT, '계정은 최상급자만 만들 수 있습니다');
END;
