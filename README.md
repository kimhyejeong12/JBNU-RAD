# SentinelAI

로컬 LLM · RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템

전북대학교 RAD (RAG & Decision) × SK쉴더스 산학 캡스톤 · 지도교수 김병관

## 하는 일

보안 솔루션 정책과 사용자 접근 권한을 외부망 없이 분석합니다.

- **정책 검토** — 방화벽 · SWG · DLP · PAM 정책 간 충돌 · 중복 · 과도한 허용
- **권한 적정성** — 신청 권한이 부서 · 직무에 맞는지 보고 승인 · 추가 검토 · 반려를 권고
- **대시보드** — 정상 · 주의 · 위험 등급과 근거 조항
- **로그 감시 · 서버 점검** — 정책과 어긋난 로그 · 서버 설정을 찾아 올림

AI는 근거와 등급만 내고, 최종 결정은 보안 운영자가 합니다.

## 팀

| 이름 | 맡은 일 |
|---|---|
| 김혜정 | 
| 서준원 | 
| 양현성 | 

## 시작

```sh
make install                              # venv · 의존성 · .env 준비
make health                               # 모델 서버 · 인덱스 확인
make index                                # docs/ 기준 문서 적재
make create-root LOGIN=아이디 NAME=이름    # 첫 계정 (한 번만)
make web                                  # http://localhost:8000
```

화면 소스는 `frontend/`(React · Vite)에 있고, `make web`은 커밋된 빌드 결과(`sentinelai/web/static/`)를 서빙한다 — 서버에 Node 는 필요 없다. 화면을 고치면 `make front-build` 결과를 함께 커밋한다.

설정은 모두 `.env`의 `SENTINELAI_*`에서 읽습니다.
