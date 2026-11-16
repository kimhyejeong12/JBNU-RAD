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
3. 알림은 비워 두면 꺼짐 <br />
   - `SENTINELAI_SLACK_WEBHOOK_URL` — 결재 대기 · 로그 감시 위험 · 예외 상황(계정 역할 변경 · 보유 권한 위험 · AI 위험 판정 승인 · 보안 설정 변경)을 운영자 Slack 채널로 (사람 이름 · 로그인 아이디는 안 넣음) <br />
   - `SENTINELAI_SMTP_*` — 결재 결과(승인 · 반려) · 회수를 신청자 메일로. 계정 관리에서 신청자의 이메일을 적어야 감 <br />
   - **메일에는 반려 의견 · 회수 사유가 들어감.** Gmail 같은 회사 밖 메일 서버를 쓰면 이 내용이 밖으로 나가므로, 실제 운영에서는 사내 SMTP를 쓸 것 (시연은 팀 Gmail) <br />

## 사용
 
1. http://localhost:8000 에서 만든 계정으로 로그인
2. 관리 → 기준 문서에서 정책 문서(.md, .txt)를 올림 — 올리면 RAG에 적재됨. 예시 문서는 `data/example-regulations/`에 있음
3. 노드 감시기 설치는 `node/README.md` 참조.


## 끄기

```sh
docker compose down
```

