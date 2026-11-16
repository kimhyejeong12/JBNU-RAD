-- 운영자 결정에 조치 완료(done)와 위협 예측(suspect, 사람마다 하나 — item_key = suspect/사람)을 더합니다.
ALTER TABLE review_decisions DROP CONSTRAINT review_decisions_kind_check;
ALTER TABLE review_decisions DROP CONSTRAINT review_decisions_check;
ALTER TABLE review_decisions ADD CONSTRAINT review_decisions_kind_check CHECK (kind IN ('policy', 'event', 'server', 'suspect'));
ALTER TABLE review_decisions ADD CONSTRAINT review_decisions_check CHECK (
    (kind = 'policy' AND action IN ('approve', 'cond', 'reject', 'done', 'cancel'))
    OR (kind IN ('event', 'server', 'suspect') AND action IN ('clear', 'act', 'done', 'cancel')));
