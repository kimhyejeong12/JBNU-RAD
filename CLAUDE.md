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
│   ├── __main__.py · cli.py    코어 CLI `python -m sentinelai` — 엔진 명령 + index-policies · review-requests · review-policies · monitor · ask-logs. 코어는 이것만으로 돈다
│   ├── pipeline.py             data × engine 실행 흐름 — review_requests · review_policies · monitor · ask_logs · ResultStore · attempt(재시도)
│   ├── engine/                 LLM · RAG 엔진 (양현성) — 수정 금지
│   │   ├── engine.py             Engine — 설정 · LLM · DocumentStore · 체인 진입점 (engine.review_chain() 등은 chains/로 넘긴다)
│   │   ├── chains/               체인 — 한 파일에 한 기능
│   │   │   ├── access.py           review_chain — 권한 신청 검토 (정책 이해)
│   │   │   ├── policy.py           policy_chain — 정책 모순 판정 (정책 이해)
│   │   │   ├── answer.py           answer_chain · rag_chain — 질의응답 (정책 이해)
│   │   │   ├── event.py            event_chain — 로그 ↔ 정책 비교 (로그 감시)
│   │   │   ├── logs.py             log_filter_chain · log_answer_chain — 로그 질의 (로그 감시). 로그는 RAG로 찾지 않는다
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
│   │   └── events.py             로그 시각 필터(between · latest) · 사용자별 묶음 → event_chain 입력 · 로그 질의용 search · summarize · vocabulary
│   └── web/                    웹 계층 (김혜정) — 코어(pipeline)를 부르고 결과를 보여준다. 판정 로직은 두지 않는다
│       ├── main.py               FastAPI — API + 화면 서빙. Engine · ResultStore · JobRunner 를 앱 시작 시 1회 만든다
│       ├── jobs.py               JobRunner — pipeline 작업을 백그라운드 스레드로 한 번에 하나씩 (진행 상황 · 마지막 실패)
│       ├── view.py               ResultStore → 화면용 dict (판정 필드는 그대로, title · detail만 덧붙임. 판정 실패는 "주의")
│       └── static/index.html     단일 파일 대시보드 — 메뉴(권한 신청 · 정책 관리 · 로그 감시)별 검토 현황, 정책 관리의 정책 질의 탭 (CSS · JS · 아이콘 인라인)
├── docs/                     판정 근거 기준 문서 — 수정 금지
│   ├── 접근권한_관리기준.md       3.1 최소권한 · 3.2 인사정보 · 3.3 급여정보 · 4.1~4.3 등급 기준
│   └── 정책_운영기준.md           5.1 DENY 우선 · 5.2 ANY 금지 · 5.3 중복 · 6.1 DLP>SWG · 6.2 PAM · 6.3 만료
├── data/                     검토 대상과 판정 결과 — 위치는 .env 의 SENTINELAI_*_SOURCE · RESULTS_PATH (지금은 비어 있음, 아래 참고)
│   └── results.json            판정 결과 저장 파일 (ResultStore) — CLI · 웹이 함께 쓴다
├── scripts/
│   └── review_check.py         반복 루프 · 등급 흔들림 재현 (테스트 전용) — 수정 금지
├── .milvus/                  벡터 DB 파일 (Milvus Lite, git 제외)
├── .env · .env.example       설정. .env는 git 제외, make install이 예시에서 만든다
├── Makefile · requirements.txt
└── Dockerfile · README.md    코어 컨테이너(엔진 · data · pipeline, `python -m sentinelai`) · 저장소 소개 (웹은 컨테이너에 없음)
```

검토 대상 위치는 `.env`에서 정한다 — `SENTINELAI_REQUESTS_SOURCE`(권한 신청) · `SENTINELAI_POLICIES_SOURCE`(솔루션 정책) · `SENTINELAI_EVENTS_SOURCE`(보안 솔루션 로그, 지금은 `docs/솔루션 별 Mock 데이터.csv`).
권한 신청 · 정책 CSV(`data/permissions.csv` · `data/policies.csv`)는 10/7에 저장소에서 지웠다. 그 파일이 없으면 해당 분석은 "데이터 파일이 없습니다"로 실패하고 화면 하단에 그대로 뜬다. 예전 사례는 git 이력에 있다.
컬럼 — 권한 신청: `id, requester, requested_access, current_access, 신청일` / 정책: `policy_id, solution, source, destination, service, action, expires_at` / 로그: Microsoft Sentinel 내보내기(`TimeGenerated`, `WHO` · `WHERE` · `HOW` 등, `sentinelai/data/mapper.py`).

---

## 2. 코어와 웹

판정은 모두 코어(`sentinelai.pipeline`)가 한다. CLI(`python -m sentinelai`)와 웹이 같은 함수를 부르고, 결과는 `ResultStore`(`SENTINELAI_RESULTS_PATH`) 한 파일에 구역별로 쌓는다.

| 구역 | 코어 함수 | 하는 일 |
|---|---|---|
| `requests` | `review_requests` | 권한 신청 전 건 → `review_chain` (기준 조항 검색) → `Verdict` |
| `policies` | `index_policies` + `review_policies` | 정책 규칙을 RAG에 적재하고, 정책 전체 → `policy_chain` (기준 조항 검색) → `PolicyReview` |
| `events` | `monitor` | 지난 감시 이후 로그 → 사용자별 묶음 → `event_chain` (조항 · 규칙 검색) → `Verdict`. 결과는 쌓이고, 마지막 로그 시각이 다음 감시의 시작점 |

**로그 질의** (`pipeline.ask_logs`, 결과 파일에 쓰지 않음) — 로그는 RAG로 찾지 않는다. "몇 번 · 언제부터 · 누가"는 집계라서 비슷한 몇 줄만 찾으면 건수가 틀린다.
1. `log_filter_chain`: 질문 + 로그에 있는 값(`vocabulary`) + 현재 시각 → `LogFilter`(사용자 · 부서 · 솔루션 · 위치 · 행위 · 항목 · 기간). 로그에 없는 표현은 비슷한 값으로 바꾸지 않는다.
2. 코드가 찾고(`search` — 부분 일치, 항목은 `Exception=1`처럼 값까지) 센다(`summarize` — 건수 · 사용자별 · 날짜별 · 숫자 항목 합계).
3. `log_answer_chain`: 조건 · 집계 · 해당 로그(최근 50줄)로 평문 답. 숫자는 집계 그대로, 정책 위반 여부는 판단하지 않는다 (그건 `monitor`의 몫).
- 10/8 `gpt-oss:20b`로 질문 1건에 70~220초 (모델 호출 2번).

- 판정이 실패하면 2회까지 다시 시도한다(`pipeline.attempt`). 그래도 실패하면 `failed` · `error`로 남기고, 화면은 그 건을 "주의"로 올려 이유 칸에 원인을 적는다.
- Milvus Lite는 한 프로세스만 DB를 열 수 있다. 웹이 떠 있는 동안 판정은 웹의 작업(`/api/jobs`)으로 돌린다. 웹이 꺼져 있으면 CLI로 돌리고, 웹은 시작할 때 같은 결과 파일을 읽는다.

**화면** — `make web` (`sentinelai/web/main.py`)

| API | 하는 일 |
|---|---|
| `GET /api/results` | 저장된 판정 결과 → 화면용 dict. 아직 돌리지 않은 구역은 비어 있다 |
| `GET /api/jobs` | 돌고 있는 작업 · 단계 · 진행(done/total) · 작업별 마지막 실패 |
| `POST /api/jobs/{kind}` | `requests` · `policies` · `events` 백그라운드 시작 (202). 한 번에 하나 — 돌고 있으면 409 |
| `POST /api/review/{id}` | 권한 신청 1건 재판정 → 결과 파일에도 반영 (없는 ID 404, 작업 중 409) |
| `POST /api/ask` | 정책 질의 실시간 답변. 입력 `{"question"}` (공백 제외 1~500자, 벗어나면 422) → `rag_chain` (조항 · 규칙 검색) |
| `POST /api/ask-logs` | 로그 질의. 입력은 `/api/ask`와 같다 → `pipeline.ask_logs` → `answer · criteria · facts · evidence · failed` |
| `GET /api/health` | 헤더 경고: 연결 · 모델 · 임베딩 · 인덱스, 모두 준비되면 `ok` |
| `GET /api/regulations` | `docs/` 원문 (근거 조항 전문 표시용) |

- `Engine()` · `rag_chain`은 앱 시작 시 1회만 만든다. CORS `*`는 데모 전용이다.
- 운영자 결정 · 정책 질의 기록은 화면 메모리에만 있다 (새로고침하면 사라짐). 판정 결과는 파일에 남는다.

**화면 필드의 출처**

| 화면 | 출처 |
|---|---|
| 헤더 경고 | `/api/health`의 `ok`가 false일 때만 "AI 엔진 점검 필요". 원인(연결 끊김 · 모델 없음 · 인덱스 비어 있음)은 툴팁. 페이지를 열 때 한 번 확인한다 |
| 분석 실행 버튼 | 대기열 제목 줄 오른쪽 하나. 보기 범위의 작업을 돌린다 (권한 신청 → 권한 신청 검토, 정책 관리 → 정책 관리 검토(규칙 적재 포함), 로그 감시 → 로그 감시). 도는 동안 "… 중 3/8"을 띄우고 2초마다 `/api/jobs`를 본다. 끝나면 결과를 다시 받는다 |
| 요약 카드 | 정상 · 주의 · 위험 건수. 숫자는 지금 보기 범위(권한 신청 · 정책 관리 · 로그 감시)를 따른다. 누르면 그 등급만 보고, 다시 누르면 전체 |
| 등급 · AI 판정 | `Verdict.level` · `PolicyIssue.level` — 화면에는 정상 · 주의 · 위험 세 단어만 쓴다. 정책의 문제 유형(`kind`)은 대기열의 상세 내용 칸과 패널 제목(예: "FW-004 ↔ FW-005 · 충돌")에 둔다. 등급에서 나오는 권고 문구(정상 → 승인 권고, 주의 → 추가 검토, 위험 → 반려 권고)는 요약 카드 툴팁에만 둔다 |
| 판단 이유 · 권고 조치 | `reason` · `recommendation` — 모델이 생성 |
| 근거 조항 | `Verdict.sources` — 기준 문서면 `docs/` 원문에서 조항을 잘라 보여주고, 솔루션 정책(`rules:`)이면 언급된 정책 ID의 원본 행을 보여준다. 정책 검토는 근거를 판단 이유에 함께 적는다 |
| 상세 요청 · 판정한 로그 · 관련 정책 원본 | 권한 신청 원본 행 · 사용자별 로그 묶음(한 줄에 한 건) · 정책 원본 행 |
| 운영자 결정 | 권한 신청 · 정책: 승인 · 조건부 승인 · 반려 확정. 로그 감시: 이상 없음 · 조치 필요 |
| 로그 질의 | 답 = `answer`, 조건 = `criteria`, 근거 칩 "해당 로그 N건" → 누르면 오른쪽 패널에 집계(`facts`)와 로그 줄(`evidence`). 숫자는 모두 코드가 센 값이다 |
| 정책 질의 | 답 = `Answer.answer`, 근거 = `Answer.sources` → 누르면 그때 오른쪽 패널을 열어 원문을 보여준다. 예시 질문 버튼(스크립트의 `ASK_EXAMPLES`)도 직접 입력과 똑같이 실시간으로 답을 만든다. 등급 배지는 달지 않는다 |
| 하단 | 계산 시각 = 구역별 마지막 실행 중 가장 늦은 것. 판정 실패 · 읽지 못한 행 · 작업 실패는 있을 때만 경고. 그 아래 맨 끝에 추진 주체 표기 |

---

## 3. 실행

| 명령 | 하는 일 |
|---|---|
| `make install` | venv · 의존성 · `.env` 준비 (처음 한 번) |
| `make health` | 서버 · 모델 · 인덱스 확인 |
| `make index` | `docs/` 기준 조항 적재 (바뀐 파일만 다시 임베딩) |
| `make index-policies [SRC=파일]` | 솔루션 정책 규칙 적재 (기본 `.env`). `sentinelai.engine.cli index --rebuild`는 규칙까지 지우므로 그 뒤에 다시 돌린다 |
| `make review-requests [SRC=파일]` | 권한 신청 전 건 판정 → 결과 파일 |
| `make review-policies [SRC=파일]` | 정책 간 중복 · 충돌 · 과도한 허용 판정 → 결과 파일 |
| `make monitor [SRC=로그] [SINCE=시각] [FULL=1]` | 로그 감시 1회 — 지난 감시 이후 로그만 판정해 결과 파일에 쌓는다 (cron용). `FULL=1`이면 처음부터 |
| `make ask-logs Q="질문"` | 보안 솔루션 로그에 질의 (벡터 DB를 쓰지 않아 `make web`이 떠 있어도 된다) |
| `make web` | 대시보드 http://localhost:8000 — 위 판정을 화면의 [분석 실행]으로도 돌린다 |

설정은 `.env` 한 곳에서 나온다. 코드에 주소 · 모델명을 하드코딩하지 않는다. 두 환경 모두에서 동작해야 한다.

| 환경 | `SENTINELAI_OLLAMA_BASE_URL` | `SENTINELAI_MODEL` |
|---|---|---|
| 팀 서버 | `http://210.117.182.197:11434` | `gpt-oss:20b` |
| 개인 맥 | `http://localhost:11434` | `qwen2.5:7b` |

서버 주소가 설정 한 줄로 바뀌는 구조가 제안서의 "향후 사내 환경 이전" 요구에 해당한다.
9/27에는 맥에서 팀 서버로 접속되지 않았다 (8초 타임아웃).

**Milvus Lite 파일 락**: DB 파일은 한 프로세스만 열 수 있다. `make web`이 떠 있으면 `make index` · `make index-policies` · `make review-requests` · `make review-policies` · `make monitor` · `make review-check`가 실패한다. 웹이 떠 있을 때는 화면의 [분석 실행]을 쓴다.

---

## 4. 규칙

- ❌ `sentinelai/engine/`, `docs/`, `scripts/review_check.py` 수정. 프롬프트(`sentinelai/engine/prompt.py`)도 엔진 담당자와 상의 없이 바꾸지 않는다
- ❌ 엔진 기능 재구현, 엔진 타입을 대체하는 웹 전용 스키마
- ❌ 서버 주소 · 모델명 하드코딩 — 전부 `Settings`
- ❌ CDN · 웹폰트 · 외부 이미지 (외부망 차단 전제), React · Tailwind · 빌드 도구
- ❌ 데이터베이스 · 로그인 · 파일 업로드
- ❌ 정책 자동 수정 · 권한 자동 승인 — 운영자 결정 버튼은 화면 메모리에만 기록한다
- ❌ 엔진 출력 항목을 손으로 고치기 · 근거 없는 목업 데이터 · 사전 계산 답을 실시간처럼 보이게 하는 연출 (10/8에 모두 걷어냈다)
- ❌ 여러 모듈을 한꺼번에 바꾸기 — 하나씩 바꾸고 확인한다. 막히면 우회하지 말고 사용자에게 보고한다

화면 규칙 (사용자 피드백):
- 배포된 운영자 화면 기준으로 판단한다. 운영자 판단에 쓰지 않는 정보(모델명 · 서버 주소 · 폐쇄망 배지 · "연동 예정" · "사전 계산" 표시)와 중복 정보는 두지 않고, 엔진 이상 · 판정 실패처럼 문제가 있을 때만 알린다. 시연 설명(§7)을 이유로 요소를 남기지 않는다. 화면이 바뀌면 이 문서를 고친다.
- 예외: 추진 주체 표기("전북대학교 RAD (RAG & Decision) · SK쉴더스")는 맨 아래 푸터(`footer.credit`)에 둔다. 탭 · 화면 폭과 상관없이 늘 보인다 (계산 시각 줄 `#foot`은 질의 탭에서 숨겨지므로 따로 둔다).
- 1150px 미만에서는 오른쪽 패널을 서랍으로 띄운다 (행 · 근거 칩 클릭 → 열림, × · Esc · 바깥 클릭 → 닫힘). 1150px 이상은 2단 배치.
- 메뉴가 탭보다 위다. 메뉴(권한 신청 · 정책 관리 · 로그 감시)마다 쓰는 탭만 둔다 — 정책 관리는 [검토 현황 · 정책 질의], 로그 감시는 [검토 현황 · 로그 질의], 권한 신청은 검토 현황 하나라 탭 줄을 숨기고 대기열 제목("권한 신청 현황")으로 메뉴를 알린다. 질의는 그 메뉴의 기능일 때만 둔다. 질의 기록은 메뉴마다 따로다.
- 탭마다 그 탭에 쓰는 것만 둔다. 요약 카드(등급 필터)와 검색창은 검토 현황 탭 안에 두고, 질의 탭(정책 · 로그)은 하단 계산 시각을 숨긴다.
- 오른쪽 패널은 메뉴 · 탭의 것이다. 검토 현황에서는 그 메뉴의 항목 판단 근거 · 운영자 결정을 보여주고(메뉴를 바꾸면 그 메뉴의 첫 항목), 정책 질의에서는 근거 칩을 눌렀을 때만 인용 조항 패널을 연다 (× · Esc로 닫음, 그 전에는 질의가 전체 폭). 탭을 바꾸면 열어 둔 인용 조항은 닫힌다.
- 통계 대시보드는 10/8에 뺐다. 도넛은 요약 카드 · 종 배지와 숫자가 겹쳤고, 부서별 막대는 이름 첫 단어로 부서를 추정해 믿을 수 없었으며, 운영자 결정에 쓰이지 않았다. 차트를 다시 넣으려면 §8의 로그 감시 이력처럼 결정에 쓰이는 질문부터 정한다.
- 같은 동작을 하는 버튼은 한 화면에 하나만 둔다. 보기 범위(권한 신청 · 정책 관리 · 로그 감시 — 세 개만, "전체" 없음)는 좌측 사이드바가 맡고(건수는 툴팁), 사이드바가 없는 1150px 미만에서만 탭 줄 위에 세그먼트 버튼을 띄운다 (어느 탭에서든 메뉴를 바꿀 수 있게). 위험 알림은 종 배지 하나로 한다 (배너 없음).
- 이모지 아이콘을 쓰지 않는다. 등급 표시는 CSS 점 `.ldot` (8px 점 + 같은 색 반투명 3px 링). 등급 글자는 정상 · 주의 · 위험만 쓰고 "정상 · 승인 권고"처럼 권고 문구를 붙이지 않는다.
- 툴팁(`data-tip="제목|설명"`)은 아이콘만 있는 요소와 화면에 없는 정보를 주는 요소에만 단다. 보이는 글자를 되풀이하는 툴팁은 달지 않는다.
- 색상: 강조 `#EA002C` · 보조 `#FF7A00` · 정상 `#2E7D5B` · 본문 `#111111`/`#666666` · 배경 `#F5F5F6` + 흰 카드. SK쉴더스 CI 컬러는 흰 배경에서만 쓴다 (예외: 상단 검은 바의 방패 로고 — CI 규정 확인 필요). 검은 바 위의 엔진 경고는 흰 알약에 빨간 글자로 띄운다.
- 폰트: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`

코드 주석은 엔진 코드처럼 "~합니다"체로, 코드만 봐서는 알 수 없는 이유만 짧게 쓴다.

---

## 5. 판정 결과 — 기대와 현재

아래 "현재"는 2026-09-27 개인 맥 `qwen2.5:7b` 결과다 (정상 3 / 주의 8 / **위험 0**). 그때 화면에 더했던 시연용 위험 예시 4건과 예시 답 캐시는 10/8에 걷어냈다.
10/8 팀 서버 `gpt-oss:20b` + 조항 검색으로 일부를 다시 돌린 결과: REQ-001 **위험** ✅ · REQ-002 정상 ✅. 정책 검토는 SWG-001 ↔ DLP-001(6.1) · FW-001(5.2)을 찾게 됐지만 실행마다 묶는 방식과 건수가 달라진다 (6~10건). 전 건 재계산은 §8.

| ID | 신청 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|---|
| REQ-001 | 영업팀 → 급여 테이블(HR_SALARY) | 위험 | 3.3, 4.2 | 주의 ❌ |
| **REQ-002** | **인사팀(팀장 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 — 위험이 나오면 오탐** | 정상 ✅ |
| REQ-003 | 개발팀 → 운영 DB 관리자 | 주의 | 4.3 | 주의 ✅ |
| **REQ-004** | **감사팀(감사위 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 단서** | 정상 ✅ |
| REQ-005 | 마케팅팀 → 방화벽 정책 변경 | 위험 | 4.2 | 정상 ❌ 미탐 |
| REQ-006 | 인프라운영팀 → PAM 경유 관리자 | 정상 | 6.2 | 주의 ❌ |
| REQ-007 | 재무팀 → 급여 테이블 수정 (인사팀장 승인 없음) | 위험 | 3.3, 4.2 | 미판정 |
| REQ-008 | 인프라운영팀 → 운영 DB 관리자 연장 (115일 미사용) | 위험 | 4.2 | 미판정 |

| 정책 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|
| FW-001 | 과도한 허용 | 5.2 | ❌ FW-003과 "중복"으로 잘못 묶음 |
| FW-002 ↔ FW-003 | 중복 | 5.3 | ❌ 위와 같음 |
| FW-004 ↔ FW-005 | 충돌 | 5.1 | ✅ |
| SWG-001 ↔ DLP-001 | 충돌 | 6.1 | ❌ 각각 "과도한 허용"으로 분리 |
| PAM-001 | 과도한 허용 | 6.2 | ✅ |
| FW-006 | 과도한 허용 | 6.3 | ❌ 못 찾음 |

**REQ-002 · REQ-004가 가장 중요하다.** 정상을 정상으로 판정하는 것(오탐률)이 실무 도입을 좌우한다. 두 건은 현재 모두 맞았다.

정책 질의 예시 질문(화면 `ASK_EXAMPLES`)은 10/8부터 실시간으로 답한다. 9/30 `qwen2.5:7b` 캐시에서는 "감사팀 담당자 → 인사 정보" 질문이 원문 "인사팀 소속 임직원"을 "감사팀 소속 임직원"으로 바꿔 옮겨 예시에서 뺐다.

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

## 7. 시연 기록 (9/30 산학 자문 멘토링)

9/30 시연은 사전 계산 결과(`results.json` · `ask_results.json`)와 시연용 위험 예시 4건, 예시 답 로딩 연출로 진행했다. 10/8에 이 경로를 모두 걷어내고 화면이 코어 작업을 직접 돌리게 바꿨다 (§2).
다음에 시연하려면: 팀 서버 연결 → `make health` → `make web` → 화면에서 보기 범위마다 [… 실행] (정책 관리를 로그 감시보다 먼저 — 규칙이 적재돼야 로그 감시가 찾는다). 판정 한 건에 1~3분이 걸리므로 미리 돌려 두고, 결과 파일이 남으므로 서버를 다시 띄워도 결과가 보인다.

---

## 8. 남은 일

1. **권한 신청 · 정책 데이터를 다시 정하고 `gpt-oss:20b`로 전 건 판정해 §5와 대조한다.** `data/`의 두 CSV가 지워져 있어 지금은 로그 감시만 실제로 돈다. `gpt-oss:20b`는 `SENTINELAI_NUM_PREDICT`를 4096 정도로 올려야 한다 (§6).
2. **알림(Notifier) 구축** — 로그 감시의 주의 · 위험 판정을 운영자에게 보낸다. 인터페이스 자리만 `sentinelai/engine/alert.py`에 두었고, `sentinelai/pipeline.py`의 `monitor`에 부를 곳을 표시했다.
3. 기준 문서에 출력 · 매체 반출 조항이 없어 로그 감시가 근거 없이 판정한다. 절차서 14 · 17번(예외처리 · 매체 반출입) 원문이 필요하다.
4. **로그 감시 이력 화면** — 로그 감시 결과가 쌓이면 운영자가 볼 이력: 같은 사용자의 반복 주의 · 위험, 솔루션 · 행위별 추이, 마지막 감시 시각과 판정하지 못한 로그. 데이터가 쌓이고 출력 · 매체 반출 기준 조항(3번)이 들어온 뒤에 만든다.
5. 이번 범위 밖: 이메일 · 메신저 알림 채널, 실제 솔루션 API 수집(`sentinelai.data` 에 RowSource 로 추가).
