-- results_ask.sql 뒤에 적용 — 질의 에이전트의 단계(세운 기준 · 골라낸 근거)입니다.
ALTER TABLE qa_records ADD COLUMN stages TEXT NOT NULL DEFAULT '{}';
