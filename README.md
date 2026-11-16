# SentinelAI

로컬 LLM / RAG 기반 보안 정책 검토 및 접근 권한 의사결정 지원 시스템

전북대학교 캡스톤 RAG & Decision 팀 × SK쉴더스

## Requirements

- Docker Compose 또는 Podman
- Ollama — `qwen3:14b`, `bge-m3`

(uses PostgreSQL, Milvus, Python Docker image.)

## Quick start

```sh
cp .env.example .env
docker compose up -d --build --wait
./sentinel create-root --login <id> --name <name>
```

http://localhost:8000

## Configuration

`.env` 파일에 해당 필드를 설정 가능(`.env.example` 참고): 

| 변수 | 설명 |
| --- | --- |
| `SENTINELAI_OLLAMA_BASE_URL` | 모델 서버. 같은 호스트면 `http://host.docker.internal:11434` |
| `SENTINELAI_WEB_BIND` | 외부 접속 허용 시 `0.0.0.0` |
| `SENTINELAI_SLACK_WEBHOOK_URL` | 운영자 알림 (선택) |
| `SENTINELAI_TEAMS_WEBHOOK_URL` | 운영자 알림 (선택) |
| `SENTINELAI_SMTP_*` | 결재 결과 메일 (선택) |

## Usage

1. 관리 → 기준 문서에서 정책 문서 업로드 (.md, .txt, .pdf, .xlsx). 예시: `data/example-regulations/`
2. 서버 수집 노드 설치: [`node/README.md`](node/README.md)

## Stop

```sh
docker compose down
```
