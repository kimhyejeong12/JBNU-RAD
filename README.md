# SentinelAI

로컬 LLM / RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템
전북대학교 RAG & Decision 산학 캡스톤 프로젝트

## 시작

Docker Compose Ollama(`qwen3:14b` · `bge-m3`) 설치 필요.

```sh
cp .env.example .env                 
docker compose up -d --build --wait
./sentinel create-root --login 아이디 --name 이름 
```

1. http://localhost:8000 에서 만든 계정으로 로그인
2. 정책 관리 → [정책 관리 검토 실행]을 한 번 누름 (기준 문서를 RAG에 적재)

- Ollama가 같은 컴퓨터에 있으면 `SENTINELAI_OLLAMA_BASE_URL=http://host.docker.internal:11434`
- 다른 컴퓨터에서 접속하려면 `.env`에 `SENTINELAI_WEB_BIND=0.0.0.0`

## 개발

- CLI: `./sentinel --help` (컨테이너 안의 `python -m sentinelai`)
- 시험 환경 · DB 시험: `python -m sentinelai.dev --help`
- 프로젝트 안내 전체: `CLAUDE.md`
