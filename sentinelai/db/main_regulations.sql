-- main.sql 뒤에 적용 — 기준 문서 원문. RAG(Milvus)는 이 표에서 조각을 만들어 쌓은 사본입니다.
CREATE TABLE regulations (
    name        TEXT   PRIMARY KEY,
    content     TEXT   NOT NULL CHECK (btrim(content) <> ''),
    updated_at  TEXT   NOT NULL,
    updated_by  BIGINT REFERENCES users (id)
);
