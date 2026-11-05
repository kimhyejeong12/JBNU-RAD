-- results.sql 뒤에 적용 — 질의 에이전트의 대화 · 도구 단계 · 검증 칸입니다.
ALTER TABLE qa_records DROP CONSTRAINT qa_records_kind_check;
ALTER TABLE qa_records ADD CONSTRAINT qa_records_kind_check CHECK (kind IN ('policy', 'logs', 'servers', 'agent'));
ALTER TABLE qa_records ADD COLUMN conversation_id TEXT;
ALTER TABLE qa_records ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE qa_records ADD COLUMN checks TEXT NOT NULL DEFAULT '[]';
CREATE INDEX qa_records_conversation ON qa_records (asker_id, conversation_id, id);
