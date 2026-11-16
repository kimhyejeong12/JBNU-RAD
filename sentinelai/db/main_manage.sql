-- main_decisions_done.sql 뒤에 적용 — 보안 운영자도 일반 사용자 계정과 권한 목록을 관리합니다. 보안 운영자 이상 계정은 보안 총책임자만 만듭니다.
CREATE OR REPLACE FUNCTION users_created_by_top() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.created_by IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role IN ('manager', 'top') AND is_active = 1) THEN
        RAISE EXCEPTION '계정은 보안 운영자 이상만 만들 수 있습니다';
    END IF;
    IF NEW.role <> 'user'
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role = 'top') THEN
        RAISE EXCEPTION '보안 운영자 이상 계정은 보안 총책임자만 만들 수 있습니다';
    END IF;
    RETURN NEW;
END $$;
ALTER FUNCTION users_created_by_top() RENAME TO users_creator_allowed;
ALTER TRIGGER users_created_by_top ON users RENAME TO users_creator_allowed;

CREATE OR REPLACE FUNCTION access_catalog_by_top() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.created_by AND role IN ('manager', 'top') AND is_active = 1) THEN
        RAISE EXCEPTION '권한 목록은 보안 운영자 이상만 관리할 수 있습니다';
    END IF;
    RETURN NEW;
END $$;
ALTER FUNCTION access_catalog_by_top() RENAME TO access_catalog_by_manager;
ALTER TRIGGER access_catalog_by_top ON access_catalog RENAME TO access_catalog_by_manager;
