# SentinelAI

로컬 LLM · RAG 기반 AI 보안 정책 검토 · 로그 감시 시스템

**전북대학교 RAD (RAG & Decision) 팀 × SK쉴더스** 산학 캡스톤 프로젝트

## 시작

```sh
make install          # venv · 의존성 · .env 준비
make health           # 모델 서버 · 인덱스 확인
make index            # docs/ 기준 문서 적재
make web              # http://localhost:8000
```

화면 소스는 `frontend/`(React · Vite)에 있고, `make web`은 커밋된 빌드 결과(`sentinelai/web/static/`)를 서빙한다 — 서버에 Node 는 필요 없다. 화면을 고치면 `make front-build` 결과를 함께 커밋한다.

설정은 `.env`의 `SENTINELAI_*` 값에서 읽습니다.
