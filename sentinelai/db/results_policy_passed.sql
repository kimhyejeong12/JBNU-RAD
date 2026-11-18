-- results_drop_policy_files.sql 뒤에 적용 — 정책 관리 검토가 정상으로 본 조항과 이유입니다 ([{policy_id, reason}]).
ALTER TABLE policy_reviews ADD COLUMN passed TEXT NOT NULL DEFAULT '[]';
