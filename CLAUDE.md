# RAD-LMENGINE

> Claude Code가 세션 시작 시 읽는 프로젝트 안내서. 팀원도 같은 문서를 본다.

로컬 LLM · RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템 (참여기업 SK쉴더스, 전북대 캡스톤 팀 RAD).
LLM · RAG 엔진 `rad_lmengine/`(양현성) 위에 웹 대시보드 `rad_web/`(김혜정)을 붙였다. 9월 30일 산학 자문 미팅에서 5분간 시연한다.

**원칙**: AI는 근거를 제공하고 등급을 매길 뿐, 승인 · 반려의 최종 결정은 보안 운영자가 한다.

---

## 1. 폴더 구조

```
RAD-LMENGINE/
├── rad_lmengine/             LLM · RAG 엔진 (양현성) — 수정 금지
│   ├── chain.py                Engine — review_chain · policy_chain · rag_chain
│   ├── rag.py                  DocumentStore — 문서 분할 · Milvus 적재 · 검색
│   ├── prompt.py               프롬프트 (권한 검토 · 정책 검토 · 질의응답)
│   ├── types.py                출력 타입 Verdict · PolicyReview · Answer
│   ├── config.py               Settings — .env 읽기
│   └── cli.py                  make health · index · ask 등이 부르는 CLI
├── docs/                     판정 근거 기준 문서 — 수정 금지
│   ├── 접근권한_관리기준.md       3.1 최소권한 · 3.2 인사정보 · 3.3 급여정보 · 4.1~4.3 등급 기준
│   └── 정책_운영기준.md           5.1 DENY 우선 · 5.2 ANY 금지 · 5.3 중복 · 6.1 DLP>SWG · 6.2 PAM · 6.3 만료
├── data/                     검토 대상과 판정 결과
│   ├── permissions.csv         권한 신청 6건
│   ├── policies.csv            정책 9건
│   └── results.json            판정 결과 캐시 — precompute가 만든다. 손으로 고치지 않는다
├── rad_web/                  웹 계층 (김혜정)
│   ├── loader.py               CSV → dict, 정책 표 → policy_chain 입력 텍스트
│   ├── review.py               엔진 호출 → 화면용 dict (최대 2회 재시도, 실패 시 "주의")
│   ├── main.py                 FastAPI — API 4개 + 화면 서빙
│   └── static/index.html       단일 파일 대시보드 — 분석 대기열 · 통계 탭 (CSS · JS · 아이콘 인라인)
├── scripts/
│   ├── precompute.py           전 건 판정 → data/results.json
│   └── review_check.py         반복 루프 · 등급 흔들림 재현 — 수정 금지
├── .milvus/                  벡터 DB 파일 (Milvus Lite, git 제외)
├── .env · .env.example       설정. .env는 git 제외, make install이 예시에서 만든다
├── Makefile · requirements.txt
└── Dockerfile · README.md    엔진 컨테이너 · 저장소 소개 (웹 계층은 컨테이너에 없음)
```

CSV 컬럼 — `permissions.csv`: `id, requester, requested_access, current_access, 신청일` / `policies.csv`: `policy_id, solution, source, destination, service, action, expires_at`.
검토 대상은 실제 회사 데이터가 아니라 `docs/` 조항에 맞춰 설계한 사례다. REQ-001 · 002는 `review_check.py`의 사례와 같으므로 바꾸지 않는다.

---

## 2. 엔진 연동

`rad_web`은 엔진을 다시 만들지 않고 `rad_lmengine.Engine`만 호출한다. 판정 결과는 엔진 타입(`Verdict`, `PolicyReview`)의 필드를 그대로 쓰고, 화면용 값(`title`, `verdict`, `detail`, `elapsed_sec`)만 덧붙인다.

**사전 계산** — `make precompute` (`scripts/precompute.py`)
1. `loader`가 CSV 두 개를 읽는다.
2. 권한 신청 1건마다 `Engine.review_chain().invoke({requester, requested_access, current_access})`
   - 엔진 안에서 `"요청자 / 신청 권한"`으로 Milvus를 검색해(bge-m3 임베딩, top_k=4) 찾은 조항을 프롬프트의 `[적용 기준 문서]`에 넣는다 → Ollama 모델 → `Verdict`
3. 정책 9건은 텍스트로 풀어 `Engine.policy_chain().invoke({policies})` → `PolicyReview`. **이 체인은 검색을 하지 않아 기준 문서를 보지 않는다.**
4. 결과를 `data/results.json`에 쓴다. 파싱이 실패하면 2회까지 다시 시도하고, 그래도 실패하면 `level="주의"`, `reason="판정 실패: <원인>"`으로 남긴다.

**화면** — `make web` (`rad_web/main.py`)

| API | 하는 일 | 엔진 호출 |
|---|---|---|
| `GET /api/results` | `results.json` 전체 (없으면 503) | 없음 — 캐시만 읽는다 |
| `GET /api/health` | 상단 배지: 연결 · 모델 · 임베딩 · 인덱스, 모두 준비되면 `ok` | `engine.models()`, `documents.is_empty()` |
| `GET /api/regulations` | `docs/` 원문 (근거 조항 전문 표시용) | 없음 |
| `POST /api/review/{id}` | 권한 신청 1건 실시간 재판정 (없는 ID는 404) | `review_chain` — 위 2번과 같은 경로 |

- `Engine()`과 `review_chain`은 앱 시작 시 1회만 만든다. CORS `*`는 데모 전용이다.
- 실시간 재판정 결과는 화면 메모리에서만 바뀐다. `results.json`은 그대로이고, 새로고침하면 캐시 결과로 돌아온다.

**화면 필드의 출처**

| 화면 | 출처 |
|---|---|
| 등급 · AI 판정 | `Verdict.level`. 판정 문구는 등급에서 파생 (정상 → 승인 권고, 주의 → 추가 검토, 위험 → 반려 권고) |
| AI 판단 근거 | `Verdict.reason` — 모델이 생성 |
| 권고 조치 | `Verdict.recommendation` — 모델이 생성 |
| Vector DB 참조 문맥 | `Verdict.sources` — 모델이 밝힌 근거 문서. 누르면 `docs/` 원문에서 해당 조항을 잘라 보여준다 |
| 상세 요청 | `permissions.csv` 원본 행 |
| 정책 검토 행 | `PolicyIssue`의 `kind` · `level` · `policy_ids` · `reason` · `recommendation` |
| 통계 대시보드 | 도넛 = `summary`의 정상 · 주의 · 위험. 부서별 막대 = 권한 신청을 신청자 첫 단어(부서)로 묶은 등급 건수. 차트는 라이브러리 없이 SVG · CSS로 그린다 |

---

## 3. 실행

| 명령 | 하는 일 |
|---|---|
| `make install` | venv · 의존성 · `.env` 준비 (처음 한 번) |
| `make health` | 서버 · 모델 · 인덱스 확인 |
| `make index` | `docs/` 적재 (바뀐 파일만 다시 임베딩) |
| `make precompute` | `data/results.json` 재계산 (맥 기준 약 25분) |
| `make web` | 대시보드 http://localhost:8000 |

설정은 `.env` 한 곳에서 나온다. 코드에 주소 · 모델명을 하드코딩하지 않는다. 두 환경 모두에서 동작해야 한다.

| 환경 | `RAD_OLLAMA_BASE_URL` | `RAD_MODEL` |
|---|---|---|
| 팀 서버 | `http://210.117.182.197:11434` | `gpt-oss:20b` |
| 개인 맥 | `http://localhost:11434` | `qwen2.5:7b` |

서버 주소가 설정 한 줄로 바뀌는 구조가 제안서의 "향후 사내 환경 이전" 요구에 해당한다.
9/27에는 맥에서 팀 서버로 접속되지 않았다 (8초 타임아웃).

**Milvus Lite 파일 락**: DB 파일은 한 프로세스만 열 수 있다. `make web`이 떠 있으면 `make precompute` · `make index` · `make review-check`가 실패하므로 서버를 끄고 돌린다.

---

## 4. 규칙

- ❌ `rad_lmengine/`, `docs/`, `scripts/review_check.py` 수정. 프롬프트(`rad_lmengine/prompt.py`)도 엔진 담당자와 상의 없이 바꾸지 않는다
- ❌ 엔진 기능 재구현, 엔진 타입을 대체하는 웹 전용 스키마
- ❌ 서버 주소 · 모델명 하드코딩 — 전부 `Settings`
- ❌ CDN · 웹폰트 · 외부 이미지 (외부망 차단 전제), React · Tailwind · 빌드 도구
- ❌ 데이터베이스 · 로그인 · 파일 업로드
- ❌ 정책 자동 수정 · 권한 자동 승인 — 운영자 결정 버튼은 화면 메모리에만 기록한다
- ❌ `data/results.json`을 손으로 고치기 · 근거 없는 목업 데이터 — 화면의 판정은 엔진 출력이어야 한다
- ❌ 여러 모듈을 한꺼번에 바꾸기 — 하나씩 바꾸고 확인한다. 막히면 우회하지 말고 사용자에게 보고한다

화면 규칙 (사용자 피드백):
- 이모지 아이콘을 쓰지 않는다. 등급 표시는 CSS 점 `.ldot` (8px 점 + 같은 색 반투명 3px 링).
- 툴팁(`data-tip="제목|설명"`)은 아이콘만 있는 요소와 화면에 없는 정보를 주는 요소에만 단다. 보이는 글자를 되풀이하는 툴팁은 달지 않는다.
- 색상: 강조 `#EA002C` · 보조 `#FF7A00` · 정상 `#2E7D5B` · 본문 `#111111`/`#666666` · 배경 `#F5F5F6` + 흰 카드. SK쉴더스 CI 컬러는 흰 배경에서만 쓴다 (예외: 상단 검은 바의 방패 로고 — CI 규정 확인 필요).
- 폰트: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`

코드 주석은 엔진 코드처럼 "~합니다"체로, 코드만 봐서는 알 수 없는 이유만 짧게 쓴다.

---

## 5. 판정 결과 — 기대와 현재

현재 `data/results.json`: 2026-09-27, 개인 맥 `qwen2.5:7b`. 전체 11건 — 정상 3 / 주의 8 / **위험 0**, 파싱 실패 0.
위험이 0건이라 알림 배너와 종 배지가 뜨지 않는다.

| ID | 신청 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|---|
| REQ-001 | 영업팀 → 급여 테이블(HR_SALARY) | 위험 | 3.3, 4.2 | 주의 ❌ |
| **REQ-002** | **인사팀(팀장 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 — 위험이 나오면 오탐** | 정상 ✅ |
| REQ-003 | 개발팀 → 운영 DB 관리자 | 주의 | 4.3 | 주의 ✅ |
| **REQ-004** | **감사팀(감사위 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 단서** | 정상 ✅ |
| REQ-005 | 마케팅팀 → 방화벽 정책 변경 | 위험 | 4.2 | 정상 ❌ 미탐 |
| REQ-006 | 인프라운영팀 → PAM 경유 관리자 | 정상 | 6.2 | 주의 ❌ |

| 정책 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|
| FW-001 | 과도한 허용 | 5.2 | ❌ FW-003과 "중복"으로 잘못 묶음 |
| FW-002 ↔ FW-003 | 중복 | 5.3 | ❌ 위와 같음 |
| FW-004 ↔ FW-005 | 충돌 | 5.1 | ✅ |
| SWG-001 ↔ DLP-001 | 충돌 | 6.1 | ❌ 각각 "과도한 허용"으로 분리 |
| PAM-001 | 과도한 허용 | 6.2 | ✅ |
| FW-006 | 과도한 허용 | 6.3 | ❌ 못 찾음 |

**REQ-002 · REQ-004가 가장 중요하다.** 정상을 정상으로 판정하는 것(오탐률)이 실무 도입을 좌우한다. 두 건은 현재 모두 맞았다.

---

## 6. 알려진 문제

- **검색은 병목이 아니다.** 두 문서가 청크 4개뿐이라 `top_k=4`가 이미 전부를 검색한다 (`top_k=8`로 올려도 같은 4개). `RAD_TOP_K` · 청크 크기 조정은 문서가 늘어나기 전까지 효과가 없다.
- **소형 모델 한계** (`qwen2.5:7b`): 반복 루프로 판정 1건이 380~417초까지 늘어나고(9/27 6건 중 3건), 같은 입력에도 등급이 바뀐다 (REQ-005: 캐시 정상 → 재판정 주의). 판정 1건은 20초대에서 7분까지 걸린다.
- **정책 검토는 기준 문서를 보지 않는다** (§2). 6.1 · 6.3 같은 사내 규칙은 모델이 알 수 없다.
- **repeat_penalty는 쓰지 않는다.** 9/27 같은 6건 + 정책으로 비교한 결과:

| 구성 | 판정 1건 | 권한 적중 | 정책 적중 | 등급 분포 |
|---|---|---|---|---|
| **temp 0.2 (현재)** | 40~417초 | **3/6** | **2/6** | 정상 3 / 주의 8 / 위험 0 |
| temp 0.2 + repeat_penalty 1.15 | 31~58초 | 2/6 | 1/6 | 정상 1 / 주의 9 / 위험 0 |
| temp 0.0 + repeat_penalty 1.15 | 34~56초 | 1/6 | 1/6 | 정상 0 / 주의 10 / 위험 0 |

반복 루프는 사라지지만 등급이 "주의"로 몰려 판별력을 잃는다. temperature는 원인이 아니다. 다시 재 보려면 `scripts/review_check.py --repeat-penalty 1.15`.

---

## 7. 시연 (9/30, 5분)

**준비**: Ollama 앱 켜기 → `make health` → (팀 서버를 쓸 수 있으면 `.env` 두 줄을 바꾸고 `make web`을 끈 채 `make precompute`) → `make web`

1. 헤더 배지 — Ollama 연결됨 · 모델명, 폐쇄망 모드 · `localhost:11434`. 폐쇄망 배지에 마우스를 올려 — "클라우드 AI로 나가는 트래픽이 없습니다. `.env` 한 줄로 사내 서버로 옮겨집니다"
2. 요약 지표 — 전체 건수와 위험 건수
3. REQ-001(영업팀 → 급여 테이블) — 기대는 위험(3.3). ⚠️ 현재 맥 결과는 "주의" → 팀 서버 결과가 없으면 소형 모델 한계로 설명한다
4. REQ-002(인사팀 → 인사정보) → 정상, REQ-004와 나란히 — "같은 민감 정보라도 직무와 승인 절차가 맞으면 통과시킵니다"
5. [승인] 버튼 — "AI는 권고하고, 결정은 운영자가 합니다"
6. 실시간 재판정 — 수십 초~수 분 걸리므로 시작할 때 눌러 두고 마지막에 돌아온다. ⚠️ 결과가 캐시와 달라질 수 있다. REQ-002에서 누르면 핵심 사례가 뒤집힐 수 있다 (새로고침하면 캐시로 돌아옴)
7. 정책 검토 탭 → FW-004 ↔ FW-005 충돌로 마무리 (현재 결과와 일치)

화면의 목록은 실시간 유입이 아니라 사전 계산 결과다. 화면 하단에 계산 시각이 나온다.

---

## 8. 남은 일

1. **팀 서버 `gpt-oss:20b`로 재계산하고 §5와 대조한다.** 코드 변경 없이 `.env` 두 줄이면 된다. 맥에서 팀 서버로 가는 접속 경로부터 확보해야 한다.
2. 정책 검토가 기준 문서를 보도록 할지 엔진 담당자(양현성)와 상의한다 (`policy_chain`에 검색 추가 등). 엔진 코드이므로 웹 쪽에서 우회하지 않는다.
3. 이번 범위 밖: 이메일 · 메신저 알림 연동, 실제 솔루션 API 수집(`rad_web/loader.py` 교체).
