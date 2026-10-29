# SentinelAI

> Claude Code가 세션 시작 때 읽는 프로젝트 안내서. 팀원도 같은 문서를 봄.

## ★ 하는 일 — 모든 작업의 기준

정책을 RAG에 쌓고, 그 위에서 두 기능을 함. 새 작업은 둘 중 어느 쪽에 쓰이는지부터 정함.

1. **정책 이해** — 기존 정책을 읽고, 정책 질의에 답하고, 정책 간 모순을 판정함
2. **로그 감시** — 로그를 읽어 정책과 비교하고, 어긋나면 알림

- 정책은 RAG 저장소 한 곳에 쌓고 두 기능 모두 거기서 근거를 찾음
- **원칙**: AI는 근거와 등급만 냄. 승인 · 반려의 최종 결정은 사람(보안 운영자 · 보안 총책임자)이 함
- **사용자 용어**(10/20): 일반 사용자(`user`) · 보안 운영자(`manager`) · 보안 총책임자(`top`, 루트 포함). 화면 · 오류 문구 · 문서 모두 이 셋만. 역할 코드는 그대로
- **이름**: SentinelAI (10/07 확정). 로그 출처는 헷갈리지 않게 항상 "Microsoft Sentinel"로 씀. 추진 주체 · 부제는 10/12에 화면 · 코드에서 뺐음 (README에만)
- **팀**: 전북대학교 RAD(RAG & Decision) × SK쉴더스 산학 캡스톤. LLM · RAG 엔진 `sentinelai/engine/`(양현성) 위에 웹 `sentinelai/web/` · 화면 `frontend/`(김혜정)
- 9/30 산학 자문 미팅에서 시연했음 (§7)

## ★ 산학협력 문제 제안서 — 원래 요구

SK쉴더스 산학협력 문제 제안서(2026. 8.)가 이 과제의 기준.

- **문제명**: 로컬 LLM 및 RAG 기반 AI 보안 정책 검토 및 접근 권한 의사결정 지원 시스템 (수요기관 SK쉴더스 · 지도교수 김병관)
- **배경**: 솔루션마다 정책이 따로 관리돼 충돌 · 중복 · 과도한 허용을 한꺼번에 볼 수 없음. 권한이 직무에 맞는지는 관리자가 수작업으로 봄
- **요구**: AI가 사내 기준(RAG)과 업무 맥락으로 위험을 찾아 사유 · 개선안 · 승인 / 반려 권고를 냄. 정책은 밖으로 나가지 않음(로컬 LLM). 최종 결정은 보안 운영자

| 요구 | 지금 구현 | 빈 곳 |
|---|---|---|
| 로컬 LLM · RAG — 보안정책 · 접근통제 · 권한 부여 기준 · 운영 가이드를 Vector DB에 | Ollama · Milvus Lite · `docs/` 기준 문서 2개 | 운영 가이드 · 사내 원문 pptx · pdf (§8 6) |
| 정책 검토 — 공통 형식으로 표준화, 충돌 · 중복 · 과도한 허용 · 기준 위반과 개선안 | `sentinelai/data/` → `review_policies` | 실제 정책 샘플 (§8 1) |
| 권한 적정성 — 부서 · 직무 · 기존 권한 · 신청 권한 → 승인 · 추가 검토 · 반려 권고 | `judge_request` (정상 → 승인 권고 · 주의 → 추가 검토 · 위험 → 반려 권고) | 직무 — 계정에 부서만 있음 |
| 대시보드 · 알림 — 정상 · 주의 · 위험, 위험이면 운영자 알림(이메일 · 메신저 포함), 고칠 것 설명 | 웹 대시보드 · 종 배지 | 알림 보내기 (§8 3). 이메일 · 메신저는 §8 11에서 범위 밖이라 범위를 정할 때 함께 봄 |
| 수집 인터페이스 모듈화 — 실제 솔루션 API · Export, 계정 관리 시스템 · AD 연동 대비 | `RowSource` · 수집 노드 | 실제 연동 (§8 11) |
| 위험도 · 신뢰도 평가 (구조도) | 사용자 의심 점수 · 안전 점수 | 정책 위험도 점수 · AI 판단 신뢰도 (§8 7) |

**검증 시나리오** — 이 넷이 맞게 나와야 함

| 시나리오 | 기대 | 가까운 예전 사례 · 조항 |
|---|---|---|
| A 솔루션은 개인 클라우드 업로드 허용, B 솔루션은 차단 | 충돌 | SWG-001 ↔ DLP-001, 6.1 |
| 외부망 → 내부 DB 직접 접근을 허용하는 방화벽 정책 | 기준 위반 | FW-001, 5.2 |
| 인사팀 사용자가 Linux Root 권한 신청 | 과도한 권한 | 사례 없음, 4.2 |
| 서버 운영 담당자가 업무 대상 서버의 관리자 권한 신청 | 정상 · 승인 권고 | REQ-006 (9/27 주의 ❌) |

**지금 문서와 다른 점**
- 제안서의 두 축은 정책 검토와 **권한 신청 판단**. 위 ★ 하는 일에는 권한 신청이 없으니 줄이거나 미루기 전에 확인함
- 로그 감시 · 서버 점검 · 로그 · 서버 질의 · 사용자 위협 예측은 제안서에 없고 진행하며 더했음

---

## 1. 폴더 구조

```
JBNU-RAD/
├── sentinelai/               SentinelAI 패키지. __init__.py 는 ROOT · 버전만 (하위 패키지를 가져오지 않음)
│   ├── __main__.py · cli.py    CLI `python -m sentinelai` — 웹이 꺼져 있을 때 쓰는 최소 명령 (health · index · review-policies · check-nodes · monitor · import-snapshots · create-root). 모두 Engine 기능을 부름
│   ├── engine/                 엔진 (양현성) — 큰 파일 다섯 개 (10/20에 chains/ · pipeline · 작업 큐 · CLI 를 합쳤음)
│   │   ├── engine.py             Settings(.env) · Engine — 모델 · RAG 저장소 · 두 DB를 열고 모든 기능(run_policies · run_nodes · run_events · ask · ask_servers · ask_logs · browse_logs · stats · user_stats · run_suspects · receive_snapshot · import_snapshots · judge_request · health)과 작업 큐를 둠 (JobRunner: 자동 로그 감시 · 서버 점검 · 정책 관리 검토, VerdictWorker: 권한 신청 판정). 웹 · CLI는 Engine 하나만 만듦
│   │   ├── pipeline.py           체인(review · policy · server · server_filter · server_answer · event · log_filter · log_answer · answer · rag)과 판정 흐름(review_policies · check_nodes · snapshot_row · ask_servers · monitor · browse_logs · ask_logs · judge_request · attempt). 결과 dict만 돌려주고 저장 · 큐는 engine.py
│   │   ├── rag.py                DocumentStore — 기준 조항(clause) · 솔루션 규칙(rule)을 한 컬렉션에, 종류별 검색(lookup · lookup_all)
│   │   ├── prompt.py             프롬프트 (권한 검토 · 로그 검토 · 정책 검토 · 서버 점검 · 질의응답 · 로그 질의)
│   │   └── types.py              출력 타입 Verdict · PolicyReview · ServerReview · Answer · LogFilter, 알림 자리 Notifier (구현 없음, §8 3)
│   ├── data/                   검토 대상 데이터 계층 (양현성) — 엔진과 독립. 소스(CSV · JSON · 메모리) × 매퍼
│   │   ├── types.py              SecurityEvent · AccessRequest · PolicyRule · ServerState · ServerSnapshot · LoadResult
│   │   ├── source.py             RowSource — CsvSource · JsonSource · MemorySource, 확장자로 고르는 open_source
│   │   ├── mapper.py             EventMapper(Microsoft Sentinel 로그) · AccessRequestMapper · PolicyRuleMapper
│   │   ├── collected.py          수집 노드 본문 → 모듈별 상태(UFW · SSH · PAM · 계정 · sudo), 직전 수집과 달라진 설정, 서버 질의용 server_digest
│   │   ├── suspect.py            의심 점수의 행동 신호 (최근 7일 vs 앞 4주, 코드가 셈), 계정 ↔ 로그 사용자 잇기 (10/22)
│   │   ├── servers.py            서버 ↔ 규칙 맞춰 보기 (IP · 대역 · 호스트 이름, ANY 제외) → server_chain 입력
│   │   └── events.py             로그 시각 필터(between · latest) · 사용자별 묶음 → event_chain 입력, 로그 질의용 search · summarize · vocabulary
│   ├── db/                     권한 DB · AI 결과 DB (SQLite). 엔진 · 데이터 계층은 모름. 설계는 design/db-schema.md · design/results-db.md
│   │   ├── schema.sql            권한 DB — 사용자 · 세션 · 감사 기록 · 신청(1건 = 1행: 신청 · AI 판정 · 1차 · 최종 결재 · 회수). 결재 순서 · 역할은 트리거가 강제
│   │   ├── results_schema.sql    AI 결과 DB — 정책 관리 검토 · 로그 감시 판정 · 질의 기록 (쌓기만, 로그 자체는 안 쌓음). results_servers.sql 이 서버 점검을 더함
│   │   ├── auth.py               Argon2id · 로그인 잠금 · 세션 2일 · 계정 관리는 보안 총책임자 (루트 계정은 루트만)
│   │   ├── permissions.py        신청(권한 목록 코드로, 현재 보유 권한은 승인된 유효 신청에서 읽어 남김) · AI 판정 저장(1차 결재 전까지만) · 철회 · 결재 · 회수
│   │   ├── decisions.sql · decisions.py  정책 관리 · 로그 감시의 운영자 결정 (쌓기만, 마지막 기록이 지금 결정)
│   │   ├── access_catalog.sql · catalog.py  권한 목록 — 일반 사용자는 켜진 권한만 신청. 보안 총책임자가 등록 · 고치기 · 끄기 (지우지 않음, 코드 못 바꿈) (10/20)
│   │   ├── nodes.sql · nodes_keys.sql · nodes_key_view.sql · nodes.py  수집 노드 등록부 — 노드마다 키 발급(해시로 찾고 화면에서 다시 볼 수 있게 키도 둠) · 다시 발급 · 끄기 (10/20)
│   │   ├── 그 밖의 *.sql          마이그레이션 — accounts(계정 생성을 보안 총책임자로, 10/12) · decisions_server(결정에 서버 점검, 10/12) · roles_names(트리거 문구를 사용자 용어로, 10/20) · users_log_id(계정의 로그 사용자 ID, 10/22) · results_server_snapshots · results_nodes(수집 기록 · 노드 판정, 10/20) · results_server_gaps(다른 곳 · 판단 안 한 항목, 10/14) · results_qa_servers(서버 질의 기록, 10/21) · results_monitor_stage · results_suspects(빠른 · 정밀 감시, 의심 점수, 10/22)
│   │   └── results.py            AI 결과 DB 저장 · 조회 — 정책 관리 검토 · 로그 감시(다음 감시 시작점 포함) · 내 질의 기록 · 보안 통계(threat_stats). CLI · 웹이 같은 DB를 씀
│   └── web/                    웹 계층 (김혜정) — Engine 기능을 부르고 결과를 보여줌. 판정 로직 · 큐 없음
│       ├── main.py               FastAPI — API + 화면 서빙. 시작 때 Engine 생성 · start()(작업 큐), 끌 때 stop()(큐 · 벡터 DB 잠금 해제)
│       ├── api_nodes.py          수집 노드 API — 수집 받기(키만) · 등록 · 키 발급 · 목록 · 끄기 (/api/nodes)
│       ├── api_permissions.py    로그인 · 계정 · 권한 목록 · 신청 · 결재 · 회수 API (/api/auth · /api/users · /api/requests). 일반 사용자에게는 AI 칸을 빼고 줌
│       ├── view.py               AI 결과 DB → 화면용 dict (판정 필드는 그대로, title · detail만 덧붙임. 판정 실패는 "주의")
│       └── static/               화면 빌드 결과 — frontend/ 에서 `make front-build` 로 만들어 커밋. 서버는 그대로 서빙
├── frontend/                 React 화면 소스 (김혜정) — TypeScript · Vite · TanStack Query · Vitest. 10/29에 옛 index.html 을 기능 · 모양 그대로 옮겼음 (리디자인은 다음)
│   └── src/
│       ├── app/                  껍데기 — App(로그인 게이트) · styles.css(CSS 순서)
│       │   ├── layout/             화면 틀 — AppShell · TopBar · Sidebar · Workspace · MainTabs · RightPanel · Footer
│       │   ├── overlays/           기준 문서 창 · 툴팁
│       │   ├── session/            로그인한 사람(me) · 역할별 메뉴(views) · 역할별 데이터 훅(data) · 부팅(useBoot)
│       │   ├── ui/                 state/(UiContext · uiReducer — 메뉴 · 탭 · 선택 · 패널 동작) · panel/(Panel · SourceChips)
│       │   └── queue/              검토 현황 공통 — useQueue · select · QueueTable …
│       ├── shared/               api/(http · types · queries · jobs) · lib/(format · request · clause · labels …) · ui/(base · charts · server) · styles/
│       └── features/             메뉴별 — auth · requests · review · nodes · logs · ask(예시 질문은 config.ts) · stats · catalog · accounts. 서로 import 하지 않고 shared 와 app/{session,ui,queue} 만 씀
├── docs/                     판정 근거 기준 문서 — 수정 금지 (make index 가 RAG에 적재)
│   ├── 접근권한_관리기준.md       3.1 최소권한 · 3.2 인사정보 · 3.3 급여정보 · 4.1~4.3 등급 기준
│   └── 정책_운영기준.md           5.1 DENY 우선 · 5.2 ANY 금지 · 5.3 중복 · 6.1 DLP>SWG · 6.2 PAM · 6.3 만료
├── data/                     검토 대상 · 두 DB 파일 (위치는 .env, DB 파일은 git 제외)
├── node/                     수집 노드 — 점검 대상 서버에 까는 데몬 (패키지와 따로, 표준 라이브러리만, Python 3.8+). 설치 · 사용은 node/README.md
│   ├── sentinel_node/          collect(모듈별 원문 읽기) · client(보내기 · 못 보낸 것 쌓기 · 키 저장) · config · __main__(run · once · show · export)
│   ├── install.sh              /opt/sentinel-node · /etc/sentinel-node/node.conf · systemd 설치 · 제거
│   └── testenv/                시험용 점검 대상 컨테이너 (Ubuntu + ufw · sshd · PAM · sudo, weak · strict)
├── scripts/                  dev_setup.py(로컬 시험 환경) · dev_nodes.py(노드 키 꺼내기 · 흉내 노드)
├── design/                   DB 설계 — db-schema.md(권한 DB 결정 경위 · 남은 질문) · results-db.md(AI 결과 DB)
├── FRONTEND_GUIDE.md         화면 가이드 — 화면 동작 · 화면 규칙의 단일 출처
├── NOTES.md                  작업 메모 — 설정 값의 이유 · 서버 이슈 경위 · 모델 비교 (설정 파일 · 코드에 설명 주석 대신 여기에)
├── .dev/ · .milvus/          로컬 시험 환경 DB · 벡터 DB 파일 (git 제외)
├── .env · .env.example       설정. .env 는 git 제외, make install 이 예시에서 만듦
├── Makefile · requirements.txt
└── Dockerfile · README.md    코어 컨테이너(엔진 · data · db, 웹 없음) · 저장소 소개
```

### 검토 대상 데이터

| `.env` | 내용 | 지금 |
|---|---|---|
| `SENTINELAI_POLICIES_SOURCE` | 솔루션 정책 | `data/policies/` — 비어 있음 |
| `SENTINELAI_SERVERS_SOURCE` | 서버 현황 (자산관리 내보내기) | `data/servers/` — 비어 있음 |
| `SENTINELAI_EVENTS_SOURCE` | 보안 솔루션 로그 | `data/연습용_로그_원본+합성.csv` |

- 폴더를 가리키면 안의 `.csv` · `.json` · `.jsonl`을 모두 읽음 (솔루션 · 도구마다 내보낸 파일을 그대로 둠)
- 컬럼이 맞지 않는 파일은 건너뛰고 화면 하단에 알림. 폴더가 없거나 비면 그 검토만 건너뜀
- 사내 기준 문서는 `docs/`에. 정책 관리 검토를 돌릴 때 바뀐 것만 RAG에 다시 적재

| 대상 | 컬럼 |
|---|---|
| 권한 신청 | `id, requester, requested_access, current_access, 신청일` |
| 정책 | `policy_id, solution, source, destination, service, action, expires_at` |
| 서버 현황 | 호스트 이름(`host` · `hostname` · `호스트명` 등)이나 IP(`ip` · `IP` 등) 하나만 있으면 됨. 나머지 컬럼(용도 · 영역 · 외부 노출 · 열린 포트 · 관리자 계정 · 마지막 패치 등)은 이름 그대로 판정에 넣음 |
| 로그 | Microsoft Sentinel 내보내기 (`TimeGenerated`, `WHO` · `WHERE` · `HOW` 등, `sentinelai/data/mapper.py`) |

**연습용 데이터** — 실제 솔루션 · 서버의 내보내기가 아니라 결과를 실제 환경 평가로 쓰지 않음. 실제 데이터가 오면 연습용 파일을 뺌.
- 권한 신청 · 정책 CSV는 10/7에 지웠음 (예전 사례: `8eb0e1d^`)
- 연습용 정책 9건 · 서버 4대(10/14)는 10/20에 지웠음 — 실제 노드 수집 판정만 보려고 (이력 `5604048`)
- 로그: 받은 원본 `data/솔루션 별 Mock 데이터.csv`(2줄, 10/6)는 그대로 두고, 원본 2줄 + 합성 155줄을 `data/연습용_로그_원본+합성.csv`로 만들어 읽음 (9/15~10/20, 사용자 7명, 한국 시간 평일 근무 시간 위주, SecureMark 컬럼)
- 합성 로그는 날짜가 고정이라 시간이 지나면 하루 · 일주일 조회가 빔
- 10/20 위험 시나리오 18줄과 `qwen3:14b` 판정:

| | 시나리오 | 판정 |
|---|---|---|
| A | 개발 박민수 — 급여 · 인사평가 문서를 퇴근 뒤 예외 승인으로 출력 | 위험 ✅ |
| B | 영업 최지훈 — 토요일 새벽 고객 개인정보 명단 · 계약 전체 680장 | **정상 ❌** |
| C | 재무 정다은 — 20분 동안 12번 연속 예외 승인 출력 | 주의 ✅ |
| D | 처음 보는 외주개발 이준호 계정 — 아침 7시 설계 문서 230장 | **정상 ❌** |

B · D를 놓친 이유: 기준 문서에 출력량 · 시간대 · 외주 계정 조항이 없음 (§8 4).

### 수집 노드 (10/20)

- 정책 관리 → [노드] → [노드 등록]에서 서버 이름을 넣으면 그 서버의 키가 나옴. 내부망 서비스라 키를 노드 화면에서 언제든 다시 봄 (처음엔 한 번만 보여주고 해시만 뒀다가 같은 날 바꿨음)
- 점검 대상 서버에서 `node/install.sh --server SentinelAI주소 --key 키`로 설치
- 노드는 정한 간격(기본 30분)마다 UFW · sshd · PAM · 계정 · sudo 원문을 **읽기만** 해서 `POST /api/nodes/snapshots`로 보냄. **이름 없이 키만** 보내고(`Authorization: Bearer`) 서버가 키로 노드를 찾음
- 키를 잃거나 새어 나가면 [키 다시 발급] (예전 키는 바로 무효). 공용 등록 토큰 · 자동 등록은 처음 설계에 있었으나 화면 발급으로 바꿨음
- 못 보낸 수집은 노드에 쌓였다가 다음 차례에 먼저 보냄
- 무엇을 뽑아 판정할지는 `sentinelai/data/collected.py`가 정함 (설치 안 됨과 권한이 없어 못 읽음은 다른 값)
- 서버는 노드 · 수집 시각별로 `server_snapshots`에 쌓고 직전 수집과 달라진 설정을 셈
- 망이 막힌 서버는 노드의 `export` 파일을 `make import-snapshots`로 넣음
- 서버 현황 표(`data/servers/`)가 있으면 노드 점검에 호스트 이름 · IP가 같은 행을 덧붙임
- 노드 시험은 점검 대상 컨테이너 · 흉내 노드로 (§3 `make dev-targets` · `make dev-sim`)

---

## 2. 코어와 웹

- 판정은 모두 엔진(`sentinelai.engine` — 흐름은 `pipeline.py`, 실행 · 저장 · 큐는 `Engine`)이 함
- CLI와 웹이 같은 `Engine` 기능을 부르고, 결과는 AI 결과 DB(`SENTINELAI_RESULTS_DB_PATH`)에 실행마다 쌓음
- 판정 실패 시 2회 재시도(`pipeline.attempt`). 그래도 실패하면 `failed` · `error`로 남기고 화면에는 "주의"로 올림 (이유 칸에 원인)
- Milvus Lite는 한 프로세스만 DB를 엶. 웹이 떠 있으면 판정은 웹 작업(`/api/jobs`)으로, 꺼져 있으면 CLI로. 둘 다 같은 AI 결과 DB에 쌓음

### 판정 기능

**정책 관리** `review_policies` — 화면 [정책 관리 검토 실행]
- 기준 문서(`docs/`) · 정책 규칙을 RAG에 맞춤 (바뀐 것만, 규칙 묶음은 하나만) → 정책 전체 → `policy_chain`(기준 조항 검색) → `PolicyReview`
- 정책 폴더가 비면 RAG의 예전 규칙을 지우고 빈 검토를 남김 — 서버 점검 · 로그 감시가 지운 규칙을 찾지 않게
- 실행마다 쌓고 화면은 마지막 실행을 봄

**서버 점검** `check_nodes` — 웹이 뜨자마자 한 번, 그 뒤 `SENTINELAI_MONITOR_INTERVAL_MIN`분마다, 또는 노드 탭 [지금 점검]
- 켜 둔 노드 중 지난 점검 뒤 새 수집이 온 노드만, 그 노드의 가장 늦은 수집 한 건 → `server_chain` → `ServerReview`
- 입력: 모듈 상태 · 직전 수집과 달라진 설정 + 서버 현황 표의 같은 서버 행 + 코드가 IP · 대역 · 호스트 이름으로 찾은 규칙 + RAG로 찾은 조항 · 규칙
- 출력: 기준과 다른 곳마다 지금 · 기준 · 근거 조항 · 등급 · 이 환경에서 바꿀 것. 조항이 없거나 확인 못한 항목은 판단하지 않고 이름만
- 한 건씩 `node_findings`에 쌓고 화면은 노드마다 마지막 판정을 봄 (노드 한 대 30초 안팎)

**위협 예측** `run_suspects` (10/22) — 정밀 감시와 같은 주기, 또는 사용자 위협 탭 [지금 예측]
- 사람마다 행동 신호(`data.suspect.behavior_signals` — 최근 7일 vs 앞 4주: 하루 양 · 근무 시간 밖 · 예외 승인 · 민감 문서 · 30분 안 몰아서 · 처음 보는 계정) + 정밀 감시 판정 · 권한 신청 기록(35일) + 최근 로그 15줄 → `suspect_chain`(생각하는 판정 모델) → `SuspectScore`(0~100 · 이유 · 확인할 점)
- 등급은 점수로 코드가 정함. 한 사람씩 `suspect_scores`에 쌓음 (사람당 20초 안팎)
- 행동 신호는 의심 점수에만 씀. 로그 감시 판정은 기준 문서로만 함 (10/20 결정)

**로그 감시** `monitor` — 두 단계 (10/22), 화면에서는 시작하지 않음
- 빠른 감시: `SENTINELAI_FAST_INTERVAL_MIN`(5)분마다 생각 단계를 끈 연결(`Engine.fast_llm`)로 새 로그만 판정해 "1차 판정"으로 바로 올림 (묶음당 수 초, 따로 도는 작업 큐). 비우면 정밀 감시만
- 정밀 감시: `SENTINELAI_MONITOR_INTERVAL_MIN`(30, 0이면 끔)분마다 생각하는 판정 모델로 같은 구간을 다시 판정해 확정. 확정된 구간의 1차 판정은 목록에서 빠짐 (`monitor_runs.stage` = fast · final)
- 흐름: 지난 감시 이후 로그 → 사용자별 묶음 → `event_chain`(조항 · 규칙 검색) → `Verdict`. 읽은 가장 늦은 로그 시각이 다음 시작점
- 웹이 뜨자마자 한 번 (꺼져 있던 동안 쌓인 로그를 따라잡음), 그 뒤 간격마다 (`JobRunner.every`). 다른 작업이 돌면 1분 뒤 다시 시도
- 판정은 모두 쌓지만 운영자 검토(목록 · 건수 · 종)에는 **주의 이상**만 올림
- 1차 판정은 운영자 결정 · 통계 · 의심 점수 기록에 넣지 않음 (종 배지에는 뜸)

**로그 조회** `browse_logs` — 기간(지금부터, 달력 단위 아님) · 사용자 · 솔루션 · 행위로 거르고 셈. 모델 없이 코드만, 저장하지 않음

### 서버 질의 · 로그 질의

둘 다 RAG로 찾지 않음. 질의 기록에 남음.
- 서버: 기준 문서에 서버의 지금 상태가 없음 (정책 질의로 "방화벽에 문제가 있는 서버"를 물으면 답하지 못했음)
- 로그: "몇 번 · 언제부터 · 누가"는 집계라 비슷한 몇 줄만 찾으면 건수가 틀림

| 단계 | 서버 질의 `ask_servers` (10/21, 정책 관리 탭) | 로그 질의 `ask_logs` (로그 감시 탭) |
|---|---|---|
| 1. 조건 뽑기 | `server_filter_chain`: 질문 + 등록 노드(이름 · 호스트 · IP) · 모듈(설명) + 현재 시각(UTC · 한국 시간) → 노드 · 모듈 · 기간. 질문의 시각은 한국 시간. 모르는 노드는 비슷한 노드로 안 바꿈. 모듈을 목록째 적으면 코드가 하나(또는 전부)로 줄임 | `log_filter_chain`: 질문 + 로그에 있는 값(`vocabulary`) + 현재 시각 → 사용자 · 부서 · 솔루션 · 위치 · 행위 · 항목 · 기간. 로그에 없는 표현은 비슷한 값으로 안 바꿈 |
| 2. 코드가 찾고 셈 | `results.server_history`(기간 안 수집 · 판정, 기간 없으면 전체) → `collected.server_digest`(노드별 지금 상태 · 마지막 점검의 다른 곳 · 판단 안 한 항목, 수집 · 바뀐 설정 · 판정 건수, 기록 줄 최근 60줄). 시각은 KST | `search`(부분 일치, 항목은 `Exception=1`처럼 값까지) → `summarize`(건수 · 사용자별 · 날짜별 · 숫자 항목 합계) |
| 3. 답 | `server_answer_chain`: 평문 답. 정책 위반은 새로 판단하지 않고 서버 점검 결과만 옮김 | `log_answer_chain`: 조건 · 집계 · 해당 로그(최근 50줄)로 평문 답. 숫자는 집계 그대로, 위반 판단은 `monitor`의 몫 |
| 속도 | 10/21 `qwen3:14b`(GPU) 9~20초 | 10/8 `gpt-oss:20b` 70~220초 |

### API

| API | 하는 일 |
|---|---|
| `POST /api/auth/login` · `logout` · `GET /api/auth/me` · `POST /api/auth/password` | 로그인 (쿠키 HttpOnly · SameSite=Strict, 2일). 첫 로그인 비밀번호 변경 전에는 다른 API 403 |
| `GET /api/results` | 마지막 정책 관리 검토(정책 문제 · 서버 점검) · 쌓인 로그 감시 판정 → 화면용 dict + 운영자 결정. 보안 총책임자에게는 결정 기록 전부(`decision_log`, 취소 포함) |
| `GET /api/jobs` | 도는 작업 · 단계 · 진행(done/total) · 작업별 마지막 실패. 빠른 감시는 `fast`(간격 · 다음 시각 · 마지막 실행) |
| `POST /api/jobs/{kind}` | `policies` · `nodes` · `suspects` 백그라운드 시작 (202). 한 번에 하나 — 돌고 있으면 409. `events`는 자동으로만 돌아 404 |
| `POST /api/decisions` | 정책 문제 · 서버 점검 · 로그 판정에 대한 운영자 결정 · 취소 (보안 운영자 이상). 지금 결정은 `/api/results`의 `decisions`로 옴 |
| `POST /api/nodes/snapshots` | **수집 노드 전용** — 로그인 대신 `Authorization: Bearer 노드 키`. 본문 = 노드가 읽은 원문(`format: sentinel-node 1`, 2MB까지). 모르는 키 401 · 꺼진 노드 403 · 형식 400. 같은 노드 · 수집 시각은 한 번만 쌓음(`stored`) |
| `POST /api/nodes` · `POST /api/nodes/{이름}/key` · `GET /api/nodes` · `GET /api/nodes/{이름}` · `PATCH /api/nodes/{이름}` | 등록(+ 키) · 키 다시 발급(예전 키 무효) · 목록(상태 · 끊김 · 마지막 판정) · 하나(키 · 최근 수집 · 바뀐 것 · 판정 기록 · 모듈 상태) · 켜기/끄기. 보안 운영자 이상, 감사 기록 |
| `POST /api/ask` · `/api/ask-servers` · `/api/ask-logs` | 정책 · 서버 · 로그 질의. 입력 `{"question"}` (공백 제외 1~500자, 벗어나면 422). 서버 · 로그는 `answer · criteria · facts · evidence · failed` |
| `GET /api/qa?kind=policy\|servers\|logs` | 내 질의 기록 (최근 50건). 다른 사람 것은 안 줌 |
| `GET /api/logs?period=day\|week\|month\|quarter\|half\|year\|all[&user=&solution=&how=&page=]` | 로그 조회 — 지금부터 1 · 7 · 30 · 90 · 180 · 365일 또는 전체. 사용자는 "부서 이름" 완전 일치. 최신순 100건씩 + 집계(`facts`) + 거르기 칸 값(`options`, 로그 전체 기준). 조회마다 감사 기록(`log_view`: 누가 · 조건 · IP) |
| `GET /api/stats?period=week\|month\|quarter\|all` | 보안 통계 (기본 한 달, 모델 없이 셈, `results.threat_stats`) — `logs`(기간 안 로그 수 · 날짜별, 비율의 분모) · `events`(주의 · 위험 판정에 묶인 로그 줄 · 날짜별) · `servers`(노드별 등급 · 위험 · 주의 항목, 모듈별 위협 항목, 걸린 조항 — 노드마다 기간 안 마지막 점검) · `safety`(시스템 안전 점수, 아래) |
| `GET /api/user-stats?period=` | 사용자 위협 — `suspects`(사람마다 마지막 의심 점수 · 등급 · 이유 · 확인할 점 · 행동 신호 · 흐름 · 지금 가진 권한 `held`, 계정 미연결은 null, 기간과 무관) · `safety`(사용자 안전 점수) · `events.users`(사용자별 위협 로그 줄 · 판정 수 · 로그 사용자 ID) · `requests`(신청 수 · AI 등급별 · AI와 결재가 엇갈린 수) |
| `GET /api/health` | 연결 · 모델 · 임베딩 · 인덱스, 모두 준비되면 `ok` (보안 운영자 이상) |
| `GET /api/regulations` | `docs/` 원문 (근거 조항 전문 표시용) |
| `GET · POST /api/users` · `PATCH /api/users/{id}` · `POST /api/users/{id}/reset-password` | 계정 관리 (보안 총책임자). `PATCH`로 로그 사용자 ID(`log_id`, 계정마다 하나, 겹치면 400). 루트 계정은 루트만, 자기 역할 · 활성은 못 바꿈 |
| `GET /api/access-catalog` · `POST /api/access-catalog` · `PATCH /api/access-catalog/{코드}` | 권한 목록 — 보기(일반 사용자 · 보안 운영자는 켜진 것만) · 등록 · 고치기 · 끄기(보안 총책임자, 감사 기록) |
| `POST /api/requests` · `GET /api/requests[?stage=&mine=]` | 신청(일반 사용자, 본문 `access_code` — 목록에 없거나 꺼진 권한 · 이미 가진 권한 · 결재 중인 같은 권한은 400, 현재 보유 권한은 서버가 채움) · 목록(일반 사용자는 자기 것만). 응답에 `ai_verdict` · `judging` |
| `POST /api/requests/{no}/withdraw` · `decision` · `revoke` · `rejudge` | 철회(신청자, 1차 결재 전) · 결재(보안 운영자 = 1차, 보안 총책임자 = 최종) · 회수 · 다시 판정 |
| `GET /internal/status` | **서버 자신(127.0.0.1)만** — 작업 큐 · 자동 실행 예약 · 권한 신청 판정 대기열. 로그인 없음, 밖에서 오거나 전달 헤더(`X-Forwarded-For` 등)가 붙으면 404. `curl -s localhost:8000/internal/status` |

- **모든 API는 로그인 필요** (`/api/auth/login` 제외). 정책 관리 · 로그 감시 API(`results` · `jobs` · `ask*` · `logs` · `stats` · `user-stats` · `qa` · `regulations`)는 보안 운영자 이상
- 안전 점수: 시스템 = 켜 둔 노드마다 마지막 점검 등급을 정상 1 · 주의 0.5 · 위험 0으로 평균 × 100 (끊긴 노드는 0.5 이하, 판정 없는 노드 제외, `results.server_safety`). 사용자 = 사람마다 마지막 의심 등급을 낮음 1 · 보통 0.5 · 높음 0으로 평균 × 100 (`results.user_safety`)
- 없앤 것: CSV 권한 신청 재판정(`/api/review`) · `requests` 작업 (DB 신청으로 바뀜), 신청 하나 보기 `GET /api/requests/{no}` (10/22, 화면이 안 씀)
- `Engine()` · `rag_chain`은 앱 시작 때 1회만 만듦. 같은 출처에서만 열므로 CORS 없음
- 결재 · 회수 · 운영자 결정은 권한 DB에, 질의 기록은 AI 결과 DB에 남음

### 화면

`make web` (`sentinelai/web/main.py`). 메뉴 · 탭 · 화면별 동작 · 화면 규칙은 **`FRONTEND_GUIDE.md`** 한 곳에 둠.

| 역할 | 메뉴 |
|---|---|
| 일반 사용자 | 메뉴 없이 내 신청 화면 하나. AI 흔적 없음 |
| 보안 운영자 | 권한 신청(1차 결재함) · 정책 관리 · 로그 감시 · 통계 · 정책 질의 |
| 보안 총책임자 | 위 + 최종 결재함 · 권한 목록 · 계정 관리 |

---

## 3. 실행

| 명령 | 하는 일 |
|---|---|
| `make install` | venv · 의존성 · `.env` 준비 (처음 한 번) |
| `make web` | 대시보드 http://localhost:8000. 로그 감시 · 서버 점검은 웹이 스스로, 정책 관리 검토는 화면 버튼 |
| `make health` | 서버 · 모델 · 벡터 DB · 두 DB 위치 확인 |
| `make create-root LOGIN=아이디 NAME=이름 [DEPT=부서]` | 첫 루트 계정(보안 총책임자) — 서버에서 한 번만. 비밀번호는 화면 표시 없이 입력 |
| `make import-snapshots DIR=폴더 NODE=이름` | 망이 막힌 노드의 `export` 파일 넣기 (벡터 DB를 안 써서 웹이 떠 있어도 됨) |
| `make index [DOCS=경로] [REBUILD=1]` | 기준 문서 적재 (기본 `docs/`, 바뀐 파일만). `REBUILD=1`은 규칙까지 지우므로 그 뒤 `review-policies` 다시 |
| `make review-policies` | 정책 관리 검토 1회 → AI 결과 DB |
| `make check-nodes` | 서버 점검 1회 (새 수집이 온 노드만) |
| `make monitor [SINCE=시각] [FULL=1]` | 로그 감시 1회 (지난 감시 이후, 웹 없는 서버에서 cron으로). `FULL=1`이면 처음부터 |
| `make dev-setup [RESET=1]` | **로컬 시험 환경**을 `.dev/`에 — 계정 `dev-root`(보안 총책임자 · 루트) · `dev-op`(보안 운영자) · `dev-user`(일반 사용자), 비밀번호 모두 `dev-pass-1234`, 첫 로그인 변경 없음. 시험용 권한 목록 7건. 이 컴퓨터용 노드 `dev-local` 키로 `.dev/node.conf`. 모델 서버에 닿으면 기준 문서도 적재 |
| `make dev [DEV_CHECK_MIN=5]` | 시험 환경으로 웹 (http://127.0.0.1:8001, `.dev/` DB, 모델 서버는 `.env` 그대로 — 진짜 웹과 함께 떠도 됨). 로그 감시 · 서버 점검은 `DEV_CHECK_MIN`분마다 |
| `make dev-sim [NODES=3] [ROUNDS=3] [EVERY=5]` | **노드 수집 흉내** — 흉내 노드(sim-01…)가 잠근 Ubuntu 원문에서 시작해 차례마다 반쯤 확률로 설정 하나를 바꿔(UFW 끄기 · root · 비밀번호 로그인 열기 · NOPASSWD · 실패 잠금 빼기) 진짜 노드와 같은 주소 · 키로 보냄 |
| `make dev-targets` · `make dev-targets-stop` | **진짜 수집** — podman compose로 점검 대상 컨테이너 2대(`target-weak`: 약한 설정 / `target-strict`: 잠근 설정)를 올리고 내림. 값은 `node/testenv/targets.env`(git 제외: `SERVER` · `KEY_WEAK` · `KEY_STRICT` · `INTERVAL`, 없으면 시험 환경 키로 만듦). SentinelAI를 바깥에 열지 않고(pasta `--map-host-loopback`) ufw가 실제로 켜짐(NET_ADMIN). 사용자 podman 소켓 필요. 10/20 시험: weak 위험 · strict 정상 |
| `make dev-node` | 이 컴퓨터를 노드로 한 번 보내기 (root가 아니면 SSH · sudo는 "확인 못함") |
| `make front-install` · `make front` · `make front-test` | 화면 개발 — npm 의존성(처음 한 번) · 개발 서버 http://localhost:5173 (`/api`는 8001로) · 시험 · 타입 검사 · 린트 |
| `make front-build` · `make front-check` | 화면 빌드 → `sentinelai/web/static/` (**커밋**함 — 팀 서버에 Node · 외부망이 없어도 `make web`만으로 새 화면) · 깨끗이 설치해 빌드한 결과가 커밋된 것과 같은지 확인 |

- 10/20에 CLI를 줄였음 — `config` · `models` · `search` · `ask` · `chat` · `index-policies` · `review-requests` · `ask-logs` 없앰 (질의는 화면에서, 규칙 적재는 `review-policies`가)
- **Milvus Lite 파일 락**: `make web`이 떠 있으면 `make health` · `index` · `review-policies` · `check-nodes` · `monitor`가 실패함. 웹이 떠 있을 때는 웹이 돌림

설정은 `.env` 한 곳. 코드에 주소 · 모델명을 하드코딩하지 않음. 두 환경 모두에서 동작해야 함.

| 환경 | `SENTINELAI_OLLAMA_BASE_URL` | `SENTINELAI_MODEL` (판정) | `SENTINELAI_QA_MODEL` (질답) |
|---|---|---|---|
| 팀 서버 | `http://210.117.182.197:11434` | `qwen3:14b` | `qwen3:14b` |
| 개인 맥 | `http://localhost:11434` | `qwen2.5:7b` | `qwen2.5:7b` |

- 판정 모델 = 권한 · 정책 · 로그 감시 판정, 질답 모델 = 정책 · 로그 질의. 나눈 이유 · 모델 비교는 `NOTES.md`
- 서버 주소가 설정 한 줄로 바뀌는 구조가 제안서의 "향후 사내 환경 이전" 요구에 해당함
- 9/27에는 맥에서 팀 서버로 접속되지 않았음 (8초 타임아웃)

---

## 4. 규칙

- ❌ `sentinelai/engine/` · `docs/` 수정. 프롬프트(`sentinelai/engine/prompt.py`)도 엔진 담당자와 상의 없이 안 바꿈
- ❌ 엔진 기능 재구현 · 엔진 타입을 대체하는 웹 전용 스키마
- ❌ 서버 주소 · 모델명 하드코딩 — 전부 `Settings`
- ❌ CDN · 웹폰트 · 외부 이미지 (외부망 차단 전제). 화면은 React + Vite, 빌드 결과를 커밋 (서버에 Node 불필요). 화면 소스를 고치면 `make front-build` 결과를 같은 커밋에. Tailwind 등 새 의존성은 리디자인 때 정함
- ❌ 파일 업로드 (문서 데이터 읽기 · §8 6에서 다시 정함)
- ❌ 정책 자동 수정 · 권한 자동 승인 — 결정은 사람이 함
- ❌ 엔진 출력을 손으로 고치기 · 근거 없는 목업 데이터 · 사전 계산 답을 실시간처럼 보이는 연출 (10/8에 모두 걷어냈음)
- ❌ 여러 모듈을 한꺼번에 바꾸기 — 하나씩 바꾸고 확인. 막히면 우회하지 말고 사용자에게 보고
- DB · 로그인(ID/PW, 운영자 분리)은 10/11에 금지를 풀고 구현했음 — 더 이상 데모 아님
- **화면**: 고치기 전에 `FRONTEND_GUIDE.md`를 읽음. 화면이 바뀌면 그 문서를 같이 고침
- **문서(md)**: 명사형 개조식 (~함 · ~했음). 한 줄 한 사실, 표와 같은 내용을 산문으로 되풀이하지 않음
- **커밋**: Conventional Commits `type: 한국어 요약` 한 줄, 50자 이내. 한 커밋에 한 타입 (`feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore`)
- **코드 주석**: 엔진 코드처럼 "~합니다"체. 코드만 봐서는 알 수 없는 이유만 짧게

---

## 5. 판정 결과 — 기대와 현재

- "현재" = 9/27 개인 맥 `qwen2.5:7b` (정상 3 / 주의 8 / **위험 0**). 그때의 시연용 위험 예시 4건 · 예시 답 캐시는 10/8에 걷어냈음
- 10/8 팀 서버 `gpt-oss:20b` + 조항 검색: REQ-001 **위험** ✅ · REQ-002 정상 ✅. 정책 검토는 SWG-001 ↔ DLP-001(6.1) · FW-001(5.2)을 찾게 됐으나 실행마다 묶는 방식 · 건수가 달라짐 (6~10건). 전 건 재계산은 §8 1

| ID | 신청 | 기대 | 근거 조항 | 현재 |
|---|---|---|---|---|
| REQ-001 | 영업팀 → 급여 테이블(HR_SALARY) | 위험 | 3.3, 4.2 | 주의 ❌ |
| **REQ-002** | **인사팀(팀장 승인) → 인사정보(HR_MASTER)** | **정상** | **3.2 — 위험이면 오탐** | 정상 ✅ |
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
| SWG-001 ↔ DLP-001 | 충돌 | 6.1 | ❌ 각각 "과도한 허용"으로 나뉨 |
| PAM-001 | 과도한 허용 | 6.2 | ✅ |
| FW-006 | 과도한 허용 | 6.3 | ❌ 못 찾음 |

- **REQ-002 · REQ-004가 가장 중요함.** 정상을 정상으로 판정하는 것(오탐률)이 실무 도입을 좌우함. 두 건은 지금 모두 맞음
- 정책 질의 예시 질문은 10/8부터 실시간으로 답함. 9/30 `qwen2.5:7b` 캐시에서 "감사팀 담당자 → 인사 정보" 질문이 원문 "인사팀 소속 임직원"을 "감사팀 소속 임직원"으로 바꿔 옮겨 예시에서 뺐음

---

## 6. 알려진 문제

- **검색은 종류별로 함.** RAG에 기준 조항과 솔루션 규칙이 함께 있어 한 번에 찾으면 규칙에 조항 청크가 밀려남. 권한 · 정책 검토는 조항만, 로그 검토는 조항 · 규칙을 따로, 질의응답은 둘을 이어 붙임. 조항은 청크 4개뿐이라 `top_k=4`가 전부를 가져옴
- **Milvus Lite는 같은 프로세스에서도 동시에 열면 실패함** (`Open local milvus failed`). 서버를 띄우는 동안 자기 잠금을 풀어 두어, 두 스레드가 동시에 처음 열면 둘 다 파일 잠금을 잡으려 함 (10/20 자동 감시와 `/api/health`가 겹쳐 드러났음). `DocumentStore.store`가 잠금으로 한 번에 하나만 열고, 웹을 끌 때 `DocumentStore.close()`가 Milvus Lite 서버까지 멈춰 잠금을 풂 (클라이언트만 닫으면 안 풀림)
- **팀 서버는 부팅 순서 때문에 GPU 없이 돌 수 있음.** 10/6~10/11 내내 CPU로만 돌았음. `ollama ps`의 PROCESSOR가 CPU면 의심. 경위 · 조치는 `NOTES.md`
- **`gpt-oss:20b`는 `SENTINELAI_NUM_PREDICT=1024`가 모자람** (10/11에 4096으로 올림). 추론하느라 1024 토큰을 다 쓰고 빈 출력(`done_reason=length`)을 냄. 10/7 측정에서 약 2000 토큰 필요
- **소형 모델 한계**(`qwen2.5:7b`): 반복 루프로 판정 1건이 380~417초까지 늘어남 (9/27 6건 중 3건). 같은 입력에도 등급이 바뀜 (REQ-005: 정상 → 재판정 주의). 판정 1건 20초대~7분
- **`rag_chain`의 sources 형식이 매번 다름.** 조항 번호가 빠지면 근거 칩에 문서 이름만 뜨고 누르면 문서 전문이 나옴
- **repeat_penalty는 안 씀.** 반복 루프는 사라지지만 등급이 "주의"로 몰려 판별력을 잃음. temperature는 원인 아님 (9/27 같은 6건 + 정책, 재현 스크립트는 10/20에 지웠음 — 이력 `5604048`)

| 구성 | 판정 1건 | 권한 적중 | 정책 적중 | 등급 분포 |
|---|---|---|---|---|
| **temp 0.2 (현재)** | 40~417초 | **3/6** | **2/6** | 정상 3 / 주의 8 / 위험 0 |
| temp 0.2 + repeat_penalty 1.15 | 31~58초 | 2/6 | 1/6 | 정상 1 / 주의 9 / 위험 0 |
| temp 0.0 + repeat_penalty 1.15 | 34~56초 | 1/6 | 1/6 | 정상 0 / 주의 10 / 위험 0 |

---

## 7. 시연 기록 (9/30 산학 자문 멘토링)

- 9/30 시연은 사전 계산 결과(`results.json` · `ask_results.json`) · 시연용 위험 예시 4건 · 예시 답 로딩 연출로 했음. 10/8에 모두 걷어내고 화면이 코어 작업을 직접 돌리게 바꿨음
- 다음 시연 순서: 팀 서버 연결 → `make health` → `make web` → 정책 관리 검토를 로그 감시보다 먼저 (규칙이 적재돼야 로그 감시가 찾음)
- 판정 한 건에 1~3분이라 미리 돌려 둠. 결과는 AI 결과 DB에 남아 서버를 다시 띄워도 보임

---

## 8. 남은 일

1. **데이터를 다시 정하고 `qwen3:14b`로 전 건 판정해 §5와 대조** — 권한 신청 CSV는 지웠고 정책 · 서버 현황 폴더는 비어 있음 (연습용은 10/20에 지움). 서버 현황은 점검 도구 · 자산관리에서 내보내는 컬럼부터 정함
2. **DB · 로그인 · 권한 신청** — 구현 끝 (10/11~10/12). 권한 DB(신청 1건 = 1행: AI 판정 · 1차 · 최종 결재 · 회수), ID/PW 로그인, 계정 생성은 보안 총책임자, AI 결과 DB 분리(`design/results-db.md`), 질의 기록(자기 것만). 보안 총책임자는 결정 기록 전부 · 1차 결재 의견을 봄. 남은 질문은 `design/db-schema.md` §5
3. **알림(Notifier)** — 로그 감시의 주의 · 위험 판정을 운영자에게 보냄. 자리(`Notifier`)만 `sentinelai/engine/types.py`에 있고 `pipeline.py`의 `monitor`에 부를 곳을 표시했음
4. **출력 · 매체 반출 조항 없음** — 로그 감시가 근거 없이 판정함. 절차서 14 · 17번(예외처리 · 매체 반출입) 원문 필요. 10/20 시나리오 B · D가 이 때문에 "정상"으로 나와 검토에서 빠졌음. **코드 규칙(출력량 · 시간대 · 새 계정)으로 올리지 않고 절차서 원문을 RAG에 넣기로 했음 (10/20).** 원문을 받으면 6번 경로로 넣고 시나리오로 다시 확인
5. **로그 감시 이력 화면** — 같은 사용자의 반복 주의 · 위험, 솔루션 · 행위별 추이, 마지막 감시 시각 · 판정 못한 로그. 데이터가 쌓이고 4번 조항이 들어온 뒤에 만듦
6. **문서 데이터 읽기** — 지금 `DocumentStore`는 `.md` · `.txt`만 적재. 사내 정책 원문(pptx · pdf · docx 등)을 기준 조항으로 넣음. `docs/보안 정책 관리 업무 프로세스.pptx`는 글자 없는 이미지 4장이라 OCR 필요. 4번 절차서도 이 경로로
7. **할루시네이션 검증** — 모델 출력이 근거와 맞는지 코드로 확인. 예: `sources`의 조항 번호 · 정책 ID가 실제 검색 근거에 있는지, 로그 질의 답의 숫자가 `summarize`와 같은지, 로그 조건(사용자 · 기간)이 질문에 있는 말인지. 어긋나면 알리거나 다시 시도. 10/11에 질문에 없는 기간을 채워 답이 틀린 적 있음 (`NOTES.md`)
8. **내부 상태 API** — 10/20에 `/internal/status`로 작업 큐 · 예약 · 판정 대기열을 화면과 분리했음. 남은 것: `/api/health`도 옮길지, 자동 감시가 연달아 실패하면 알릴지
9. **보안 대시보드** (10/21 TODO) — 권한 신청 · 정책 관리 · 서버 점검 · 로그 감시를 한눈에. 통계 메뉴(10/21)와 겹치지 않게, 운영자가 무엇을 결정하는 데 쓰는지부터 정함 (10/8에 옛 통계 대시보드를 뺀 이유 — `FRONTEND_GUIDE.md` §7)
10. **위협 미리 판정** (10/21 TODO) — 사고 전에 먼저 판정해 알림. 사용자 쪽은 의심 점수(10/22)를 만들었음. 남은 것: 의심 점수가 오를 때 알리기(3번과 함께) · 서버 쪽 예측. 입력(서버 점검의 바뀐 설정 · 로그 감시 추이 · 권한 신청 등)과 알림과의 관계는 아직 안 정함
11. **이번 범위 밖** — 이메일 · 메신저 알림 채널, 실제 솔루션 API 수집(`sentinelai.data`에 RowSource로 추가). 로그가 외부 DB(Microsoft Sentinel 등)에 쌓이면 읽기만 하고 우리 DB에 안 쌓음. 그때 로그 질의 조건을 그 DB 쿼리(KQL 등)로 넘기고 로그 전체를 메모리에 읽는 `ask_logs`를 바꿈 (`design/results-db.md` §0)
