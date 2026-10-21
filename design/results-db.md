# AI 결과 DB 설계

SentinelAI — 전북대학교 RAD(RAG & Decision) · SK쉴더스
2026-10-12 · 권한 DB는 [`db-schema.md`](db-schema.md) · DDL: [`sentinelai/db/results_schema.sql`](../sentinelai/db/results_schema.sql)

---

## 0. 기준 (2026-10-12, 양현성)

**사람이 한 것과 결재 흐름은 권한 DB, 그 밖에 AI가 만든 것은 AI 결과 DB.** 로그는 어느 쪽에도 쌓지 않는다.

| 저장소 | 담는 것 |
|---|---|
| 권한 DB (`SENTINELAI_DB_PATH`) | 계정 · 세션 · 감사 기록 · 권한 신청(AI 판정 · 1차 · 최종 결재 · 회수를 한 행에) · 정책 · 로그 운영자 결정 |
| **AI 결과 DB** (`SENTINELAI_RESULTS_DB_PATH`) | 정책 관리 검토 · 로그 감시 판정(지금의 `results.json`) · AI 질의 기록 |
| 보안 솔루션 로그 | **쌓지 않는다.** 로그가 있는 곳(지금은 CSV, 나중에 외부 DB · Microsoft Sentinel)에서 `sentinelai.data`의 소스로 읽는다 |

- 처음 이름은 Log DB였다. 로그는 외부 DB에 쌓일 수 있어 우리가 따로 쌓지 않기로 하고(10/12), 남은 것이 AI 결과뿐이라 이름을 바꿨다.
- 권한 신청 AI 판정은 권한 DB에 둔다. 보안 총책임자까지 올라가는 결재 근거라서 신청과 함께 남아야 한다 (`db-schema.md` 결정 15~17).
- 권한 DB의 운영자 결정은 AI 결과 DB 행을 `테이블/id` 문자열로 가리키고, 결정에 쓴 값(AI 등급)은 사본으로 함께 둔다. 두 DB는 FK로 묶이지 않는다.
- AI 결과 DB는 쌓기만 한다. 행을 고치지 않는다 (트리거). 지우는 것은 보관 기간 정리뿐이고, **권한 DB가 가리키는 행은 지우지 않는다** (§4).
- 엔진 · 데이터 계층 · `pipeline`은 DB를 모른다. `pipeline`은 지금처럼 dict를 돌려주고, 저장은 `sentinelai/db/results.py`가 한다. `pipeline.ResultStore`와 `SENTINELAI_RESULTS_PATH`는 없앴다 (10/12). (10/20: 흐름은 `engine/pipeline.py`로 옮겼고, 저장은 `Engine`의 `run_*` 기능이 `db.results`로 한다.)

**로그 질의는 RAG로 만들지 않는다** (10/12 재확인). "몇 번 · 언제부터 · 누가"는 집계라서 비슷한 몇 줄(`top_k`)만 찾으면 건수가 틀린다. 로그를 RAG에 넣으려면 외부 DB의 로그를 Milvus에 한 벌 더 쌓고 계속 맞춰야 한다. 지금처럼 모델이 질문을 조건(`LogFilter`)으로 바꾸고, 세는 일은 로그가 있는 곳이 한다. 외부 DB 소스를 붙이면 조건을 그 DB의 쿼리(Microsoft Sentinel이면 KQL)로 넘긴다. 지금 `ask_logs`는 로그 전체를 메모리에 읽어 세므로, 외부 소스를 붙일 때 함께 바꾼다. 조건으로 바꾸기 어려운 질문("수상한 출력 행위")의 비슷한 사례 찾기는 필요해지면 RAG를 두 번째 경로로 더한다.

---

## 1. 무엇을 바꾸나

| 지금 | 바뀐 뒤 |
|---|---|
| 정책 관리 검토 = `results.json`의 `policies` 구역, 돌릴 때마다 덮어씀 | 실행마다 쌓인다. 화면은 마지막 실행을 보여주고, 예전 실행과 그 결정도 남는다 |
| 로그 감시 = `results.json`의 `events` 구역에 쌓음, 다음 감시 시작점도 그 안 | 감시 1회 = 실행 1행 + 판정 n행. 다음 시작점 = 실행들의 마지막 로그 시각 중 가장 늦은 것 |
| 운영자 결정 key = `실행 시각#순번` · `사용자@마지막 로그 시각` | `policy_issues/{id}` · `event_findings/{id}` |
| CLI와 웹이 JSON 파일 하나를 함께 씀 (겹치면 한쪽 결과가 사라질 수 있음) | SQLite가 쓰기를 차례로 받는다 |
| 질의 기록 = 화면 메모리, 새로고침하면 사라짐 | 질문 · 답 · 근거 · 물은 사람이 남는다 |

---

## 2. 테이블

```
policy_reviews ── policy_issues        (정책 관리 검토 1회 ── 문제 n건)
               └─ server_findings      (            ── 서버 점검 n건, results_servers.sql)
monitor_runs   ── event_findings       (로그 감시 1회 ── 사용자별 판정 n건)
qa_records                             (정책 질의 · 서버 질의 · 로그 질의)
```

### `policy_reviews` — 정책 관리 검토 1회 = 1행
| 칸 | 설명 |
|---|---|
| `source` · `load_issues` | 읽은 정책 파일 · 읽지 못한 행 (JSON 목록) |
| `rules` | 그때 읽은 정책 원본 (JSON). 정책 파일이 바뀌어도 그 실행이 무엇을 봤는지 남는다 |
| `summary` | 검토 요약 (`PolicyReview.summary`) |
| `failed` · `error` | 판정 실패 |
| `model` · `elapsed_sec` · `created_at` | 판정 모델 · 걸린 시간 · 실행 시각 |
| `servers_source` · `servers_load_issues` | 읽은 서버 현황 폴더 · 읽지 못한 행 (10/12 추가) |

### `policy_issues` — 문제 1건 = 1행
| 칸 | 설명 |
|---|---|
| `review_id` · `seq` | 어느 실행의 몇 번째 문제 (화면의 `ISSUE-n`) |
| `kind` · `level` · `policy_ids` · `reason` · `recommendation` | `PolicyIssue` 그대로 (`policy_ids`는 JSON 목록) |

### `server_snapshots` — 수집 1건 = 1행 (10/20, `results_server_snapshots.sql` · `results_nodes.sql`)
| 칸 | 설명 |
|---|---|
| `node` · `host` · `ip` · `collected_at` · `collected_by` | 수집 노드가 보낸 본문 그대로 (수집 시각 UTC). `(node, collected_at)`은 한 번만 — 같은 수집을 다시 보내도 늘지 않는다. `file`은 10/20 첫 설계(폴더 수집)의 흔적으로 비어 있다 |
| `modules` | 모듈 → 항목 → 값 (JSON, `ServerSnapshot.modules`). 판정 입력 · 화면이 이것을 쓴다 |
| `sections` | 모듈별 수집 원문 (JSON). 뽑는 항목을 바꾸면 이것으로 다시 셀 수 있다 |
| `changes` | 같은 서버의 바로 앞 수집과 달라진 항목 (예: `[UFW] 상태: 켜짐 → 꺼짐`). 처음 수집 · 늦게 도착한 옛 수집은 빈 목록 |
| `loaded_at` | 적재 시각 |

고칠 수 없다 (트리거).

### `node_findings` — 노드 서버 점검 1건 = 1행 (10/20, `results_nodes.sql`)
| 칸 | 설명 |
|---|---|
| `node` · `snapshot_id` | 어느 노드의 어느 수집을 보고 판정했는지 — 판정이 본 모듈 상태는 그 수집 행이다 |
| `host` · `ip` · `state` · `matched` | 서버와 덧붙인 서버 현황 표의 행(JSON) · 코드가 찾은 규칙 |
| `level` · `summary` · `gaps` · `unjudged` · `sources` | `ServerReview` 그대로 (`sources`는 `gaps`의 근거 조항을 모은 것) |
| `failed` · `error` · `elapsed_sec` · `model` · `created_at` | 실패 · 걸린 시간 · 판정 모델 · 판정 시각 |

주기 점검(`check_nodes`)은 노드마다 가장 늦은 수집 중 이 표에 아직 없는 것만 판정한다. 화면은 노드마다 마지막 판정을 보고, 운영자 결정은 `node_findings/{id}`를 가리킨다 (`kind = server`). 10/12 · 10/14의 `server_findings`(정책 관리 검토 안의 서버 점검)는 10/20부터 쓰지 않는다 — 예전 행만 남아 있다.

### `server_findings` — 서버 점검 1건 = 1행 (10/12, `results_servers.sql`)
| 칸 | 설명 |
|---|---|
| `review_id` · `seq` | 어느 정책 관리 검토의 몇 번째 서버 |
| `host` · `ip` · `state` | 서버와 그때 읽은 현황 원본 행 (JSON) |
| `matched` | 코드가 IP · 대역 · 호스트 이름으로 찾은 규칙 (판정에 넣은 글 그대로) |
| `level` · `failed` · `error` · `elapsed_sec` | `ServerReview.level` + 실패 · 걸린 시간 |
| `gaps` | 기준 문서와 다른 곳 목록 (JSON) — `ServerGap` 그대로: 항목 · 지금 상태 · 기준이 요구하는 상태 · 근거 조항 · 등급 · 바꿀 것 (10/14, `results_server_gaps.sql`) |
| `unjudged` | 다루는 조항이 없어 판단하지 않은 현황 항목 (JSON) |
| `reason` · `sources` | `ServerReview.summary` · `gaps`의 근거 조항을 모은 것 (결정 · 근거 칩이 다른 판정과 같은 칸을 읽게). `recommendation`은 10/14부터 비우고 바꿀 것은 `gaps`에 둔다 (그 전 행은 `Verdict`라 `gaps`가 빈다) |

운영자 결정은 `server_findings/{id}`를 가리킨다 (`kind = server`, 이상 없음 · 조치 필요). 정책 문제처럼 다시 돌리면 새 행이 생기므로 예전 결정은 새 점검에 붙지 않는다.

### `monitor_runs` — 로그 감시 1회 = 1행
| 칸 | 설명 |
|---|---|
| `source` · `load_issues` | 읽은 로그 · 읽지 못한 행 |
| `since` · `until` | 이번에 판정한 기간 (비면 처음부터 · 끝까지) |
| `last_event_at` | 이번에 읽은 로그 중 가장 늦은 시각. 새 로그가 없으면 비어 있다 |
| `model` · `created_at` | 판정 모델 · 실행 시각 |

- 다음 감시 시작점 = `max(last_event_at)`. 시각은 UTC ISO 문자열로 맞춰 넣어 문자열 비교가 곧 시각 비교가 되게 한다.

### `event_findings` — 사용자별 판정 1건 = 1행
| 칸 | 설명 |
|---|---|
| `run_id` | 어느 감시 실행 |
| `user` · `subject` | 로그의 사용자 · 화면 제목(부서 + 이름) |
| `first_event_at` · `last_event_at` · `events` | 판정한 로그 묶음 (한 줄에 한 건) |
| `level` · `reason` · `recommendation` · `sources` | `Verdict` 그대로 |
| `failed` · `error` · `elapsed_sec` | 판정 실패 · 걸린 시간 |

### `qa_records` — 질의 1건 = 1행
| 칸 | 설명 |
|---|---|
| `kind` | `policy`(정책 질의 · `rag_chain`) · `servers`(서버 질의 · `ask_servers`, 10/21 `results_qa_servers.sql` — CHECK 를 바꾸려고 표를 다시 만들었다) · `logs`(로그 질의 · `ask_logs`) |
| `question` · `answer` | 질문 · 답 |
| `sources` | 정책 질의의 근거 (JSON) |
| `criteria` · `facts` · `evidence` | 로그 질의의 조건 · 집계 · 근거 로그 줄 (JSON). 숫자가 집계와 맞는지 나중에 검증할 재료 (§8-7 할루시네이션 검증) |
| `failed` · `error` · `model` · `elapsed_sec` | |
| `asker_id` + `asker_name` · `asker_department` · `asked_at` | 물은 사람 (권한 DB 사용자 id와 당시 이름 · 부서 사본) |

---

## 3. 코드

10/12에 모두 옮겼다. CLI(`review-policies` · `monitor`)와 웹 작업이 같은 함수로 쌓고, `/api/results`는 DB에서 읽는다. CLI의 `ask-logs`는 물은 사람이 없어 질의 기록에 남기지 않는다.

| 지금 | 바뀐 뒤 |
|---|---|
| `pipeline.ResultStore(results_path)` | `db.results` — `save_policy_review` · `save_monitor_run` · `next_monitor_since` · `latest_policy_review` · `monitor_findings` · `save_qa` · `my_qa` |
| `store.put("policies", …)` · `store.add_events(…)` | 위 함수. CLI · 웹 작업이 같은 함수를 부른다 |
| `view.results(store.load())` | `view.results(latest_policy_review, monitor_findings)` — 화면 응답 모양은 그대로, key만 바뀐다 (`requests` 구역은 빠졌다) |
| `/api/ask` · `/api/ask-servers` · `/api/ask-logs` | 답한 뒤 `qa_records`에 남긴다 |
| — | `GET /api/qa?kind=` — 내 질의 기록 (§5-1) |

---

## 4. 보관 기간

지금은 지우지 않는다. 정리를 넣을 때의 규칙만 정해 둔다.
- 질의 기록은 기간이 지나면 지울 수 있다.
- 판정(`policy_issues` · `event_findings`)은 권한 DB의 운영자 결정이 가리키면 지우지 않는다.

---

## 5. 정한 것 (10/12)

1. **질의 기록은 자기 것만 본다.** 보안 운영자는 화면에서 자기 질의만 본다 (메뉴마다, 새로고침해도 남음). `GET /api/qa`는 부른 사람의 기록만 돌려준다. 전체 기록은 DB에만 있다.
2. **CSV 권한 신청 일괄 판정(`make review-requests`)** — 권한 신청은 DB로 들어온다. 이 명령은 §8-1(전 건 판정해 기대와 대조)용 **평가 명령으로만 남기고 DB에 쓰지 않는다**. 결과는 화면에 찍고, `--out 파일`이면 JSON으로도 남긴다. `/api/results`에서 `requests` 구역을 뺀다. → 10/20에 CLI를 줄이며 없앴다.
3. **지금 `results.json`** (로그 감시 판정 2건)은 옮기지 않는다. 필요하면 `make monitor FULL=1`로 다시 판정한다.
4. **로그 감시 화면 범위** — 이번에는 쌓인 판정을 전부 보여준다. 기간은 로그 감시 이력 화면(§8-5)에서 정한다.
