-- results_briefing.sql 뒤에 적용 — 정책 파일 · 서버 현황 표를 읽던 때의 칸과 표를 지웁니다 (11/5부터 아무도 쓰지 않음).
DROP TABLE server_findings;
ALTER TABLE policy_reviews
    DROP COLUMN source,
    DROP COLUMN load_issues,
    DROP COLUMN rules,
    DROP COLUMN servers_source,
    DROP COLUMN servers_load_issues;
