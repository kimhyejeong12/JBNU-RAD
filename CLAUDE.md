# SentinelAI

> Claude Code가 세션 시작 시 읽는 프로젝트 안내서. 팀원도 같은 문서를 본다.

## ★ 이 프로젝트가 하는 일 — 모든 작업의 기준

정책을 RAG에 쌓고, 그 위에서 두 기능을 한다.

1. **정책 이해** — 기존 정책을 읽고, 정책에 대한 질의에 답하고, 정책 간 모순을 판정한다.
2. **로그 감시** — 로그를 읽어 들여 정책과 비교하고, 어긋나면 알린다.

정책은 RAG 저장소 한 곳에 쌓고, 두 기능 모두 거기서 근거를 찾는다. 새 작업은 둘 중 어느 쪽에 쓰이는지부터 정한다.

로컬 LLM · RAG 기반 AI 보안 정책 검토 · 로그 감시 시스템. **전북대학교 RAD(RAG & Decision) 팀과 SK쉴더스가 함께 추진하는 산학 캡스톤 프로젝트**다.
프로젝트 이름은 SentinelAI로 확정했다 (2026-10-07). 추진 주체(전북대학교 RAD · SK쉴더스)는 문서 · 화면 · 코드 설명에서 빼지 않는다. 로그 출처인 Microsoft Sentinel과 헷갈리지 않게, 그쪽은 항상 "Microsoft Sentinel"로 쓴다.
LLM · RAG 엔진 `sentinelai/engine/`(양현성) 위에 웹 대시보드 `sentinelai/web/`(김혜정)을 붙였다. 9월 30일 산학 자문 미팅에서 5분간 시연한다.

**원칙**: AI는 근거를 제공하고 등급을 매길 뿐, 승인 · 반려의 최종 결정은 보안 운영자가 한다.

---

## 1. 폴더 구조

```
JBNU-RAD/
├── sentinelai/               SentinelAI 패키지. __init__.py 는 ROOT · 버전만 두고 하위 패키지를 가져오지 않는다
│   ├── __main__.py · cli.py    코어 CLI `python -m sentinelai` — 엔진 명령 + index-policies · monitor. 코어는 이것만으로 돈다
│   ├── pipeline.py             data × engine 실행 흐름 — index_policies · monitor(로그 감시 1회) · Watermark · attempt(재시도)
│   ├── engine/                 LLM · RAG 엔진 (양현성) — 수정 금지
│   │   ├── engine.py             Engine — 설정 · LLM · DocumentStore · 체인 진입점 (engine.review_chain() 등은 chains/로 넘긴다)
│   │   ├── chains/               체인 — 한 파일에 한 기능
│   │   │   ├── access.py           review_chain — 권한 신청 검토 (정책 이해)
│   │   │   ├── policy.py           policy_chain — 정책 모순 판정 (정책 이해)
│   │   │   ├── answer.py           answer_chain · rag_chain — 질의응답 (정책 이해)
│   │   │   ├── event.py            event_chain — 로그 ↔ 정책 비교 (로그 감시)
│   │   │   └── retrieval.py        종류별 검색 (조항 · 규칙) — 체인들이 함께 쓴다
│   │   ├── rag.py                DocumentStore — 기준 조항(clause) · 솔루션 규칙(rule)을 한 컬렉션에 적재, 종류별 검색
│   │   ├── alert.py              Notifier 인터페이스 자리 — 아직 구현 없음, 부를 곳은 pipeline.monitor (§8)
│   │   ├── prompt.py             프롬프트 (권한 검토 · 로그 검토 · 정책 검토 · 질의응답)
│   │   ├── types.py              출력 타입 Verdict · PolicyReview · Answer
│   │   ├── config.py             Settings — .env 의 SENTINELAI_* 읽기
│   │   └── cli.py                엔진만 있는 환경용 CLI `python -m sentinelai.engine.cli` (data · pipeline 명령 없음)
│   ├── data/                   검토 대상 데이터 계층 (양현성) — 엔진과 독립. 소스(CSV · JSON · 메모리) × 매퍼
│   │   ├── types.py              SecurityEvent · AccessRequest · PolicyRule · LoadResult
│   │   ├── source.py             RowSource — CsvSource · JsonSource · MemorySource, 확장자로 고르는 open_source
│   │   ├── mapper.py             Mapper — EventMapper(Microsoft Sentinel 로그) · AccessRequestMapper · PolicyRuleMapper
│   │   └── events.py             로그 시각 필터(between · latest) · 사용자별 묶음 → event_chain 입력
│   └── web/                    웹 계층 (김혜정)
│       ├── loader.py             CSV → dict, 정책 표 → policy_chain 입력 텍스트
│       ├── review.py             엔진 호출 → 화면용 dict (최대 2회 재시도, 실패 시 "주의" · 질의는 답 자리에 원인)
│       ├── main.py               FastAPI — API 6개 + 화면 서빙
│       └── static/index.html     단일 파일 대시보드 — 분석 대기열 · 통계 대시보드 · 권한 질의 탭 (CSS · JS · 아이콘 인라인)
├── docs/                     판정 근거 기준 문서 — 수정 금지
│   ├── 접근권한_관리기준.md       3.1 최소권한 · 3.2 인사정보 · 3.3 급여정보 · 4.1~4.3 등급 기준
│   └── 정책_운영기준.md           5.1 DENY 우선 · 5.2 ANY 금지 · 5.3 중복 · 6.1 DLP>SWG · 6.2 PAM · 6.3 만료
├── data/                     검토 대상과 판정 결과
│   ├── permissions.csv         권한 신청 8건 (REQ-007 · 008은 시연용 위험 예시)
│   ├── policies.csv            정책 9건
│   ├── results.json            판정 결과 캐시 — precompute가 만든다. 시연용 예시 4건이 더해져 있다 (§5)
│   └── ask_results.json        권한 질의 예시 답변 캐시 — precompute-ask가 만든다
├── scripts/                  웹 · 시연 · 테스트 보조. 코어 실행에는 필요 없다
│   ├── precompute.py           전 건 판정 → data/results.json
│   ├── precompute_ask.py       권한 질의 예시 질문 3개 → data/ask_results.json (예시 질문 목록은 여기 한 곳)
│   └── review_check.py         반복 루프 · 등급 흔들림 재현 — 수정 금지
├── .milvus/                  벡터 DB 파일 (Milvus Lite, git 제외)
├── .env · .env.example       설정. .env는 git 제외, make install이 예시에서 만든다
├── Makefile · requirements.txt
└── Dockerfile · README.md    코어 컨테이너(엔진 · data · pipeline, `python -m sentinelai`) · 저장소 소개 (웹은 컨테이너에 없음)
```

CSV 컬럼 — `permissions.csv`: `id, requester, requested_access, current_access, 신청일` / `policies.csv`: `policy_id, solution, source, destination, service, action, expires_at`.
검토 대상은 실제 회사 데이터가 아니라 `docs/` 조항에 맞춰 설계한 사례다. REQ-001 · 002는 `review_check.py`의 사례와 같으므로 바꾸지 않는다. REQ-007 · 008은 4.2 위험 사례를 보여주려고 더한 시연용 예시다.

---

## 2. 엔진 연동

`sentinelai.web`은 엔진을 다시 만들지 않고 `sentinelai.engine.Engine`만 호출한다. 판정 결과는 엔진 타입(`Verdict`, `PolicyReview`, `Answer`)의 필드를 그대로 쓰고, 화면용 값(`title`, `verdict`, `detail`, `question`, `elapsed_sec`)만 덧붙인다.

**사전 계산** — `make precompute` (`scripts/precompute.py`)
1. `loader`가 CSV 두 개를 읽는다.
2. 권한 신청 1건마다 `Engine.review_chain().invoke({requester, requested_access, current_access})`
   - 엔진 안에서 `"요청자 / 신청 권한"`으로 Milvus를 검색해(bge-m3 임베딩, top_k=4) 찾은 조항을 프롬프트의 `[적용 기준 문서]`에 넣는다 → Ollama 모델 → `Verdict`
3. 정책 9건은 텍스트로 풀어 `Engine.policy_chain().invoke({policies})` → `PolicyReview`. 정책 표로 기준 조항을 검색해 `[적용 기준 문서]`에 넣는다 (규칙은 입력으로 받으므로 조항만 찾는다).
4. 결과를 `data/results.json`에 쓴다. 파싱이 실패하면 2회까지 다시 시도하고, 그래도 실패하면 `level="주의"`, `reason="판정 실패: <원인>"`으로 남긴다.

**권한 질의 예시** — `make precompute-ask` (`scripts/precompute_ask.py`)
- 예시 질문 3개를 `Engine.rag_chain(structured=True).invoke(질문)`에 넣어 `Answer`(answer · sources)를 `data/ask_results.json`에 쓴다. `results.json`은 건드리지 않는다.
- 이 체인은 기준 조항과 적재된 솔루션 규칙을 따로 검색해 이어 붙인다. 신청 목록은 모르므로, 질문에 적힌 부서 · 직무와 정책으로만 답한다. `ask_results.json`은 규칙을 적재하기 전에 계산한 것이다.

**화면** — `make web` (`sentinelai/web/main.py`)

| API | 하는 일 | 엔진 호출 |
|---|---|---|
| `GET /api/results` | `results.json` 전체 (없으면 503) | 없음 — 캐시만 읽는다 |
| `GET /api/asks` | `ask_results.json` 전체 (없으면 503) — 권한 질의 예시 버튼용 | 없음 — 캐시만 읽는다 |
| `GET /api/health` | 헤더 경고: 연결 · 모델 · 임베딩 · 인덱스, 모두 준비되면 `ok` | `engine.models()`, `documents.is_empty()` |
| `GET /api/regulations` | `docs/` 원문 (근거 조항 전문 표시용) | 없음 |
| `POST /api/review/{id}` | 권한 신청 1건 실시간 재판정 (없는 ID는 404) | `review_chain` — 위 2번과 같은 경로 |
| `POST /api/ask` | 권한 질의 실시간 답변. 입력 `{"question"}` (공백 제외 1~500자, 벗어나면 422), 출력 `answer · sources · elapsed_sec · failed` | `rag_chain(structured=True)` |

- `Engine()` · `review_chain` · `rag_chain`은 앱 시작 시 1회만 만든다. CORS `*`는 데모 전용이다.
- 실시간 재판정 결과 · 운영자 결정 · 권한 질의 기록은 화면 메모리에만 있다. 파일은 그대로이고, 새로고침하면 캐시 결과로 돌아온다.

**화면 필드의 출처**

| 화면 | 출처 |
|---|---|
| 헤더 경고 | `/api/health`의 `ok`가 false일 때만 "AI 엔진 점검 필요". 원인(연결 끊김 · 모델 없음 · 인덱스 비어 있음)은 툴팁. 페이지를 열 때 한 번 확인한다 |
| 요약 카드 | 정상 · 주의 · 위험 건수. 숫자는 지금 보기 범위(전체 · 권한 신청 · 정책 검토)를 따른다. 누르면 그 등급만 보고, 다시 누르면 전체 |
| 등급 · AI 판정 | `Verdict.level` · `PolicyIssue.level` — 화면에는 정상 · 주의 · 위험 세 단어만 쓴다. 정책의 문제 유형(`kind`)은 대기열의 상세 내용 칸과 패널 제목(예: "FW-004 ↔ FW-005 · 충돌")에 둔다. 등급에서 나오는 권고 문구(정상 → 승인 권고, 주의 → 추가 검토, 위험 → 반려 권고)는 요약 카드 · 도넛 범례 툴팁에만 둔다 (`results.json`의 `verdict` 필드는 화면에서 쓰지 않는다) |
| 판단 이유 | `Verdict.reason` — 모델이 생성 |
| 권고 조치 | `Verdict.recommendation` — 모델이 생성 |
| 근거 조항 | `Verdict.sources` — 모델이 밝힌 근거 문서. 누르면 `docs/` 원문에서 해당 조항을 잘라 보여준다 |
| 상세 요청 | `permissions.csv` 원본 행 |
| 정책 검토 행 | `PolicyIssue`의 `kind` · `level` · `policy_ids` · `reason` · `recommendation` |
| 통계 대시보드 | 도넛 = `summary`의 정상 · 주의 · 위험. 부서별 막대 = 권한 신청을 신청자 첫 단어(부서)로 묶은 등급 건수. 차트는 라이브러리 없이 SVG · CSS로 그린다 |
| 권한 질의 | 답 = `Answer.answer`, 근거 조항 = `Answer.sources` → 누르면 오른쪽 패널에 인용 조항 원문. 예시 버튼은 `ask_results.json`의 답을 3~4초 로딩 연출 뒤 보여주고, 직접 입력한 질문은 `/api/ask`로 실시간 생성한다. 등급 배지는 달지 않는다 (`Answer`에 등급이 없음) |
| 하단 | 계산 시각 = `results.json`의 `generated_at`. 판정 실패는 1건 이상일 때만 경고 |

---

## 3. 실행

| 명령 | 하는 일 |
|---|---|
| `make install` | venv · 의존성 · `.env` 준비 (처음 한 번) |
| `make health` | 서버 · 모델 · 인덱스 확인 |
| `make index` | `docs/` 기준 조항 적재 (바뀐 파일만 다시 임베딩) |
| `make index-policies SRC=정책파일` | 솔루션 정책 규칙 적재 (기본 `data/policies.csv`). `sentinelai.engine.cli index --rebuild`는 규칙까지 지우므로 그 뒤에 다시 돌린다 |
| `make monitor SRC=로그 [SINCE=시각] [STATE=파일]` | 로그 감시 1회 — 로그를 정책과 비교해 사용자별로 판정. `STATE`를 주면 마지막 판정 시각을 그 파일에 남겨 다음 실행이 이어서 판정한다 (cron용) |
| `make precompute` | `data/results.json` 재계산 (맥 기준 약 25분) |
| `make precompute-ask` | `data/ask_results.json` 재계산 (약 1분) |
| `make web` | 대시보드 http://localhost:8000 |

설정은 `.env` 한 곳에서 나온다. 코드에 주소 · 모델명을 하드코딩하지 않는다. 두 환경 모두에서 동작해야 한다.

| 환경 | `SENTINELAI_OLLAMA_BASE_URL` | `SENTINELAI_MODEL` |
|---|---|---|
| 팀 서버 | `http://210.117.182.197:11434` | `gpt-oss:20b` |
| 개인 맥 | `http://localhost:11434` | `qwen2.5:7b` |

서버 주소가 설정 한 줄로 바뀌는 구조가 제안서의 "향후 사내 환경 이전" 요구에 해당한다.
9/27에는 맥에서 팀 서버로 접속되지 않았다 (8초 타임아웃).

**Milvus Lite 파일 락**: DB 파일은 한 프로세스만 열 수 있다. `make web`이 떠 있으면 `make precompute` · `make precompute-ask` · `make index` · `make index-policies` · `make monitor` · `make review-check`가 실패하므로 서버를 끄고 돌린다.

---

## 4. 규칙

- ❌ `sentinelai/engine/`, `docs/`, `scripts/review_check.py` 수정. 프롬프트(`sentinelai/engine/prompt.py`)도 엔진 담당자와 상의 없이 바꾸지 않는다
- ❌ 엔진 기능 재구현, 엔진 타입을 대체하는 웹 전용 스키마
- ❌ 서버 주소 · 모델명 하드코딩 — 전부 `Settings`
- ❌ CDN · 웹폰트 · 외부 이미지 (외부망 차단 전제), React · Tailwind · 빌드 도구
- ❌ 데이터베이스 · 로그인 · 파일 업로드
- ❌ 정책 자동 수정 · 권한 자동 승인 — 운영자 결정 버튼은 화면 메모리에만 기록한다
- ❌ 엔진 출력 항목을 손으로 고치기 · 근거 없는 목업 데이터 — 시연용 예시는 새 항목으로만 더하고 `"example": true`를 단다. 예시 문구도 `docs/` 조항에 근거해야 한다 (§5)
- ❌ 여러 모듈을 한꺼번에 바꾸기 — 하나씩 바꾸고 확인한다. 막히면 우회하지 말고 사용자에게 보고한다

화면 규칙 (사용자 피드백):
- 배포된 운영자 화면 기준으로 판단한다. 운영자 판단에 쓰지 않는 정보(모델명 · 서버 주소 · 폐쇄망 배지 · "연동 예정" · "사전 계산" 표시)와 중복 정보는 두지 않고, 엔진 이상 · 판정 실패처럼 문제가 있을 때만 알린다. 시연 설명(§7)을 이유로 요소를 남기지 않는다. 화면이 바뀌면 이 문서를 고친다.
- 예외: 상단 검은 바의 추진 주체 표기("전북대학교 RAD (RAG & Decision) · SK쉴더스")는 어느 폭에서도 숨기지 않는다. 720px 미만에서는 시스템 설명("AI 보안 정책 검토 시스템")을 먼저 숨긴다.
- 1150px 미만에서는 오른쪽 패널을 서랍으로 띄운다 (행 · 근거 칩 클릭 → 열림, × · Esc · 바깥 클릭 → 닫힘). 1150px 이상은 2단 배치.
- 탭 줄은 맨 위에 고정하고, 탭마다 그 탭에 쓰는 것만 둔다. 요약 카드(등급 필터)와 검색창은 대기열 탭 안에, 통계 탭은 패널 없이 차트를 전체 폭으로, 권한 질의 탭은 하단 계산 시각을 숨긴다.
- 같은 동작을 하는 버튼은 한 화면에 하나만 둔다. 보기 범위(전체 · 권한 신청 · 정책 검토)는 좌측 사이드바가 맡고(건수는 툴팁), 사이드바가 없는 1150px 미만에서만 대기열 제목 줄에 세그먼트 버튼을 띄운다. 위험 알림은 종 배지 하나로 한다 (배너 없음).
- 이모지 아이콘을 쓰지 않는다. 등급 표시는 CSS 점 `.ldot` (8px 점 + 같은 색 반투명 3px 링). 등급 글자는 정상 · 주의 · 위험만 쓰고 "정상 · 승인 권고"처럼 권고 문구를 붙이지 않는다.
- 툴팁(`data-tip="제목|설명"`)은 아이콘만 있는 요소와 화면에 없는 정보를 주는 요소에만 단다. 보이는 글자를 되풀이하는 툴팁은 달지 않는다.
- 색상: 강조 `#EA002C` · 보조 `#FF7A00` · 정상 `#2E7D5B` · 본문 `#111111`/`#666666` · 배경 `#F5F5F6` + 흰 카드. SK쉴더스 CI 컬러는 흰 배경에서만 쓴다 (예외: 상단 검은 바의 방패 로고 — CI 규정 확인 필요). 검은 바 위의 엔진 경고는 흰 알약에 빨간 글자로 띄운다.
- 폰트: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`

코드 주석은 엔진 코드처럼 "~합니다"체로, 코드만 봐서는 알 수 없는 이유만 짧게 쓴다.

---

## 5. 판정 결과 — 기대와 현재

현재 `data/results.json` = 엔진 출력 11건(2026-09-27, 개인 맥 `qwen2.5:7b` — 정상 3 / 주의 8 / **위험 0**, 파싱 실패 0) + **시연용 위험 예시 4건**(`"example": true` — REQ-007 · 008, FW-001 · FW-006 문제).
화면에는 15건 — 정상 3 / 주의 8 / 위험 4가 뜨고, 종 배지에 미결 위험 4가 나온다. 엔진은 위험을 한 건도 내지 않았다. 예시는 위험 등급 화면을 보여주려고 더한 것이고, 엔진 출력 11건은 바꾸지 않았다.
`make precompute`를 돌리면 예시가 사라지고 REQ-007 · 008도 엔진이 판정한다.

| ID | 신청 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|---|
| REQ-001 | 영업팀 → 급여 테이블(HR_SALARY) | 위험 | 3.3, 4.2 | 주의 ❌ |
| **REQ-002** | **인사팀(팀장 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 — 위험이 나오면 오탐** | 정상 ✅ |
| REQ-003 | 개발팀 → 운영 DB 관리자 | 주의 | 4.3 | 주의 ✅ |
| **REQ-004** | **감사팀(감사위 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 단서** | 정상 ✅ |
| REQ-005 | 마케팅팀 → 방화벽 정책 변경 | 위험 | 4.2 | 정상 ❌ 미탐 |
| REQ-006 | 인프라운영팀 → PAM 경유 관리자 | 정상 | 6.2 | 주의 ❌ |
| REQ-007 | 재무팀 → 급여 테이블 수정 (인사팀장 승인 없음) | 위험 | 3.3, 4.2 | 예시 — 엔진 판정 아님 |
| REQ-008 | 인프라운영팀 → 운영 DB 관리자 연장 (115일 미사용) | 위험 | 4.2 | 예시 — 엔진 판정 아님 |

| 정책 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|
| FW-001 | 과도한 허용 | 5.2 | ❌ FW-003과 "중복"으로 잘못 묶음 → 화면에는 예시 "과도한 허용 · 위험"을 더함 |
| FW-002 ↔ FW-003 | 중복 | 5.3 | ❌ 위와 같음 |
| FW-004 ↔ FW-005 | 충돌 | 5.1 | ✅ |
| SWG-001 ↔ DLP-001 | 충돌 | 6.1 | ❌ 각각 "과도한 허용"으로 분리 |
| PAM-001 | 과도한 허용 | 6.2 | ✅ |
| FW-006 | 과도한 허용 | 6.3 | ❌ 못 찾음 → 화면에는 예시 "과도한 허용 · 위험"을 더함 |

**REQ-002 · REQ-004가 가장 중요하다.** 정상을 정상으로 판정하는 것(오탐률)이 실무 도입을 좌우한다. 두 건은 현재 모두 맞았다.

권한 질의 예시 답변 (`data/ask_results.json` — 2026-09-30, `qwen2.5:7b`, 두 번 계산해 나은 쪽):

| 예시 질문 | 인용 | 결과 |
|---|---|---|
| 1. 인사팀 김민수 → 급여 테이블(HR_SALARY) | 3.3 | ✅ |
| 2. 감사팀 담당자 → 인사 정보(HR_MASTER) | 3.2 | ⚠️ 원문 "인사팀 소속 임직원"을 "감사팀 소속 임직원"으로 옮겼다. 두 번 계산해도 같았다 — 시연에서 누르지 않는다 |
| 3. 개발팀 사원 → 운영 DB 관리자 | 3.1 | ✅ (1차 계산에서는 조항 번호가 빠져 문서 전문이 떴다) |

---

## 6. 알려진 문제

- **검색은 종류별로 한다.** RAG에는 기준 조항과 솔루션 규칙이 함께 있다. 한 번에 찾으면 규칙 9건에 조항 청크 4개가 밀려나므로, 권한 · 정책 검토는 조항만, 로그 검토는 조항과 규칙을 따로, 질의응답은 둘을 이어 붙여 쓴다. 조항은 아직 청크 4개뿐이라 `top_k=4`가 전부를 가져온다.
- **`gpt-oss:20b`는 `SENTINELAI_NUM_PREDICT=1024`가 모자라다.** 답하기 전에 추론하느라 조항이 들어간 정책 검토에서 1024 토큰을 다 쓰고 빈 출력(`done_reason=length`)을 낸다. 10/7 측정에서 약 2000 토큰이 필요했고 4096이면 끝났다.
- **소형 모델 한계** (`qwen2.5:7b`): 반복 루프로 판정 1건이 380~417초까지 늘어나고(9/27 6건 중 3건), 같은 입력에도 등급이 바뀐다 (REQ-005: 캐시 정상 → 재판정 주의). 판정 1건은 20초대에서 7분까지 걸린다.
- **`rag_chain`의 sources 형식이 매번 다르다.** 조항 번호가 빠지면 근거 칩에 문서 이름만 뜨고, 누르면 문서 전문이 나온다.
- **repeat_penalty는 쓰지 않는다.** 9/27 같은 6건 + 정책으로 비교한 결과:

| 구성 | 판정 1건 | 권한 적중 | 정책 적중 | 등급 분포 |
|---|---|---|---|---|
| **temp 0.2 (현재)** | 40~417초 | **3/6** | **2/6** | 정상 3 / 주의 8 / 위험 0 |
| temp 0.2 + repeat_penalty 1.15 | 31~58초 | 2/6 | 1/6 | 정상 1 / 주의 9 / 위험 0 |
| temp 0.0 + repeat_penalty 1.15 | 34~56초 | 1/6 | 1/6 | 정상 0 / 주의 10 / 위험 0 |

반복 루프는 사라지지만 등급이 "주의"로 몰려 판별력을 잃는다. temperature는 원인이 아니다. 다시 재 보려면 `scripts/review_check.py --repeat-penalty 1.15`.

---

## 7. 시연 (9/30 산학 자문 멘토링, 5분)

실제 기능 시연이 아니라 "이런 방식이 맞는가"를 묻는 자리다. 화면은 배포된 운영자 화면처럼 보여주되, **시작할 때 "위험 4건과 권한 질의 예시 답은 미리 준비한 예시"라고 먼저 말한다.**

**준비**: Ollama 앱 켜기 → `make health` → `make web` (예시 답을 다시 만들려면 `make web`을 끈 채 `make precompute-ask`)

1. 종 배지 · 요약 카드 — 정상 3 · 주의 8 · 위험 4. [위험] 카드를 눌러 위험만 본다
2. REQ-007(재무팀 → 급여 테이블 수정) → 위험. 근거 조항 3.3을 눌러 원문을 보여준다
3. REQ-002(인사팀 → 인사정보) → 정상, REQ-004와 나란히 — "같은 민감 정보라도 직무와 승인 절차가 맞으면 통과시킵니다"
4. [승인] 버튼 — "AI는 권고하고, 결정은 운영자가 합니다"
5. 정책 검토 → FW-004 ↔ FW-005 충돌 (엔진 결과, 기대와 일치)
6. 권한 질의 탭 → 예시 1번 · 3번 (2번은 누르지 않는다, §5). 3~4초 로딩은 연출이고 저장된 답을 보여준다
7. 멘토에게 물을 것 — REQ-001처럼 소형 모델(`qwen2.5:7b`)이 위험을 주의로 낮추는 문제 (§5 · §6). 모델명 · 폐쇄망 구조는 화면에 없으므로 말로 설명한다 ("클라우드로 나가는 트래픽이 없고, `.env` 한 줄로 사내 서버로 옮겨집니다")

- [실시간 재판정]은 수십 초~수 분 걸리고 결과가 캐시와 달라질 수 있다. 쓰려면 엔진 항목에서 시작할 때 눌러 두고 마지막에 돌아온다. 예시 건(REQ-007 · 008)과 REQ-002에서는 누르지 않는다 (새로고침하면 캐시로 돌아옴).
- 화면의 목록은 실시간 유입이 아니라 사전 계산 결과다. 화면 하단에 계산 시각이 나온다.

---

## 8. 남은 일

1. **팀 서버 `gpt-oss:20b`로 재계산하고 §5와 대조한다.** 코드 변경 없이 `.env` 두 줄이면 된다. 맥에서 팀 서버로 가는 접속 경로부터 확보해야 한다. 재계산하면 §5의 시연용 예시가 사라진다.
2. **알림(Notifier) 구축** — 로그 감시의 주의 · 위험 판정을 운영자에게 보낸다. 인터페이스 자리만 `sentinelai/engine/alert.py`에 두었고, `sentinelai/pipeline.py`의 `monitor`에 부를 곳을 표시했다.
3. 기준 문서에 출력 · 매체 반출 조항이 없어 로그 감시가 근거 없이 판정한다. 절차서 14 · 17번(예외처리 · 매체 반출입) 원문이 필요하다.
4. 이번 범위 밖: 이메일 · 메신저 알림 채널, 실제 솔루션 API 수집(`sentinelai/web/loader.py` 교체).
