-- results_ask_stages.sql 뒤에 적용 — 판정의 근거(적은 줄 · 코드 확인)입니다.
ALTER TABLE event_findings ADD COLUMN grounding TEXT NOT NULL DEFAULT '{}';
ALTER TABLE node_findings ADD COLUMN grounding TEXT NOT NULL DEFAULT '{}';
ALTER TABLE suspect_scores ADD COLUMN grounding TEXT NOT NULL DEFAULT '{}';
ALTER TABLE policy_reviews ADD COLUMN grounding TEXT NOT NULL DEFAULT '{}';
