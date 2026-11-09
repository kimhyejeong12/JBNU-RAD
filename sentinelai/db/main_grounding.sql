-- main_regulations.sql 뒤에 적용 — 권한 신청 · 보유 권한 재검토 AI 판정의 근거(세운 기준 · 적은 줄 · 코드 확인)입니다.
ALTER TABLE access_requests ADD COLUMN ai_grounding TEXT NOT NULL DEFAULT '{}';
ALTER TABLE grant_reviews ADD COLUMN grounding TEXT NOT NULL DEFAULT '{}';
