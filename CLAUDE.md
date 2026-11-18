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
| 로컬 LLM · RAG — 보안정책 · 접근통제 · 권한 부여 기준 · 운영 가이드를 Vector DB에 | Ollama · Milvus(compose) · 기준 문서 2개(권한 DB 원문, 화면에서 올림) | 운영 가이드 · 사내 원문 pptx · pdf (§8 7) |
| 정책 검토 — 공통 형식으로 표준화, 충돌 · 중복 · 과도한 허용 · 기준 위반과 개선안 | `review_policies` — RAG에 올라간 기준 문서끼리 견줌 (11/5, 솔루션 정책 파일 읽기는 뺐음) | 실제 솔루션 정책을 RAG에 올리는 길 (§8 2) |
| 권한 적정성 — 부서 · 직무 · 기존 권한 · 신청 권한 → 승인 · 추가 검토 · 반려 권고 | `judge_request` (정상 → 승인 권고 · 주의 → 추가 검토 · 위험 → 반려 권고). 직무 · 신청 사유 · 사용 기간 · 최근 이동을 봄 (11/3). 받은 뒤 이동하면 `judge_grant`로 다시, 퇴사하면 코드가 위험 | 직무 기준 문서 (직무별 필요 권한) |
| 대시보드 · 알림 — 정상 · 주의 · 위험, 위험이면 운영자 알림(이메일 · 메신저 포함), 고칠 것 설명 | 웹 대시보드 · 종 배지 · 결재 대기 Slack 채널 알림 · 결재 결과 신청자 메일(11/04) · 로그 감시 위험 Slack 채널 알림(11/08) · 예외 상황(계정 역할 변경 · 보유 권한 위험 · AI 위험 판정 승인 · 보안 설정 변경) Slack 채널 알림(11/13) · 같은 채널 알림을 Teams 에도(11/15) | 주의 · 서버 점검 · 의심 점수 알림 (§8 4 · 11) |
| 수집 인터페이스 모듈화 — 실제 솔루션 API · Export, 계정 관리 시스템 · AD 연동 대비 | 데이터 계층 입구 `Sources` — 모듈마다 따로 읽는 DLP 로그 · 수집 노드 · DB · RAG | 실제 연동 (§8 12) |
| 위험도 · 신뢰도 평가 (구조도) | 사용자 의심 점수 · 안전 점수 | 정책 위험도 점수 · AI 판단 신뢰도 (§8 8) |

**검증 시나리오** — 이 넷이 맞게 나와야 함. 위 둘(솔루션 정책)은 실제 솔루션 정책이 RAG에 올라와야 볼 수 있음 (11/5부터 정책 파일을 읽지 않음)

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
│   ├── dev.py                  로컬 시험 환경 `python -m sentinelai.dev` — setup · web · test · targets · api-types(응답 모델 → 화면 타입) · api-check(실제 서버 응답 대조, 11/16) (11/5, 예전 scripts/)
│   ├── __main__.py · cli.py    CLI `python -m sentinelai` — 화면에 없는 일만 (index --rebuild · monitor · import-snapshots · create-root, 11/9 정리). 모두 Engine 기능을 부름
│   ├── engine/                 엔진 (양현성) — 자원 · 이슈어 · 종류별 큐 · 워커 · 인터페이스 (11/5 사용자 정리)
│   │   ├── interface.py          Engine — 넷을 엮는 입구. 웹 · CLI 가 부르는 이름(health · index · run_* · start · start_job · enqueue_* · job_status · stats · browse_logs · receive_snapshot …)만. run_* 는 CLI 용으로 묶음을 쌓고 그 자리에서 워커를 돌림(drain). 질의(ask)는 질의 에이전트를 큐 밖에서 부름
│   │   ├── resource.py           Resources — LLM 연결(생각 켬 · 끔) · 체인 · 벡터 DB · 두 DB · 데이터 계층 · 프롬프트 모듈을 한 번만 열고, 상태 확인(health)
│   │   ├── issue.py              Issuer — 데이터 계층에서 판정할 것을 읽어 큐에 잡을 쌓음(판정 한 건 = 잡 하나, 한 번의 실행 = 묶음), 예약 · 판정 못한 신청 다시 쌓기 · 수집 받기(받으면 서버 점검을 바로) · 집계(보안 통계 · 사용자 위협 · 권한 변동 · 로그 조회, 모델 없이 바로 돌려줌)
│   │   ├── queue.py              Queues — 종류별 길(기준 문서 적재 · 권한 신청 · 재검토 0 → 빠른 감시 1 → 정밀 감시 · 서버 점검 · 위협 예측 · 정책 관리 검토 2), 묶음(Batch)과 닫기 잡, 같은 key 한 번만, 취소 · 강제 중지, 화면 · 내부 상태 모양
│   │   ├── worker.py             Worker — 잡을 꺼내 규정 RAG → 프롬프트 모듈(context) → 모델(JUDGMENTS 표: 종류마다 프롬프트 · 출력 타입 · 생각 켬/끔) → 저장. 묶음은 닫기 잡이 마무리(로그 감시는 여기서 한 번에 저장). 출력 타입 Verdict · ServerReview · SuspectScore · PolicyReview 와 알림 자리 Notifier(구현 없음, §8 4)도 여기
│   │   ├── ground.py             판정 근거 확인 — 모델이 댄 근거 조항(문서 이름 · 조항 번호)이 실제 입력 조항에 있는지 코드로 봄 → `grounding.checks` (11/9)
│   │   ├── settings.py           Settings(.env · SENTINELAI_ 환경변수)
│   │   └── rag.py                DocumentStore — 기준 문서(이름 → 원문)를 조각내 한 컬렉션에. 검색 · 조각 전부(문서 · 원래 순서) · 없는 문서의 조각 빼기. 파일을 읽지 않음
│   ├── ask/                    질의 에이전트 (11/5) — tools(읽기 전용 도구 여섯, MCP 도구 모양) · agent(기준 세우기 → 쿼리 → 골라내기 → 판단 단계 · 대화 이어 가기) · check(답 검증)
│   ├── sources/                데이터 계층 (양현성) — DLP 로그 · 서버 상태(수집 노드) · DB 의 사용자 데이터 · RAG 기준 문서 넷만 읽음. 모듈마다 독립(공통 베이스 없음), 입구 `Sources`(hub.py)는 모으기만. 엔진을 모름 (11/5, 예전 data/)
│   │   ├── hub.py                Sources — events(DLP) · pending_servers(서버 상태) · people · 운영자 결정(DB) · regulations(RAG). `Engine.sources`
│   │   ├── logs.py               SecurityEvent · EventMapper(Microsoft Sentinel 로그) · 파일 · 폴더 · 행 목록 읽기(load_events) · 시각 필터 · 사용자별 묶음 · 로그 질의용 search · summarize · vocabulary · 행동 신호 · 위협 표시
│   │   ├── snapshots.py          ServerSnapshot · 수집 노드 본문 → 모듈별 상태(UFW · SSH · PAM · 계정 · sudo), 직전 수집과 달라진 설정, 질의 servers 도구용 server_digest
│   │   ├── people.py             People · Person — 사람마다 계정 · 이동 · 지금 가진 권한 · 신청 기록(권한 DB) · 로그 · 행동 신호 · 운영자 결정, 위협 예측 대상 고르기. 신청 · 이동 글(access_text · move_text)
│   │   ├── decisions.py          운영자 결정 — 정책 관리 · 서버 점검 · 로그 감시 판정에 사람이 정한 것 (권한 DB · AI 결과 DB)
│   │   ├── precedents.py         선례 — 판정과 비슷한 지난 사례에 사람이 정한 것(결재 · 회수 · 운영자 결정), 예전 AI 등급은 안 고름. 코드가 비슷한 정도로 6건까지 (11/9)
│   │   └── regulations.py        규정 RAG — 판정마다 검색어를 만들어 조항을 찾음, 정책 관리 검토에는 쌓인 문서 전부 (엔진이 넘긴 DocumentStore)
│   ├── context/                맥락 (11/5) — 프롬프트 합성만. sources 가 모은 데이터를 판정마다 LLM 입력 글로 쓰고 크기를 맞춤. DB · RAG 를 모름
│   │   ├── prompts.py            프롬프트 (권한 검토 · 보유 권한 재검토 · 로그 검토 · 위협 예측 · 정책 검토 · 서버 점검 · 질의 에이전트). 판정 입력 칸 이름 = 빌더의 Section key
│   │   ├── inputs.py             Inputs — 판정마다 프롬프트 · 빌더를 짝짓고 크기를 한 번만 맞춤 (`Engine.inputs`)
│   │   ├── person.py             사람 칸 — sources.Person 을 글로 (full: 계정 · 이동 · 지금 가진 권한 · 신청 기록 · 로그 요약 · 행동 신호 · 최근 위협 기록 / short: 계정 · 지금 가진 권한)
│   │   ├── builders.py           판정마다 빌더 하나 (request · grant · events · suspect · server · policy) — 받은 데이터 · RAG 결과 → 칸(Section) 목록. 크기는 모름
│   │   ├── precedent.py          선례 검토 입력 — 판사 모델에 줄 사례 · 1차 판정 · 선례 글과 크기 (11/9)
│   │   └── budget.py             입력 크기를 한 곳에 — 글자 한도 · 칸별 줄 수(위협 기록 15 · 운영자 결정 20) · 한 줄 글자 수 · 자르는 순서(`TRIM`) · fit
│   ├── db/                     권한 DB · AI 결과 DB (PostgreSQL 스키마 main · results). 엔진 · 데이터 계층은 모름. 설계 결정은 §9
│   │   ├── core.py               연결 풀 · 스키마 적용(schema_version) · 쓰기 차례(advisory lock) · 트리거 · 제약 위반 → Denied
│   │   ├── main.sql              권한 DB — 사용자 · 세션 · 감사 기록 · 신청(1건 = 1행: 신청 · AI 판정 · 1차 · 최종 결재 · 회수) · 권한 목록 · 운영자 결정 · 수집 노드 · 직무 · 퇴사일 · 이동 기록 · 보유 권한 재검토(11/3). 결재 순서 · 역할은 트리거가 강제 (11/03 SQLite 마이그레이션 11개를 하나로)
│   │   ├── main_email.sql        main.sql 뒤에 적용 — 계정에 알림 받을 이메일 칸 (11/04)
│   │   ├── main_regulations.sql  그 뒤에 적용 — 기준 문서 원문(`regulations`, 11/6). RAG 는 이 표의 사본
│   │   ├── main_grounding.sql    그 뒤에 적용 — 권한 신청 · 보유 권한 재검토 AI 판정의 근거 칸(`ai_grounding` · `grounding`, 11/9)
│   │   ├── main_decisions_done.sql 그 뒤에 적용 — 운영자 결정에 조치 완료(`done`) · 위협 예측(`suspect`) (11/15)
│   │   ├── main_manage.sql       그 뒤에 적용 — 계정 · 권한 목록을 만드는 사람 트리거를 보안 운영자 이상으로 (11/16)
│   │   ├── main_accounts.sql     그 뒤에 적용 — 계정을 만드는 사람은 보안 운영자 또는 루트 (11/17)
│   │   ├── results.sql           AI 결과 DB — 정책 관리 검토 · 로그 감시 판정 · 서버 점검 · 수집 기록 · 의심 점수 · 질의 기록 (쌓기만, 로그 자체는 안 쌓음)
│   │   ├── results_ask.sql       results.sql 뒤에 적용 — 질의 기록에 대화 id · 도구 단계 · 검증 칸 (11/5)
│   │   ├── results_ask_stages.sql 그 뒤에 적용 — 질의 기록의 단계 칸(`stages`, 11/9)
│   │   ├── results_grounding.sql 그 뒤에 적용 — 로그 감시 · 서버 점검 · 의심 점수 · 정책 관리 검토의 근거 칸(`grounding`, 11/9)
│   │   ├── results_briefing.sql  그 뒤에 적용 — AI 비서(보안 현황의 영역별 할 일, `briefings`, 11/15)
│   │   ├── results_drop_policy_files.sql 그 뒤에 적용 — 정책 파일 · 서버 현황 표를 읽던 때의 칸(`policy_reviews` 의 source · load_issues · rules · servers_*)과 `server_findings` 표를 지움 (11/15)
│   │   ├── results_policy_passed.sql 그 뒤에 적용 — 정책 관리 검토가 정상으로 본 조항 · 이유(`policy_reviews.passed`, 11/18)
│   │   ├── postgres-init.sql     시험 DB(sentinelai_dev · sentinelai_test) 만들기 — compose 의 PostgreSQL 이 처음 뜰 때
│   │   ├── auth.py               Argon2id · 로그인 잠금 · 세션 2일 · 계정 만들기 · 고치기 · 역할 바꾸기는 보안 운영자, 루트는 처음 설정 · 비상용 (루트 계정은 루트만, 11/17)
│   │   ├── permissions.py        신청(권한 목록 코드로, 현재 보유 권한은 승인된 유효 신청에서 읽어 남김) · AI 판정 저장(1차 결재 전까지만) · 철회 · 결재 · 회수
│   │   ├── decisions.py          정책 관리 · 로그 감시의 운영자 결정 (쌓기만, 마지막 기록이 지금 결정)
│   │   ├── regulations.py        기준 문서 원문 — 올리기 · 고치기 · 지우기는 보안 운영자 이상, 적재 실패 때 되돌리기
│   │   ├── catalog.py            권한 목록 — 일반 사용자는 켜진 권한만 신청. 보안 운영자 이상이 등록 · 고치기 · 끄기 (지우지 않음, 코드 못 바꿈) (10/20)
│   │   ├── nodes.py              수집 노드 등록부 — 노드마다 키 발급(해시로 찾고 화면에서 다시 볼 수 있게 키도 둠) · 다시 발급 · 끄기 (10/20)
│   │   ├── lookup.py             질의 query 도구가 읽는 권한 DB 행 — 계정 · 신청 · 권한 목록 · 이동, 비밀번호 · 세션 칸은 고르지 않음 (11/9)
│   │   ├── results.py            AI 결과 DB 저장 · 조회 — 정책 관리 검토 · 로그 감시(다음 감시 시작점 포함) · 내 질의 기록 · 보안 통계(threat_stats). CLI · 웹이 같은 DB를 씀
│   │   └── watch.py              채널 알림 · 변경 이력(`history`)이 읽는 DB 변화 — AI 결과 DB 의 로그 감시 위험 판정(`RiskWatcher`, 11/17에 results.py 에서 옮김), 권한 DB 의 감사 기록 · 보유 권한 재검토 위험 · 계정 역할 · 활성 · 퇴사자에게 남은 권한(`ExceptionWatcher`) (읽기만, 11/13)
│   └── web/                    웹 계층 (김혜정) — Engine 기능을 부르고 결과를 보여줌. 판정 로직 · 큐 없음
│       ├── main.py               FastAPI — API + 화면 서빙. 시작 때 Engine 생성 · start()(작업 큐), 끌 때 stop()(큐 · 벡터 DB 연결 닫기)
│       ├── api_nodes.py          수집 노드 API — 수집 받기(키만) · 등록 · 키 발급 · 목록 · 끄기 (/api/nodes)
│       ├── api_regulations.py    기준 문서 API — 보기 · 올리기 · 고치기 · 지우기 · 검색 상태 · PDF 글자 · 엑셀 표 꺼내기(보안 운영자 이상, 감사 기록). 엔진의 공개 기능(index · documents.chunks)만 씀 (/api/regulations)
│       ├── pdf_text.py           PDF → 글 (pypdf, 저장 안 함). 스캔본은 OCR 이 없어 못 읽음 (11/13)
│       ├── xlsx_text.py          엑셀 → 표 목록 (openpyxl, 저장 안 함) — 합친 칸 채우기 · 두 줄 머리 · 셀 메모 · 사람 기록 표 표시. 조항 글은 화면이 씀 (11/16)
│       ├── api_permissions.py    로그인 · 계정 · 권한 목록 · 신청 · 결재 · 회수 API (/api/auth · /api/users · /api/requests). 일반 사용자에게는 AI 칸을 빼고 줌
│       ├── responses.py          API 가 돌려주는 모양 — 명세(/openapi.json)와 화면 타입(schema.ts)의 출처. 판정 결과는 엔진 출력 타입을 물려받음 (11/16, §9)
│       ├── contract.py           돌려준 값이 선언과 같은지 대조 — 시험과 `dev api-check` 가 함께 씀 (11/16)
│       ├── view.py               AI 결과 DB → 화면용 dict (판정 필드는 그대로, title · detail만 덧붙임. 판정 실패는 "주의")
│       ├── notify.py             운영자 채널(`Chat` — Slack · Teams, 같은 글을 켜 둔 곳마다, Teams 는 적응형 카드 `SENTINELAI_TEAMS_WEBHOOK_URL`, 11/15). 결재 대기 → 채널 (새 신청 = 1차 결재 대기, 1차 승인 = 최종 결재 대기). `SENTINELAI_SLACK_WEBHOOK_URL`, 비우면 끔. 신청 번호 · 부서 · 권한만, 결과(승인 · 반려)는 채널에 안 보냄. 결재 결과(1차 반려 · 최종 승인 · 최종 반려) · 회수(11/09) → 신청자 계정 이메일(`users.email`), SMTP `SENTINELAI_SMTP_*`, 비우면 끔, 신청 번호 · 권한 · 결과 · 반려 의견 · 회수 사유 (11/04, 사유는 11/09). 로그 감시 위험 → 같은 Slack 채널 (`RiskWatcher` — 결과 DB를 30초마다 봄, 1차 판정 + 확정 중 1차 때 안 알린 것, 단계 · 건수만) (11/08). 예외 상황 → 같은 Slack 채널 (`ExceptionWatcher` — 권한 DB를 30초마다 봄: 계정 역할 변경 · 정지 · 다시 켬 · 보안 운영자 이상 계정 만듦, 이동 뒤 보유 권한 재검토 위험 · 퇴사일이 지난 계정에 남은 권한, AI 위험인데 최종 승인, 기준 문서 · 권한 목록 · 수집 노드 키 · 켜기/끄기 · 작업 강제 중지 · 큐 초기화. 이름 · 로그인 아이디는 안 넣음) (11/13)
│       └── static/               화면 빌드 결과 — frontend/ 에서 `npm run build` 로 만들어 커밋. 서버는 그대로 서빙
├── frontend/                 React 화면 소스 (김혜정) — TypeScript · Vite · TanStack Query · Vitest · Tailwind v4. 10/29에 옛 index.html 을 기능 · 모양 그대로 옮기고 10/30에 CSS를 Tailwind로 바꿨음 (화면 그대로, 리디자인은 다음)
│   └── src/
│       ├── app/                  껍데기 — App(로그인 게이트) · styles.css(CSS는 이 파일 하나 — Tailwind · 색 토큰 · 화면 틀)
│       │   ├── layout/             화면 틀 — AppShell · TopBar(메뉴 포함) · Workspace(탭 내용 · 아래 줄) · MainTabs · RightPanel · lib(큰 화면 확대 · 경고 · 툴팁 자리)
│       │   ├── session/            me(로그인한 사람 · 로그인 API) · views(역할별 메뉴 · 마지막 화면) · data(역할별 데이터 훅 · 부팅)
│       │   ├── ui/                 state/(UiContext · uiReducer — 메뉴 · 탭 · 선택 · 패널 동작) · panel/(Panel · AiReport · DecisionFoot) · Overlays(확인 창 · 툴팁) · ask(확인 창 열기)
│       │   └── queue/              검토 현황 공통 — useQueue · select · QueueHead · QueueTable
│       ├── shared/               api/(http · types · schema(백엔드 응답 모델에서 생성 — 손으로 안 고침) · queries · jobs) · lib/(format · request · clause · labels · form · hooks) · ui/(parts 공용 부품 · styles 클래스 묶음 · charts · Icon)
│       └── features/             메뉴별 — 화면(.tsx) · lib(계산 · 훅) · api(서버 호출). auth · requests(결재 패널 · 신청서 · 내 신청 MineList) · review · nodes · logs · ask(질의 팝업 AskDock — 오른쪽 아래 버튼으로 어느 화면에서든 열고, 대화 · 근거 칩 · 도구별 근거 보기, 예시 질문은 lib.ts) · stats · risk(보안 현황의 권한 변동 탭 — 사람 카드 · 회수) · overview(보안 현황의 종합 대시보드 `OverviewTab`) · catalog · accounts · regulations(기준 문서) · engine(관리의 큐 탭). 서로 import 하지 않고 shared 와 app/{session,ui,queue} 만 씀
├── data/                     DLP 로그 (위치는 .env) · 예시 기준 문서. 컨테이너에는 읽기만으로 붙음
│   └── example-regulations/    예시 기준 문서(.md · .txt) · 참고 pptx — 웹은 읽지 않음. 시험 환경 setup 이 권한 DB 에 넣음, 운영은 화면에서 올림 (11/9, 예전 docs/ → examples/regulations/)
│       ├── 접근권한_관리기준.md     3.1 최소권한 · 3.2 인사정보 · 3.3 급여정보 · 4.1~4.3 등급 기준
│       └── 정책_운영기준.md         5.1 DENY 우선 · 5.2 ANY 금지 · 5.3 중복 · 6.1 DLP>SWG · 6.2 PAM · 6.3 만료
├── node/                     수집 노드 — 점검 대상 서버에 까는 데몬 (패키지와 따로, 표준 라이브러리만, Python 3.8+). 설치 · 사용은 node/README.md
│   ├── sentinel_node/          collect(모듈별 원문 읽기) · client(보내기 · 못 보낸 것 쌓기 · 키 저장) · config · __main__(run · once · show · export)
│   ├── install.sh              /opt/sentinel-node · /etc/sentinel-node/node.conf · systemd 설치 · 제거
│   └── testenv/                시험용 점검 대상 컨테이너 (Ubuntu + ufw · sshd · PAM · sudo, weak · strict)
├── tests/                    DB 시험 (pytest, 시험마다 새 스키마) — python -m sentinelai.dev test
├── .dev/                     로컬 시험 환경 파일 (git 제외)
├── .env · .env.example       설정. .env 는 git 제외, 처음에 예시를 복사함
├── compose.yaml              웹(app) + PostgreSQL 18 + Milvus(벡터 DB, 단독 실행 — 로컬 저장소) + etcd(Milvus 메타데이터, 11/9) (docker compose up). DB sentinelai · sentinelai_dev · sentinelai_test, 컬렉션 sentinelai_policies · sentinelai_dev. 벡터 DB(`milvus-store`) · etcd · PostgreSQL은 볼륨, data/는 읽기만 (기준 문서 볼륨 `docs`는 11/6에 뺐음)
├── sentinel                  CLI — 떠 있는 컨테이너 안에서 `python -m sentinelai` (11/5, Makefile 대신)
├── requirements.txt · requirements-dev.txt
└── Dockerfile · README.md    컨테이너 이미지(웹 · 엔진 · data · db · CLI, 11/04에 웹을 넣음) · 저장소 소개
```

### 읽는 데이터 (11/5부터 넷만)

| 데이터 | 어디서 | 지금 |
|---|---|---|
| DLP 로그 | `SENTINELAI_EVENTS_SOURCE` — Microsoft Sentinel 내보내기 (`TimeGenerated`, `WHO` · `WHERE` · `HOW` 등, `sentinelai/sources/logs.py`) | `data/연습용_로그_원본+합성.csv` |
| 서버 상태 | 수집 노드가 보낸 원문 → AI 결과 DB `server_snapshots` | 시험 컨테이너 2대 |
| 사용자 데이터 | 권한 DB — 계정 · 이동 · 신청 · 결재 · 운영자 결정 | — |
| 기준 문서 | 권한 DB `regulations` 원문 → RAG 에 적재 (보안 운영자 이상이 화면에서 올리고 고치고 지움) | 2개 |

- 로그 위치가 폴더면 안의 `.csv` · `.json` · `.jsonl`을 모두 읽음 (솔루션 · 도구마다 내보낸 파일을 그대로 둠). 컬럼이 맞지 않는 파일은 건너뛰고 화면 하단에 알림
- 솔루션 정책 파일(`SENTINELAI_POLICIES_SOURCE`) · 서버 현황 표(`SENTINELAI_SERVERS_SOURCE`)는 11/5에 뺐음 — 10/20부터 둘 다 비어 있었고, 정책은 RAG에 올려 검색하기로 함 (§9)

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

B · D를 놓친 이유: 기준 문서에 출력량 · 시간대 · 외주 계정 조항이 없음 (§8 5).

### 수집 노드 (10/20)

- 정책 관리 → [노드] → [노드 등록]에서 서버 이름을 넣으면 그 서버의 키가 나옴. 내부망 서비스라 키를 노드 화면에서 언제든 다시 봄 (처음엔 한 번만 보여주고 해시만 뒀다가 같은 날 바꿨음)
- 점검 대상 서버에서 `node/install.sh --server SentinelAI주소 --key 키`로 설치
- 노드는 정한 간격(기본 30분)마다 UFW · sshd · PAM · 계정 · sudo 원문을 **읽기만** 해서 `POST /api/nodes/snapshots`로 보냄. **이름 없이 키만** 보내고(`Authorization: Bearer`) 서버가 키로 노드를 찾음
- 키를 잃거나 새어 나가면 [키 다시 발급] (예전 키는 바로 무효). 공용 등록 토큰 · 자동 등록은 처음 설계에 있었으나 화면 발급으로 바꿨음
- 못 보낸 수집은 노드에 쌓였다가 다음 차례에 먼저 보냄
- 무엇을 뽑아 판정할지는 `sentinelai/sources/snapshots.py`가 정함 (설치 안 됨과 권한이 없어 못 읽음은 다른 값)
- 서버는 노드 · 수집 시각별로 `server_snapshots`에 쌓고 직전 수집과 달라진 설정을 셈
- 망이 막힌 서버는 노드의 `export` 파일을 `./sentinel import-snapshots`로 넣음
- 노드 시험은 점검 대상 컨테이너를 올려 그 안의 진짜 노드로 (§3 `python -m sentinelai.dev targets`). 흉내 노드 · 이 컴퓨터를 노드로 보내기는 11/5에 뺐음

---

## 2. 코어와 웹

- 판정은 모두 엔진(`sentinelai.engine`)이 함 — 이슈어가 읽어 쌓고, 워커 하나가 꺼내 판정 · 저장
- CLI와 웹이 같은 `Engine` 기능을 부르고, 결과는 AI 결과 DB(`SENTINELAI_RESULTS_DB_PATH`의 스키마 `results`)에 실행마다 쌓음
- 판정 실패 시 2회 재시도(`worker.attempt`). 그래도 실패하면 `failed` · `error`로 남기고 화면에는 "주의"로 올림 (이유 칸에 원인)
- 벡터 DB는 compose 의 Milvus 서버 (`SENTINELAI_MILVUS_URI`, 파일 경로를 넣으면 Milvus Lite). 판정은 웹 작업(`/api/jobs`)으로. CLI 판정은 cron 용 로그 감시(`monitor`)뿐 — 따로 큐를 돌려 웹과 함께 돌면 모델을 함께 침. 둘 다 같은 AI 결과 DB에 쌓음
- 판정 입력: `sentinelai.sources`가 대상 · 사람 · 규정 RAG(조항) · 운영자 결정을 모으고, `sentinelai.context`가 글로 씀. 입력 예산 = (`NUM_CTX` − `NUM_PREDICT`) × 1.4자 − 프롬프트 글. 넘치면 신청 기록 · 운영자 결정 → 로그 줄 → 위협 기록 순으로 오래된 줄부터 빼고 "오래된 N줄은 입력 한도로 뺐습니다"를 그 칸에 적음. 대상 · 조항은 빼지 않음. 판정 결과 dict의 `input`(글자 수 · 한도 · 뺀 줄)은 저장하지 않음
- **판정 근거 확인** (11/9): 워커가 `engine/ground.py` 로 판정이 댄 근거 조항(문서 이름 · 조항 번호)이 판정 입력의 조항 칸에 실제로 있는지 보고 `grounding.checks`(어긋난 것)로 판정과 함께 저장. 어긋나도 판정은 그대로 두고 적기만 함 (다시 묻지 않음). 모델 입력은 바꾸지 않음 — 입력 줄 번호 · `evidence` 칸은 시험해 보고 뺐음 (§9). 화면에는 아직 안 보임. 권한 신청 · 재검토 · 로그 감시의 `sources` 는 기준 문서 "문서 이름 조항 번호"만 남기고 입력 칸 이름 · 로그는 빼서 checks 에 적음 (`regulation_sources`, 11/18)
- **선례 검토** (11/9, LLM-as-a-Judge — 권한 신청 · 보유 권한 재검토 · 정밀 감시 · 서버 점검 · 정책 관리 검토, 빠른 감시 · 위협 예측은 뺌): 1차 판정 뒤 `sources.precedents` 가 비슷한 지난 사례에 사람이 정한 것만 고름(권한 신청 = 같은 권한 3 · 분류 2 · 시스템 1 + 같은 부서 1, 정밀 감시 = 다른 사람 판정에 정한 것 중 솔루션 · 어디서 · 행위 · 예외 승인이 겹치는 것, 서버 점검 = 다른 노드 판정 중 차이 항목이 겹치는 것, 정책 관리 검토 = 조항 · 유형이 겹치는 문제). 선례가 없으면 건너뜀. 있으면 판사 모델(같은 판정 모델, `PRECEDENT_JUDGE` → `PrecedentReview`)이 사례(대상 칸만) · 1차 판정 · 선례를 보고 맞음 · 어긋남과 어긋난 선례 번호를 냄. 어긋남이고 실제 선례 번호를 대면 그 평가를 원래 판정 프롬프트 뒤에 붙여(`PRECEDENT_REJUDGE`) 한 번 다시 판정하고 두 번째 판정을 씀 (사용자 결정). 번호를 안 대면 다시 판정하지 않고 checks 에 적음. 기록은 `grounding.precedent`(선례 줄 · 평가 · rejudged · 1차 판정 · 초). 다시 판정할 몫(3,800자)은 판정 입력 예산에서 미리 뺌. 판정 한 건에 모델 호출 1~3번. 화면에는 아직 안 보임

**이슈어 · 큐 · 워커** (`engine/issue.py` · `queue.py` · `worker.py`, 11/5)
- 잡 하나 = 판정 한 건(사용자 묶음 · 노드 · 사람 · 신청). 한 번의 실행(로그 감시 1회 등)은 묶음 — 잡 여럿 + 마지막 닫기 잡
- 웹이 뜰 때마다 기준 문서(권한 DB)를 RAG 에 맞춤 — 맨 먼저 쌓아 판정보다 앞섬. 바뀐 문서만 임베딩해 그대로면 금방 끝남. 임베딩 모델에 닿지 않으면 그 잡만 실패하고 웹은 뜸
- 길 순서: 기준 문서 적재 · 권한 신청 · 보유 권한 재검토(0) → 빠른 감시(1) → 정밀 감시 · 서버 점검 · 위협 예측 · 정책 관리 검토(2). 같은 길은 먼저 들어온 것부터. 판정이 한 건씩이라 급한 일은 다음 차례에 바로 끼어듦
- 워커 하나 — 모델 · 벡터 DB 를 동시에 치지 않음. 규정 RAG 검색도 워커가 함
- 데이터(로그 · 사람 · 운영자 결정 · 신청)는 이슈어가 쌓을 때 읽어 잡에 담음. 신청은 웹 요청 자리에서 읽어 응답이 로그 읽기만큼 늦음 (실제 로그가 커지면 워커로 미룸). 로그를 못 읽으면 잡에 오류를 담아 판정 실패로 남김 — 웹 시작 · 신청 응답은 막지 않고 다음 시작 때 다시
- 같은 key(신청 번호 · `grant:신청번호:이동 id` · 묶음 종류)가 기다리거나 돌고 있으면 다시 쌓지 않음
- 예약(웹만): 종류마다 뜨자마자 한 번, 그 뒤 간격마다. 같은 종류 묶음이 열려 있으면 그 차례는 건너뜀
- 강제 중지: 돌던 잡과 그 묶음을 끝내고 워커를 새로 띄움. 응답 없는 모델 호출에 묶인 옛 워커는 그 호출이 돌아오면 아무것도 쓰지 않고 끝남 (그동안 새 잡과 모델 호출이 겹칠 수 있음). 끝낼 때(`stop`)는 돌던 잡을 5초 기다림
- CLI 는 같은 이슈어로 묶음을 쌓고 그 자리에서 워커를 돌림(`drain`)

### 판정 기능

**정책 관리** `review_policies` — 화면 [정책 관리 검토 실행]
- 기준 문서(권한 DB)를 RAG에 맞춤 (바뀐 것만, 지운 문서의 조각은 뺌) → RAG에 쌓인 조각 전부(문서 · 원래 순서) + 지난 검토의 문제에 운영자가 정한 것(유형 · 조항 · 결정 · 의견) → `policy_chain` → `PolicyReview`
- 기준 문서끼리의 중복 · 충돌 · 과도한 허용과 관련 조항(`policy_ids` 칸에 "문서 이름 조항 번호") · 개선안. 문제에 들지 않은 조항은 정상 이유 한 줄과 함께 `passed` (11/18). 문서 전부를 넣으므로 문서가 입력 한도를 넘으면 자르지 못함 — 문서가 늘면 조각마다 비슷한 조각을 찾아 견주는 방식으로 바꿈
- 실행마다 쌓고 화면은 마지막 실행을 봄

**서버 점검** `check_nodes` — 웹이 뜨자마자 한 번, 그 뒤 `SENTINELAI_MONITOR_INTERVAL_MIN`분마다, 또는 노드 탭 [지금 점검]
- 켜 둔 노드 중 지난 점검 뒤 새 수집이 온 노드만, 그 노드의 가장 늦은 수집 한 건 → `server_chain` → `ServerReview`
- 입력: 서버(호스트 · IP) · 모듈 상태 · 직전 수집과 달라진 설정 + RAG로 찾은 조항 + 그 노드의 지난 점검에 운영자가 정한 것(이상 없음 · 조치 필요, 그때 다른 곳 이름 · 의견)
- 출력: 기준과 다른 곳마다 지금 · 기준 · 근거 조항 · 등급 · 이 환경에서 바꿀 것. 조항이 없거나 확인 못한 항목은 판단하지 않고 이름만
- 한 건씩 `node_findings`에 쌓고 화면은 노드마다 마지막 판정을 봄 (노드 한 대 30초 안팎)

**위협 예측** `run_suspects` (10/22) — 정밀 감시와 같은 주기, 또는 사용자 위협 탭 [지금 예측]
- 사람마다 행동 신호(`sources.logs.behavior_signals` — 최근 7일 vs 앞 4주: 하루 양 · 근무 시간 밖 · 예외 승인 · 민감 문서 · 30분 안 몰아서 · 처음 보는 계정) + 사용자 기록 · 최근 위협 기록 15건(아래 "사용자 기록") + 기준 조항(11/5, 눈에 띄는 신호로 찾음 — 참고로만) → `suspect_chain`(생각하는 판정 모델) → `SuspectScore`(0~100 · 이유 · 확인할 점)
- 등급은 점수로 코드가 정함. 한 사람씩 `suspect_scores`에 쌓음 (사람당 20초 안팎)
- 로그 감시 판정의 근거는 기준 문서만 (10/20 결정, 11/5에 솔루션 정책을 뺌). 11/3부터 정밀 감시는 사용자 기록을 맥락으로 함께 봄 — 어긋남의 근거로는 쓰지 않게 프롬프트에 적음

**로그 감시** `monitor` — 두 단계 (10/22), 화면에서는 시작하지 않음
- 빠른 감시: `SENTINELAI_FAST_INTERVAL_MIN`(5)분마다 생각 단계를 끈 연결(`Resources.llm(think=False)`)로 새 로그만 판정해 "1차 판정"으로 바로 올림 (묶음당 수 초, 큐에서 정밀 감시 · 서버 점검보다 먼저). 사람 맥락은 계정(부서 · 직무 · 활성 · 퇴사일) · 지금 가진 권한만 (11/5). 비우면 정밀 감시만
- 정밀 감시: `SENTINELAI_MONITOR_INTERVAL_MIN`(30, 0이면 끔)분마다 생각하는 판정 모델로 같은 구간을 다시 판정해 확정. 확정된 구간의 1차 판정은 목록에서 빠짐 (`monitor_runs.stage` = fast · final)
- 흐름: 지난 감시 이후 로그 → 사용자별 묶음 → `event_chain`(조항 검색) → `Verdict`. 읽은 가장 늦은 로그 시각이 다음 시작점

**사용자 기록** (11/3, 11/5 맥락 빌더로 옮김) — 사용자가 관여한 판정(권한 신청 · 보유 권한 재검토 · 정밀 감시 · 위협 예측)에 그 사람의 기록을 한 칸(`person`)으로 넣음. 빠른 감시는 속도 때문에 계정 · 지금 가진 권한만
- 모으는 곳: `sources.People` — 작업 한 번에 로그 · 계정 · 운영자 결정을 한 번만 읽고, `get(계정 id 또는 로그 사용자 ID)`이 사람마다 `Person`. 계정 ↔ 로그 사용자는 `log_id`로 이음. 글로 쓰는 곳은 `context/person.py`
- 담는 것: 계정(부서 · 직무 · 활성 · 퇴사일) · 이동 전부 · 지금 가진 권한(권한 목록의 시스템 · 분류 · 설명 · 끝나는 날) · 권한 신청 전부(결재 · 반려 의견 · 회수 사유, 예산이 모자라면 오래된 것부터 뺌) · 로그 집계 · 행동 신호 · 최근 위협 기록
- 권한 신청 판정은 신청 시각까지로 자름 — 그 뒤의 이동 · 신청 · 로그 · 운영자 결정을 뺌 (11/5 전에는 신청만 잘랐음). 보유 권한은 신청할 때 남긴 칸(`current_access`)을 씀
- 최근 위협 기록 15건: 운영자가 로그 감시 판정에 정한 것([조치] · [이상 없음], 11/5부터 이상 없음도)을 먼저, 남은 자리는 코드가 고른 로그(`sources.logs.threat_lines` — 예외 승인 · 민감 문서 · 근무 시간 밖, 같은 종류가 몰리지 않게 돌아가며 최근 것부터). 정밀 감시는 지금 판정하는 묶음의 로그를 뺌 (같은 줄을 두 번 넣지 않게)
- **예전 AI 등급은 넣지 않음** (사람이 정한 것만) — 한 번 위험으로 찍힌 사람이 계속 위험으로 나오는 되먹임을 막으려고. 감사 기록도 넣지 않음
- 웹이 뜨자마자 한 번 (꺼져 있던 동안 쌓인 로그를 따라잡음), 그 뒤 간격마다 (`JobQueue.every`). 다른 작업이 돌면 큐에서 차례를 기다림
- 판정은 모두 쌓지만 운영자 검토(목록 · 건수 · 종)에는 **주의 이상**만 올림
- 1차 판정은 운영자 결정 · 통계 · 의심 점수 기록에 넣지 않음 (종 배지에는 뜸)

**로그 조회** `browse_logs` — 기간(지금부터, 달력 단위 아님) · 사용자 · 솔루션 · 행위로 거르고 셈. 모델 없이 코드만, 저장하지 않음

### 질의 — 질의 에이전트 (11/5)

- 정책 · 로그 · 서버 질의를 하나로 합쳤음. 질답 모델(`SENTINELAI_QA_MODEL`, 생각 켬)이 도구를 골라 부르고, 찾은 것으로만 답함. MCP 는 쓰지 않음 — 쓰는 쪽이 같은 프로세스뿐이라 내부 도구 호출로, 도구 정의는 MCP 모양(이름 · 설명 · JSON 인자)으로 둠 (사용자 결정)
- 도구 여섯 (`ask/tools.py`, 읽기만, 숫자는 코드가 셈): `search_regulations` 기준 문서 조항 · `find_logs` 로그 거르고 세기 · `servers` 노드 상태 · 점검 · 바뀐 설정 · `person` 한 사람의 계정 · 이동 · 권한 · 신청 · 로그 요약 · `findings` 로그 감시 판정 · 정책 문제 · 의심 점수
- `query` (11/9) — 권한 DB 를 거르고 셈. 대상 = 지금 가진 권한 · 신청 · 계정 · 권한 목록 · 이동. 권한 이름은 권한 목록에서 말이 가장 많이 겹치는 것으로 고름("급여 테이블" → SALARY_READ · SALARY_PRINT). 거르기 칸(사람 · 부서 · 결재 단계 · AI 등급 · 기간 끝 임박 · 기간 · `where` 칸 조건) · 묶어 세기 · 보여 줄 칸 · 정렬 · `ids`
- `query` 의 `meaning` — 뜻을 봐야 하는 조건(사유가 권한과 안 맞음 등). 다른 인자로 거른 후보 40줄까지를 번호로 질답 모델에 따로 보여 주고(도구 없이, `prompts.AGENT_PICK`) 고른 번호만 남겨 코드가 셈. 후보가 넘치면 줄이라고 돌려줌
- 단계 (11/9, 단계마다 질답 모델을 따로 부름 — 사용자 결정): ① 기준 세우기(도구 없이 목표 · 기준 · 자료 · 답 모양 네 줄, `AGENT_PLAN`) → ② 쿼리(세운 기준을 넣은 도구 루프, 답은 안 씀, `AGENT_QUERY`) → ③ 거르기(도구 안 코드 — `query` 인자 · `meaning`) → ④ 골라내기(모은 자료를 `T도구-줄` 번호로 보여 주고 필요한 줄만 고르게 함, 코드가 있는 번호만 남김, `AGENT_SPOT`) → ⑤ 판단(고른 근거 · 세운 기준만 보고 답, `AGENT_JUDGE`). 늘 다섯 단계 (사용자 결정)
- 쿼리 루프: 도구를 부르는 모델 호출 5번까지, 넘으면 다음 단계로. 모르는 도구 · 인자 오류 · 도구 예외는 오류 글로 모델에 돌려줌. 도구 없이 끝내면 쿼리를 처음부터 1번 다시 (사용자 요청), 그래도 없으면 검증에 "도구로 찾지 않고 답했습니다"
- 코드가 막는 것: 기준에 '기준 문서'가 걸렸는데 쿼리에서 조항을 안 찾았으면 목표로 `search_regulations` 를 부름(단계에 `by: code`). 행을 고른 도구의 [집계] 줄은 늘 근거에 넣음. 골라내기 답을 못 읽으면 모은 자료 전부로 판단하고 검증에 적음. 골라내기에 넣는 자료는 1만 2천 자까지(도구마다 나눔)
- 결과 `stages` = 세운 기준(`plan` — text · goal · criteria · needs · form) · 고른 근거(`spotted` — id · tool · line · why) · 모은 줄 수(`pool`) · `fallback` · 단계별 초(`times`). 질의 기록 `stages` 칸(`results_ask_stages.sql`). 화면에는 아직 안 보임 (사용자 결정 — 백엔드 먼저)
- 대화: 화면이 대화 id 를 만들고, 같은 대화의 앞 4턴(질문 + 앞서 찾은 것 요약 · 답)을 넣음. 도구 없이 낸 답 · 실패한 턴은 넣지 않음 — 모델이 그 답을 흉내 냄
- 예전 버그를 도구가 막음: 사람 이름이 `keyword` 로 오면 `user` 로 옮김, 로그 처음 · 끝으로 채운 기간은 비움, 솔루션 · 어디서 · 행위에 로그에 없는 값은 빼고 쉼표는 '또는', 0건이면 조건 하나씩의 건수를 돌려줘 다시 부르게 함. 답의 `**` · `<think>` 는 코드가 걷어냄
- 검증(`ask/check.py`): 답의 숫자가 고른 근거 · 질문에 있는지, 인용한 문서가 고른 근거에 있는지 (판단 단계가 본 것만으로) → `checks`, 화면에 경고. 날짜에 든 숫자와 구분하지 못해 약함 (§8 8)
- `find_logs` 를 부를 때마다 감사 기록 `log_view` (`via: ask`). 큐 밖에서 웹 요청 자리에서 돎 — 판정 워커와 모델을 함께 씀
- CLI 질의는 11/9에 뺐음 (화면 팝업과 겹침). 모델 평가는 `Engine().ask(질문, None)` 을 부르는 스크립트로

### API

| API | 하는 일 |
|---|---|
| `POST /api/auth/login` · `logout` · `GET /api/auth/me` · `POST /api/auth/password` | 로그인 (쿠키 HttpOnly · SameSite=Strict, 2일). 첫 로그인 비밀번호 변경 전에는 다른 API 403 |
| `GET /api/results` | 마지막 정책 관리 검토(정책 문제 · 서버 점검) · 쌓인 로그 감시 판정(주의 이상, 정상은 `event_levels` 건수만) → 화면용 dict + 운영자 결정 + 결정 기록 전부(`decision_log`, 취소 포함, 11/17부터 보안 운영자에게도) |
| `GET /api/jobs` | 도는 작업(`running` — 없으면 기다리는 첫 작업, 그때 `queued: true`) · 진행(done/total) · 작업별 마지막 실패 · 기다리는 일(`waiting`, 신청 판정 · 기준 문서 적재 포함). 빠른 감시는 `fast`(간격 · 다음 시각 · 마지막 실행) |
| `POST /api/jobs/{kind}` | `policies` · `nodes` · `suspects`를 큐에 넣음 (202, 다른 작업이 돌면 그 뒤에). 같은 작업이 이미 기다리거나 돌고 있으면 409. `events`는 자동으로만 돌아 404 |
| `GET /api/queue` · `POST /api/queue/clear` | 관리 → 큐 화면 (보안 운영자 이상) — 도는 잡 · 길마다 기다리는 잡 전부 · 열린 묶음 · 예약 · 종류마다 마지막 실행. 초기화는 도는 · 기다리는 잡을 모두 끝내고 워커를 새로 띄운 뒤 뜰 때처럼 기준 문서 적재 · 판정 못한 신청을 다시 쌓음 (예약은 그대로, 도는 작업이 없어도 됨, 감사 기록 `queue_clear`) |
| `POST /api/jobs/reset` | 돌고 있는 작업(작업 큐 · 빠른 감시)을 강제로 끝냄 (보안 운영자 이상, 감사 기록 `jobs_reset`). `{rerun: true}`면 같은 작업을 다시 넣음. 돌던 판정 한 건은 끝날 때까지 이어지고 결과는 버림 (`JobQueue.reset`). 도는 작업이 없으면 409 |
| `POST /api/decisions` | 정책 문제 · 서버 점검 · 로그 판정에 대한 운영자 결정 · 취소 (보안 운영자 이상). 지금 결정은 `/api/results`의 `decisions`로 옴 — 다시 판정됐지만 결과가 그대로인 서버 점검 · 정책 문제는 지난 결정을 이어받아 `carried_from`(이어받은 판정 key)과 함께 옴 (`view.carry_decisions`) |
| `POST /api/nodes/snapshots` | **수집 노드 전용** — 로그인 대신 `Authorization: Bearer 노드 키`. 본문 = 노드가 읽은 원문(`format: sentinel-node 1`, 2MB까지). 모르는 키 401 · 꺼진 노드 403 · 형식 400. 같은 노드 · 수집 시각은 한 번만 쌓음(`stored`) |
| `POST /api/nodes` · `POST /api/nodes/{이름}/key` · `GET /api/nodes` · `GET /api/nodes/{이름}` · `PATCH /api/nodes/{이름}` | 등록(+ 키) · 키 다시 발급(예전 키 무효) · 목록(상태 · 끊김 · 마지막 판정) · 하나(키 · 최근 수집 · 바뀐 것 · 판정 기록 · 모듈 상태) · 켜기/끄기. 보안 운영자 이상, 감사 기록 |
| `POST /api/ask` | 질의 에이전트 — 입력 `{question, conversation_id?}` (질문 공백 제외 1~500자, id 는 32자리 16진수, 벗어나면 422). 같은 id 의 내 앞 턴을 이어 넣고, 기록이 없는 id 면 새 대화. 출력 `{answer, steps, sources, checks, restarts, failed, error, elapsed_sec, id, conversation_id}`, 질의 기록(kind `agent`)에 남김 |
| `GET /api/qa[?conversation=]` | 내 대화 목록(최근 30개 — 첫 질문 · 턴 수 · 마지막 시각), `conversation` 을 주면 그 대화의 턴. 다른 사람 것은 안 줌 |
| `GET /api/logs?period=day\|week\|month\|quarter\|half\|year\|all[&user=&solution=&how=&page=]` | 로그 조회 — 지금부터 1 · 7 · 30 · 90 · 180 · 365일 또는 전체. 사용자는 "부서 이름" 완전 일치. 최신순 100건씩 + 집계(`facts`) + 거르기 칸 값(`options`, 로그 전체 기준). 조회마다 감사 기록(`log_view`: 누가 · 조건 · IP) |
| `GET /api/stats?period=week\|month\|quarter\|all` | 보안 통계 (기본 한 달, 모델 없이 셈, `results.threat_stats`) — `logs`(기간 안 로그 수 · 날짜별, 비율의 분모) · `events`(주의 · 위험 판정에 묶인 로그 줄 · 날짜별) · `servers`(노드별 등급 · 위험 · 주의 항목, 모듈별 위협 항목, 걸린 조항 — 노드마다 기간 안 마지막 점검) · `safety`(시스템 안전 점수, 아래) |
| `GET /api/overview?period=week\|month\|quarter\|all` | 보안 현황 종합 (보안 운영자 이상, 모델 없이 셈, `sources/overview.py`) — 정책 관리 · 서버 점검 · 로그 감시 · 위협 예측 · 보유 권한 재검토에서 지금 열린 위험 · 주의(`counts` · `areas`, 기간과 무관) · 조치 필요(결정 없음 · 조치 중) · 조치 완료율(기간 안) · 일별 추이(`trend`, 그날 끝에 남은 것) · 남은 이슈 전부(`top`, 위험부터) · 판정 실패 · 최근 조치 10건(`recent` — 완료율의 완료, 운영자 의견 · 회수 사유 `note`) · 마지막 AI 비서(`briefing` — 한 줄 요약 · 영역별 할 일, 작업 `briefing`) |
| `GET /api/user-stats?period=` | 사용자 위협 — `suspects`(사람마다 마지막 의심 점수 · 등급 · 이유 · 확인할 점 · 행동 신호 · 흐름 · 지금 가진 권한 `held`, 계정 미연결은 null, 기간과 무관) · `safety`(사용자 안전 점수) · `events.users`(사용자별 위협 로그 줄 · 판정 수 · 로그 사용자 ID) · `requests`(신청 수 · AI 등급별 · AI와 결재가 엇갈린 수) |
| `GET /api/audit?target_type=regulation\|user\|access&target_id=` | 한 기준 문서(이름) · 계정(id) · 권한(코드)의 변경 이력 — 감사 기록 최근 20건 `[{id, at, action, by, detail}]` (보안 운영자 이상, `db/watch.py` `history`). 기준 문서의 지난 원문(`before`)은 뺌 |
| `GET /api/health` | 연결 · 모델 · 임베딩 · 인덱스, 모두 준비되면 `ok` (보안 운영자 이상) |
| `GET /api/regulations` · `GET /api/regulations/index` · `POST /api/regulations` · `PUT /api/regulations/{이름}` · `DELETE /api/regulations/{이름}` | 문서마다 RAG 조각 수(`index` → `{chunks}`, 엔진 `documents.chunks`, 벡터 DB 에 닿지 않으면 빈 칸). 권한 DB 의 원문 · 고친 시각 · 올리기 · 고치기 · 지우기 (모두 보안 운영자 이상). 지우기는 `{reason}` → 원문을 지우고 RAG 를 다시 맞춰 그 문서의 조각을 뺌, 지운 원문 · 사유는 감사 기록(`regulation_remove`)에. 마지막 문서는 400. 올리기는 `{name, content, source?}`(.md · .txt, 1MB, 같은 이름 400 — 덮어쓰지 않음, `source` = 글을 꺼낸 PDF 이름, 감사 기록에) → 바뀐 문서만 적재. `POST /api/regulations/extract`— 본문 = PDF 그대로(20MB · 500쪽) → `{text, pages, empty_pages}`, 저장하지 않음. 글자가 없는 PDF · 암호 · 깨진 파일 400, 20MB 넘으면 413. `POST /api/regulations/extract-xlsx`— 본문 = .xlsx 그대로(20MB) → `{tables[{sheet, title, intro, columns, rows[{cells, notes}], personal}]}`, 저장하지 않음. 표 없음 · 깨진 파일 400. 고치기는 `{content, reason}`(없는 문서 404, 같은 내용 400) → 그 문서만 다시 적재, 고치기 전 원문 · 사유는 감사 기록(`regulation_edit`)에. 원문 쓰기 · 적재를 한 일로 큐에 넣고 (적재가 실패하면 원문을 되돌림) 차례를 기다림(10분 넘거나 기다리는 중에 화면이 끊으면 빼고 409), AI 엔진(임베딩)에 닿지 않으면 바로 503 |
| `GET · POST /api/users` · `PATCH /api/users/{id}` · `POST /api/users/{id}/reset-password` | 계정 관리 — 만들기 · 고치기 · 역할 바꾸기 · 정지 · 비밀번호 초기화는 보안 운영자, 루트는 처음 설정 · 비상용. 보안 총책임자는 목록 보기만 (어기면 400, 일반 사용자의 목록 보기는 403). `PATCH`로 로그 사용자 ID(`log_id`, 계정마다 하나, 겹치면 400) · 직무(`job`) · 퇴사일(`left_on`, YYYY-MM-DD) · 이메일(`email`, 결재 결과 알림용, 만들 때도 받음, 빈 값이면 안 보냄, 형식이 틀리면 400). 부서 · 직무가 바뀌면 이동 기록 + 보유 권한 재검토를 판정 큐에. 루트 계정은 루트만, 자기 역할 · 활성은 못 바꿈 |
| `GET /api/access-catalog` · `POST /api/access-catalog` · `PATCH /api/access-catalog/{코드}` | 권한 목록 — 보기(일반 사용자는 켜진 것만) · 등록 · 고치기 · 끄기(보안 운영자 이상, 감사 기록) |
| `POST /api/requests` · `GET /api/requests[?stage=&mine=]` | 신청(일반 사용자, 본문 `access_code` · `reason`(필수, 비면 400) — 목록에 없거나 꺼진 권한 · 이미 가진 권한 · 결재 중인 같은 권한은 400, 현재 보유 권한은 서버가 채움) · 목록(일반 사용자는 자기 것만). 신청 · 1차 승인 뒤 응답을 보내고 Slack 채널에 결재 대기 알림, 결재가 끝나면 신청자 이메일로 결과 메일(실패해도 신청 · 결재는 그대로). 응답에 `ai_verdict` · `judging` · `grant_review`(유효 권한의 재검토 — 퇴사 `leave` · 이동 `move`, 일반 사용자에게는 뺌) |
| `GET /api/risk-people` | 권한 변동 (보안 운영자 이상, 코드가 셈, 화면은 30초마다) — 최근 90일에 부서 · 직무를 옮긴 사람(이동 · 보유 권한 재검토 · 가장 이른 이동 뒤 그 사람의 로그 감시 주의 · 위험 판정, 1차 포함)과 90일 안에 사용 기간이 끝났는데 회수 기록이 없는 권한(`expired`, `permissions.expired_grants`)이 남은 일반 사용자. 퇴사 · 결재 중 신청은 뺌 — 화면이 퇴사를 `/api/people` 에서 붙임. `{generated_at, people[{…, flags, log_id, log_user}], log_error}` (`Issuer.risk_people`) |
| `GET /api/people` | 권한 변동 화면이 퇴사만 가져다 씀 (보안 운영자 이상, 코드가 셈) — 퇴사 · 최근 90일 이동 · 위험 · 주의인 결재 중 신청 · 보유 권한(이동 뒤 재검토 · 승인 때 AI 판정)이 걸린 일반 사용자. 사람마다 `flags`(kind · level · at · text · request_no) · `level` (`permissions.watch_people`) |
| `POST /api/requests/{no}/withdraw` · `decision` · `revoke` · `rejudge` | 철회(신청자, 1차 결재 전) · 결재(보안 운영자 = 1차, 보안 총책임자 = 최종) · 회수(응답 뒤 신청자 이메일로 회수 메일, 11/09) · 다시 판정 |
| `GET /internal/status` | **서버 자신(127.0.0.1)만** — 작업 큐 · 자동 실행 예약 · 권한 신청 판정 대기열. 로그인 없음, 밖에서 오거나 전달 헤더(`X-Forwarded-For` 등)가 붙으면 404. `curl -s localhost:8000/internal/status` |

- **모든 API는 로그인 필요** (`/api/auth/login` 제외). 정책 관리 · 로그 감시 API(`results` · `jobs` · `ask` · `logs` · `stats` · `user-stats` · `qa` · `regulations`)는 보안 운영자 이상
- 안전 점수: 시스템 = 켜 둔 노드마다 마지막 점검 등급을 정상 1 · 주의 0.5 · 위험 0으로 평균 × 100 (끊긴 노드는 0.5 이하, 판정 없는 노드 제외, `results.server_safety`). 사용자 = 사람마다 마지막 의심 등급을 낮음 1 · 보통 0.5 · 높음 0으로 평균 × 100 (`results.user_safety`)
- 없앤 것: CSV 권한 신청 재판정(`/api/review`) · `requests` 작업 (DB 신청으로 바뀜), 신청 하나 보기 `GET /api/requests/{no}` (10/22, 화면이 안 씀)
- `Engine()` · `rag_chain`은 앱 시작 때 1회만 만듦. 같은 출처에서만 열므로 CORS 없음
- 결재 · 회수 · 운영자 결정은 권한 DB에, 질의 기록은 AI 결과 DB에 남음

### 화면

`docker compose up` (`sentinelai/web/main.py`). 역할별 메뉴 · 탭은 `frontend/src/app/session/views.ts`. 화면 가이드(`FRONTEND_GUIDE.md`)는 11/5에 뺐음.

| 역할 | 메뉴 |
|---|---|
| 일반 사용자 | 메뉴 · 오른쪽 패널 없이 한 화면 — 제목 아래 설명 한 줄, 왼쪽 신청서(시스템별로 묶은 권한 고르기 상자 · 사용 기간이나 기한 없음 · 사유 · 초기화 · 버튼 아래 결재 안내 상자), 오른쪽 숫자 타일 넷(전체 신청 · 결재 대기 · 사용 중 · 반려, 만료 — 누르면 거름, 반려 · 만료 타일은 숫자 아래 내역) · 내 신청 표(검색, 4건씩 쪽 — 두 카드 아래 끝이 같음, 반려 사유 · 철회는 상태 칸). 좁은 화면은 위아래. AI 흔적 없음 |
| 보안 운영자 | 권한 신청(1차 결재함) · 정책 관리 · 로그 감시 · 보안 현황(종합 대시보드 · 권한 변동 · 시스템 · 사용자) · 관리(계정 관리 · 권한 목록 · 기준 문서 · 큐 — 계정 · 역할 관리는 보안 운영자의 일). 질의는 메뉴가 아니라 오른쪽 아래 버튼의 팝업 (어느 화면에서든) |
| 보안 총책임자 | 위와 같은 메뉴, 첫 화면은 보안 현황 종합 대시보드. 1차 대신 최종 결재함. 메뉴 숫자 · 종은 최종 결재할 권한 신청만 (정책 · 로그 알림은 보안 운영자, 11/18). 계정은 보기만 (역할 변경은 알림 · 변경 이력으로 감독) |

---

## 3. 실행

Makefile은 11/5에 없앴음 — 컨테이너는 `docker compose`, CLI는 `./sentinel`, 시험 환경은 `python -m sentinelai.dev`, 화면은 `frontend/`의 `npm`.

| 명령 | 하는 일 |
|---|---|
| `docker compose up -d --build --wait` · `down` · `logs -f app` | **컨테이너로** 웹 + PostgreSQL 올리기 (http://localhost:8000) · 내리기(볼륨은 남음) · 웹 로그. 다른 컴퓨터에서 보려면 `.env`에 `SENTINELAI_WEB_BIND=0.0.0.0` (11/04). PostgreSQL만은 끝에 `postgres` |
| `./sentinel 명령` | 떠 있는 컨테이너 안에서 `python -m sentinelai 명령`. 터미널이 없으면(cron) `-T`로 붙음 |
| `./sentinel create-root --login 아이디 --name 이름 [--department 부서]` | 첫 루트 계정(보안 총책임자) — 한 번만. 비밀번호는 화면 표시 없이 입력 |
| `./sentinel import-snapshots 폴더 --node 이름` | 망이 막힌 노드의 `export` 파일 넣기 (폴더를 컨테이너로 복사해 넣음, 벡터 DB를 안 써서 웹이 떠 있어도 됨) |
| `./sentinel index --rebuild` | RAG 컬렉션을 비우고 권한 DB 의 기준 문서를 전부 새로 적재 (바뀐 문서만 맞추는 것은 웹이 뜰 때 · 화면에서 올릴 때 알아서 함) |
| `./sentinel monitor [--since 시각] [--until 시각] [--full]` | 로그 감시 1회 (cron 용, 웹이 꺼져 있을 때, `--full`이면 처음부터). 웹이 떠 있으면 웹 작업 큐와 따로 모델을 침. venv 에서는 `python -m sentinelai monitor` |
| `python -m sentinelai.dev setup [--reset]` | **로컬 시험 환경**을 `sentinelai_dev` DB · `.dev/`에 — 계정 `dev-root`(보안 총책임자 · 루트) · `dev-op`(보안 운영자) · `dev-user`(일반 사용자), 비밀번호 모두 `dev-pass-1234`, 첫 로그인 변경 없음. 시험용 권한 목록 7건. 예시 기준 문서(`data/example-regulations`)를 넣고 모델 서버에 닿으면 적재 |
| `python -m sentinelai.dev web [--check-min 5]` | 시험 환경으로 웹 (http://127.0.0.1:8001, `sentinelai_dev` DB, 모델 서버는 `.env` 그대로 — 진짜 웹과 함께 떠도 됨). 로그 감시 · 서버 점검은 `--check-min`분마다 |
| `python -m sentinelai.dev api-types` | 백엔드의 요청 · 응답 모델(Pydantic)에서 화면 타입 `frontend/src/shared/api/schema.ts` 를 다시 만듦 (Node 없이). **응답 모델을 고치면 같은 커밋에** — 안 돌리면 `tests/test_api_contract.py` 가 실패함 |
| `python -m sentinelai.dev api-check 주소 --login 아이디` | 떠 있는 서버의 실제 응답이 선언과 같은지 대조 (읽기만, 보안 운영자 이상 계정, 비밀번호는 화면 표시 없이 물음). 읽기 API 18개와 노드 상세 · 대화 한 건을 받아 어긋난 칸을 줄마다 적음. 선언을 바꾼 뒤나 새 환경에 올리기 전에. 로그 조회는 그 서버의 감사 기록에 조회로 남음 |
| `python -m sentinelai.dev test [pytest 인자]` | DB 시험 — `sentinelai_test` 에 시험마다 새 스키마를 만들고 지움. 뒤에 붙인 인자는 pytest 에 그대로 (예: `test -k ground -x`) |
| `python -m sentinelai.dev targets [up\|down]` | **진짜 수집** — podman compose로 점검 대상 컨테이너 2대(`target-weak`: 약한 설정 / `target-strict`: 잠근 설정)를 올리고 내림. 값은 `node/testenv/targets.env`(git 제외: `SERVER` · `KEY_WEAK` · `KEY_STRICT` · `INTERVAL`, 없으면 시험 환경 키로 만듦). SentinelAI를 바깥에 열지 않고(pasta `--map-host-loopback`) ufw가 실제로 켜짐(NET_ADMIN). 사용자 podman 소켓 필요. 10/20 시험: weak 위험 · strict 정상 |
| `npm ci` · `npm run dev` · `npm test && npm run typecheck && npm run lint` (`frontend/`) | 화면 개발 — npm 의존성(처음 한 번) · 개발 서버 http://localhost:5173 (`/api`는 컨테이너 웹 8000으로, 시험 웹이면 `SENTINELAI_API=http://127.0.0.1:8001 npm run dev`) · 시험 · 타입 검사 · 린트 |
| `npm run build` (`frontend/`) | 화면 빌드 → `sentinelai/web/static/` (**커밋**함 — 팀 서버에 Node · 외부망이 없어도 새 화면). 깨끗이 설치해(`npm ci`) 빌드한 뒤 `git status sentinelai/web/static`이 비면 커밋된 것과 같음 |

- venv 준비(처음 한 번): `python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && cp .env.example .env`. 팀 서버처럼 PostgreSQL 이 따로 있으면 `.env` 주소만
- 10/20에 CLI를 줄였음 — `config` · `models` · `search` · `ask` · `chat` · `index-policies` · `review-requests` · `ask-logs` 없앰 (11/5에 `ask` 를 질의 에이전트로 다시 붙임)
- **CLI 는 화면에 없는 일만** (11/9): 연결 확인 · 기준 문서 넣기 · 정책 관리 검토 · 서버 점검 · 위협 예측 · 질의는 화면에서 함 (`/api/health` · 기준 문서 · 작업 버튼 · 질의 팝업). 시험 환경의 예시 기준 문서는 `python -m sentinelai.dev setup` 이 넣음
- Milvus 컨테이너가 healthy 가 된 뒤 웹이 뜸. 시험 환경(`python -m sentinelai.dev`)도 같은 Milvus 의 `sentinelai_dev` 컬렉션을 써서 compose 의 milvus 가 떠 있어야 함

설정은 `.env` 한 곳. 코드에 주소 · 모델명을 하드코딩하지 않음. 두 환경 모두에서 동작해야 함.

| 환경 | `SENTINELAI_OLLAMA_BASE_URL` | `SENTINELAI_MODEL` (판정) | `SENTINELAI_QA_MODEL` (질답) |
|---|---|---|---|
| 팀 서버 | `http://210.117.182.197:11434` | `qwen3:14b` | `qwen3:14b` |
| 개인 맥 | `http://localhost:11434` | `qwen2.5:7b` | `qwen2.5:7b` |

- 판정 모델 = 권한 · 정책 · 로그 감시 판정, 질답 모델 = 정책 · 로그 질의. 나눈 이유 · 모델 비교는 §9
- 서버 주소가 설정 한 줄로 바뀌는 구조가 제안서의 "향후 사내 환경 이전" 요구에 해당함
- 9/27에는 맥에서 팀 서버로 접속되지 않았음 (8초 타임아웃)

---

## 4. 규칙

- ❌ `sentinelai/engine/` 수정 · 기준 문서를 코드 작업으로 고치기 (보안 운영자 이상이 화면에서 올리고 고치고 지움, 10/30 · 11/2 · 11/3, 원문은 11/6부터 권한 DB). 프롬프트(`sentinelai/context/prompts.py`)도 엔진 담당자와 상의 없이 안 바꿈
- ❌ 엔진 기능 재구현 · 엔진 타입을 대체하는 웹 전용 스키마
- ❌ 서버 주소 · 모델명 하드코딩 — 전부 `Settings`
- ❌ CDN · 외부에서 받는 웹폰트 · 외부 이미지 (외부망 차단 전제). 폰트는 파일을 빌드에 넣어 우리 서버가 줌 — Noto Sans KR(OFL, `@fontsource-variable/noto-sans-kr`, 11/16). 아이콘은 Lucide(ISC, 일부 Feather MIT) 선 모양을 `Icon.tsx` 에 옮겨 씀 — 라이선스 원문 `frontend/public/licenses/lucide.txt`(빌드에 함께 실림), 새 아이콘도 같은 세트에서 (11/17). 화면은 React + Vite, 빌드 결과를 커밋 (서버에 Node 불필요). 화면 소스를 고치면 `npm run build` 결과를 같은 커밋에. 스타일은 Tailwind v4 유틸리티. shadcn/ui 부품 등 새 의존성은 리디자인 때 정함
- ❌ 기준 문서(.md · .txt · .pdf · .xlsx, 보안 운영자 이상) 말고는 파일 업로드. PDF 는 글만, 엑셀은 고른 표만 조항 글로 꺼내 사람이 확인한 뒤 .txt 로 올림 — 원본은 남기지 않음 (11/13 · 11/16). pptx · docx · OCR 은 §8 7
- ❌ 정책 자동 수정 · 권한 자동 승인 — 결정은 사람이 함
- **화면 파일** (11/17): 여러 화면이 쓰거나 40줄이 넘을 때만 따로 파일. 되풀이는 화면 조각 `shared/ui/parts.tsx` · 클래스 묶음 `styles.ts` · 함수 `shared/lib/` 에 한 번. .tsx 에는 컴포넌트만 (린트 규칙)
- **화면 글**: 가운뎃점(·) 쓰지 않음 — 값 목록은 쉼표, 한 줄 정보는 간격(`Meta`)으로 나눔. 라벨 · 버튼 · 빈 화면은 몇 단어, 설명 문단 · 확인 창 글머리표 없이 화면만 보고 알게 함 (11/6 사용자 요청)
- ❌ 엔진 출력을 손으로 고치기 · 근거 없는 목업 데이터 · 사전 계산 답을 실시간처럼 보이는 연출 (10/8에 모두 걷어냈음)
- ❌ 여러 모듈을 한꺼번에 바꾸기 — 하나씩 바꾸고 확인. 막히면 우회하지 말고 사용자에게 보고
- DB · 로그인(ID/PW, 운영자 분리)은 10/11에 금지를 풀고 구현했음 — 더 이상 데모 아님
- **문서(md)**: 명사형 개조식 (~함 · ~했음). 한 줄 한 사실, 표와 같은 내용을 산문으로 되풀이하지 않음
- **커밋**: Conventional Commits `type: 한국어 요약` 한 줄, 50자 이내. 한 커밋에 한 타입 (`feat` · `fix` · `docs` · `style` · `refactor` · `test` · `chore`)
- **주석** (11/5 정리, 11/17 명사형으로): 핵심만 명사형으로 끝냄 (~것 · ~함 · ~용). 주석 때문에 코드가 길어지지 않게 한 줄. 코드 · 설정 파일에서 보기만으로는 알 수 없는 이유나 묶음 설명만. docstring도 한 줄. 날짜 · 경위는 주석에 적지 않고 §9에. 출력 타입(`engine/worker.py`)의 docstring은 모델에 그대로 들어가므로 판정 문구로 다룸

---

## 5. 판정 결과 — 기대와 현재

- "현재" = 9/27 개인 맥 `qwen2.5:7b` (정상 3 / 주의 8 / **위험 0**). 그때의 시연용 위험 예시 4건 · 예시 답 캐시는 10/8에 걷어냈음
- 10/8 팀 서버 `gpt-oss:20b` + 조항 검색: REQ-001 **위험** ✅ · REQ-002 정상 ✅. 정책 검토는 SWG-001 ↔ DLP-001(6.1) · FW-001(5.2)을 찾게 됐으나 실행마다 묶는 방식 · 건수가 달라짐 (6~10건). 전 건 재계산은 §8 2

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

- **RAG에는 기준 문서만 있음** (11/5). 조항은 청크 4개뿐이라 `top_k=4`가 전부를 가져옴. 예전엔 솔루션 규칙도 함께 있어 종류별로 따로 찾았음
- (Milvus Lite 를 쓸 때만) **Milvus Lite는 같은 프로세스에서도 동시에 열면 실패함** (`Open local milvus failed`). 서버를 띄우는 동안 자기 잠금을 풀어 두어, 두 스레드가 동시에 처음 열면 둘 다 파일 잠금을 잡으려 함 (10/20 자동 감시와 `/api/health`가 겹쳐 드러났음). `DocumentStore.store`가 잠금으로 한 번에 하나만 열고, 웹을 끌 때 `DocumentStore.close()`가 Milvus Lite 서버까지 멈춰 잠금을 풂 (클라이언트만 닫으면 안 풀림)
- **팀 서버는 부팅 순서 때문에 GPU 없이 돌 수 있음.** 10/6~10/11 내내 CPU로만 돌았음. `ollama ps`의 PROCESSOR가 CPU면 의심. 경위 · 조치는 §9
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
- 다음 시연 순서: 팀 서버 연결 → `docker compose up` → 화면 상단의 연결 상태 확인 → 정책 관리 검토(기준 문서 적재 포함)
- 판정 한 건에 1~3분이라 미리 돌려 둠. 결과는 AI 결과 DB에 남아 서버를 다시 띄워도 보임

---

## 8. 남은 일

1. **질의 에이전트 평가** — 11/5에 정책 · 로그 · 서버 질의를 질의 에이전트 하나로 합쳤음 (§2 질의). 남은 것: 평가 질문 15개(예전 예시 9 + 섞인 질문)를 `qwen3:14b`로 돌려 도구 선택 · 숫자 · 근거를 §9에, 근무 시간 밖 · 주말처럼 로그 도구가 못 거르는 조건, 도구 단계를 실시간으로 보여 주기(SSE)
2. **데이터를 다시 정하고 `qwen3:14b`로 전 건 판정해 §5와 대조** — 권한 신청 CSV는 지웠고, 정책 · 서버 현황 파일 읽기는 11/5에 뺐음. 실제 솔루션 정책이 오면 RAG에 올리는 길(화면 업로드 등)을 정하고 정책 관리 검토 · 로그 감시가 찾게 함
3. **DB · 로그인 · 권한 신청** — 구현 끝 (10/11~10/12). 권한 DB(신청 1건 = 1행: AI 판정 · 1차 · 최종 결재 · 회수), ID/PW 로그인, 계정 생성은 보안 운영자(11/17, 루트는 처음 설정 · 비상용), AI 결과 DB 분리(§9), 질의 기록(자기 것만). 결정 기록 전부는 보안 운영자 이상이 봄 (11/17, 예전엔 보안 총책임자만). 남은 질문은 §9 DB 설계
4. **알림** — 로그 감시 **위험**은 11/08에 웹(`web/notify.py`의 `RiskWatcher`)이 결과 DB를 지켜보다 결재 대기와 같은 Slack 채널로 보냄 (§9). 엔진의 자리(`Notifier`, `sentinelai/engine/worker.py`의 `_save_events`)는 쓰지 않음 — 엔진을 고치지 않으려고. 11/13에 예외 상황(계정 역할 변경 · 보유 권한 위험 · AI 위험 판정 승인 · 보안 설정 변경)도 같은 채널로 (`ExceptionWatcher`, §9). 11/15에 같은 채널 알림을 Teams 에도 (§9). 남은 것: 주의 · 서버 점검 위험 · 의심 점수를 알릴지, 엔진 쪽으로 옮길지(담당자와 상의). 결재 대기 알림은 11/04에 웹(`web/notify.py`)에서 Slack 채널로 보냄 (11/04 팀 결정: 채널, Slack 먼저) — 같은 채널을 쓰면 됨. 결재 결과는 같은 날 신청자 이메일로 (SMTP, 시연은 Gmail · 사내 이전 때 사내 SMTP). 계정 관리 화면의 이메일 칸은 리디자인 때 (그 전에는 `PATCH /api/users/{id}`)
5. **출력 · 매체 반출 조항 없음** — 로그 감시가 근거 없이 판정함. 절차서 14 · 17번(예외처리 · 매체 반출입) 원문 필요. 10/20 시나리오 B · D가 이 때문에 "정상"으로 나와 검토에서 빠졌음. **코드 규칙(출력량 · 시간대 · 새 계정)으로 올리지 않고 절차서 원문을 RAG에 넣기로 했음 (10/20).** 원문을 받으면 7번 경로로 넣고 시나리오로 다시 확인
6. **로그 감시 이력 화면** — 같은 사용자의 반복 주의 · 위험, 솔루션 · 행위별 추이, 마지막 감시 시각 · 판정 못한 로그. 데이터가 쌓이고 5번 조항이 들어온 뒤에 만듦
7. **문서 데이터 읽기** — 지금 `DocumentStore`는 `.md` · `.txt`만 적재. 글자가 든 PDF 는 11/13에, 엑셀(.xlsx) 표는 11/16에 화면에서 글을 꺼내 올리게 했음 (§9). 남은 것: pptx · docx, 스캔본 OCR. `data/example-regulations/보안 정책 관리 업무 프로세스.pptx`는 글자 없는 이미지 4장이라 OCR 필요. 5번 절차서도 이 경로로
8. **할루시네이션 검증** — 모델 출력이 근거와 맞는지 코드로 확인. 예: `sources`의 조항 번호 · 정책 ID가 실제 검색 근거에 있는지, 로그 질의 답의 숫자가 `summarize`와 같은지, 로그 조건(사용자 · 기간)이 질문에 있는 말인지. 어긋나면 알리거나 다시 시도. 10/11에 질문에 없는 기간을 채워 답이 틀린 적 있음 (§9)
9. **내부 상태 API** — 10/20에 `/internal/status`로 작업 큐 · 예약 · 판정 대기열을 화면과 분리했음. 남은 것: `/api/health`도 옮길지, 자동 감시가 연달아 실패하면 알릴지
10. **보안 대시보드** (10/21 TODO) — 권한 신청 · 정책 관리 · 서버 점검 · 로그 감시를 한눈에. 통계 메뉴(10/21)와 겹치지 않게, 운영자가 무엇을 결정하는 데 쓰는지부터 정함
11. **위협 미리 판정** (10/21 TODO) — 사고 전에 먼저 판정해 알림. 사용자 쪽은 의심 점수(10/22)를 만들었음. 남은 것: 의심 점수가 오를 때 알리기(4번과 함께) · 서버 쪽 예측. 입력(서버 점검의 바뀐 설정 · 로그 감시 추이 · 권한 신청 등)과 알림과의 관계는 아직 안 정함
12. **이번 범위 밖** — 실제 솔루션 API 수집(`sentinelai.sources`에 모듈 하나로 추가하고 `Sources`에 묶음). 로그가 외부 DB(Microsoft Sentinel 등)에 쌓이면 읽기만 하고 우리 DB에 안 쌓음. 그때 로그 질의 조건을 그 DB 쿼리(KQL 등)로 넘기고 로그 전체를 메모리에 읽는 `ask_logs`를 바꿈
13. **감사 기록 분석** (11/3 TODO) — 지금 감사 기록(로그인 · 결재 · 로그 조회 · 기준 문서 · 계정 · 노드 변경)은 쌓기만 하고 아무도 다시 읽지 않음. 이 기록을 전방위로 분석해 사람이 놓친 위협(예: 로그인 실패 몰림 · 한 사람의 몰아서 로그 조회 · 기준 문서 수정 직후 판정 변화 · 결재 패턴)을 찾아 알림(4번과 함께). 중간발표 보안 설계 슬라이드 5번 카드에서 나왔음. 구현 전까지 발표 · 문서에서는 "남김"까지만 말함
14. **퇴사 · 이직 · DLP 로그 묶기** (11/3 TODO) — 계정에 필드를 더함
    - ~~퇴사 · 이직(부서 이동)한 사람의 정보~~ → 11/3에 직무 · 퇴사일 · 이동 기록(`user_moves`)을 넣고 판정에 씀 (`main.sql`). 남은 것: 의심 점수 · 로그 감시에도 퇴사 · 이동을 넣을지, 퇴사일이 지나면 계정을 알아서 정지할지
    - DLP 로그와 묶어 등록할 수 있게 — 계정을 등록할 때 DLP 로그의 사용자 값과 함께 넣음. 지금은 로그 사용자 ID(`log_id`)가 계정마다 하나뿐이고 등록 뒤 계정 관리에서 따로 적음

---

## 9. 작업 메모 — 설정 값의 이유 · 결정 경위 · 측정

- 이유 · 경위 · 측정 결과는 주석 대신 여기에 적음 (11/5에 `NOTES.md`를 이 절로 합쳤음)
- 기준 문서와 섞지 않으려고 여기에 적음 (예전 docs/ 는 RAG 적재 폴더였음)

### DB 설계 (10/11~11/3, 11/5에 `design/`을 이 절로 합쳤음)

테이블 · 칸 · 트리거는 `sentinelai/db/main.sql` · `results.sql`이 단일 출처. 여기에는 결정만 둠.

- **두 DB** — 사람이 한 것 · 결재 흐름은 권한 DB(스키마 `main`), 그 밖에 AI가 만든 것은 AI 결과 DB(스키마 `results`). 보안 솔루션 로그는 어느 쪽에도 쌓지 않고 있는 곳(지금 CSV, 나중에 외부 DB)에서 읽음
  - 처음 이름은 Log DB — 로그를 따로 쌓지 않기로 해(10/12) 남은 것이 AI 결과뿐이라 이름을 바꿨음
  - 권한 신청 AI 판정은 권한 DB — 보안 총책임자까지 올라가는 결재 근거라 신청과 함께 남아야 함
  - 두 DB는 FK로 묶지 않음. 운영자 결정이 AI 결과 행을 `테이블/id` 문자열로 가리키고, 결정에 쓴 AI 등급은 사본으로 둠
  - AI 결과 DB는 쌓기만 함 (트리거가 고치기를 막음). 보관 기간 정리는 아직 없음 — 넣을 때 질의 기록은 지워도 되고, 운영자 결정이 가리키는 판정은 지우지 않음
  - 맥락은 DB를 모름. 데이터 계층 · 이슈어는 읽기만(수집 받기는 쌓음), 판정 저장은 워커가 `db.results` · `db.permissions`로
- **3단계 결재** — 일반 사용자 신청 · 1차 결재 전 철회 → 보안 운영자 1차 승인 · 반려 → 보안 총책임자 최종 승인 · 반려 · 회수. 업무 절차서(신청자 → 부서장 검토 → 정보보호 담당자 승인)에 대응. 감사자 역할 없음
  - 보안 운영자는 부서와 상관없이 결재하고, 결재자 이름 · 부서를 남김. 보안 운영자도 아무 권한이나 회수 가능 (가정)
  - 반려되면 끝 — 다시 하려면 새 신청. 신청 번호 `REQ-YYYYMMDD-NNN`
- **신청 1건 = 1행** (10/12) — AI 판정 · 1차 결재 · 최종 결재 · 회수를 한 행의 칸 묶음으로. 결재 순서 · 역할은 트리거가 강제
  - AI 판정은 신청이 들어오면 바로 백그라운드로, 못 끝낸 판정은 다음 시작 때 다시
  - AI 칸은 1차 결재 전까지만 바뀜 — 결재하면 굳어 보안 총책임자는 보안 운영자가 본 판정을 그대로 봄. 판정 없이 결재했으면 "AI 판정 없이 결재", 그 뒤 끝난 판정은 버림
  - 권한 DB를 계정과 신청으로 나누지 않음 — 트리거가 `users`를 봐야 함
- **계정** — 비밀번호 Argon2id(RFC 9106 권장 2: 64 MiB · t=3 · p=4, 로그인 약 50 ms), 길이 제한 없음(빈 비밀번호만 막음), 5회 실패 → 15분 잠금, 세션 2일(절대 만료)
  - 첫 루트는 서버 CLI(`./sentinel create-root`)로. 자기 가입 없음. 계정 생성 · 수정 · 역할 · 비밀번호 초기화는 보안 운영자, 루트는 처음 설정 · 비상용 (11/17, 아래 "관리 권한을 보안 운영자에게"), 루트 계정은 루트만 (다른 사람이 루트 비밀번호를 초기화하면 가로챌 수 있음). 자기 역할 · 활성은 못 바꿈
- **운영자 결정**(정책 관리 · 로그 감시)도 권한 DB (`review_decisions`) — 사람의 결정이라 결정자와 같은 DB
- **질의 기록은 자기 것만** (`GET /api/qa`). 전체 기록은 DB에만
- **PostgreSQL로 옮김** (11/3) — 한 DB에 스키마 둘(같은 DB여도, 다른 DB여도 됨, 연결마다 `search_path`). SQLite 데이터는 옮기지 않고 새로 시작했고, 마이그레이션 파일들의 최종 상태를 `main.sql` · `results.sql` 하나씩으로 합쳤음
  - 트리거 문장은 그대로 plpgsql 함수로. 쓰기 트랜잭션은 스키마마다 `pg_advisory_xact_lock`으로 하나씩 (신청 번호 매기기가 겹치지 않게)
  - 값은 SQLite 때와 같게 — 시각은 ISO 8601 문자열, 0/1 칸은 INTEGER. DB는 UTF-8 · C 로캘(문자열 정렬이 바이트 순)
  - 시험 DB(`sentinelai_dev` · `sentinelai_test`)는 `sentinelai/db/postgres-init.sql`이 PostgreSQL이 처음 뜰 때 만듦

**남은 질문**
1. 세션 무활동 만료(예: 30분)도 둘지
2. 회수 범위 — 보안 운영자를 자기가 1차 승인한 건으로 한정할지
3. ~~사용 기간이 끝난 권한은 `active_grants`에서 빠지기만 함~~ → 11/6 보안 현황 [권한 변동]에 알리고 사람이 [회수]로 기록함 (자동 회수 안 함)
4. 루트가 떠나면 다른 보안 총책임자에게 넘기는 절차(웹 밖)가 필요한지
5. 결재 이력 화면 — 보안 운영자는 자기 결재만 볼지 전체를 볼지
6. 도입 전부터 가진 권한 — 지금은 이 시스템에서 승인된 신청만 보유 권한으로 읽음. 옮겨 넣기(화면 · IAM 내보내기)와 결재 없이 넣는 기록 방법 (10/20)
7. 직무 분리 — 보안 운영자가 일반 사용자 비밀번호를 초기화하고 그 계정으로 신청한 뒤 스스로 1차 승인할 수 있음 (11/16 코드 검토). 11/17부터 운영자가 다른 계정을 보안 총책임자로 올릴 수도 있어(자기 역할은 못 바꿈) 최종 결재 자리도 만들 수 있음 — 역할 변경 · 운영자 이상 계정 만듦은 예외 알림 · 감사 기록에 남음. 막으려면 "최근에 그 신청자의 비밀번호를 초기화한 사람은 1차 결재 못 함" 트리거나 예외 알림

### 설정 값의 이유

#### 판정 모델 · 질답 모델 (10/11)
- `SENTINELAI_MODEL` — 판정: 권한 신청 · 재검토 · 정책 관리 검토 · 서버 점검 · 로그 감시 · 위협 예측 (워커)
- `SENTINELAI_QA_MODEL` — 질답: 질의 에이전트 (생각 켬, `Resources.qa_llm`)
- 나눈 이유: 판정은 오탐이 적어야 하고(정상을 정상으로), 질답은 빨리 답해야 함 — 요구가 달라 모델을 따로 고를 수 있게 했음
- `/api/health`는 두 모델을 모두 확인함
- 지금은 둘 다 `qwen3:14b` (아래 모델 비교)

#### `SENTINELAI_NUM_PREDICT` (10/11 4096 → 10/22 8192)
- `gpt-oss:20b`는 답하기 전에 길게 추론함. 1024이면 조항이 들어간 정책 검토에서 토큰을 다 쓰고 빈 출력(`done_reason=length`). 10/7 측정에서 약 2000 토큰 필요, 4096이면 끝났음
- 생각 단계를 켠 판정은 4096에서 3번 중 1번 빈 출력이라 8192로 올렸음 (아래 Qwen3.5 시험)

#### 데이터 위치 (10/08)
- `SENTINELAI_EVENTS_SOURCE`: 보안 솔루션 로그(Microsoft Sentinel 내보내기 등). 확장자(.csv · .json · .jsonl)로 읽는 방식을 고름. 권한 신청(`REQUESTS_SOURCE`)은 DB 신청으로, 솔루션 정책(`POLICIES_SOURCE`) · 서버 현황(`SERVERS_SOURCE`)은 11/5에 뺐음 — 코드 · `.env.example` 에 없음 (11/15)
- `SENTINELAI_RESULTS_DB_PATH`: AI 결과 DB (SQLite, 11/03에 PostgreSQL로 옮김). 정책 관리 검토 · 로그 감시 판정 · 질의 기록. CLI와 웹이 함께 쓰고 웹을 다시 띄워도 결과가 보임. 10/12까지는 `SENTINELAI_RESULTS_PATH`(JSON 파일)
- `SENTINELAI_DB_PATH`: 권한 DB (SQLite, 11/03에 PostgreSQL로 옮김). 계정 · 신청 · 결재 · 운영자 결정
- (11/03) 둘 다 PostgreSQL 스키마로 옮김 — 권한 DB = `main`, AI 결과 DB = `results`. 설정 이름은 그대로 두고 값만 PostgreSQL 주소 (엔진 `Settings`를 고치지 않으려고)

---

### 팀 서버 GPU (cilab-5070-server, 10/11)

- **증상**: 모든 모델이 GPU 0% — Ollama가 CPU로만 돌았음. `num_gpu 999`로 1.1GB 모델을 올려도 VRAM 0
- **원인**: 부팅 순서. Ollama는 시작할 때 한 번만 GPU를 찾음

| 시각 (KST) | 일 |
|---|---|
| 10/6 02:36:03 | 부팅 |
| 10/6 02:36:17 | `ollama serve` 시작 — `/dev/nvidia*`가 없어 GPU를 못 찾음 |
| 10/6 08:01:08 | `/dev/nvidia0` 생성 (Persistence Mode 꺼짐 → 처음 쓸 때 만들어짐) |

- GPU(RTX 5070 12GB, 드라이버 595, CUDA 13.2) · Ollama 0.21.2의 CUDA 라이브러리 · 장치 권한 · 서비스 환경 변수는 모두 정상이었음
- **조치**: `sudo systemctl restart ollama` → GPU 사용 확인 (`gpt-oss:20b` 78%가 VRAM에)
- **재발 방지**: `/etc/systemd/system/ollama.service.d/override.conf`

```ini
[Unit]
Wants=nvidia-persistenced.service
After=nvidia-persistenced.service

[Service]
ExecStartPre=+/usr/bin/nvidia-smi
```

- `nvidia-persistenced`는 `[Install]`이 없어 `enable`이 안 되고 `StopWhenUnneeded=true`라 아무도 원하지 않으면 꺼짐 — 그래서 Ollama 쪽에서 `Wants=`로 끌어옴
- `systemctl edit`에서 `### Edits below this comment will be discarded` 아래에 쓰면 버려짐 (첫 시도가 그랬음)
- 다음 재부팅 뒤 `ollama ps`의 PROCESSOR에 GPU가 나오는지 확인할 것
- **접근**: Tailscale SSH는 `hsyang` 계정만 (`maka`는 정책상 거부). sudo는 비밀번호 필요. `journalctl -u ollama`는 `hsyang`이 못 읽음 (`adm` · `systemd-journal` 그룹 아님)

---

### 모델 비교 (10/11, 팀 서버 GPU)

방법: 기준 문서를 직접 넣고(벡터 DB 없이) 권한 판정 4건(REQ-001 · 005 위험, REQ-002 · 006 정상) · 정책 검토 1회 · 로그 조건 추출 2건. 각 1회, `num_predict` 4096.

| 모델 | VRAM | 권한 판정 | 정책 검토 (6항목) | 로그 조건 | 시간 |
|---|---|---|---|---|---|
| gpt-oss:20b | 78% | 4/4 | 5/6 (FW-006 놓침) | 무난 | 판정 11~31초 · 정책 90초 · 조건 31초 |
| gpt-oss:20b (reasoning low) | 78% | 3/4 (REQ-006 → 위험) | 6/6 (FW-004↔005 종류 틀림) | 없는 사용자 조건을 지어냄 | 판정 8~12초 · 정책 24초 |
| qwen3-coder:30b | 58% | 3/4 (REQ-006 → 주의) | 2~3/6, 같은 항목 반복 | 가장 깔끔 | 판정 7~17초 · 정책 50초 · 조건 3초 |
| gemma4 | 100% | 2/4 (REQ-002 → 주의) | 5/6 | 부서를 "재무, 전략"으로 묶어 검색 실패 | 판정 11~20초 · 정책 23초 |

- CPU 때와 비교: `gpt-oss:20b` 권한 판정 60~200초 → 11~31초
- 거의 모든 모델이 로그 조건의 기간을 "지금 있는 로그의 처음~마지막 시각"으로 좁혔음 — 로그가 많아지면 틀린 집계 → 프롬프트 보완 필요

**3회 반복** (권한 판정 4건 × 3회)

| 모델 | VRAM | 권한 판정 12회 | 정책 검토 (6항목) | 로그 조건 | 시간 |
|---|---|---|---|---|---|
| **qwen3:14b** | 100% | **12/12**, 흔들림 없음 | 5/6 (FW-006 놓침, FW-004↔005를 처음으로 "충돌"로 맞힘) | 날짜 질문은 하루 범위로 정확. 예외 질문은 기간을 로그 범위로 좁힘 | 판정 9~20초 · 정책 40초 · 조건 6~9초 |
| gpt-oss:20b | 78% | 10/12 — REQ-006이 정상 · 주의 · 위험으로 흔들림 (위험 오탐 1회) | 6/6 (FW-004↔005는 "중복"으로) | 무난 | 판정 11~46초 · 정책 63초 · 조건 30~39초 |
| exaone3.5:7.8b | 100% | 6/12 — 위험 없이 주의로 몰림 | 2/6, 엉뚱한 쌍을 중복으로 묶음 | 날짜 질문에서 기간 빠뜨림 | 판정 4~7초 · 정책 14초 · 조건 1초 |

- **결정: 판정 · 질답 모두 `qwen3:14b`로 바꿨음.** 오탐 없음(12/12) · VRAM에 전부 적재 · 2배 이상 빠름. 정책 검토에서 FW-006(만료)을 놓치는 점은 지켜봄
- exaone은 시험만 했음 — 빠르지만 `qwen2.5:7b`처럼 등급이 "주의"로 몰림
- 표본이 작음 (권한 4건 · 정책 1회). REQ-003 · 004 · 007 · 008과 실제 로그로는 아직 안 재 봤음

**`qwen3:14b`로 바꾼 뒤** (10/11)
- 로그 감시 판정 2명 39초 (예전 CPU의 gpt-oss는 한 명에 70~150초). 판정 실패 0
- 로그 질의 9~15초. 처음엔 "예외 처리된 출력"을 없다고 틀렸고 원인 둘을 고쳤음
  - 모델이 질문에 없는 기간을 로그의 첫 · 마지막 시각으로 채움 → 조건 추출에 넘기는 값에서 첫 · 마지막 시각을 뺐음 (현재 시각은 따로 넘김)
  - `between`의 since가 "초과"라 그 시각의 로그가 빠짐 (감시의 이어서 판정에는 맞는 동작) → 질의에서는 `include_since=True`로 "이상"
- 남은 약점: "홍길동이 몇 번" 질문에서 사용자 조건을 빠뜨림 (답은 맞혔지만 근거 로그 건수가 틀리게 보임). 답에 `**굵게**`가 남음 — 조건 추출 프롬프트 보완 후보

---

### Qwen3.5 시험 — `qwen3:14b` 유지 (10/22)

팀 서버 Ollama를 0.40.8로 올려 Qwen3.5를 받았음 (0.21.2는 "newer version" 거부). 같은 GPU · main 판정 흐름, 권한 신청 CLAUDE.md §5의 8건 + 로그 7묶음 (기대: A 박민수 위험 · B 최지훈 주의 이상 · C 정다은 주의 · D 이준호 주의 이상).

| 모델 (생각 켬) | 크기 | 권한 신청 | REQ-002 · 004 | 로그 A · B · C · D | 평범한 김수영 | 판정 1건 |
|---|---|---|---|---|---|---|
| `qwen3:14b` (이전) | 9.3GB | 6/8 | ✅ ✅ | 위험 · 위험 · 위험(과함) · 정상 ❌ | 주의 | 22초 · 로그 31초 |
| `qwen3:8b` | 5.2GB | 5/8 | **❌(주의)** ✅ | 위험 · 위험 · 정상 ❌ · 정상 ❌ | 정상 | 25초 · 29초 |
| **`qwen3.5:9b`** | 6.6GB | **6/8** | ✅ ✅ | 주의(약함) · 주의 · 정상 ❌ · 정상 ❌ | 정상 | 23초 · 28초 |
| `qwen3.5:4b` | 3.3GB | 5/8 (형식 오류 1) | ✅ ✅ | 위험 · 주의 · 위험(과함) · 정상 ❌ | **위험** | 28초 · 27초 |

- **결정: `qwen3:14b` 유지.** `qwen3.5:9b`가 가장 나은 대안 — 권한 신청은 14B와 같고(틀린 것도 003 · 006으로 같음) GPU를 2.7GB 덜 씀. 그러나 로그 감시가 약하고(A를 주의로, C를 놓침) 생각 단계 때문에 출력 한도 · 질답 설정을 따로 손봐야 함. GPU 메모리를 아껴야 할 때의 첫 대안으로 둠
- D(처음 보는 외주 계정)는 모든 Qwen이 놓침 — 기준 문서에 조항이 없어서 (CLAUDE.md §8 5)
- GPU에서는 크기를 줄여도 판정 시간이 거의 같음 (20~30초). 얻는 것은 GPU 메모리 여유
- **생각 단계**
  - 끄면 판정이 2~4초로 빨라지지만 정확도가 무너짐 (`qwen3.5:9b` 4/8 · `qwen3:14b` 3/8, 로그는 거의 다 위험) → 판정은 켜 두고 출력 한도를 8192로 올렸음
  - qwen3.5 질의는 생각을 켜면 130~150초 뒤 빈 출력 · 파싱 실패 → 질답만 끄는 방법(`SENTINELAI_QA_THINK=0`, 같은 모델이어도 질답용 연결을 따로) · 끈 질의는 정책 · 로그 · 서버 1~3초
  - `qwen3:14b`(Ollama 0.40.8)는 질답 생각을 꺼도 시간 · 답이 거의 같음 (정책 13 → 9초, 로그 2초, 서버 4초) → 질답만 끄는 설정은 넣지 않았음. qwen3.5로 바꾸면 그때 넣음 (`ChatOllama(reasoning=False)`)
- **로그 질의 버그**: "재무 정다은이 출력을 몇 번 했어?"를 `qwen3:14b`가 사용자 칸이 아니라 항목(`keyword`)에 넣어 **0회로 틀리게 답함** (실제 23회). `qwen3.5:9b`는 사용자를 아예 빠뜨림 (숫자는 사용자별 집계라 맞지만 근거 로그가 전체로 넓어짐)
- 표본 15건뿐. 실제 신청 · 로그가 쌓이면 다시 견줌

---

### 로그 감시 이중 큐 — 빠른 감시 + 정밀 감시 (10/22)

- **이유**: 로그 감시는 실시간 응답이 중요함. 생각하는 `qwen3:14b`는 묶음당 약 30초라 30분 주기면 위험 행위가 뜨기까지 30분 넘게 걸림. 생각을 끄면 묶음당 2~7초지만 정확도가 무너짐 (권한 신청 6/8 → 3/8, 로그 7묶음을 거의 다 위험) → 둘을 나눴음
- **빠른 감시**: `SENTINELAI_FAST_INTERVAL_MIN`(5)분마다 같은 모델에 생각 단계만 끈 연결(`ChatOllama(reasoning=False)`)로 새 로그만 → "1차 판정". 따로 도는 작업 큐(`Engine.fast`)라 다른 작업을 기다리지 않음. 시작점은 지난 빠른 감시와 정밀 감시 중 늦은 쪽
- **정밀 감시**: `SENTINELAI_MONITOR_INTERVAL_MIN`(30)분마다 생각하는 판정 모델로 확정. 그 구간의 1차 판정은 목록에서 빠짐 (AI 결과 DB에는 `monitor_runs.stage = fast`로 남음)
- 1차 판정은 운영자 결정 · 통계 · 의심 점수에 넣지 않음 — 같은 로그를 정밀 감시가 다시 판정하므로 세면 겹침. 종 배지에는 뜸 (빨리 알리려는 것이므로)
- **10/22 시험** (진짜 DB 복사본, 빠른 감시 1분): 로그에 영업 최지훈의 고객 개인정보 300장 · 예외 승인 3줄을 더하자 다음 빠른 감시가 **약 15초 만에 위험(1차)** 으로 올렸음 — 로그를 쓴 뒤 1분 남짓
- 빠른 판정은 주의 · 위험을 많이 걸 수 있다는 점을 패널에 적었음
- 진짜 실시간(들어오는 즉시)은 판정 속도보다 로그를 받는 방식에 달림 — 지금은 내보낸 파일을 주기적으로 읽음

---

### 사용자 의심 점수 (10/22)

- **목적**: 앞으로 위협이 될 사람을 먼저 고름. 이미 받은 판정만 세면 판정 모델이 정상으로 놓친 사람(10/20 시나리오 B 주말 새벽 대량 출력 · D 처음 보는 외주 계정)은 끝내 안 걸림
- **방법**: 로그 원본의 행동 변화를 코드가 세고(`sources/logs.py`), 판정 모델이 그 신호와 판정 · 신청 기록을 함께 보고 0~100을 냄
- **같은 날 바꾼 것**: 처음엔 100점에서 깎는 규칙 신뢰 수치(`data/trust.py`)였음. 이미 받은 판정을 세는 과거형이라 예측 목적에 맞지 않아 의심 점수로 바꿨음 (감점표 · 구간은 `71b6b33`, 바꾼 것은 `96b0ecc`)
- **행동 신호** (최근 7일 vs 앞 4주, 서버 현지 시각)
  - 하루 양(숫자 칸 합 — 출력 장수 등, 없으면 건수)의 배율
  - 근무 시간 밖(평일 8~19시 밖 · 주말) 비율 · 예외 승인 비율
  - 민감 문서(파일 이름에 급여 · 인사 · 개인정보 · 계약 · 고객 · 설계 · 소스 등)
  - 30분 안 최대 건수 · 처음 보는 계정(첫 로그 7일 안)
  - 눈에 띄는 값은 문장(highlights)으로 모델 입력 · 화면에 함께 씀
- 10/20 결정(로그 감시는 출력량 · 시간대 · 새 계정 같은 코드 규칙으로 올리지 않고 절차서 원문을 RAG에)은 그대로 — 그건 정책 위반 판정이고, 의심 점수는 먼저 살펴볼 사람을 고르는 예측이라 역할이 다름 (10/22 사용자 결정)
- 프롬프트: 부서 업무에 맞는 행동(인사팀의 인사 문서)은 의심을 낮춤. 계정 · 로그 사용자 ID가 비어 있는 것은 운영 설정일 뿐 의심 근거가 아님 (처음에 모델이 "계정 없음"을 근거로 삼았음)
- 등급은 모델이 적지 않고 점수로 코드가 정함 (높음 70 이상 · 보통 40~69) — 점수와 등급이 어긋나지 않게
- 계정과 로그 사용자는 계정의 `log_id`(보안 솔루션 로그의 UserID)로 이음. 이름 · 부서 표기가 달라(로그 "재무 정다은" ↔ 계정 "재무팀 · 정다은") 자동으로 맞추지 않고 보안 총책임자가 계정 관리에서 적음
- **10/22 결과** (`qwen3:14b` 생각 켬, 진짜 DB 복사본 9명, 사람당 15~25초, 합계 170초): 박민수 · 최지훈(B) · 이준호(D) 85 높음, 정다은(C) 82, 김수영 · 홍길동 75, 인사 이영희 65 보통, 로그 없는 계정 40 · 30. 판정 모델이 놓쳤던 B · D가 높음으로 올라왔음. 합성 로그에 위험 시나리오가 몰려 대부분 높게 나옴 — 실제 로그로 다시 봄

---

### 화면 React 이식 (10/29)

- 옛 `index.html` 한 파일(2,751줄)을 `frontend/`(TypeScript · Vite · TanStack Query · Vitest)로 기능 · 모양 그대로 옮겼음. 옛 파일은 화면을 바꾼 커밋 `08b7d0f`의 바로 앞 (`git show 08b7d0f^:sentinelai/web/static/index.html`). 리디자인은 다음 단계
- **빌드 결과를 커밋하는 이유**: 팀 서버에 Node가 없고 외부망도 막힐 수 있어 서버에서 빌드할 수 없음. 웹은 커밋된 파일을 그대로 서빙. `npm ci && npm run build` 뒤 `git status sentinelai/web/static`이 비어 있으면 커밋된 것과 같음
- **옮기며 정한 것**
  - 기능(메뉴)별 폴더 (FSD 아님 — 메뉴 하나가 폴더 하나라 찾기 쉬움)
  - 라우터 없음 (URL 상태가 없고 `StaticFiles`가 깊은 경로 새로고침을 404로 냄)
  - TanStack Query 기본값에서 창 포커스 · 재접속 재요청과 재시도를 끔 (`/api/logs`는 조회마다 감사 기록을 남김)
  - 옛 CSS를 클래스 이름 그대로 영역별 파일로 나눔 (Tailwind는 리디자인 때)
- **확인 방법**: 옛 화면(`127.0.0.1:8001`)과 새 화면(`localhost:5173`)을 같은 백엔드에 붙여 Playwright로 같은 조작을 하고 화면 글자를 견줬음 (세 역할 · 1440 · 390px). 쿠키가 호스트별이라 두 세션이 따로 감
- **이식 뒤 정리**: 20줄 미만 파일이 셋 중 하나라 읽기가 끊겨 합쳤음 (소스 105 → 83개). 역할이 섞인 폴더(`app/ui` 등)는 역할별 하위 폴더로 나눴음

---

### 화면 스타일 Tailwind 전환 (10/29~10/30)

- **왜**: 리디자인 1단계 — 옛 CSS 18개 파일 469줄, 전역 클래스 163종, 불러오는 순서가 곧 우선순위라 고치기 어려웠음. 업계에서 많이 쓰는 조합으로 바탕을 바꾸고 화면은 그대로 둠. 배치 · 색 · 컴포넌트는 2단계
- **정한 것**
  - Tailwind v4 (설정 파일 없이 `app/styles.css`의 `@theme`), `clsx` + `tailwind-merge`(`cn()`), shadcn/ui는 바탕(`components.json` · 색 변수)만
  - 값은 바꾸지 않음 — 색은 같은 값으로 토큰화, 간격은 4px 단위 표준 이름(`gap-4.5` = 18px), 글자 크기는 임의 값 그대로
  - shadcn의 `--radius`(8px)를 `@theme`에도 둠 — Tailwind 기본 테마에 옛 `--radius: 0.25rem`이 남아 있어 편집기 확장이 둥근 모서리 값을 4px로 잘못 계산했음
  - preflight를 켬 (2단계 shadcn이 전제함). 브라우저 기본값에 기대던 배치(제목 굵기 · 버튼 · 입력 칸 여백 · 인라인 SVG · 글머리표)는 요소마다 명시, 브라우저가 그리는 부분(placeholder 색 · 날짜 칸 안쪽 · 쓸 수 없는 칸의 흐림 · 글상자 크기 조절)은 `revert`로 기본값 그대로
  - 반응형은 옛 `max-width` 그대로 `narrow`(1150px) · `phone`(760px) 변형
  - 최종 검토(스크린샷 밖의 조건)에서 옛 동작으로 되돌린 셋: 고르기 칸 묶음 이름(optgroup) 굵기, 터치 기기의 hover(Tailwind 기본은 마우스 기기에서만), 간격 단위 px(Tailwind 기본 rem은 브라우저 기본 글자 크기를 키우면 여백만 커짐)
  - 지원 브라우저 하한이 Firefox 114 → 128로 올라감 (Chrome · Edge 111, Safari 16.4는 그대로)
- **확인**: 옛 번들(`69c4cd3`의 `static/`)과 새 번들을 같은 서버 · 데이터에서 번갈아 띄워 Playwright 스크린샷을 픽셀 비교(문턱 0)
  - 84개 상태 — 세 역할 × 1440 · 1151 · 1150 · 761 · 760 · 390px, hover · focus · 펼친 표 · 서랍 · 툴팁 · 모달 · 빈 목록
  - 시험 데이터에 없는 상태(실패한 답 · 지금 가진 권한)는 응답을 가로채 만들어 비교
  - 모두 0px, 화면 글자 비교 8개 흐름도 같음. 비교 도구는 이번 한 번용이라 저장소에 넣지 않음
- **옛 화면 그대로 둔 것**: 좁은 화면에서 [표로 보기]를 펼치면 화면이 가로로 넓어짐

---

### 기준 문서 올리기 (10/30)

- 보안 총책임자가 화면(관리 → 기준 문서)에서 `docs/`에 .md · .txt 를 올림. 사용자가 필요한 기능으로 정해 CLAUDE.md §4 의 "파일 업로드 금지 · docs/ 수정 금지"를 이 기능에 한해 풀었음
- 엔진은 고치지 않음 — 웹(`api_regulations.py`)이 `Engine.index`(바뀐 파일만)만 부름. 적재가 실패하면 올린 파일을 지움. 다른 작업이 돌거나(409) 임베딩 모델에 닿지 않으면(503) 올리지 않음
- **지우기는 같은 날 뺐음 → 11/3에 다시 붙였음**: 처음엔 엔진에 문서 하나만 RAG 에서 빼는 기능이 없어, 지우려면 컬렉션을 비우고(rebuild) 다시 적재한 뒤 정책 관리 검토를 다시 돌려야 했음(솔루션 정책 규칙도 함께 지워져서). 11/3에 `DocumentStore.remove`(그 파일 이름의 조각만 지움, 규칙 묶음은 안 건드림) · `Engine.remove_document`를 더했음. 마지막 문서는 지우지 않음 — 판정 근거가 없어지고 빈 `docs/`는 적재가 실패함. 지운 원문은 고치기처럼 감사 기록 `detail.before`에
- **고치기는 11/2에 붙였음**: 같은 이름 파일의 내용이 바뀌면 `Engine.index`가 해시를 비교해 그 문서의 예전 조각만 지우고 새로 넣으므로(`DocumentStore._replace`) 엔진을 고치지 않아도 됨. 지난 판정이 고치기 전 조항을 근거로 했으므로 고치기 전 원문을 감사 기록 `detail.before`에 남김 (보관 폴더를 `docs/` 안에 두면 엔진이 하위 폴더까지 읽어 적재해 버림). 실수 방지는 사유 · 파일 이름 입력 · 확인 창
- **작업 중 올리기 · 고치기는 기다렸다가 적용 (11/2)**: 처음엔 AI 작업이 돌면 409로 거절했는데, 시험 서버는 자동 작업이 5분마다 돌아(위협 예측 한 번 3분 남짓) 거의 늘 막혔음. 엔진 작업 큐에 일을 끼워 넣는 공개 기능이 없어 웹이 2초마다 쉬는지 보다가(최대 10분) 바로 적재함. 쉬는 걸 본 직후 자동 작업이 시작되면 적재(수 초)와 겹칠 수 있음 — 엔진에 끼워 넣기 기능이 생기면 그쪽으로 옮김. 11/2 시험: 위협 예측 중 고치기 → 208초 기다린 뒤 적용
- **기다리는 중 [취소]**: 화면이 요청을 끊으면(AbortController) 서버가 2초마다 · 적재 직전에 `request.is_disconnected()`를 보고 멈춤 (그래서 올리기 · 고치기는 async). 화면은 끊은 뒤 문서를 다시 받아 실제로 안 바뀌었는지 보고 알림. 11/2 시험: 위협 예측 중 직접 · 개발 서버 프록시 거쳐 각각 4초 뒤 끊음 → 작업이 끝난 뒤에도 적용 안 됨
- 서버에서 올린 문서는 그 서버의 git 작업 트리에 새 파일로 남음 (`docs/`가 저장소 안에 있음)


### 운영자 결정 이어받기 (11/2)

- 결정은 판정 한 건(`node_findings/{id}` · `policy_issues/{id}`)에 붙어, 노드가 새 수집을 보내거나(기본 30분) 정책 관리 검토를 다시 돌리면 같은 문제도 새 판정이라 결정 없음이 됐음 → 메뉴의 "처리할 일" 숫자가 같은 문제로 계속 되살아남
- 웹(`/api/results`)이 결과가 그대로인 새 판정에 지난 결정을 이어 붙임. 같다 = 서버 점검은 노드 · 등급 · 정책과 다른 곳(항목 · 등급, 정상 항목 제외), 정책 문제는 유형 · 등급 · 정책 ID. 권한 DB의 결정 기록은 그대로(새 행을 쓰지 않음)
- 그 판정에 자기 기록(취소 포함)이 있으면 잇지 않음 — 이어진 결정을 취소하면 정말 결정 없음이 되게
- 로그 감시는 판정마다 새 로그 구간이라 잇지 않음. 한계: 모델이 같은 문제를 다른 말 · 다른 항목 이름으로 내면 다른 결과로 봄

### 작업 강제 중지 · 다시 돌리기 (11/3)

- **이유**: 작업 큐는 한 번에 하나라, 모델 서버가 응답하지 않으면 작업이 끝나지 않고 정책 관리 검토 · 서버 점검 · 기준 문서 적재가 모두 막힘. 그동안은 웹을 다시 띄우는 것 말고 방법이 없었음
- **방법**: `JobRunner`가 작업마다 번호(generation)를 매기고 `reset()`이 번호를 올리며 큐를 바로 비움. 돌던 스레드는 밖에서 멈출 수 없어 다음 진행 보고 때 `JobCancelled`로 멈추고, 상태 · 결과를 덮어쓰지 않음
- **한계**: 진행 보고는 판정 한 건이 끝날 때라 돌던 모델 호출 한 건은 이어짐 (다시 돌린 작업과 잠깐 겹칠 수 있음). 한 건씩 쌓는 서버 점검 · 위협 예측은 끝난 것이 남고, 끝에 한 번에 쌓는 로그 감시 · 정책 관리 검토는 남는 것 없이 다음 실행이 같은 구간을 다시 판정함
- 보안 총책임자만 (감사 기록 `jobs_reset`). 화면은 작업 버튼 옆([정책 관리 검토 실행] · [지금 점검] · [지금 예측])에 작업이 돌 때만 [강제 중지 · 다시 돌리기]. API는 다시 돌리지 않고 끝내기만도 됨(`rerun: false`)
- 11/3 시험: 가짜 엔진으로 끝낸 스레드가 판정 중이던 한 건 뒤 멈추고 새 작업은 처음부터 끝까지 돌았음. 시험 웹에서 위협 예측 중 화면으로 눌러 다시 시작됨을 확인

### 권한 판정에 직무 · 사유 · 기간, 퇴사 · 이동 재검토 (11/3)

- 이유: 제안서의 권한 적정성은 "부서 · 직무 · 기존 권한 · 신청 권한"을 봄. 판정은 부서 · 권한만 보고 신청 사유 · 사용 기간을 보지 않았음 (사유는 11/2에 필수로 만들었으나 결재자만 봤음)
- 신청 판정(`ACCESS_REVIEW`): [신청 사유] · [사용 기간] 칸을 더하고, 신청자 칸에 직무 · 신청 전 90일 안의 이동을 적음. 사유가 직무에 맞는지, 기간이 사유에 비해 길거나 끝이 없지 않은지, 옮긴 사람이 예전 업무 권한을 이어 가려는지 보게 함. 직무 · 사유가 비면 이유에 밝히게 함
- 이직 = 사내 부서 · 직무 이동으로 정했음. 회사를 떠나는 것은 퇴사로 따로
- 퇴사: 퇴사일이 지난 사람의 보유 권한은 모델 없이 코드가 바로 위험 · 회수 권고. 남은 권한이 있다는 사실만으로 판단이 끝나서 모델이 할 일이 없음
- 이동: 권한마다 모델 판정(`GRANT_REVIEW` — 새 업무에 필요하면 정상, 불분명하면 주의, 예전 업무에만 필요하면 위험). `grant:신청번호:이동 id`로 큐에 들어감 (11/5부터 통합 잡 큐, 권한 신청과 같은 우선순위)
- 재검토는 신청 행의 AI 칸에 쓰지 않고 `grant_reviews`에 쌓음 — AI 칸은 1차 결재 뒤 트리거로 굳고, 결재자가 본 판정을 바꾸면 안 돼서
- 비어 있던 부서 · 직무를 처음 채우는 것은 이동으로 치지 않음 — 직무 칸이 새로 생겨 기존 계정이 모두 빈 값이라, 채울 때마다 전 권한이 재검토되면 안 돼서
- 회수는 자동으로 하지 않음 (★ 원칙: AI는 근거와 등급만)
- 한계: 직무별 필요 권한을 적은 기준 문서가 없어 모델이 상식으로 판단함 (직무 기준 문서를 올리면 조항 검색이 찾음)

### 판정에 사용자 기록 (11/3)

- 요청: 사용자가 관여한 AI 판정은 그 사람의 데이터를 모두 읽어 판정 — 대표적인 최근 위협 기록은 15건 정도만
- 넣은 판정: 권한 신청 · 보유 권한 재검토 · 정밀 감시 · 위협 예측. 빠른 감시는 넣지 않음 — 묶음당 수 초여야 1차 판정이 빨리 뜸
- 10/20 결정(로그 감시는 기준 문서로만)을 "근거는 기준 문서, 사용자 기록은 맥락"으로 고쳤음. 프롬프트에 어긋남의 근거는 조항 · 정책으로 대라고 적음
- 사람이 정한 것만 넣음: 계정 · 이동 · 결재 · 반려 의견 · 회수 사유 · 운영자 [조치] 결정. 로그 감시 등급 · 의심 점수 · 신청 AI 등급은 뺌 — 예전 AI 판정이 다음 판정의 근거가 되면 한 번 찍힌 사람이 계속 찍힘
- 위협 예측도 같은 기록을 쓰게 바꿨음. 전에는 35일 안 정밀 감시 판정(AI 등급)과 신청 AI 등급을 넣었음. 화면의 기록 칸(로그 위험 · 주의 수 등)은 그대로
- 위협 기록은 코드가 고름: 예외 승인 · 민감 문서 · 근무 시간 밖 표시가 붙은 로그를 최근 것부터, (솔루션 · 행위 · 표시) 종류마다 돌아가며 뽑아 같은 출력 수십 건이 다른 기록을 밀어내지 않게 함
- 길이: 기록 두 칸이 사람당 약 2,600자(연습용 로그 48줄인 사람). `num_ctx` 8192에서 정밀 감시는 묶음 로그 · 조항 · 규칙과 함께 들어감 — 묶음이 크면 모자랄 수 있음, 실제 로그가 오면 다시 잼
- 감사 기록(로그인 실패 등)은 넣지 않았음 (§8 13번과 함께 정함)

### 확인할 사람 (11/3)

- 요청: 퇴사 · 이직 · 직무 이동이 있거나 신청 · 보유 권한이 위험 · 적절치 않은 사람을 따로 보여 줌
- 자리: 권한 신청 메뉴의 탭 [확인할 사람] — 결재 · 회수를 하는 곳과 같은 메뉴라 [신청 보기]로 바로 그 신청 패널로 감. 통계의 사용자 위협(의심 점수, 앞으로의 위협 예측)과는 다름 — 여기는 지금 손볼 권한
- 코드가 셈 (모델 없음): 퇴사일 · 이동 기록 · 결재 중 신청의 AI 판정 · 보유 권한의 재검토 · 승인 때 AI 판정
- 화면 표시라 예전 AI 판정도 씀 — 판정 입력에서 AI 등급을 뺀 것(11/3 "판정에 사용자 기록")과 다름. 사람이 보고 정하는 목록이라 되먹임이 없음
- 지난 퇴사 · 이동은 90일(`WATCH_DAYS`) 뒤에는 남은 권한 · 활성 계정이 있을 때만 남김 — 지난 일이 쌓여 목록이 묻히지 않게
- 승인 때 AI 위험 · 주의였던 보유 권한도 넣음 — 사람이 승인했어도 "가진 권한이 위험"에 해당해서. 많아지면 빼거나 거르기를 둘지 다시 봄
- 11/17 탭을 없앰 (사용자 결정) — 이동 · 재검토는 [권한 변동], 결재 중 신청은 결재 대기 탭과 겹쳐서. 퇴사는 [권한 변동]이 `/api/people` 에서 가져다 붙임 (11/6 퇴사를 뺀 이유가 "확인할 사람에 있어서"라 겹침 없음). 승인 때 AI 위험 · 주의 권한은 유효 권한 탭의 위험 · 주의 타일과 같아 뺌

### 코어 리팩토링 — 소스 · 맥락 빌더 · 통합 잡 큐 (11/5)

- **이유**: 레코드 타입 · 컬럼 매퍼 · 읽기가 `data/`의 세 파일에 흩어졌고, 판정 입력을 판정마다 다른 곳(`permissions.judge_input` · `Engine.user_records` · `pipeline.user_record_text` · `events.event_review_input` · `servers.server_review_input`)에서 모았음. RAG 검색은 체인 안에 숨어 모델이 무엇을 봤는지 코드에서 안 보였음. 큐는 셋(`JobRunner` · 빠른 감시용 `JobRunner` · `VerdictWorker`)이 서로를 몰라 모델 · 벡터 DB를 동시에 쳤음
- **sources/**: 데이터 종류별(로그 · 정책 규칙 · 서버 현황 · 노드 스냅샷)로 구조체 · 컬럼 · 읽기 · 글을 한 파일에. 솔루션(DLP · SecureMark)별 차이는 로그 소스 안의 컬럼 설정. 쓰지 않던 `AccessRequest` · `AccessRequestMapper` · `load_requests`를 지웠음. 옮긴 뒤 판정 입력 27건이 옮기기 전과 글자까지 같았음
- **context/**: 판정마다 빌더 하나. 사람 맥락에 예전 AI 등급 · 의심 점수는 계속 넣지 않음 (11/3 결정 유지, 사용자 결정). 새로 넣은 것: 지금 가진 권한의 시스템 · 분류 · 설명, 이동 · 신청 전부(예전엔 이동 5 · 신청 10), 운영자 [이상 없음] 결정, 위협 예측의 기준 조항, 서버 점검 · 정책 관리 검토의 운영자 결정, 빠른 감시의 계정 · 지금 가진 권한
- 화면 파일 수를 줄이려 빌더 여섯은 `builders.py` 한 파일에 둠 (계획에서는 판정마다 한 파일)
- 같은 날 프롬프트를 `engine/prompt.py`에서 `context/prompts.py`로 옮겼음 — 판정 입력 칸과 프롬프트 칸을 한 곳에서 맞추려고. 빌더는 칸만 내고, 크기(글자 한도 · 줄 수 · 한 줄 글자 수 · 자르는 순서)는 `budget.py`, 프롬프트 · 빌더 짝과 자르기 호출은 `inputs.py` 한 곳. 옮긴 뒤 판정 입력 28건이 옮기기 전과 글자까지 같았음
- 같은 날 사람 · 운영자 결정(DB 읽기) · 규정 RAG 검색을 `context/`에서 `sources/`(people · decisions · regulations)로 옮겼음 — `context/`는 프롬프트 합성만. 판정 흐름은 `sources`로 모으고(`engine.people` · `engine.regulations.for_*` · `sources.decisions`) → `engine.inputs`로 글을 씀. 그래서 `sources`는 이제 DB를 읽음(엔진은 여전히 모름). 옮긴 뒤 판정 입력 28건이 글자까지 같았음
- 같은 날 데이터 계층이 읽는 것을 넷으로 줄였음 (사용자 결정) — DLP 로그 · 서버 상태(수집 노드) · DB 의 사용자 데이터 · RAG 기준 문서. 입구는 `Sources` 하나(`Engine.sources`), 안의 구조체는 종류별
  - 뺀 것: 솔루션 정책 파일(`PolicyRule` · `data/policies`) · 서버 현황 표(`ServerState` · `data/servers`) · IP로 규칙 맞추기(`rules_for`) · RAG의 솔루션 규칙(`index_rules` · 종류별 검색) · 프롬프트의 [솔루션 정책] 칸 · 화면의 "서버 현황" · "이 서버에 걸린 정책" · "관련 정책 원본"
  - 이유: 10/20부터 두 폴더가 비어 있어 판정에 들어간 적이 없었음. 정책은 파일이 아니라 RAG에 올려 검색하는 쪽이 낫다고 봄
  - 정책 관리 검토는 RAG에 쌓인 기준 문서 조각 전부를 꺼내 문서끼리 견주게 바꿨음 (★ 정책 이해의 "정책 간 모순"). 조각 id 가 "파일 이름|순번" 해시라 순서를 되짚어 원래 순서로 넣음. `PolicyIssue.policy_ids` 칸 이름은 그대로 두고 조항을 담음 (DB · 화면을 바꾸지 않으려고)
  - 기준 문서 적재가 폴더에 없는 문서의 조각을 빼므로 예전 규칙 조각도 다음 적재 때 빠짐
  - 판정 입력: 권한 신청 · 재검토 · 위협 예측은 글자까지 같고, 로그 감시 · 서버 점검은 [솔루션 정책] 칸만 빠짐 (늘 "찾은 솔루션 정책 없음"이었음)
- 같은 날 공통 베이스(`sources/base.py` — `RowSource` · `ColumnMapper` · `load`)를 없앴음 (사용자 결정). 읽는 것마다 방식이 달라 모듈마다 따로 읽음 — 로그는 `logs.py`가 파일 · 폴더 · 행 목록을, 노드 원문은 `snapshots.py`가, 사람 · 결정은 DB를, 규정은 RAG를. `Sources`는 모으기만. 새 출처(솔루션 API 등)는 모듈 하나를 더하고 `Sources`에 묶음. 옮긴 뒤 판정 입력이 글자까지 같았음 (행동 신호 4주 구간이 시각에 따라 미끄러진 것만 다름)
- **입력 예산**: `qwen3:14b`로 잰 판정 입력은 토큰당 1.52자 → 1.4자로 셈. 예전에는 `NUM_CTX` 8192 · `NUM_PREDICT` 4096에서 판정 입력이 9천 자(약 6천 토큰)까지 가 Ollama가 말없이 앞을 잘랐을 수 있음 — 지금은 빌더가 정한 순서로 자르고 그 사실을 입력에 적음
- **`NUM_CTX` 16384**: 계획은 32768이었으나 팀 서버에서 `qwen3:14b`가 16384에 10.0 GiB · 32768에 14.0 GiB(`/api/ps`)라 RTX 5070 12GB에 다 올라가는 16384로 정했음. 16384면 판정 입력 약 1만 6천 자 — 11/5 시험 DB의 가장 긴 입력(정밀 감시 48줄 묶음) 7.4천 자가 자르지 않고 들어감
- **통합 잡 큐**: 일꾼 하나 · 우선순위 · 진행 보고 때 급한 일에 자리 내주기(§2). 기준 문서 적재도 큐의 일이라 웹이 2초마다 엿보던 것을 없앴고, 파일 쓰기와 적재가 다른 작업 사이에 끼지 않음. 바깥 API 모양(`/api/jobs` · `/internal/status` · `judging`)은 그대로 두고 `queued` · `waiting`만 더해 화면 코드는 안 바꿨음
- 강제 중지 뒤 응답 없는 모델 호출에 묶인 스레드는 남음 (밖에서 멈출 수 없음). 새 일꾼을 띄워 큐는 바로 풀리고, 옛 스레드는 호출이 돌아오면 쓰지 않고 끝남. 서버 점검 · 위협 예측은 진행 보고 전에 한 건을 쌓으므로 그 한 건은 남을 수 있음 (11/3과 같음)
- `results.save_policy_review`가 쓰던 옛 `server_findings`(정책 관리 검토 시절 서버 점검)는 지웠음 — 10/20 뒤로 아무도 넘기지 않았음. 표 · 읽는 쪽 · `policy_reviews` 의 파일 시절 칸은 11/15에 지웠음 (`results_drop_policy_files.sql`)
- **11/5 시험** (시험 DB · 시험 웹, 팀 서버가 CPU로만 돌던 때 — `/api/ps` VRAM 0)
  - 가짜 모델로 6종 판정 입력을 옮기기 전과 견줘 늘어난 정보만 있음을 봄. DB · 소스 · 맥락 · 큐 시험 38건, 화면 시험 144건 통과
  - 신청 → `judging: true` → 3분 30초 뒤 위험 판정 저장 (CPU). 그동안 [지금 예측] · [지금 점검]은 `queued`, 같은 작업 다시 누르면 409
  - 판정 중 기준 문서 고치기 → 신청 판정이 끝난 뒤 바로 적용(3분 25초 기다림). 위협 예측 중 고치기 → 첫 사람(1/8) 뒤 끼어들어 적용
  - 강제 중지 · 다시 돌리기 → 기다리던 서버 점검 뒤 위협 예측이 처음부터 다시. 다시 돌리지 않고 끝내기 · 도는 작업 없을 때 409 확인
  - 끌 때 위협 예측이 돌던 중이면 5초 기다린 뒤 벡터 DB를 닫고 끝남
- 팀 서버가 11/5에 다시 CPU로만 돌고 있었음 (§6 · 위 "팀 서버 GPU"). 판정 한 건 3~7분 — 재부팅 뒤 `ollama ps`를 확인할 것


### 엔진 부품 나누기 (11/5)

- **이유**: `engine.py`(535줄)가 설정 · 모델 · 체인 위임 12개 · DB · 판정 실행 · 저장 · 모델 없는 집계 · 수집 받기 · 큐 배선 · 화면 상태 모양을 모두 들었고, `pipeline.py`(379줄)는 함수마다 `engine`을 받고 Engine이 다시 pipeline을 불러 서로를 물었음 — 무엇이 무엇에 기대는지 안 보였음
- **나눈 것**: settings · models · judge · runs · ask · reports · intake · tasks (§1). 부품은 서로를 생성자 인자로만 받고 Engine을 받는 부품은 없음. Engine은 부품을 `cached_property`로 엮고 웹 · CLI가 부르는 이름만 한 줄 위임 — 웹 · CLI · 화면 · DB는 import 경로(`web/notify.py`) 말고 안 바꿨음
- 판정 여섯 종은 `judge.JUDGMENTS` 표(프롬프트 · 출력 타입) 하나와 `Judge._run` 하나. 체인은 종류 · 빠른 감시 여부마다 한 번 만들어 둠
- `snapshot_row`(노드 원문 → 저장할 행)는 모델이 없어 `sources/snapshots.py`로. `rag.lookup`은 정책 질의만 써서 `Ask`로 옮김. `fast_interval_min`은 정수(비우면 0 = 끔)
- 질의(`ask.py`)는 흐름을 그대로 옮기기만 했음 — 다음 업무 "질의 통합 시스템"(§8 1)에서 다시 짬
- **확인**: 가짜 모델로 판정 입력 29건이 옮기기 전과 글자까지 같았음. 시험 42건(새 `test_tasks.py` 넷), 시험 웹에서 `/api/jobs` · `/internal/status` 모양이 같고 작업 202 → 409 · 강제 중지 · 신청 → 판정 중 · 기준 문서 올리기(신청 판정 뒤 270초 기다림) · 지우기 확인

### 엔진 다시 짜기 — 자원 · 이슈어 · 큐 · 워커 · 인터페이스 (11/5)

- 위 "엔진 부품 나누기"를 같은 날 다시 짰음 (사용자 정리) — 부품 여덟(settings · models · judge · runs · ask · reports · intake · tasks)은 역할 경계가 흐렸음: runs 가 읽기와 판정 · 저장을 함께, tasks · jobs 가 큐를 반씩
- 엔진이 하는 일을 다섯으로: 자원(`resource.py`) · 읽어 쌓기(`issue.py`) · 종류별 큐(`queue.py`) · 꺼내 판정 · 저장(`worker.py`) · 입구(`interface.py`)
- **잡 = 판정 한 건** (사용자 결정) — 예전엔 "로그 감시 1회"가 잡 하나라 급한 일을 진행 보고 때 안에서 돌리는 우회를 썼음. 지금은 꺼내는 순서만으로 끼어듦
- **종류별 큐 + 워커 하나** (사용자 결정) — GPU 하나라 모델 · 벡터 DB 를 동시에 치지 않게
- 묶음(Batch)은 마지막 닫기 잡이 마무리 — 로그 감시는 닫기 잡이 판정 전체 · 다음 시작점을 한 번에 저장해 중간에 멈추면 예전처럼 남는 것 없음. 서버 점검 · 위협 예측 · 정책 관리 검토는 한 건씩 바로 저장
- 집계(보안 통계 · 사용자 위협 · 로그 조회)도 이슈어로 (사용자 결정) — 데이터를 읽는 쪽이라. 큐에 넣지 않고 바로 돌려줌. 로그 조회의 거르기 · 세기는 `sources.logs.browse`
- 수집 받기도 이슈어 — 새 수집을 쌓으면 서버 점검 묶음을 바로 쌓음 (웹만). 예전엔 다음 예약(30분)까지 기다렸음
- **질의는 지웠음** (사용자 결정) — 질의 통합 시스템으로 완전히 다시 만들 예정이라 흐름 · 질의 프롬프트(ANSWER · LOG_FILTER · LOG_ANSWER · SERVER_FILTER · SERVER_ANSWER) · 출력 타입(Answer · LogFilter · ServerFilter) · `server_digest` 를 지우고 API 자리만 남김 (§2 질의)
- 화면 · API 모양은 그대로 — `/api/jobs` 의 running · done · total 은 묶음 기준, waiting 은 묶음 · 단독 잡 한 줄씩
- 처음 띄운 컨테이너가 시작에서 죽었음 — `./data` 마운트에 SELinux 라벨(`z`)이 없어 로그를 못 읽었고, 이슈어가 시작 때 판정 못한 신청의 사람 기록을 읽다 예외가 웹까지 올라왔음. 라벨을 붙이고, 읽기 실패는 그 판정의 실패로만 남기게 했음 (예전엔 판정 작업 안에서 읽어 그랬음)
- 관리에 [큐] 탭(보안 총책임자)을 붙이고 작업 큐 화면을 넣었음 (사용자 요청 — 처음엔 따로 [설정] 메뉴였다가 같은 날 관리의 한 탭으로 합치고, 하는 일에 맞게 이름을 큐로 바꿨음). 작업 버튼 옆 [강제 중지]는 도는 작업 하나만 끝내서, 기다리는 잡이 쌓였거나 워커가 멈췄을 때 큐 전체를 비우고 새로 시작할 곳이 없었음. 다른 관리 탭(목록)과 달리 오른쪽 패널 없이 넓게 씀
- 벡터 DB를 Milvus Lite(파일)에서 compose 의 Milvus 서버(`milvusdb/milvus:v3.0.3`, pymilvus 3.0 과 맞춤)로 옮겼음 (사용자 결정). Lite 는 한 프로세스만 파일을 열어 CLI 가 웹과 함께 못 돌았고, 같은 프로세스에서도 동시에 열면 실패했음. etcd · MinIO 를 따로 띄우지 않는 단독 실행(내장 etcd · 로컬 저장소)이라 컨테이너 하나. 예전 볼륨(`milvus`)은 옮기지 않음 — 웹이 뜰 때 기준 문서를 다시 적재함. 코드는 주소만 바뀌어 엔진은 그대로 (파일 경로를 넣으면 여전히 Lite)
- 웹이 뜰 때마다 기준 문서를 적재함 (사용자 요청) — 새 볼륨으로 띄운 컨테이너가 인덱스가 빈 채로 판정하고 있었음. 적재를 판정과 같은 길(0)로 올렸음 — 빈 인덱스로 신청을 먼저 판정하지 않게, 화면에서 올린 문서도 다음 판정부터 보이게
- `types.py`를 없앴음 (사용자 결정) — 타입은 쓰는 모듈에서 정의. 판정 출력 타입 · `Notifier`는 쓰는 곳이 워커뿐이라 `worker.py`로, `Job` · `Batch`는 `queue.py`, `Settings`는 `settings.py`. 출력 타입 docstring · 설명은 글자 그대로 옮겼음


### 질의 에이전트 (11/5)

- **이유**: 예전 질의는 정책 · 로그 · 서버가 따로(조건 뽑기 → 코드가 찾고 셈 → 답) 돌고 메뉴마다 탭이 달랐음. 섞인 질문("박민수가 받은 위험 판정과 걸린 조항")을 못 받았음 → 도구를 고르는 에이전트 하나로 (사용자 기획)
- **MCP 를 안 씀** (사용자 결정 — 화면에서만 씀): 쓰는 쪽이 같은 프로세스뿐이라 통신 층만 늘어남. 로그인 사용자 · 감사 기록이 그대로 붙음. 밖에 꺼낼 때 감싸기만 하게 도구 모양은 MCP 와 같게 둠
- **화면**: 질의 탭 하나 — [정책 질의] 메뉴를 [질의]로 바꾸고 정책 관리 · 로그 감시의 질의 탭은 뺐음 (사용자 요청 "한 탭으로"). 답 아래 도구 호출마다 근거 칩, 누르면 오른쪽 패널에 도구별 집계 · 로그 · 조항 원문. 검증 경고 · [새 대화] · 지난 대화 고르기
- **11/5 시험** (팀 서버 `qwen3:14b` GPU, `NUM_CTX` 8192 · `NUM_PREDICT` 4096)
  - 재무 정다은 출력 48회 ✅ (17~60초). 처음엔 어디서 칸에 `PC,VDI`, 행위 칸에 항목 이름 `PrintCount`를 채워 0건 → 도구가 바로잡게 고침
  - 영업팀 → 급여 테이블: 한 번은 도구 없이 지어냄("인사 · 재무만") → 도구 없이 답하면 다시 돌리게 함. 그 뒤 3.3 · 3.2 · 4.2 ✅
  - SSH 루트 로그인 서버 + 조항: tnode-01 열림 · tnode-02 닫힘 ✅, 조항은 6.2(특권 계정 직접 로그인 금지)로 넓게 댐
  - "VPN 접속 기록은?" → 모른다 ✅, 다만 도구를 부르지 않고 부른 척 적음 → 프롬프트에 금지를 적음
  - 이어지는 질문 "그중 예외 승인된 건?": 처음엔 로그 줄을 직접 세 1건(실제 2건) → 조건을 더해 다시 부르고 `keyword` 에 `항목=값`을 쓰게 프롬프트를 고쳐 2건 ✅
  - 대화 기록 요약을 답 쪽에 붙였더니 모델이 그 모양(`[그때 찾은 것] …`)을 답에 베낌 → 질문 쪽으로 옮기고, 근거 없는 턴은 기록에서 뺌
  - 숫자 검증이 날짜 속 숫자와 구분하지 못해 "10월 19일 15건"(실제 14건)을 걸러내지 못했음
- 앞서 CPU 로만 돌던 때 질의 한 건 168~521초, 한 번은 빈 답 — 입력(시스템 · 도구 정의 · 도구 결과 약 6,600토큰)이 `NUM_CTX` 8192 − 4096 을 넘었을 수 있음. 빈 답이면 오류에 `done_reason` · 토큰 수를 남김

### 보안 현황 · 권한 변동 (11/6)

- 요청: 통계를 알아보기 쉬운 이름으로 바꾸고, 부서 이동 · 권한 만료로 위험해진 사람을 바로 알리는 탭 (처음엔 퇴사도 넣었으나 같은 날 사용자 결정으로 뺌 — 퇴사는 확인할 사람에 그대로)
- 메뉴 [통계] → [보안 현황] (사용자 결정). 탭 [권한 변동] · [시스템](예전 보안 통계) · [사용자](예전 사용자 위협). 메뉴에 들어오면 권한 변동이 먼저
- 사실 + 기존 AI 판정만 씀 (사용자 결정) — 새 모델 판정 없이 코드가 셈. 이동 뒤 보유 권한 재검토(`grant_reviews`)가 "직무와 맞지 않는 권한", 이동 뒤 로그 감시 판정이 "권한 밖의 행동"에 해당. 화면은 30초마다 다시 셈
- 로그 감시 판정은 계정의 `log_id` 와 판정의 사용자(`event_findings.user`)로 이음. 가장 이른 이동 날 뒤에 끝난 묶음만
- **자동 회수는 하지 않음** (사용자 결정, §4 · ★ 원칙 그대로) — 만료 · 재검토가 끝난 주의 이상 권한에 [회수] 버튼, 사유를 미리 채운 확인 창 뒤 사람이 회수(회수자 = 누른 사람). 재검토 대기 · 실패인 권한에는 버튼을 두지 않음
- 11/6 시험(시험 웹): dev-user 를 보안팀 → 영업팀으로 옮기고 11/4 만료 권한을 승인해 둠 → 이동 · 재검토 대기 · 만료가 뜸 → 보안 운영자가 [회수] → 회수 기록(사유 "사용 기간 만료 (2026-11-04)") · 목록에서 빠짐
- 같은 날 화면 글 전체를 줄였음 (사용자 요청 "가운뎃점 제거 · 설명 최소화") — 가운뎃점 149곳을 쉼표 · 괄호 · `Meta`(간격으로 나눈 한 줄)로, 확인 창 글머리표 · 안내 문단 · 긴 툴팁을 한 줄 이하로. 탭 이름 [권한 변동] · [시스템] · [사용자]. 뜻이 바뀐 곳 없음 — 쓰지 않게 된 `periodDays` 만 지웠음

### 질의 팝업 (11/6)

- [질의] 메뉴 · 탭을 없애고 오른쪽 아래 떠 있는 버튼으로 여는 팝업으로 바꿨음 (사용자 요청 "어느 탭에서든 열 수 있게") — 일반 사용자에게는 버튼 없음
- 근거 칩을 누르면 오른쪽 패널 대신 팝업 안에서 근거를 보고 [대화]로 돌아감. Esc 는 근거 → 대화 → 닫기 순
- 대화 · 근거 선택 · 열림은 메뉴 · 탭을 옮겨도 그대로 (답을 기다리는 중에 다른 메뉴로 가도 답이 이어짐). 닫혀 있는 동안 답을 기다리면 버튼에 점
- 버튼이 오른쪽 패널의 결재 버튼을 가리지 않게 운영자 화면은 아래 여백을 둠. 휴대폰 폭에서는 팝업이 화면 전체
- 11/6 시험(시험 웹): 정책 관리에서 열어 묻고 다른 메뉴로 옮긴 뒤에도 답(재무 정다은 출력 48회 ✅, 17.9초) · 근거 보기 · Esc 확인

### 위 메뉴 (11/6)

- 왼쪽 사이드바(접기 · 펼치기)를 없애고 메뉴를 위 막대(`TopNav`)로 옮겼음 (사용자 결정 — 시안을 보고 정함). 목록 · 오른쪽 패널이 화면 폭을 다 씀
- 처리할 일 건수는 메뉴 옆 빨간 배지. [관리](보안 총책임자) · [기준 문서](보안 운영자)는 구분선 뒤 끝에
- 1150px 이하에서는 메뉴가 막대 아래 줄로 내려가 옆으로 밂 — 좁은 화면용 메뉴 고르기(`Seg`)는 뺐음
- 휴대폰 폭에서 탭 이름이 글자마다 줄을 바꾸던 것을 고쳤음 (줄 바꿈 없음, 아이콘 숨김)

### 기준 문서를 권한 DB 로 (11/6)

- 이유: 엔진이 `docs/` 폴더를 읽어 RAG 에 적재해, 화면에서 올린 문서가 저장소 작업 트리 · compose 볼륨에 파일로 남고 폴더 경로가 엔진 · 웹 두 곳에 박혀 있었음 → 기준 문서는 화면으로만 올리고 파일과 떼기로 함 (사용자 결정)
- 원문은 권한 DB `regulations`(이름 · 원문 · 고친 시각 · 고친 사람), RAG(Milvus)는 그 사본 (사용자 결정) — Milvus 볼륨이 비어도 웹이 뜰 때 다시 채움. 사람이 올린 근거라 결정자와 같은 DB
- `DocumentStore.index(이름 → 원문)` 하나로 맞춤 — 바뀐 문서만 임베딩, 없는 문서의 조각은 뺌. 그래서 `DocumentStore.remove` · `Engine.remove_document` · 폴더 읽기(`read`)를 지웠음
- 올리기 · 고치기 · 지우기는 원문을 쓰고 적재하는 한 일로 큐에 들어가고, 적재가 실패하면 원문을 되돌림 (예전 파일 되돌리기와 같음). 감사 기록은 그대로
- 예전 `docs/`는 `examples/regulations/`로 옮겨 예시로 둠 (사용자 결정) — 시험 환경 setup 이 넣고, 운영은 `./sentinel import-regulations data/example-regulations`로 한 번 넣음 (11/9에 `data/example-regulations/`로 옮겼음 — data/ 는 컨테이너에 읽기만으로 붙어 이미지에 따로 넣지 않음). compose 의 `docs` 볼륨은 뺐음 (지우려면 `docker volume rm jbnu-rad_docs`)
- 같은 날 엔진이 남기는 시각(작업 큐 · 예약 · 정책 관리 검토 · 로그 감시 실행)에 시간대를 붙였음 — 컨테이너는 UTC 인데 시간대 없이 남겨 화면이 한국 시각으로 읽어 9시간 이르게 보였음 ("작업 큐가 주기적으로 안 돈다"로 보였으나 예약은 제때 돌았음)

### 질의 query 도구 (11/9)

- 증상: "급여 테이블 권한 가진 유저들 찾아줘"에 도구 없이 답을 지어냄 — 여러 사람에 걸친 권한 질문을 받을 도구가 없었음 (`person` 은 한 사람만)
- `query` 하나로 권한 DB 다섯 대상을 거르고 셈 (사용자 결정 — 대상마다 도구를 두면 작은 모델이 고르기를 틀림). SQL 은 `db/lookup.py` 가 고른 칸만 읽고, 거르기 · 세기는 파이썬에서 (행이 적음)
- 숫자 · 날짜 비교는 코드, 뜻으로 거르기만 모델 (사용자 결정). 처음엔 에이전트가 후보를 읽고 고른 뒤 `ids` 로 다시 세게 프롬프트에 적었으나 `qwen3:14b` 가 따르지 않고 `where` 의 not_contains · AI 등급으로 흉내 냄 → 도구 안에서 따로 모델을 불러 고르게 바꿨음 (`meaning`)
- 결과 줄에 칸 이름을 붙임 — "끝 없음까지, 승인 2026-10-21" 을 모델이 "10-21까지 유효"로, 이름 "직원 2" 를 "이름 없음"으로 읽었음
- 고른 이유는 "AI 판정 아님"을 붙임 — 모델이 고른 이유를 신청의 AI 판정으로 옮겨 적었음
- 11/9 시험 (팀 서버 `qwen3:14b`, 운영 DB): 급여 테이블 권한 가진 사람 1명 ✅ (15~19초), AI 위험인데 승인된 신청 1건 ✅ (19초), 사유가 권한과 안 맞는 신청 1건 ✅ (`meaning`, 22~28초 — 답에 "AI 판정 기준" 이라는 말이 남음)
- 도구 정의가 약 4천 자로 늘어남 (칸 이름 목록) — 입력 한도는 여유 있음

### 질의 단계 나누기 (11/9)

- 요청: 모델 하나가 도구 루프 안에서 기준 · 쿼리 · 판단을 한꺼번에 해, 판단 기준 없이 찾고 찾은 것 전부를 보고 답했음 → 기준 세우기 → 쿼리 → 거르기 → 골라내기 → 판단 단계로 (사용자 기획)
- 단계마다 코드가 따로 부름 (사용자 결정) — 한 루프 안에서 프롬프트로 단계를 적게 하면 작은 모델이 건너뛰어도 못 막음 (`meaning` 때 같은 일)
- 늘 다섯 단계 (사용자 결정, 질의 한 건 15~30초 → 33~57초). 화면은 다음에 (백엔드만 먼저)
- 판단 단계는 고른 근거만 봄 — 검증도 고른 근거로 함. 기준 단계가 "기준 문서에서 찾음"이라 적고도 쿼리에서 조항을 안 찾자 판단 단계가 3.3 을 지어냈음(검증이 잡음) → 코드가 조항을 찾게 함, 판단 프롬프트에 근거에 없는 조항 금지
- 골라내기가 건수 줄을 빼먹어 판단이 "출력 권한은 사용자 정보가 기록되지 않음"으로 읽었음 → [집계] 줄은 코드가 늘 넣고, 판단 프롬프트에 "근거의 행 목록에 없는 것은 해당하는 것이 없다는 뜻"
- "영업팀 직원이 급여 테이블 조회를 신청하면 기준상 괜찮아?"에 조항(3.3 · 4.2)은 골랐지만 "예"로 답했음 → 조건이 붙으면 예 · 아니오로 줄이지 말고 위험 · 반려 조항은 반드시 적게 함 → "기준에 부합하지 않음"
- 11/9 시험 (팀 서버 `qwen3:14b`, 운영 DB): 급여 테이블 권한 가진 사람 1명 ✅ (36초), 사유가 권한과 안 맞는 신청 1건 ✅ (39초), 영업팀 → 급여 조회 기준 위반 ✅ (57초), 재무 정다은 출력 48회 ✅ (33초). 단계별로 기준 6~10초 · 쿼리 10~34초 · 골라내기 8~28초 · 판단 4~14초

### Milvus 메타데이터 etcd 를 따로 (11/9)

- 증상: compose 의 Milvus 가 뜨자마자 `panic: etcdserver: leader changed` 로 죽음(종료 코드 134), 다시 띄워도 매번 같음. Milvus 에 `restart` 가 없어 그대로 멈추고 웹은 Milvus healthy 를 기다리며 Created 에 머묾
- 원인: 내장 etcd(`ETCD_USE_EMBED`)가 쌓인 데이터로 다시 뜨면 혼자 리더를 다시 뽑는 데 약 1.3초 걸리는데, Milvus 3.0.3 이 그 사이에 세션을 읽다 실패하면 다시 묻지 않고 죽음. 11/6 에는 같은 볼륨으로 다시 떴음 — 무엇이 바뀌었는지는 못 찾음
- 내장 etcd 의 선거 시간을 줄여(`election-timeout` 50ms) 리더가 0.24초에 뽑혀도 Milvus 가 먼저 읽어 같은 패닉 → 설정으로는 못 막음
- 조치: etcd 를 컨테이너로 따로 띄우고(`quay.io/coreos/etcd:v3.5.18`) Milvus 는 etcd 가 healthy 가 된 뒤 뜸 (사용자 결정). `milvus/embedEtcd.yaml` 지움, Milvus · etcd 에 `restart: unless-stopped`
- Milvus 볼륨은 새 이름(`milvus-store`)으로 새로 시작 — 예전 볼륨의 조각은 내장 etcd 메타데이터와 묶여 있어 그대로 못 씀. RAG 는 권한 DB 의 기준 문서 사본이라 웹이 뜰 때 다시 채움. 예전 볼륨 `jbnu-rad_milvus-data` 는 남겨 둠 (지우려면 `docker volume rm jbnu-rad_milvus-data`)

### 판정 근거 확인 (11/9)

- 요청: 질의의 단계 나누기를 다른 판정에도 — 판정 입력 줄 번호 · 근거 줄 확인(1번)과 권한 신청 · 재검토의 기준 세우기 단계(2번)를 넣었음. 2번은 사용자 결정으로 뺐음 (크게 필요없음)
- 1번 처음 모양: 판정 입력의 빈 줄 아닌 줄마다 `[L번호]`, 출력 타입마다 `evidence`(판단을 받치는 줄 번호), 코드가 번호 · 조항이 입력에 있는지 확인
- 시험 (팀 서버 `qwen3:14b`, §5 권한 신청 8건, 판정 입력 그대로 · 사람 기록 없음, `NUM_CTX` 8192)
  - 줄마다 번호: REQ-002 · 004(정상)가 위험 — 조항이 여러 줄로 쪼개져 "인사팀 소속 임직원 및 감사위원회가 승인한"에서 끊긴 줄을 "인사팀만"으로 읽고, 정책 만료 6.3 줄을 권한 기간에 끌어다 씀. `sources` 에도 조항 대신 줄 번호를 적음
  - 문단마다 번호 · 조항 칸은 번호 없이: 그래도 REQ-002 위험
  - 예전 코드와 새 코드를 번갈아 3번씩 (REQ-002 · 004 · 006, 모두 정상 기대): 예전 정상 2 · 주의 3 · 위험 4, 새 코드 위험 9 — 번호 · `evidence` 칸만으로 등급이 위험으로 몰림
  - REQ-002 는 같은 예전 코드도 20분 사이에 정상 2/2 → 위험 2/2 로 흔들림 — 직무 빈칸 · 끝 없는 사용 기간을 보라는 지시(11/3)와 맞물린 경계 사례. REQ-006 은 둘 다 늘 위험
- 결정: 입력 줄 번호 · `evidence` 칸 · 프롬프트 규칙을 뺌. 모델 입력을 바꾸지 않는 코드 확인(댄 조항이 입력 조항에 있는지)만 남김 — §5 대로 정상을 정상으로 내는 것이 먼저
- 같은 시험에서 근거 조항은 늘 입력에 있었음 (조항 4조각을 다 넣어서). 조항이 늘면 확인이 쓸모 있어짐

### 선례 검토 (11/9)

- 요청: 선례 검토 레이어, LLM-as-a-Judge 로 (사용자 기획). 대상 = 운영자 결정 · 결재가 있는 판정 전부 (권한 신청 · 보유 권한 재검토 · 정밀 감시 · 서버 점검 · 정책 관리 검토), 어긋나면 다시 판정, 선례는 사람이 정한 것만 (사용자 결정)
- 선례에 예전 AI 등급을 넣지 않음 — 11/3 사용자 기록과 같은 이유(한 번 찍힌 판정이 되먹임)
- 판사는 같은 판정 모델 · 생각 켬. 사례 칸은 대상 칸만(사람 기록 · 조항 빼고 3,500자까지), 선례 1,800자까지 6건
- 판사가 어긋남이라 해도 실제 선례 번호를 못 대면 다시 판정하지 않음 — 작은 모델이 이유 없이 어긋남을 내는 것을 막으려고
- 다시 판정은 원래 판정 프롬프트 + 1차 판정 · 선례 · 평가. "평가가 타당하지 않으면 1차 판정을 유지해도 됨", "등급 근거는 조항, 선례는 맥락"을 적음
- 시험 (팀 서버 `qwen3:14b`, 운영 DB 선례 — SALARY_READ 마케팅팀 1차 반려 · 재무팀 최종 승인 두 건, REQ-001 · 007 에 급여 권한 코드를 붙여 2번씩)
  - 4번 모두 위험 ✅ (기대 위험). 판사가 맞음 3 · 어긋남 1
  - 어긋남 1번: REQ-001(영업팀)을 재무팀 승인 선례(P1)와 견줘 어긋난다 함 — 부서가 달라 사실이 다른 선례인데 같다고 봄. 다시 판정은 위험을 지킴
  - REQ-007(급여 수정)은 판사가 "조회 선례와 권한 수준이 다름"으로 맞음 — 사실 차이를 봄
  - 판정 한 건 43~63초 (선례 없는 판정 20~30초) — 판사 호출 + 다시 판정
- 한계: 시험 DB 선례가 두 건뿐이고 사유가 엉성함 ("사용자 특정 마켓팅 업무 수행"이 승인됨). 선례의 질이 판사에 그대로 들어가 — 실제 결재가 쌓인 뒤 다시 봄. 판사가 사실이 다른 선례를 같다고 보는 일이 있음

### 예외 상황 알림 (11/13)

- 요청: 권한 변경 같은 예외 상황도 알림. 고른 것(사용자 결정) — 계정 역할 변경 · 보유 권한 재검토 위험 · AI 위험인데 승인 · 보안 설정 변경. 운영자 Slack 채널, 이름 · 로그인 아이디는 넣지 않음 (사용자 결정)
- 로그 감시 위험(`RiskWatcher`)처럼 웹이 DB를 30초마다 봄 — 계정 · 결재 · 기준 문서 · 노드 API 를 고치지 않으려고. 감사 기록과 `grant_reviews` 는 id 로 이어 읽음
- 계정은 감사 기록이 아니라 계정 표를 견줌 — `user_update` 기록에는 바뀌기 전 값이 없고 화면이 바꾸지 않은 칸도 보냄
- 퇴사자 권한은 퇴사일이 날이 바뀌며 지나 기록이 없으므로 매번 "퇴사일이 지났는데 권한이 남은 계정"을 견주어 새로 든 계정만 알림
- AI 위험인데 승인은 최종 승인 기록(`request_approve`, step top)의 AI 등급으로 고름 (AI 칸은 1차 결재 뒤 굳음)
- 웹이 뜨기 전 · 꺼져 있던 동안의 일은 알리지 않음 (다시 띄울 때마다 예전 일이 다시 가지 않게)
- 보안 설정 변경 중 기준 문서 이름 · 권한 코드 · 노드 이름은 넣음 — 사람을 가리키지 않아서

### 관리 권한을 보안 운영자에게 (11/16)

- 이유: 멘토 피드백(11월, 5개 화면 정리) — 관리(사용자 · 권한 종류 · 사내 보안규정)는 보안 운영자의 일, 보안 총책임자는 최종 결재와 현황 판단. 그 전에는 관리 메뉴 전부가 보안 총책임자만이었음 (사용자 결정)
- 나눈 기준: 멘토 피드백의 "계정의 시스템 역할과 실제 업무 접근 권한은 구분하여 관리" — 업무 정보는 보안 운영자, 시스템 역할은 보안 총책임자
- 보안 운영자에게 연 것: 권한 목록 · 기준 문서 · 큐(보기 · 강제 중지 · 초기화) · 일반 사용자 계정(만들기 · 부서 · 직무 · 퇴사일 · 로그 사용자 ID · 정지 · 비밀번호 초기화). 팀 main 에 따로 들어온 PDF · 엑셀 꺼내기 API(11/13 · 11/16, 보안 총책임자만)도 합치며 보안 운영자 이상으로 맞춤 — 꺼낸 글은 저장하지 않고 올리기는 이미 보안 운영자 이상이라
- 보안 총책임자만: 역할 바꾸기, 보안 운영자 이상 계정 만들기 · 고치기 · 초기화 — 보안 운영자가 역할을 올리면 1차 · 최종 결재를 혼자 할 수 있어서. 보안 운영자는 자기 계정도 못 고침
- 일반 사용자 비밀번호 초기화까지 연 이유: 계정을 만들 수 있으면 초기화만 막아도 얻는 것이 적음. 둘 다 감사 기록에 남음
- 검사는 DB 계층(`db/auth.py` `_guard_target` · `catalog.py` · `regulations.py`)과 트리거(`main_manage.sql`) 두 곳. 역할 바꾸기는 누가 고쳤는지 트리거가 알 수 없어 코드에서만 막음
- 보안 총책임자의 감독: 이 변경들은 감사 기록과 Slack 예외 알림(`ExceptionWatcher`, 11/13)으로 그대로 감
- 화면: 보안 운영자의 [기준 문서] 버튼을 [관리]로 합침. 계정 패널은 보안 운영자에게 역할 칸을 감추고 보안 운영자 이상 계정은 읽기만
- 11/16 시험(시험 웹, dev-op): 일반 사용자 계정 만들기 · 부서 고치기 · 권한 등록 · 큐 보기 됨, 운영자 계정 만들기 · 역할 올리기 · 자기 계정 고치기 · 루트 초기화는 400
- **11/17 계정 · 역할도 보안 운영자로** (사용자 결정, 피드백 표 "⑤ 관리 = 보안운영자", 보안 담당자 · CISO = 보안 총책임자): 운영자가 모든 계정(루트 빼고)을 만들고 고치고 역할을 바꿈, 보안 총책임자는 보기만 하고 예외 알림 · 변경 이력으로 감독. 루트는 처음 설정(첫 운영자 만들기) · 비상용으로 함께 함. 위 "보안 총책임자만" 줄을 대신함. 검사는 `db/auth.py` `_require_account_admin` · 트리거 `main_accounts.sql`, 화면은 `views.canManageAccounts`

### 보안 현황 종합 대시보드 (11/16 · 11/17)

- 이유: 교수님 미팅(10/19) "대시보드 최상단에 현재 위협 현황", "통계 → 세부 드릴다운"과 멘토 피드백(CISO · 보안담당자가 회사 전체를 한눈에)
- 11/16 보안 총책임자 전용 [현황] 메뉴를 뒀다가 11/17 보안 현황 [종합 대시보드]로 합침 (사용자 결정) — 같은 `/api/overview` 를 두 화면이 거의 같게 보였음. 두 역할 메뉴가 같고 첫 화면만 다름 (`views.ts` `HOME`)
- 배치: 타일(전체 이슈 · 위험 · 주의 · 완료율 · 판정 실패) → 위험 유형별 도넛 · 위험 주의 추이 선 그래프 · AI 종합 분석 요약(먼저 할 일 셋 `firstTodos` + 우선 조치 권고 = AI 한 줄 `headline`, 엔진 그대로) → 주요 위험 이슈 · 최근 조치 내역
- 전체 이슈 = 지금 열린 위험 + 주의 (11/18, 사용자 결정 — 예전 "완료 + 남은 것"은 누른 뒤 표 건수와 안 맞고 기간에 이 타일만 바뀌었음). 아래 글 결정 없음 · 조치 중, [조치 필요] 타일은 같은 숫자라 뺌. 위험 · 주의 타일은 어제 끝과의 차이
- 두 그래프는 표 전환 없이 그래프만 (사용자 결정, 11/17) — 값은 마우스를 올리면 보임. 추이는 흐름이 보이게 막대에서 선으로. 추이 높이는 도넛 카드와 맞춤(그래프 128px) — 넓은 화면에서 가운데 줄이 늘어나지 않게
- 숫자 → 건별: 위험 · 주의 · 판정 실패 타일은 이슈 표를 거르고 (판정 실패는 11/18부터 — 맨 아래 따로 두던 실패 표가 화면 폭을 다 차지해 뺌. 0이면 비활성(흐리고 누를 수 없음)으로 늘 둠 — 실패 때만 나타나면 타일 줄이 갑자기 바뀜, 사용자 결정) 전체 이슈 타일은 거르기를 풂 (검토 현황의 [전체] 타일과 같음), 표 줄 · 먼저 볼 것 · 최근 조치 줄은 그 판정 화면으로. 표는 남은 이슈 전부를 5건씩 쪽으로 (11/18 10건 제한을 풂 — 타일 숫자와 표 건수가 같게, 최근 조치만 10건)
- 최근 조치 내역(11/17): `sources/overview.py` `recent` — 완료율의 "완료"(기간 안 조치 완료 결정 · 회수)를 늦은 것부터 10건. 화면에서 모으면 지난 판정이 빠져 완료 건수와 어긋나서 서버에 둠
- 아래 두 표(11/17, 시안): 주요 위험 이슈 = 발생일 · 유형 · 대상과 내용 · AI 판단 · 처리 상태, 최근 조치 내역 = 처리일 · 유형 · 대상과 조치 내용(의견 · 회수 사유) · 결과. 날짜(진하게) · 시각(연하게) 두 줄(`DayTime`, 올해면 연도 뺌), 유형은 회색 배지, 대상(굵게) · 내용(회색) 두 줄. 두 표 모두 한 쪽 5줄, 쪽 번호로 넘김 (공용 `Pager` · `usePage`, 내 신청 표와 같음) 시안의 [전체 보기]는 영역을 넘는 전체 목록 화면이 없어 뺌
- 아래 두 표 줄이기 (11/18, 사용자 요청 "가독성"): 날짜만 한 줄(올해면 연도 뺌, 시각은 툴팁), 유형은 배지 없이 기호 + 회색 글, 처리 상태의 결정 없음은 글만(결정이 있으면 배지 — 조치 필요 · 승인 · 조건부 승인은 열린 채 남고, 조치 완료는 최근 조치 내역으로, 이상 없음 · 반려 확정은 빠짐). 행마다 같은 값 · 상자가 되풀이돼 대상 · 내용이 묻혔음
- 이슈 표 제목은 고른 타일 이름 그대로 — 전체 이슈 · 위험 이슈 · 주의 이슈 · 판정 실패. 화면 전체가 남은 이슈만 다뤄 "열린"은 뺌 (도넛 가운데 "전체 이슈", 11/18 사용자 결정)
- 기간 버튼은 조치 완료율 · 위험 주의 추이 · 최근 조치 내역만 바꿈 — 완료율 · 최근 조치 이름에 고른 기간을 붙임 ("조치 완료율 (한 달)", 추이는 날짜 축이 보여 안 붙임). 남은 이슈 칸(타일 · 도넛 · 이슈 표)은 기간과 무관 (11/18, 사용자 결정 — 맨 위 기간 버튼이 모든 숫자를 바꾸는 것처럼 보였음)
- 조치 완료율 = 완료 ÷ (완료 + 미완료). 타일 아래 "완료 N, 미완료 M" — 미완료 = 전체 이슈 타일 (11/18, 예전 "1 / 11건"은 11 이 무엇인지 안 보였음). 완료 = 기간 안 조치 완료 결정 + 재검토가 주의 · 위험으로 본 권한의 회수
- AI 요약 머리: 제목 · 정리 시각 · 오른쪽 끝 새로고침 기호. 우선 조치 권고는 한 줄 상자. "그 뒤 바뀜" 배지는 뺌 (사용자 결정 — 정리 시각으로 충분)
- 기호는 다른 화면과 같게 (11/17): 타일 이름 앞 등급 점, AI 판단 = `LevelLabel`(등급 기호), 처리 상태 = `StateCell`(배지만, 누가 · 언제는 패널) — 검토 현황 목록과 같은 부품. 유형 칸은 색 네모 대신 메뉴 기호(`AREA_ICON`), 영역 색은 도넛에만
- 뺀 것: 최종 결재 대기 타일 · 목록(결재함 배지와 같음). 결재 중인 위험 신청은 영역에 없어 도넛 · 추이에 안 들어감

### 판정 목록 — 건수 타일 · AI 판단과 처리 상태 열 (11/16)

- 이유: 멘토 피드백이 권한 신청 · 정책 관리 · 로그 감시 세 화면에 같은 것을 요구 — 상단에 전체 · 정상 · 주의 · 위험 건수를 크게, 목록에서 AI 판단과 사람의 실제 처리를 다른 항목으로
- 건수 타일: 검토 현황 머리의 등급 거르기 칸(작은 버튼 줄)을 큰 타일로 바꿈. 숫자 · 거르기 동작은 그대로(`levelCounts` · `setFilter`), 고른 타일을 다시 누르면 전체. 권한 신청은 타일 아래에 등급별 처리 방향(승인 권고 · 추가 검토 · 반려 권고). 교수님의 "통계 → 세부 드릴다운"도 이 타일로 함
- 열: 세 화면만 다섯 열(AI 판단 · 처리 상태). 처리 상태 = 권한 신청은 결재 단계, 정책 · 서버 · 로그는 운영자 결정(없으면 "결정 없음", 1차 판정은 그대로). 목록에는 배지만, 누가 · 언제는 패널의 처리 칸 · 결정 기록(최신부터) (11/18). 검토 패널(정책 · 서버 · 로그)은 [AI 분석] · [결정 기록 N] 탭 (11/17, 사용자 결정 — 기록이 길어도 AI 분석이 밀리지 않게, 지금 결정은 처리 칸에 늘 보임). 권한 신청은 결재가 3단계를 안 넘어 탭 없이 위에 둠. 결정 배지는 누른 결정 버튼과 같은 색 테두리 — 승인 · 이상 없음 초록, 조건부 승인 주황, 반려 확정 · 조치 필요 빨강, 조치 완료 검정 (11/17, `decisionState`). 관리 화면 · 확인할 사람은 네 열 그대로
- 패널 (11/17, 사용자 결정): 모든 패널이 공용 `Panel`(머리 상자 + 내용 상자). AI 판정은 공용 `AiReport` 카드 — 질문형 네 칸(어떻게 판단 · 왜 · 어떤 규정 · 어떻게 처리/조치), 권한 신청 · 정책 관리 · 서버 점검 · 로그 감시가 함께 씀. 처리 상태는 제목 아래
- 로그 감시 (11/17): 타일에 정상 건수(누르지 않음, 목록엔 주의 이상만 — 사용자 결정), 목록 행동 칸은 로그에서 센 행위별 수, AI 분석 첫 칸은 "무슨 일이 있었나요?"(등급은 "왜" 제목 옆)
- 정책 관리 목록: 대상 · 주요 문제(유형을 등급 색 굵게) · AI 판단 · 처리 상태 — 시간 열 없음(검토 한 번의 시각이라 줄마다 같음). 정상 조항의 판단 근거는 엔진이 문제 조항만 돌려줘 못 보임 — 양현성에게 요청 (11/17) → 11/18 `policy_review.passed` 로 옴 (아래 "판정 근거 정리"). 화면은 같은 목록에 정상 조항 줄(항목 종류 `pass`, 정상 타일에 셈, 처리 상태 "결정 불필요")과 결정 칸 없는 정상 조항 패널 (11/18)
- 권한 신청 패널: 결재 단계 표시(신청 · 1차 · 최종, 이름만) + 신청 내용 5칸
- 근거 조항은 한 상자에 조항마다 한 줄(제목), [원문]을 눌러야 원문. 이유 · 권고는 줄 · 문장마다 글머리표, 모델이 단 소제목만 굵게
- 타일 부품은 `shared/ui/base/parts.tsx` `Tile` 하나로 (종합 대시보드 · 검토 현황이 함께 씀)
- 반영하지 않은 것: 시안의 [정책 수정] · [정책 차단] 버튼(§4 정책 자동 수정 금지 — 지금처럼 사람의 결정을 기록), Llama 3 · ChromaDB 표기(실제는 설정의 모델 · Milvus)

### 변경 이력 (11/16)

- 이유: 멘토 피드백 "기준 문서의 변경 이력도 확인" · "AI가 임의로 판단하는 것이 아니라 관리자가 등록한 사용자 정보와 보안규정을 근거로 분석한다는 점을 보여 줌". 감사 기록은 쌓기만 하고 화면에서 읽을 길이 없었음 (§8 13)
- 기준 문서 · 계정 · 권한 목록(11/17) 패널에 [변경 이력] 칸 — 누가 언제 올리고 고쳤는지, 사유(기준 문서) 또는 바뀐 칸과 값(계정 · 권한). 계정 · 권한은 11/18에 최근 변경 줄로 바꿈 (아래 "관리 패널 보기 · 수정 · 이력")
- 관리 권한을 보안 운영자에게 넘긴 뒤(위)라 누가 고쳤는지가 화면에 보이는 것이 감독 수단이기도 함
- 기준 문서의 지난 원문은 길어서 API가 빼고 줌 (감사 기록에는 그대로). 예시 문서처럼 CLI · setup 으로 넣은 문서는 기록이 없어 "기록 없음"
- 문서별 검색 가능 여부(조각 수)는 11/17에 붙였음 — 엔진의 공개 기능 `Engine.documents.chunks()` 로 셈 (아래 관리 패널)

### 관리 패널 · 큐 화면 (11/17)

- 이유: 멘토 피드백 — 관리는 다른 화면의 AI 분석을 받치는 기반. AI 가 관리자가 등록한 사용자 정보 · 보안규정을 근거로 판단함을 보이고, 계정의 시스템 역할과 업무 접근 권한을 나눔
- 패널 안 묶음 상자는 공용 `GroupBox` 하나 (계정 · 권한 · 기준 문서)
- 목록(시안): 계정 = 이름 · 부서(아래 직무) · 역할 · 마지막 로그인 · 상태, 권한 = 권한(아래 코드) · 분류(아래 설명) · 업무 시스템 · 고친 시각 · 신청 가능 / 신청 막힘(예전 켜짐 · 꺼짐). 셋째 칸은 `VIEWS.kind`, 검색은 역할 · 직무 · 시스템도. 역할 · 업무 시스템은 11/18부터 배지 없이 글 (사용자 결정 — 기호 · 굵은 글 상자가 이름 · 부서보다 눈에 띄고 눌리는 것처럼 보였음)
- 계정 · 권한 상세는 11/18에 다시 짬 (아래 "관리 패널 보기 · 수정 · 이력"). 그 전: 계정은 정보 상자 · 권한 정보 배지(`roleMenus`) · 계정 관리 · 추가 설정, 권한은 처음부터 입력 칸. 프로필 기호 · 최근 로그인은 뺌 (사진을 올릴 곳이 없고, 마지막 로그인은 목록에 있음)
- 기준 문서: [검색 상태] = RAG 조각 수(`/api/regulations/index`) · 판정 모델(`/api/health`). 목록은 조항 아래 "검색 가능 / 검색 불가" — 기호 뜻을 적는 안내 줄 없이 글자로 보임. 시안의 ChromaDB · Llama 3 · "재학습"은 실제(Milvus · 설정의 모델 · 다시 임베딩)와 달라 안 씀
- 큐: 왼쪽 2/3 [작업 큐](첫 줄 지금 도는 작업 + 기다리는 작업, 실시간), 오른쪽 1/3 [작업별 실행](작업마다 간격 · 다음 실행 · 마지막 실행 · 성공/실패, `jobRows`) (사용자 제안). 처음 네 영역이었으나 같은 큐 · 같은 작업 이름을 두 번 보여 둘로 합침 (11/17). 작업 기호는 보안 현황 유형 기호와 같음(`jobIcon`), 회색 상자 없이 이름과 간격 두 줄의 왼쪽 가운데에 (11/18)

### API 응답 모양을 명세로 (11/16)

- 이유: 라우트가 모두 `dict` 를 돌려줘 FastAPI 명세(`/openapi.json` · `/docs`)에 응답 모양이 비어 있었고, 화면 타입(`types.ts` 517줄)을 손으로 맞췄음. 백엔드가 응답 칸을 바꿔도 타입 검사 · 시험이 못 잡음. 기업에 넘긴 뒤에는 "백엔드를 고치면 화면 타입도 손으로"를 아는 사람이 없음 (사용자 결정 — 넘기기 전에 채움)
- 지금: 라우트 47개 모두 돌려주는 모양을 선언함. 선언은 `sentinelai/web/responses.py` 한 파일 → `python -m sentinelai.dev api-types` 가 `frontend/src/shared/api/schema.ts` 로 씀 → `types.ts` 는 그 타입을 다시 내보내고 화면만 쓰는 타입(거르기 값 · 화면 상태)만 둠
- **붙이는 방법 둘** (어느 쪽인지는 `responses.py` 머리말에)
  - `response_model` (22개) — 권한 DB 의 행을 그대로 돌려주는 API(계정 · 권한 목록 · 기준 문서 · 변경 이력 · 확인할 사람 · 노드 등록 · 목록 · 운영자 결정 적기). FastAPI 가 응답을 선언에 맞추므로 응답과 선언이 늘 같음. 대신 선언에 없는 칸은 응답에서 빠짐
  - `responses={200: {"model": …}}` (25개 — 팀 main 에서 온 PDF · 엑셀 꺼내기 둘 포함) — 판정 · 집계 · 큐 · 질의처럼 엔진과 데이터 계층이 조립한 값. **명세에만 올리고 응답은 건드리지 않음** — 선언이 틀려도 API 는 그대로 나감(검사 실패로 500 이 나거나 칸이 빠지는 일이 없음). 모양이 크고 실패 사례가 많아 선언 실수가 곧 장애가 되는 것을 피하려고 (사용자 요청 "오류 없이")
- 판정 결과는 엔진의 출력 타입(`engine/worker.py` 의 `Verdict` · `ServerGap` · `PolicyIssue` · `SuspectScore` · `Todo`)을 물려받아 저장하며 붙는 칸만 더함 — 엔진이 칸을 더하면 선언도 따라가고, 같은 정의를 두 벌 두지 않음 (§4 엔진 타입을 대체하는 웹 전용 스키마 금지와 같은 뜻). 엔진 코드는 고치지 않았음
- **지키는 시험** (`tests/test_api_contract.py`)
  - `schema.ts` 가 지금 코드에서 만든 것과 같은지 — 선언을 고치고 `api-types` 를 안 돌리면 실패
  - 모든 라우트가 모양을 선언했는지 — 새 API 를 선언 없이 더하면 실패
  - `response_model` 쪽: 선언의 칸이 DB 가 주는 칸과 같은지
  - `responses` 쪽: 판정 성공 · 실패 · 결재 · 회수 · 퇴사 · 이동 · 결정 이어받기 · 빠른 감시 · 큐에 잡이 도는 상태 · 질의 성공 · 실패를 만들어 넣고 **실제 라우트 함수**를 불러, 돌려준 값이 선언과 엄격히 같은지(종류가 다른 칸 · 선언에 없는 칸 · 빠진 칸). 참 · 거짓과 숫자도 다른 종류로 봄
  - 11/16: 8000번 DB · 시험 DB 의 실제 값으로도 대조해 어긋남 0
- 실제 서버 대조: `python -m sentinelai.dev api-check 주소 --login 아이디` — 떠 있는 서버에 로그인해 읽기 API 를 받아 같은 대조를 함. `response_model` 쪽은 맞추다 실패할 값(올리면 500)과 선언에 없어 빠질 칸을, `responses` 쪽은 어긋난 칸 전부를 짚음. 11/16 시험 웹에서 18개 + 노드 상세 일치. 팀 서버(더 큰 모델의 판정 · 실제 서버 점검 기록)로는 아직 안 돌렸음 — 돌려서 어긋남이 없으면 `responses` 쪽도 `response_model` 로 옮겨 방식을 하나로 할 수 있음
- 생성기를 직접 둔 이유: `openapi-typescript` 는 TypeScript 5 의 컴파일러 API 에 기대는데 화면은 TypeScript 7 — 함께 깔면 실행에서 죽음(`ts.factory` 없음). FastAPI 가 내는 모양만 다루는 60줄 안팎의 변환을 `dev.py` 에 둠 (새 의존성 없음, Node 없이 됨)
  - 한계: 타입만 만들고 주소와 타입의 짝(`getJSON<UserRow[]>("/api/users")`)은 호출하는 쪽이 손으로 고름
  - 대안(확인함): `npx -p typescript@5.9.3 -p openapi-typescript@7.13.0 openapi-typescript …` 처럼 TypeScript 5 를 따로 붙이면 표준 도구가 돌고 주소 단위 타입도 나옴. 타입을 다시 만들 때 Node 와 npm 저장소가 필요함. 넘기기 전에 바꿀지 정함 — 바꿔도 `responses.py` 는 그대로 쓰임
- **드러난 것** (손으로 적은 타입이 실제와 달랐던 곳)
  - 로그 조회의 [내보낸 행 그대로] 칸: 화면이 읽던 `raw` 를 API 가 준 적이 없어 늘 빈 표였음 → 칸을 뺌. 되살리려면 `sources/logs.py` 가 원본 행을 돌려줘야 함
  - 예측에 실패한 의심 점수는 `score` · `level` 이 null 인데 타입은 늘 있다고 봤음 (화면은 실패를 먼저 걸러 문제없었음)
  - 부서 · 시스템 · 분류 · 사용 기간 · 호스트 · IP 를 null 일 수 있다고 봤으나 DB 는 빈 글. 계정 타입에 이메일, 노드 목록에 `finding_failed`, 결재 기록에 결재자 id 가 없었음
  - 질의 답을 화면 항목에 덮어쓰며 서버의 기록 번호가 화면 항목의 id 를 바꿔, 답이 오면 그 줄이 다시 그려졌음 → 화면이 붙인 id 를 그대로 둠
  - 화면 코드는 대부분 `||` 로 받아 동작은 같았고, 고친 것은 주로 시험용 가짜 데이터(실제와 다른 null · 빠진 칸)
- 응답이 달라진 것(`response_model` 쪽만): 계정 목록의 `is_root` · `is_active` · `must_change_password` 가 1/0 에서 true/false 로, 확인할 사람의 flag 에 신청 번호가 없으면 `request_no: null`. `responses` 쪽은 한 글자도 안 바뀜
- 응답 모양을 바꿀 때: `responses.py` 를 고치고 `python -m sentinelai.dev api-types` → 화면 타입 검사가 고칠 곳을 알려 줌. 같은 커밋에

### 일반 사용자 화면 · 테마색 (11/16)

- 이유: 사용자가 가져온 시안(왼쪽 신청서 · 오른쪽 숫자 타일과 표)이 지금 화면(신청서 위 · 목록 아래)보다 한눈에 들어옴. 구조만 가져오고 모양은 운영자 화면들과 같게 — 시안의 그라데이션 띠 · 색 막대 · 카드 그림자 · 깜빡이는 점 · 설명 문장 · 안내 상자 글머리표 · 외부 아이콘 폰트는 뺌 (§4, 사용자 결정)
- 시안에서 뺀 것: 프로필 사진 · [공지사항] 메뉴(백엔드가 새로 필요하고 제안서에 없음), 부제의 "AI 사전 적합도 분석"
- **일반 사용자에게 AI 사전 분석을 주지 않음** (사용자 판단): 신청하면 이미 판정이 돌아 결재자에게 감. 사용자가 결과를 보면 "정상"이 나올 때까지 사유를 고쳐 쓸 수 있어 판정이 통과 요령이 됨. 판정 한 건 20초 안팎이 결재자 판정과 같은 줄을 씀. AI 투자는 보안 운영자 · 보안 총책임자 화면에
- 사용 기간: 끝나는 날을 고르거나 [기한 없음]을 눌러야 신청되고, 끝이 시작보다 앞서면 막음 — 화면에서만 (`periodProblem`). 서버는 지금도 받음: 이번 작업은 백엔드를 고치지 않기로 해서 (사용자 결정, 11/16). API 를 직접 부르면 막히지 않으니 넘기기 전에 `permissions.submit` 에 같은 검사를 더할지 정함. 기한 없음 = 예전처럼 빈 종료일
- 타일은 처음에 결재 중(없으면 전체)을 고른 상태 — 지난 기록에 지금 볼 것이 묻히지 않게(10/30 결정 유지), 빈 목록으로 시작하지 않게
- 상태 색 넷: 결재 대기 남색 · 사용 중 초록 · 반려, 만료 빨강 · 전체 회색. 타일 이름 앞 점 · 표의 배지가 같은 색이라 표를 보고 어느 타일인지 이어짐. 결재 대기를 주황으로 하지 않은 것은 운영자 화면에서 주황이 "주의"라서. 넓게 칠하는 곳은 없음 (사용자 요청 "밋밋하지만 알록달록하지 않게"). 스스로 철회한 신청의 배지만 회색. 고른 타일은 상태색 없이 2px 남색 테두리만 — 처음엔 상태색 테두리 · 바탕이었으나 고를 때마다 화면에서 가장 큰 색 덩어리가 바뀌어 산만했음 (11/16 사용자 결정). 신청서 칸을 누를 때도 같은 2px 남색이라 "지금 고른 · 누른 것 = 남색". 회색은 꺼진 것처럼 보여 안 씀
- 타일 이름 "끝난 신청" → "반려, 만료" — 사용자가 궁금한 것은 반려됐는지라. 이 묶음에 회수 · 철회도 들어가 숫자 아래에 0 이 아닌 것만 내역(`endedBreakdown`)
- 화면 글 규칙(11/6)을 이 화면에서 두 곳만 풂 (사용자 결정): 제목 아래 설명 한 줄(일반 사용자는 이 화면 하나뿐이고 가장 덜 익숙함), 신청서의 결재 안내 상자 두 줄(누가 결재하는지 · 권한이 언제 다시 검토되는지). 안내는 [결재 신청] 아래에 한 줄씩 — 위에 두니 노트북(높이 750px)에서 버튼이 스크롤 아래로 내려갔고, 신청한 뒤의 일이라 버튼 아래가 읽는 순서에도 맞음. 사유 칸 3줄 시안의 "불필요한 신청은 반려될 수 있습니다"는 누구나 아는 말이라 뺌
- 위 막대는 휴대폰 폭(760px 이하)에서만 프로필 · 종을 로고 줄에, 버튼 둘을 그 아래 줄에 둠. 좁은 화면(1150px 이하)에서는 메뉴만 아래 줄로
- **테마색** (산학 과제 상대 회사 사이트에서 남색을 가져옴, 사용자 요청 "조금은"): 위 막대 · 주 버튼 · 질의 버튼 = 남색 `--color-brand`, 선택된 메뉴 = 빨간 밑줄. AI 종합 분석 요약은 다른 카드와 같은 흰 바탕, 머리 기호 · 우선 조치 권고 상자만 남색(`brand-soft`, 신청서 결재 안내 상자와 같은 모양) (11/18 — 예전 카드 전체 살구색이 주의 바탕과 거의 같아 "주의"로 읽혔음). 빨강은 이 화면에서 "위험"이라 버튼에 쓰지 않음 — 반려 버튼과 헷갈림. 위험 · 주의 색(#EA002C · #FF7A00)은 원래 그 회사 빨강 · 주황과 거의 같아 그대로. 회사 로고 · 이름은 넣지 않음 (10/12 결정)
- 위 막대의 부서는 이름 아래 오른쪽 맞춤 (모든 역할) — 한 줄로 두면 버튼처럼 보임
- 크기는 시안 그대로 (사용자 요청 "지금 상자 · 버튼보다 안정적", 위 막대 제외): 화면 폭 1600px 가운데 · 바깥 여백 24px · 두 칸 4:8 · 칸 사이 32px, 카드 안 여백 24px · 칸 사이 20px · 글 14px, 숫자 타일은 안 여백 16px · 이름 14px · 숫자 24px(공용 `Tile` 이라 운영자 화면 타일도 같이 바뀜). 폰트는 시안의 웹 폰트 대신 시스템 폰트 (§4)
- 권한 고르기는 카드 목록 대신 시스템별로 묶은 고르기 상자 — 회사의 권한은 수백 개라 카드로는 다 못 늘어놓음 (사용자 결정). 고른 권한의 분류 · 설명은 상자 아래 한 줄. 브라우저 기본 고르기 상자가 아니라 직접 그린 목록(`AccessSelect`) — 맥 기본 상자는 목록을 상자 위에 겹쳐 띄우고 화살표가 테두리에 붙어, 운영체제와 상관없이 상자 아래로 펼침. 화살표 키 · Enter · Esc · 바깥 누르면 닫힘
- 내 신청 표는 한 쪽 4건 (사용자 결정), 줄이 적어도 4건 자리 · 쪽 번호 줄을 늘 둠 — 거를 때마다 카드 높이가 바뀌지 않고 왼쪽 신청서와 아래 끝이 같음. 1440×900 은 스크롤 없음, 1340×750 은 57px 스크롤 (3건이면 들어감)
- **폰트 Noto Sans KR** (11/16, 사용자 결정 "맥과 윈도우에서 화면을 통일하려면 폰트도 같아야"): 예전엔 시스템 폰트라 맥은 애플 고딕, 윈도우는 맑은 고딕으로 달랐음. 시안과 같은 크기로 재도 시안이 더 굵고 커 보인 까닭도 이 폰트. 외부에서 받지 않고 `@fontsource-variable/noto-sans-kr`(5.3.1 고정)의 파일을 빌드에 넣어 우리 서버가 줌 — 화면 빌드 124개 조각 3.6MB, 브라우저는 쓰는 글자의 조각만 받음(일반 사용자 화면 8개 · 134KB). 굵기는 변수 폰트 하나로 다. 모든 화면에 적용
- 크기 대조 (11/16): 시안 HTML 과 우리 화면을 같은 브라우저 · 1440px 에서 띄워 요소마다 잼 — 위 막대 · 타일 · 표 머리줄 · 표 줄 · 고르기 상자 · 버튼 높이가 같음. 다른 것은 내용 차이뿐(안내 상자 문장이 더 김). 표 줄 높이를 맞추려고 신청 사유는 권한 이름에 마우스를 올리면 보이게, 철회 · 반려 사유는 배지 옆에 둠
- **위 막대** (11/17, 사용자 결정): 남색 유지(흰 막대와 견줘 봄), 메뉴는 가운데보다 조금 왼쪽(양옆 1:2), 처리할 일 숫자는 메뉴 오른쪽 위 작게(99+), 높이 56px, 메뉴 15px · 칸 여백 16px, 로고 글 20px, 선택 밑줄 3px, 로고는 상자 없이 채운 방패 30px(로그인 화면도 같음)

### 기준 문서 PDF 글자 꺼내기 (11/13)

- 이유: 사내 정책 · 절차서 원문이 PDF 로 옴 (§8 5 · 7). 기준 문서는 글로만 적재함
- 흐름: 화면에서 PDF 를 고르면 서버(`web/pdf_text.py`, pypdf)가 글만 꺼내 돌려줌 → 꺼낸 글 · 이름(`.pdf` → `.txt`)을 화면에서 보고 고침 → 예전 올리기 API 로 올림. 엔진 · DB · RAG 는 그대로
- 바로 적재하지 않고 사람이 보게 한 이유: PDF 는 표 · 머리말 · 쪽 번호 · 줄 바꿈이 섞여 나와 조항 번호(`## 3.1`)를 사람이 다듬어야 조항 검색 · 근거 칩이 맞음
- 원본 PDF 는 저장하지 않음 — 원문은 권한 DB 의 글 하나. 감사 기록에 PDF 이름만(`source`)
- 쪽마다 글자가 없으면 그 쪽 번호를 화면에 보임 (스캔 쪽). 모두 없으면 "스캔본은 OCR 이 필요합니다"로 막음. OCR 은 넣지 않음 (§8 7)
- 시험: pytest(쪽 잇기 · 빈 쪽 · 스캔본 · PDF 아님 · 깨짐 · 길이 · 암호). 맑은 고딕으로 만든 한글 PDF 2쪽(둘째 쪽 빈 쪽)에서 제목 · 조항 · 본문이 그대로 나옴. 시험 웹에서 보안 총책임자로 PDF 를 골라 꺼낸 글 · 이름 · 빈 쪽 표시를 봄. 적재는 Milvus · 모델 서버가 없어 503 까지만 봄 (`.md` 올리기와 같은 길)

### Teams 채널 알림 (11/15)

- 요청: Slack 으로 가는 운영자 채널 알림을 Teams 에도 똑같이. 결재 대기 · 로그 감시 위험 · 예외 상황 전부, 글도 같음
- `Chat`(Slack · Teams 주소)을 감시 스레드 · 결재 대기 알림에 넘기고 `send_chat` 이 켜 둔 곳마다 보냄. 한쪽이 실패해도 다른 쪽은 감
- Teams 는 적응형 카드(`attachments` 에 `application/vnd.microsoft.card.adaptive`) — 예전 Office 365 커넥터의 수신 웹훅이 없어지는 중이라 새 워크플로 웹훅이 받는 모양으로. 예전 수신 웹훅도 같은 모양을 받음
- 줄마다 글 상자 하나 · 첫 줄 굵게 — 글 상자 하나에 줄 바꿈을 넣으면 마크다운으로 읽혀 줄이 붙을 수 있음
- 시험: pytest(두 채널에 같은 글 · 한쪽만 켜기 · 결재 대기 카드 · Teams 만 켜도 감시가 뜸), 로컬 수신기로 실제 HTTP 본문 확인

### 기준 문서 엑셀 표 꺼내기 (11/16)

- 이유: 사내 보안 솔루션 정책 현황이 엑셀(`보안솔루션정책현황.xlsx` — 솔루션 20종 · 통제 기능 47줄)로 옴. 실제 솔루션 정책을 RAG 에 올리는 길 (§8 2)
- 흐름: PDF 와 같음 — 서버(`web/xlsx_text.py`)가 표 모양만 돌려줌 → 화면이 표마다 고르기 칸 → 고른 표를 조항 글로(`tablesText`) → 사람이 보고 고친 뒤 예전 올리기 API 로. 엔진 · DB · RAG 는 그대로
- 표 찾기: 한 칸만 든 줄은 제목(`■ …` · `3) …` · `[DLP]` — 대괄호 제목은 위 절 제목을 붙임), 두 칸 이상이면 표 머리, 빈 줄까지가 본문. 세로로 합친 칸은 아래 줄에 같은 값, 가로로 합친 묶음 머리가 있으면 다음 줄이 아래 머리. 본문이 빈 칸 · 본문 없는 표는 뺌. 셀 메모는 그 줄의 `메모` 로
- 조항 글: 첫 칸(구분)으로 `## 번호.` 묶음, 줄마다 `### 번호.번호 둘째 칸` — 근거 확인(`engine/ground.py`)이 `문서.txt 2.1` 로 찾게. 같은 묶음에 같은 제목이 여럿이면 다음 칸 첫 줄을 붙임. 고른 표가 여럿이면 번호를 이어 감
- 정책 표만 올림 (사용자 결정) — 머리에 사번 · 성명 · 이름 · 아이디가 든 표(예외처리 현황 신청자 · 대상자)는 "사람 기록"으로 처음부터 빼 둠. 고르면 경고. 사람 기록이 RAG · 판정 입력에 그대로 들어가지 않게
- 크기 막기: 파일 20MB · 압축 푼 크기 200MB · 칸 200만 · 글 100만 자. XML 은 `defusedxml` 로 읽음 (openpyxl 이 있으면 씀)
- 시험: pytest(합친 칸 · 제목 · 메모 · 사람 기록 표시 · 두 줄 머리 빈 표 · 깨진 파일 · 빈 책 · 길이), vitest(조항 글 · 번호 잇기 · 같은 제목 가르기). 시험 웹에서 실제 파일 — 정책 표 1개(47줄, 조항 글 9.3천 자)만 골라지고 예외처리 4표는 사람 기록으로 빠짐. 적재는 하지 않음. 실제 파일은 사번 · 이름이 들어 저장소에 넣지 않음

### 화면 문구 정리 (11/18)

- 요청: 화면 글의 AI 말투를 뺌 — 끊어 쓴 동사형(올림 · 고침 · 안 셈 · 못 함 · 안 됨 · 바꿀 것)과 "안 · 밖 · 뒤"를 업로드 · 수정 · 미입력 · 불가 · 내 · 외 · 후 같은 말로 (사용자 요청)
- 백엔드가 만드는 화면 · 채널 알림 · 오류 문구도 같게 — 권한 변동 flag "이동 후 재검토", 노드 추이 악화 · 개선 · 변화 없음, Slack · Teams 의 업로드 · 수정 · 생성 · 재활성, 값 목록의 가운뎃점은 쉼표
- 모델 입력 글(`context/` · `ask/` · 출력 타입 · `sources/` 의 판정 입력)과 트리거 오류 문구(`main.sql`)는 그대로 — 판정 · 스키마가 바뀌지 않게
- 예외 알림의 보유 권한 위험이 가리키던 [확인할 사람](11/17에 없앰)을 보안 현황 [권한 변동]으로
### 관리 패널 보기 · 수정 · 이력 (11/18)

- 이유: 멘토 피드백(계정에서 사용자 · 부서 · 직무 · 역할을 쉽게 확인, 시스템 역할과 업무 접근 권한 구분, 변경 이력 확인). 계정과 권한 목록은 같은 성질(지금 설정을 보고 고치고 이력을 봄)이라 같은 틀 (사용자 결정)
- 공용 틀: `Panel` 의 `record`(보기 · 수정 · 이력) — 보기에서 머리 [수정], 수정 중 넓은 화면 머리 ×(좁은 화면은 패널 닫기 ×), 줄은 `InfoRow`, 수정 칸은 낮은 `rowInput`. 머리(이름 · 정보 한 줄 · 상태 배지 · 최근 변경 줄)는 `RecordHead`, 아래 [취소] [저장]은 `EditActions` — 세 패널이 같이 씀
- 묶음 둘: 판정에 들어가는 값(계정 = 업무 정보: 부서 · 직무 · 업무 권한 · 로그 사용자 ID · 퇴사일, 권한 = 권한 정보: 시스템 · 분류 · 설명)과 시스템 설정(SentinelAI 계정: 이름 · 역할 · 상태 · 비밀번호 · 생성일, 신청 설정: 상태 · 등록일). 묶음 이름에 "AI 판정 근거"는 안 붙임 (사용자 결정)
- 권한 정보 배지(역할로 쓰는 메뉴 다섯)를 뺌 — 역할로 정해지는 목록이고 보안 운영자와 보안 총책임자는 넷이 같음. ✓ 배지가 계정마다 켜고 끄는 권한처럼 보였음. 역할 옆에 다른 일 한 구절(`ROLE_DUTY`)
- 권한의 신청 가능 스위치도 계정 상태처럼 [저장] 때 함께 반영 (예전엔 누르는 즉시). 막을 때만 확인 창
- 변경 이력: 이름 아래 최근 변경 한 줄(누가 · 언제 · 바뀐 칸)을 늘 보이고, 누르면 패널 안이 이력 목록 (사용자 선택 — 정책 관리의 AI 분석 / 결정 기록 탭은 두 내용이 같은 무게라 맞지만, 설정 화면은 지금 값이 먼저이고 이력은 확인용). 수정 중에는 안 보임
- 감사 기록: 계정 · 권한 수정은 바뀐 칸과 바뀌기 전 값(`from`)만 남김, 바뀐 것이 없으면 안 남김 (`db/auth.py` · `db/catalog.py`). 화면이 저장 때 칸을 전부 보내 이력에 무엇이 바뀌었는지 안 보였음. 화면은 "부서 빈 값 → 인사팀", 그 전 기록은 받은 칸 그대로
- 기준 문서도 같은 틀 — 상태 배지는 검색 가능 · 불가, 최근 변경 줄은 동작과 사유. 지우기는 수정 화면 왼쪽 아래 [문서 지우기]로 (머리 버튼이 [수정] 하나가 되게). 수정 화면은 원문 글상자 · 사유 · 파일 이름 확인이라 한 줄씩 나누지 않음. 기다리던 수정은 [취소] · ×가 같게 멈춤. 화면 말은 업로드 · 수정 · 저장으로 맞춤

### 판정 근거 정리 (11/18)

- 요청: 화면 피드백 작업(김혜정)에서 엔진에 셋을 부탁 — 정책 관리 검토의 정상 조항 이유 · AI 비서의 영역을 넘는 우선순위 · 판정 근거의 입력 칸 이름. AI 비서는 이번에 뺌 (사용자 결정)
- 정책 관리 검토: 출력 타입에 `passed`(조항 · 정상 이유) 칸을 더함. `kind` 에 "정상"을 넣지 않은 이유 — 문제마다 운영자 결정 · 처리할 일 · 보안 현황 집계가 붙어 정상 조항이 결정 대기로 섞임. 저장은 `policy_reviews.passed`(JSON), `/api/results` 의 `policy_review.passed`. 정상 조항도 근거 확인(입력에 있는 조항인지)을 함
- 판정 근거: 로그 감시 `sources` 에 "대상 사용자 기록 — 로그 22건"처럼 입력 칸 이름이 왔음. 출력 타입 설명을 "기준 문서 이름과 조항 번호만"으로 고치고, 모델이 따르지 않아도 코드가 문서 이름(.md · .txt, 확장자 없이 쓴 입력 문서 이름도)이 든 것만 남겨 "문서 이름 조항 번호" 한 줄씩으로 나눔. 뺀 것은 `grounding.checks` 에 적음. `Verdict` 를 쓰는 권한 신청 · 재검토 · 로그 감시 모두
- 모델로는 아직 안 돌려 봄 — 프롬프트 · 출력 타입 설명이 바뀌어 §5 판정을 다시 볼 것
