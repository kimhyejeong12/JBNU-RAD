# SentinelAI

전북대학교 캡스톤 RAG & Decision 팀 with SK Shieldus <br />
로컬 LLM · RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템 <br />

| Member | Role |
| ---- | --- |
| 김혜정 | 총괄, 문서, 프론트엔드 |
| 서준원 | DBA, DevOps |
| 양현성 | 백엔드, AI |

## 시작

Docker Compose(또는 Podman)와 Ollama(`qwen3:14b` · `bge-m3`) 필요.

```sh
cp .env.example .env
docker compose up -d --build --wait
./sentinel create-root --login 아이디 --name 이름
```

## 설정

1. `.env`의 `SENTINELAI_OLLAMA_BASE_URL`을 모델 서버 주소로 <br /> (만일 Ollama가 같은 컴퓨터에 있다면 `http://host.docker.internal:11434`) <br />
2. 다른 컴퓨터에서 접속하려면 `.env`에 `SENTINELAI_WEB_BIND=0.0.0.0` <br />

## 사용
 
1. http://localhost:8000 에서 만든 계정으로 로그인
2. 관리 → 기준 문서에서 정책 문서(.md, .txt)를 올림 — 올리면 RAG에 적재됨. 예시 문서는 `data/example-regulations/`에 있음
3. 노드 감시기 설치는 `node/README.md` 참조.


## 끄기

```sh
docker compose down
```

