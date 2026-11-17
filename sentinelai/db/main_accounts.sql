-- main_manage.sql 뒤에 적용 — 계정은 보안 운영자가 만듭니다 (역할 무관). 루트는 처음 설정 · 비상용으로 함께 만듭니다.
CREATE OR REPLACE FUNCTION users_creator_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.created_by IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND is_active = 1 AND (role = 'manager' OR is_root = 1)) THEN
        RAISE EXCEPTION '계정은 보안 운영자가 만듭니다';
    END IF;
    RETURN NEW;
END $$;
