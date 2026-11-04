# SentinelAI

로컬 LLM · RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템

전북대학교 RAD (RAG & Decision) × SK쉴더스 산학 캡스톤 · 지도교수 김병관

## 하는 일

보안 솔루션 정책과 사용자 접근 권한을 외부망 없이 분석함.

- **정책 검토** — 방화벽 · SWG · DLP · PAM 정책 간 충돌 · 중복 · 과도한 허용
- **권한 적정성** — 신청 권한이 부서 · 직무에 맞는지 보고 승인 · 추가 검토 · 반려를 권고
- **대시보드** — 정상 · 주의 · 위험 등급과 근거 조항
- **로그 감시 · 서버 점검** — 정책과 어긋난 로그 · 서버 설정을 찾아 올림

AI는 근거와 등급만 냄. 최종 결정은 보안 운영자가 함.

## 팀

| 이름 | 맡은 일 |
|---|---|
| 김혜정 | 
| 서준원 | 
| 양현성 | 

## 시작

컨테이너로 (Docker만 있으면 됨, 11/04):

```sh
cp .env.example .env                      # 설정 (모델 서버 주소 등)
make up                                   # 웹 + PostgreSQL → http://localhost:8000
make docker-root LOGIN=아이디 NAME=이름    # 첫 계정 (한 번만)
```

- 기준 문서는 처음 뜰 때 이미지의 `docs/`로 채워짐. RAG 적재는 화면의 [정책 관리 검토 실행]이 함 — 처음 띄운 뒤 한 번 눌러야 권한 신청 판정이 기준 조항을 찾음 (웹이 떠 있으면 CLI `index`는 Milvus 잠금으로 실패)
- 벡터 DB · 기준 문서 · PostgreSQL은 볼륨에 남음 (`make down` 해도 그대로). `data/`는 이 폴더 것을 읽기만 함
- 다른 컴퓨터에서 웹을 보려면 `.env`에 `SENTINELAI_WEB_BIND=0.0.0.0`

venv로 (개발):

```sh
make install                              # venv · 의존성 · .env 준비
make db-up                                # PostgreSQL 컨테이너 (권한 DB · AI 결과 DB)
make health                               # 모델 서버 · 인덱스 확인
make index                                # docs/ 기준 문서 적재
make create-root LOGIN=아이디 NAME=이름    # 첫 계정 (한 번만)
make web                                  # http://localhost:8000
```

- 설정은 모두 `.env`의 `SENTINELAI_*`에서 읽음
- DB는 PostgreSQL(`SENTINELAI_DB_PATH` · `SENTINELAI_RESULTS_DB_PATH`(이름은 SQLite 때 그대로, 값이 PostgreSQL 주소)). 권한 DB는 스키마 `main`, AI 결과 DB는 스키마 `results` — 처음 열 때 만듦. `make test`로 트리거 · 쿼리 시험
- 화면 소스는 `frontend/`(React · Vite). `make web`은 커밋된 빌드 결과(`sentinelai/web/static/`)를 서빙하므로 서버에 Node 필요 없음
- 화면을 고치면 `make front-build` 결과를 함께 커밋함 (`FRONTEND_GUIDE.md`)
- 프로젝트 안내 전체는 `CLAUDE.md`
