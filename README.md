# SentinelAI

로컬 LLM · RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템

전북대학교 RAD (RAG & Decision) × SK쉴더스 산학 캡스톤 · 지도교수 김병관

- **정책 검토** — 보안 솔루션 정책 간 충돌 · 중복 · 과도한 허용
- **권한 적정성** — 신청 권한이 부서 · 직무에 맞는지 보고 승인 · 반려 권고
- **로그 감시 · 서버 점검** — 정책과 어긋난 로그 · 서버 설정을 찾아 올림

AI는 근거와 등급만 냄. 최종 결정은 사람이 함.

## 시작

Docker와 Ollama 모델 서버(`qwen3:14b` · `bge-m3`)가 있으면 됨.

```sh
cp .env.example .env                 # SENTINELAI_OLLAMA_BASE_URL 을 모델 서버 주소로
docker compose up -d --build --wait  # 웹 + PostgreSQL
./sentinel create-root --login 아이디 --name 이름     # 첫 계정 (비밀번호는 입력받음)
```

1. http://localhost:8000 에서 만든 계정으로 로그인
2. 정책 관리 → [정책 관리 검토 실행]을 한 번 누름 (기준 문서를 RAG에 적재)

- Ollama가 같은 컴퓨터에 있으면 `SENTINELAI_OLLAMA_BASE_URL=http://host.docker.internal:11434`
- 다른 컴퓨터에서 접속하려면 `.env`에 `SENTINELAI_WEB_BIND=0.0.0.0`
- 내리기 `docker compose down` · 로그 `docker compose logs -f app`. DB · 벡터 DB · 기준 문서는 볼륨에 남음

## 개발

- CLI: `./sentinel --help` (컨테이너 안의 `python -m sentinelai`)
- 시험 환경 · DB 시험: `scripts/dev.py --help`
- 화면: `FRONTEND_GUIDE.md`, 프로젝트 안내 전체: `CLAUDE.md`
