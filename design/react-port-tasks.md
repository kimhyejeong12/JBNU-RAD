# React 이식 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sentinelai/web/static/index.html`(단일 파일 바닐라 JS, 2,751줄)을 기능 · 모양 그대로 React + TypeScript로 옮기고, 마지막에 빌드 결과를 같은 자리에 넣어 서버 코드를 건드리지 않고 바꾼다.

**Architecture:** `frontend/`에 Vite 앱 하나. `app/`(껍데기 · UI 상태 reducer · 검토 현황 공통) · `shared/`(API · 공통 부품 · CSS) · `features/`(메뉴별 폴더, 서로 import 금지). 서버 데이터는 TanStack Query가 키별로 폴링하고, UI 상태는 순수 reducer + context에 둔다. CSS는 지금 것을 클래스 이름 그대로 영역별 파일로 나눠 원래 순서로 import한다.

**Tech Stack:** React 19 · TypeScript · Vite 8 · @tanstack/react-query 5 · Vitest 5 · ESLint(Vite 템플릿 것). 외부 CDN · 웹폰트 없음.

**Spec:** `design/react-port-plan.md`. 기능 · API 명세는 `FRONTEND_GUIDE.md`, 동작의 정답지는 `index.html`(git 태그 `ui-legacy`). 아래 줄 번호는 모두 그 파일 기준이다.

## Global Constraints

- 외부 출처 요청 없음 — CDN · 웹폰트 · 외부 이미지 · 아이콘 서비스 금지. 아이콘은 `index.html` 664–684의 SVG 경로를 그대로 옮긴다.
- 같은 출처 · 쿠키 세션 — `fetch`에 토큰을 넣지 않는다. 모든 요청은 `cache: "no-store"`.
- 일반 사용자(`role: "user"`) 화면에는 AI · 엔진 · 모델 문구가 없고 `/api/health`를 부르지 않는다.
- 등급 글자는 정상 · 주의 · 위험 셋만. 사용자 용어는 일반 사용자 · 보안 운영자 · 보안 총책임자.
- 화면 글자 · 문구는 `index.html`과 글자 단위로 같게 옮긴다 (이번 단계는 리디자인이 아니다).
- 서버 코드(`sentinelai/`) · `docs/` · `FRONTEND_GUIDE.md`는 마지막 전환 작업 전까지 건드리지 않는다.
- `dangerouslySetInnerHTML` 금지. `data-tip` · `data-tip-pos`는 남긴다 (툴팁이 document 위임으로 읽는다).
- 기능 폴더는 `shared/*` · `app/ui`만 import한다. `app/*`가 조립한다.
- 자동 결재 · 자동 조치 버튼 없음. 결정은 사람이 한다.
- 커밋: 한국어 짧은 제목 + 3줄 이하. 작업마다 `frontend/` 경로만 `git add`한다 (작업 트리에 CLAUDE.md · README.md의 스테이지된 변경이 따로 있다).
- 코드 주석은 "~합니다"체로, 코드만 봐서는 알 수 없는 이유만.

## Review Focus

명세가 말하지 않지만 운영자가 바로 만나는 입력. 각 줄의 시험은 해당 작업에 넣었다.

1. **폴링 도중 세션 만료(401)** — 작업 폴링 · 판정 폴링이 돌던 중 401이 오면 로그인 게이트가 뜨고 폴링이 멈춰야 한다. 오류가 반복해서 뜨면 안 된다. → 작업 3(`http.test.ts`) · 작업 4 수동 확인.
2. **판정이 없거나 실패한 신청** — `ai_verdict`가 없거나(일반 사용자) `failed: true`인 행에서 깨지지 않고 "판정 대기" · "판정 실패"가 뜬다. → 작업 5 `items.test.ts`.
3. **아무것도 돌리지 않은 서버** — `/api/results`가 비어 있을 때(정책 0 · 서버 0 · 로그 0) 빈 문구와 "아직 분석하지 않았습니다", 근거 칩의 정책 원본 안내가 뜬다. → 작업 3 `clause.test.ts` · 작업 6 `emptyText.test.ts` · `footer.test.ts`.
4. **모델이 변형 문자로 적은 정책 ID**(`FW‑002`, U+2011) — 근거 칩이 정책 원본 행을 찾는다. → 작업 3 `clause.test.ts`.
5. **좁은 화면 ↔ 넓은 화면 전환** — 서랍을 연 채 창을 넓히면 배경 막이 남지 않고, 좁히면 목록 칸이 6개 그대로라 3 · 4 · 6번째가 숨는다. → 작업 4 · 5 수동 확인.

---

## 폴더 · 파일 (전체)

```
frontend/
├── index.html · vite.config.ts · package.json · tsconfig*.json · eslint.config.js
└── src/
    ├── main.tsx                      createRoot · QueryClientProvider · import "./app/styles.css"
    ├── app/
    │   ├── styles.css                @import만, 아래 작업 2의 순서
    │   ├── queryClient.ts            전역 기본값
    │   ├── views.ts                  VIEWS · ROLE_VIEWS · RESULT_VIEWS · LEVEL_VIEWS · TYPE_VIEW · TYPE_LABEL (709–731, 701, 703)
    │   ├── App.tsx                   AuthContext · 게이트 · AppShell 분기 (boot 2726–2748)
    │   ├── AppShell.tsx              body.solo · body.drawer-open · Escape · 자식 순서 (2533–2537, 2576–2580, 2736)
    │   ├── useBoot.ts                역할별 필수 쿼리가 한 번 끝났는지 (loadData 827–843)
    │   ├── useJobsWatcher.ts         작업 끝 · 빠른 감시 끝 → invalidate (watchJobs 1804–1837)
    │   ├── TopBar.tsx · AlertPop.tsx renderTop 962–987 · engineProblems · 종 (2520–2523)
    │   ├── Sidebar.tsx · Seg.tsx     buildNav 2485–2496
    │   ├── MainTabs.tsx              514–521 · 2450–2452
    │   ├── Workspace.tsx             탭 보이기 (2429–2435) · cite 클래스 (syncCite 1683)
    │   ├── RightPanel.tsx            renderPanel 1116–1136 · 닫기 (2578)
    │   ├── Footer.tsx                renderFooter 2582–2598
    │   ├── DocsModal.tsx             653–658 · 2525–2532
    │   ├── TooltipLayer.tsx          2669–2722
    │   ├── ui/uiReducer.ts           UI 상태 · 동작 (순수)
    │   ├── ui/UiContext.tsx          useUi() — 동작 래퍼 (firstKey 계산 · 서랍 폭 확인)
    │   └── queue/                    검토 현황 공통
    │       ├── types.ts              QueueItem
    │       ├── useQueue.ts           queue() 872–919 — 기능별 어댑터 조립
    │       ├── select.ts             inView · visible · openRisks · viewCounts · firstKeyInView (921–946, 1007–1011, 2463–2467)
    │       ├── emptyText.ts          1020–1030
    │       ├── QueueTab.tsx · QueueHead.tsx · SummaryCards.tsx · QueueTable.tsx   524–564 · 990–1055
    ├── shared/
    │   ├── api/http.ts               getJSON · send · ApiError · onUnauthorized (807–825)
    │   ├── api/types.ts              응답 타입 (FRONTEND_GUIDE §4)
    │   ├── api/queries.ts            queryOptions 모음 · EMPTY_RESULTS (770)
    │   ├── api/jobs.ts               useStartJob · runButton · jobsInterval · shouldRefresh (1767–1801)
    │   ├── lib/format.ts             stamp · pct · niceMax (847, 2073, 2112)
    │   ├── lib/request.ts            period · requester · isActive · STAGE_LABEL · STEP (849–854, 705–707)
    │   ├── lib/levels.ts             LEVELS · LEVEL_ICON · LEVEL_TIP · SUSPECT_COLOR (692–693, 764–768, 2048)
    │   ├── lib/labels.ts             ROLE_LABEL · MODULE_LABEL (704, 702)
    │   ├── lib/clause.ts             docOf · plainDash · isRule · ruleIds · ruleText · clauseText · chipLabel (1069–1113)
    │   ├── lib/hooks.ts              useNow · useMediaQuery · activateProps
    │   ├── lib/tooltip.ts            placeTip 계산 (2675–2689)
    │   ├── ui/Icon.tsx · LevelDot.tsx · KvTable.tsx · Section.tsx · PanelHead.tsx · PanelMsg.tsx
    │   ├── ui/History.tsx · SourceChips.tsx · ModuleTables.tsx · Periods.tsx
    │   ├── ui/charts/                HBars · Legend · Meter · TableView · Sparkline · DataTable (2062–2112)
    │   └── styles/                   base · layout · components · panel · forms · responsive
    └── features/
        ├── auth/        Gate.tsx · LoginForm.tsx · PasswordForm.tsx · api.ts · auth.css
        ├── requests/    items.ts · RequestPanel.tsx · RequestForm.tsx · accessOptions.ts · api.ts · requests.css
        ├── review/      items.ts · constants.ts · ReviewPanel.tsx · DecisionLog.tsx · RunButton.tsx · api.ts · review.css
        ├── nodes/       nodeState.ts · NodesTab.tsx · NodesPanel.tsx · NodeKey.tsx · api.ts · nodes.css
        ├── logs/        constants.ts · LogsTab.tsx · LogsPanel.tsx · lib.ts · logs.css
        ├── ask/         config.ts · criteria.ts · useAsk.ts · AskTab.tsx · AskPanel.tsx · Evidence.tsx · ask.css
        ├── stats/       constants.ts · lib.ts · StatsTab.tsx · SystemStats.tsx · UserStats.tsx · SafetyBand.tsx · StatsPanel.tsx · StatRow.tsx · stats.css
        ├── catalog/     items.ts · AccessPanel.tsx · api.ts
        └── accounts/    items.ts · UserPanel.tsx · api.ts
```

옮기지 않는 것: `$` · `esc` · `paintIcons` · `renderAll` · `renderAfterChange` · `jobTimer` · 3초 `setInterval`(1573–1585) · `syncCite` · `levelsText`(2036) · `LEVEL_SEGS`(2082) · 두 번째 `periodDays`(2106) · `logsSeq`.

---

### Task 0: 준비

**Files:** 없음 (git만)

- [ ] **Step 1:** `git tag ui-legacy` (지금 `main` HEAD — 옛 화면의 마지막 모습)
- [ ] **Step 2:** `git switch -c react-port`
- [ ] **Step 3:** `make dev-setup RESET=1 && make dev`가 `http://127.0.0.1:8001`에서 뜨는지 확인. 세 계정(`dev-root` · `dev-op` · `dev-user`, `dev-pass-1234`)으로 로그인되는지 본다.
- [ ] **Step 4:** 옛 화면을 세 계정 × 1440px · 390px로 스크린샷해 `/private/tmp/claude-501/.../scratchpad/legacy/`에 둔다 (비교용, 커밋 안 함).

---

### Task 1: Vite 뼈대

**Files:**
- Create: `frontend/` (Vite `react-ts` 템플릿), `frontend/vite.config.ts`, `frontend/index.html`
- Modify: `.gitignore`, `.dockerignore`, `Makefile`

**Interfaces:**
- Produces: `npm run dev`(5173, `/api` → `127.0.0.1:8001` 프록시) · `npm test`(Vitest, `TZ=Asia/Seoul`) · `npm run build` · `npm run lint`, 경로 별칭 `@/` → `src/`

- [ ] **Step 1:** `npm create vite@latest frontend -- --template react-ts` 뒤 템플릿의 `App.css` · `index.css` · `assets/` · 샘플 `App.tsx` 내용을 지운다.
- [ ] **Step 2:** `cd frontend && npm i @tanstack/react-query && npm i -D vitest`
- [ ] **Step 3:** `vite.config.ts` — `server: { port: 5173, strictPort: true, proxy: { "/api": "http://127.0.0.1:8001" } }`, `resolve.alias["@"] = "/src"`, `test: { environment: "node", include: ["src/**/*.test.ts"] }`. `/internal`은 화면이 쓰지 않으므로 넘기지 않는다.
- [ ] **Step 4:** `tsconfig.app.json`에 `paths: { "@/*": ["./src/*"] }`. `package.json` scripts: `"test": "TZ=Asia/Seoul vitest run"`, `"typecheck": "tsc -b --noEmit"`.
- [ ] **Step 5:** `frontend/index.html` — `index.html` 1–7과 같은 head(`lang="ko"` · viewport · `<title>SentinelAI</title>` · `<link rel="icon" href="data:,">`), body에 `<div id="root"></div>` + `<script type="module" src="/src/main.tsx">`.
- [ ] **Step 6:** `src/main.tsx` — `createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>)`, `App.tsx`는 빈 `<></>`.
- [ ] **Step 7:** `.gitignore`에 `frontend/node_modules/` · `frontend/dist/`. `.dockerignore`에 `frontend`.
- [ ] **Step 8:** `Makefile` — `.PHONY`에 추가하고 `help`에 한 줄씩:
  - `front-install: cd frontend && npm ci`
  - `front: cd frontend && npm run dev`
  - `front-test: cd frontend && npm test && npm run typecheck && npm run lint`
- [ ] **Step 9:** 확인 — `make dev` 떠 있는 상태에서 `make front`, `curl -s localhost:5173/api/auth/me` → `{"detail":...}` 401 JSON. 브라우저 Network에 다른 출처 요청 없음.
- [ ] **Step 10:** `npm test`(테스트 0개 통과) · `npm run typecheck` · `npm run build` 통과.
- [ ] **Step 11:** Commit — `git add frontend .gitignore .dockerignore Makefile` / "React 뼈대 — frontend/ (Vite · TanStack Query · Vitest)"

---

### Task 2: CSS 나누기

**Files:**
- Create: 아래 표의 18개 파일, `src/app/styles.css`
- Test: 정렬 diff (명령 아래)

**Interfaces:**
- Produces: `src/app/styles.css` 하나를 `main.tsx`가 import. 어떤 `.tsx`도 CSS를 import하지 않는다.

`index.html` 14–484를 **원래 순서를 지켜** 잘라 넣는다. 파일 안 순서도 원문 순서. `responsive.css`(1150px 블록)는 반드시 맨 마지막이다 — 같은 특이도의 규칙을 뒤에 와서 덮어쓰는 것이 여럿이다.

| 순서 | 파일 | 줄 |
|---|---|---|
| 1 | `shared/styles/base.css` | 14–44 + 새 규칙 `#root { display: contents; }` (body가 그리드라 `#root`를 투명하게 둔다) |
| 2 | `app/styles/topbar.css` | 46–78, 405–409 |
| 3 | `app/styles/sidebar.css` | 80–92, 403 |
| 4 | `app/queue/queue.css` | 94–101, 116–156, 400–402 |
| 5 | `shared/styles/layout.css` | 103–114, 167–179, 399 |
| 6 | `shared/styles/components.css` | 157–165, 222, 246–251, 254–263, 270, 321–324, 329–351, 441–445, 455–456 |
| 7 | `shared/styles/panel.css` | 305–320, 357–358 |
| 8 | `shared/styles/forms.css` | 411–433, 438–440 (426이 429–431보다 앞) |
| 9 | `shared/ui/charts/charts.css` | 186–221 |
| 10 | `features/stats/stats.css` | 181–185, 223–242, 325–328 |
| 11 | `features/logs/logs.css` | 244–245, 252–253 |
| 12 | `features/nodes/nodes.css` | 264–269 |
| 13 | `features/ask/ask.css` | 274–303 |
| 14 | `features/review/review.css` | 352–355, 359–370 |
| 15 | `features/requests/requests.css` | 434–437 |
| 16 | `app/styles/overlays.css` | 372–380, 382–397 |
| 17 | `features/auth/auth.css` | 447–454 |
| 18 | `shared/styles/responsive.css` | 458–484 |

- [ ] **Step 1:** 표대로 파일을 만든다. 들여쓰기 두 칸은 빼도 된다. 주석(`/* ── … */`)은 그대로 둔다.
- [ ] **Step 2:** `src/app/styles.css`에 위 순서로 `@import "…";` 18줄.
- [ ] **Step 3:** 확인 — 한 줄도 빠지거나 바뀌지 않았는지:
  ```sh
  diff <(sed -n 14,484p sentinelai/web/static/index.html | sed 's/^  //' | grep -v '^\s*$' | sort) \
       <(cd frontend/src && cat $(grep -o '"[^"]*"' app/styles.css | tr -d '"' | sed 's#^./##; s#^#app/#') | grep -v '^\s*$' | grep -v '^@import' | sort)
  ```
  허용되는 차이: `#root` 한 줄, 272줄의 빈 주석. 그 밖의 줄은 모두 양쪽에 있어야 한다. (경로가 `app/` 기준이 아니면 명령을 맞춰 고친다.)
- [ ] **Step 4:** `main.tsx`에 `import "./app/styles.css"`. `npm run build` 통과.
- [ ] **Step 5:** Commit — "CSS 나누기 — 지금 스타일을 영역별 파일로, 순서 그대로"

---

### Task 3: API 계층 · 공통 함수

**Files:**
- Create: `shared/api/http.ts` · `types.ts` · `queries.ts` · `jobs.ts`, `app/queryClient.ts`, `app/views.ts`, `shared/lib/format.ts` · `request.ts` · `levels.ts` · `labels.ts` · `clause.ts` · `hooks.ts` · `tooltip.ts`
- Test: `shared/api/http.test.ts`, `shared/lib/format.test.ts` · `request.test.ts` · `clause.test.ts` · `tooltip.test.ts`, `shared/api/jobs.test.ts`

**Interfaces (Produces):**
```ts
// http.ts
export class ApiError extends Error { constructor(public status: number, message: string) }
export function getJSON<T>(url: string, init?: RequestInit): Promise<T>
export function send<T>(url: string, body?: unknown, method?: string): Promise<T>   // JSON 본문, 기본 POST
export function onUnauthorized(cb: () => void): () => void                          // 해지 함수 반환
// queries.ts — 모두 queryOptions(...)
meQuery() · healthQuery() · regulationsQuery() · requestsQuery(mine: boolean) · usersQuery() · catalogQuery()
resultsQuery() · jobsQuery() · qaQuery(kind: AskKind) · nodesQuery() · nodeQuery(name) · logsQuery(p: LogsParams) · statsQuery(kind: "stats"|"ustats", period: StatPeriod)
export const EMPTY_RESULTS: Results
// jobs.ts
export function runButton(jobs: Jobs | null | undefined, view: View | null): { hidden: boolean; disabled: boolean; text: string }
export function jobsInterval(jobs: Jobs | undefined): 2000 | 30000
export function fastDone(jobs: Jobs | null | undefined): string | null
export function shouldRefresh(prev: Jobs | null, next: Jobs): boolean
export function useStartJob(): UseMutationResult<Jobs, Error, JobKind>
// clause.ts — 전역 state 대신 인자
export function clauseText(source: string, regulations: Regulation[], policies: PolicyRow[]): string
export function chipLabel(source: string, regulations: Regulation[], policies: PolicyRow[]): string
export function ruleText(source: string, policies: PolicyRow[]): string
export function ruleIds(source: string, policies: PolicyRow[]): string[]
// request.ts
export function isActive(r: Pick<RequestRow, "stage" | "period_end">, today?: string): boolean
// tooltip.ts
export function placeTip(r: DOMRectLike, pos: "bottom" | "right", tw: number, th: number, vw: number, vh: number): { left: number; top: number }
// hooks.ts
export function useNow(everyMs: number, active: boolean): number
export function useMediaQuery(q: string): boolean
export function activateProps(fn: () => void): { tabIndex: 0; onClick; onKeyDown }   // Enter · Space
```

- [ ] **Step 1: `http.test.ts`** — `globalThis.fetch`를 `vi.fn`으로 바꿔:
  ```ts
  test("401이면 onUnauthorized를 부르고 던진다", ...)        // cb 1회, rejects.toThrow("로그인이 필요합니다")
  test("로그인 URL의 401은 onUnauthorized를 부르지 않는다", ...)
  test("detail 문자열을 오류 문장으로", ...)                 // {detail:"아이디 또는 비밀번호가 틀렸습니다"} → 같은 message
  test("detail이 문자열이 아니면 '입력값을 확인하세요'", ...)  // 422 {detail:[...]}
  test("본문이 JSON이 아니면 '500 Internal Server Error'", ...)
  test("send는 JSON 본문과 Content-Type을 보낸다", ...)       // body "{}" (undefined일 때)
  ```
- [ ] **Step 2:** 실패 확인 `npm test`
- [ ] **Step 3:** `http.ts` 구현 (807–825 그대로, `showLogin()` 자리만 구독자 호출)
- [ ] **Step 4:** `clause.test.ts`:
  ```ts
  const regs = [{ name: "접근권한_관리기준.md", content: "# 제목\n\n## 4. 등급\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2\n" }];
  expect(clauseText("[접근권한_관리기준.md] 4.1, 4.2", regs, [])).toBe("접근권한_관리기준.md\n\n### 4.1 정상\n본문1\n\n### 4.2 위험\n본문2");
  expect(clauseText("접근권한_관리기준.md", regs, [])).toBe(regs[0].content.trim());
  expect(clauseText("없는문서.md 1.1", regs, [])).toBe("기준 문서 원문에서 이 근거를 찾을 수 없습니다.");
  expect(ruleIds("rules:policies.csv (FW‑002)", [{ policy_id: "FW-002" } as PolicyRow])).toEqual(["FW-002"]);
  expect(ruleText("rules:x", [])).toBe("정책 관리 검토를 돌리면 솔루션 정책 원본이 여기에 표시됩니다.");
  expect(chipLabel("[접근권한_관리기준.md] 4.1, 4.2", regs, [])).toBe("접근권한_관리기준 · 4.1, 4.2");
  expect(chipLabel("rules:policies.csv (FW-001)", regs, [{ policy_id: "FW-001" } as PolicyRow])).toBe("솔루션 정책 · FW-001");
  ```
- [ ] **Step 5:** `request.test.ts` — `isActive`: `period_end` = 오늘 → true, 어제 → false, null → true, `stage:"manager"` → false (today는 "2026-10-29"로 주입). `format.test.ts` — `stamp("2026-10-29T03:49:00+09:00")` → `"2026-10-29 03:49"`, `stamp(null)` → `""`; `pct` · `niceMax`는 2073 · 2112의 식으로 값 2개씩 고정.
- [ ] **Step 6:** `tooltip.test.ts` — 아래 공간이 없으면 위로(`top = r.top - th - 8`), 왼쪽 끝은 8 이상, 오른쪽 끝은 `vw - tw - 8` 이하, `pos:"right"`면 `left = r.right + 10`.
- [ ] **Step 7:** `jobs.test.ts`:
  ```ts
  expect(runButton(null, "policies")).toEqual({ hidden: false, disabled: true, text: "분석 실행 불가" });
  expect(runButton({ running: "policies", auto: true, done: 3, total: 8, kinds: { policies: "정책 관리 검토" } }, "policies").text).toBe("정책 관리 검토(자동) 중… 3/8");
  expect(runButton({ running: null, kinds: { policies: "정책 관리 검토" } }, "policies")).toEqual({ hidden: false, disabled: false, text: "정책 관리 검토 실행" });
  expect(runButton(jobs, "events").hidden).toBe(true);
  expect(jobsInterval({ running: "nodes" })).toBe(2000); expect(jobsInterval({ running: null })).toBe(30000);
  expect(shouldRefresh({ running: "nodes" }, { running: null })).toBe(true);
  expect(shouldRefresh(idle("t1"), idle("t2"))).toBe(true);   // fast.last.events_fast.finished_at 변화
  expect(shouldRefresh(idle("t1"), idle("t1"))).toBe(false);
  ```
- [ ] **Step 8:** 구현 — `types.ts`(이 작업에서 쓰는 타입부터, 나머지는 각 작업에서 더한다), `queries.ts`, `queryClient.ts`(`refetchOnWindowFocus:false, refetchOnReconnect:false, retry:false, staleTime:Infinity` — `/api/logs`가 조회마다 감사 기록을 남기므로 암묵적 재요청을 모두 끈다), `views.ts`, `lib/*`.
- [ ] **Step 9:** `npm test` 전부 통과, `npm run typecheck`.
- [ ] **Step 10:** Commit — "API 계층 · 공통 함수 — getJSON · 쿼리 · 조항 자르기 (시험 포함)"

---

### Task 4: 껍데기 · 로그인

**Files:**
- Create: `app/App.tsx` · `AppShell.tsx` · `useBoot.ts` · `useJobsWatcher.ts` · `TopBar.tsx` · `AlertPop.tsx` · `Sidebar.tsx` · `Seg.tsx` · `MainTabs.tsx` · `Workspace.tsx` · `RightPanel.tsx` · `Footer.tsx` · `DocsModal.tsx` · `TooltipLayer.tsx`, `app/ui/uiReducer.ts` · `UiContext.tsx`, `app/queue/types.ts` · `useQueue.ts` · `select.ts`, `features/auth/*`, `shared/ui/Icon.tsx` · `LevelDot.tsx` · `PanelHead.tsx` · `PanelMsg.tsx`
- Test: `app/ui/uiReducer.test.ts`, `app/queue/select.test.ts`, `app/engine.test.ts`(engineProblems), `app/footer.test.ts`

**Interfaces (Produces):**
```ts
// app/queue/types.ts
export interface QueueItem { type: "req"|"mine"|"user"|"access"|"policy"|"server"|"event"; key: string; itemKey?: string; id: string; typeLabel?: string; level?: Level; decision?: Decision; who: string; what: string; when: string; judge: string; sub?: string; raw: any }
// app/queue/select.ts  (role · view · stageFilter를 인자로 — 전역 state 없음)
export function inView(it: QueueItem, view: View, stageFilter: StageFilter, role: Role): boolean
export function visible(items: QueueItem[], o: { view: View; stageFilter; role; filter: "전체" | Level; query: string }): QueueItem[]
export function openRisks(items: QueueItem[], role: Role): QueueItem[]
export function viewCounts(items: QueueItem[], views: View[], stageFilter, role): Record<string, number>
export function firstKeyInView(items: QueueItem[], view: View, stageFilter, role): string | null
// app/queue/useQueue.ts — 기능별 어댑터를 모아 QueueItem[] (작업 5~11이 어댑터를 채운다. 여기서는 빈 배열)
export function useQueue(): QueueItem[]
// app/ui/uiReducer.ts
export interface UiState { view: View | null; mainTab: MainTab; filter: "전체" | Level; stageFilter: StageFilter; query: string; selected: string | null; panelMsg: string; expanded: ReadonlySet<string>; askSource: { i: number; n: number } | null; drawerOpen: boolean; nodes: { selected: string | null; adding: boolean }; logs: { period: LogPeriod; user: string; solution: string; how: string; page: number; selected: number | null }; stats: { period: StatPeriod; kind: "stats" | "ustats" | null; selected: { kind: string; key: string } | null } }
export type UiAction =
  | { type: "NAVIGATE"; view: View; nextSelected: string | null }        // 메뉴 바꿈 (2446–2482): mainTab = tabs에 queue 있으면 queue 아니면 tabs[0]; view가 바뀌면 filter "전체" · panelMsg "" · askSource null
  | { type: "SET_MAIN_TAB"; tab: MainTab }                                // 탭 바꾸면 askSource null (2423); 통계 종류가 바뀌면 stats.selected null · kind 갱신 (2053)
  | { type: "SELECT"; key: string; view: View }                            // key가 바뀌면 panelMsg "" (1058); mainTab "queue"; view 갱신
  | { type: "SELECT_SILENT"; key: string | null }                          // panelMsg 유지 (저장 뒤 "✓ …")
  | { type: "SET_FILTER"; level: "전체" | Level } | { type: "SET_QUERY"; query: string }
  | { type: "SET_STAGE_FILTER"; value: StageFilter; nextSelected: string | null }
  | { type: "SET_PANEL_MSG"; msg: string } | { type: "TOGGLE_CHIP"; key: string }
  | { type: "OPEN_DRAWER" } | { type: "CLOSE_PANEL" }                      // CLOSE_PANEL: drawerOpen false + 탭별 선택 해제 (2557–2574)
  | { type: "OPEN_LOGS"; user: string }                                    // mainTab "logs", logs {user, solution:"", how:"", page:1, selected:null} (2320–2324)
  | { type: "PICK_NODE"; name: string | null } | { type: "ADD_NODE" }      // panelMsg ""
  | { type: "SET_LOGS"; patch: Partial<UiState["logs"]> } | { type: "SET_STATS"; patch: Partial<UiState["stats"]> }
  | { type: "SET_ASK_SOURCE"; src: UiState["askSource"] }
export function uiReducer(s: UiState, a: UiAction): UiState
export const initialUi: UiState   // 772–799의 초기값
// app/ui/UiContext.tsx
export function useUi(): { ui: UiState; navigate(view): void; select(key): void; selectSilent(key): void; setMainTab(tab): void; closePanel(): void; openDrawer(): void; openLogs(user): void; gotoNode(name): void; gotoEvent(key): void; gotoActiveGrant(no): void; dispatch }
//   navigate · setStageFilter는 useQueue()로 nextSelected를 계산해 넘긴다. openDrawer는 matchMedia("(max-width: 1150px)")일 때만 dispatch.
// app/App.tsx — AuthContext: { gate: "login" | "password" | "password-forced" | null; showPassword(forced): void; hideGate(): void }
// shared/ui/Icon.tsx: <Icon name="shield" className="sm"/> → <svg class="i sm" viewBox="0 0 24 24" aria-hidden="true">…</svg>
// shared/ui/LevelDot.tsx: <LevelDot level="위험"/> → <i class="ldot 위험"/>; level 없으면 "none"
// shared/ui/PanelHead.tsx: <PanelHead title children?/> — h3 + (children) + 닫기 버튼(drawer-close, useUi().closePanel)
// shared/ui/PanelMsg.tsx: <PanelMsg msg/> — 앞이 "✓"면 class "form-msg ok"
```

- [ ] **Step 1: `uiReducer.test.ts`** — NAVIGATE(다른 view)는 filter · panelMsg · askSource를 초기화하고 selected = nextSelected · mainTab "queue"; NAVIGATE(같은 view)는 filter 유지; NAVIGATE("qa")는 mainTab "ask"; SELECT(다른 key)는 panelMsg ""; SELECT_SILENT는 panelMsg 유지; SET_MAIN_TAB("logs")는 askSource null; SET_MAIN_TAB("ustats")는 stats.kind "ustats" · stats.selected null; CLOSE_PANEL(nodes 탭)은 nodes {selected:null, adding:false}; CLOSE_PANEL(logs 탭)은 logs.selected null; CLOSE_PANEL(ask 탭)은 askSource null; OPEN_LOGS("A 개발 박민수")는 mainTab "logs" · logs.user 그 값 · page 1.
- [ ] **Step 2: `select.test.ts`** — 항목 fixture 5개(req 위험 stage manager · req 정상 stage approved period_end null · policy 위험 결정 없음 · policy 위험 결정 있음 · event 주의)로:
  - `inView(req manager, "requests", "pending", "manager")` true, role "top" false; `"active"` → approved만; `"all"` → 둘 다; `inView(policy, "events", …)` false.
  - `visible(..., filter "위험")`은 위험만; `query "fw-001"`은 `raw.policy_ids ["FW-001"]` 항목을 찾는다 (대소문자 무시).
  - `openRisks(items, "manager")` → `[req 위험, policy 결정 없음]`의 key; `"user"` → `[]`.
  - `viewCounts`는 입력을 바꾸지 않고 `{requests: 2, policies: 2, events: 1}`.
  - `firstKeyInView(items, "policies", …)` → 첫 policy key.
- [ ] **Step 3: `engine.test.ts`** — `engineProblems(null)` → `["서버에서 엔진 상태를 받지 못했습니다"]`; `connected:false` → `["Ollama 서버 연결 끊김"]`만; `connected:true, model_ready:false, model:"qwen3:14b", index_ready:false` → `["판정 모델 없음 (qwen3:14b)", "기준 문서 인덱스 비어 있음"]`. **`footer.test.ts`** — `footerWarnings(results, jobs)`: `summary.failed: 2` → 첫 경고가 `"판정 실패 2건 — 해당 건은 '주의'로 기록되었습니다. 수동 검토가 필요합니다"`; `sections.policies.load_issues: ["x"]` · `source:"data/policies"` → `"data/policies 읽기 문제 1건 — x"`; `jobs.last.nodes.error:"e"` · `kinds.nodes:"서버 점검"` → `"서버 점검 실패 — e"`.
- [ ] **Step 4:** 실패 확인 → 구현 → 통과.
- [ ] **Step 5:** 컴포넌트 구현. 지킬 것:
  - `AppShell`의 자식 순서: `TopBar → Sidebar → Workspace → drawer-back → Gate → DocsModal → TooltipLayer`. 감싸는 div 없음(`#root { display: contents }`). `body.solo`(역할 메뉴가 2개 미만) · `body.drawer-open`은 effect로 단다.
  - `TopBar`: `id="who-name"` 유지(CSS가 id로 숨김). `.alert-pop`은 TopBar 바로 아래(position 조상 없음). 종 클릭 `stopPropagation`, document 클릭으로 닫기.
  - `Workspace`: 모든 탭 뷰를 항상 그리고 `hidden`으로 숨긴다(지금과 같음). `data-tab` · `cite` 클래스(askSource가 있고 ask 탭일 때).
  - `QueueHead`의 `#run` · `#add-user` · `#add-access` 세 버튼은 **빼지 말고 `hidden`** — `.run + .run` 여백 규칙이 숨은 형제에 기댄다. 이 작업에서는 자리만 만들고 내용은 작업 5~6.
  - `RightPanel`: `<aside id="panel" class="card panel">`에 `open` 클래스(drawerOpen). 탭 · 메뉴별 분기는 1116–1136 순서. 이 작업에서는 빈 패널(1127–1135의 문구, `<br>`은 JSX `<br/>`)만.
  - `TooltipLayer`: document `mouseover` · `focusin` · `focusout` · `scroll`(capture) · `click`(capture) 위임 그대로. 내용은 `textContent`/state로 (innerHTML 아님). 사이드바 · 상단 바는 즉시, 나머지는 220ms. **마지막 자식**으로, opacity · transform 조상 없이.
  - `Gate`: 로그인 폼(`autoFocus` login_id) · 비밀번호 폼(강제면 취소 숨김 · 제목 "처음 로그인했습니다" · 안내 문구 2619). 성공 시 `location.reload()`. 401 구독(`onUnauthorized`) → gate "login".
  - `useBoot`: 역할별 필수 쿼리(`requests`/`mine`/`users`/`catalog`/`results`/`qa×3`)가 모두 한 번 끝나면 ready. `health` · `jobs` · `regulations` 실패는 무시(null · []). 필수 쿼리 실패 → workspace에 `서버에서 화면 데이터를 받지 못했습니다: …` 카드(2746). ready가 되고 `ui.view === null`이면 `navigate(roleViews[0])`.
  - `useJobsWatcher`: `jobsQuery`에 `refetchInterval: (q) => jobsInterval(q.state.data)`. 직전 값을 ref에 두고 `shouldRefresh(prev, next)`면 `invalidateQueries(["results"])` · `["nodes"]` · `["stats"]`(활성 쿼리만 다시 받는다). 첫 값은 비교하지 않는다. StrictMode 두 번 마운트에 안전하게.
  - Escape: 문서 모달 닫기 + `closePanel()`. 1150px 넘게 넓어지면 서랍 닫기(`useMediaQuery` 변화).
- [ ] **Step 6: 옛 화면과 비교** (`127.0.0.1:8001` vs `localhost:5173` — 호스트를 다르게 해야 세션이 안 섞인다):
  - [ ] 로그인 실패 문구가 서버 `detail` 그대로; 비밀번호 칸이 비워진다.
  - [ ] 옛 화면에서 dev-root로 dev-user 비밀번호 초기화 → 새 화면 dev-user 로그인 → 강제 변경 폼(취소 없음) → 바꾸면 다시 로그인.
  - [ ] 세 역할의 사이드바 · 세그먼트 메뉴 수와 순서. dev-user는 `body.solo` (사이드바 · 종 없음).
  - [ ] 상단 이름 · 역할 · "(루트)". 종 숫자가 옛 화면과 같다(아직 항목 어댑터가 없으면 0 — 작업 5 뒤 다시).
  - [ ] 엔진 경고(모델 서버를 끄고) + 툴팁 원인 문장.
  - [ ] 툴팁 위치: 사이드바는 오른쪽, 나머지는 아래, 아래 공간이 없으면 위.
  - [ ] 문서 모달: 열기 · × · 배경 · Esc.
  - [ ] 쿠키를 지우고 아무 데나 클릭 → 로그인 게이트. 콘솔에 반복 오류 없음 (Review Focus 1).
  - [ ] 390px: 세그먼트 메뉴가 탭 줄 위에, 서랍 열고 창을 1440으로 넓히면 배경 막이 남지 않는다 (Review Focus 5).
- [ ] **Step 7:** `make front-test` 통과. Commit — "껍데기 · 로그인 — 상단 바 · 사이드바 · 탭 · 패널 자리 · 툴팁 · 게이트"

---

### Task 5: 권한 신청 (결재함 · 내 신청)

**Files:**
- Create: `features/requests/items.ts` · `RequestPanel.tsx` · `RequestForm.tsx` · `accessOptions.ts` · `api.ts`, `app/queue/QueueTab.tsx` · `QueueHead.tsx` · `SummaryCards.tsx` · `QueueTable.tsx` · `emptyText.ts`, `shared/ui/KvTable.tsx` · `Section.tsx` · `History.tsx` · `SourceChips.tsx`
- Modify: `app/queue/useQueue.ts`(어댑터 연결), `app/RightPanel.tsx`
- Test: `features/requests/items.test.ts` · `accessOptions.test.ts`, `app/queue/emptyText.test.ts`

**Interfaces:**
```ts
// features/requests/items.ts
export function requestItem(r: RequestRow): QueueItem          // 856–867
export function mineItem(r: RequestRow): QueueItem             // 902–906
// features/requests/accessOptions.ts
export function accessOptions(catalog: AccessItem[], mine: RequestRow[], prev: string): { groups: [system: string, items: AccessItem[]][]; disabled: Set<string>; value: string }   // 1505–1525: 시스템별 묶음, 보유 · 결재 중 막힘, 막히지 않았으면 prev 유지
// features/requests/api.ts
export function useRequestAction(): mutate({ no, act: "approve"|"reject"|"revoke"|"withdraw"|"rejudge", comment?, reason? })   // 1355–1380, confirm() 그대로, 성공 시 invalidate ["requests"] + panelMsg
export function useCreateRequest(): mutate(form)               // 2651–2666, 성공 시 selectSilent(`mine:${no}`)
// shared/ui/SourceChips.tsx: <SourceChips itemKey sources/> — 펼침은 ui.expanded(TOGGLE_CHIP), 본문은 clauseText(useClauses())
// shared/ui/History.tsx: <History steps={[{ who, when, say, cls }]}/> — .box.history .step, 인라인 요소 사이 {" "} 유지 (1287–1292)
// app/queue/emptyText.ts: emptyText(view, stageFilter, jobs): string   // 1020–1030 문구 그대로
```

- [ ] **Step 1: `items.test.ts`** — `requestItem`: `ai_verdict` 없음 + `judging:true` → judge "판정 중"; 없음 + judging 없음 → "판정 대기"; `{failed:true}` → "판정 실패" · level undefined; `{level:"위험"}` → judge "위험"; `stage:"approved", period_end:"2000-01-01"` → sub "승인 · 기간 끝"; `stage:"manager"` → sub "1차 결재 대기". `mineItem`: reason 없음 → what "—".
- [ ] **Step 2: `accessOptions.test.ts`** — 카탈로그 3건(시스템 A 2건 · B 1건), mine에 A-1 유효 보유 · A-2 결재 중(stage manager) → groups `[["A",[A-1,A-2]],["B",[B-1]]]`, disabled `{A-1, A-2}`, `prev:"A-1"` → value `"B-1"`(첫 가능한 것), `prev:"B-1"` → `"B-1"`.
- [ ] **Step 3: `emptyText.test.ts`** — 1020–1030의 분기마다 문구를 그대로 고정 (view × stageFilter, jobs 유무).
- [ ] **Step 4:** 실패 확인 → 구현 → 통과.
- [ ] **Step 5:** 화면 구현 (`index.html` 990–1055, 1267–1380, 1505–1545, 2651–2666). 지킬 것:
  - `requestsQuery(false)`에 `refetchInterval: (q) => q.state.data?.some(r => r.judging) ? 3000 : false`. 일반 사용자의 `mine`은 폴링하지 않는다(1574).
  - `RequestPanel`의 `key`는 항목 key만 — 폴링으로 다시 그려도 입력 중 의견이 남는다. 성공 뒤에만 비운다.
  - 요약 카드는 `gridTemplateColumns` style 객체(996). 카드 툴팁은 `LEVEL_TIP`.
  - `QueueTable` 행과 머리줄은 **항상 자식 6개**(`.tr > :nth-child(3|4|6)` 숨김 규칙). 행은 `activateProps`로 키보드 선택.
  - 고르기 칸은 controlled `<select>`, 옵션은 `accessOptions`. 설명 노트(1535)는 고른 권한의 `description`.
  - 신청 폼은 `new FormData(e.currentTarget)` → `Object.fromEntries`. 폼 안 다른 버튼은 `type="button"`.
- [ ] **Step 6: 옛 화면과 비교**:
  - [ ] dev-user(새): 묶인 고르기 칸 · 보유 · 결재 중 막힘 · 설명 노트 · 목록이 비면 신청 막힘. 신청 → "N 신청했습니다. …" → 목록에 뜨고 패널에 **AI 문구 없음**. Network에 `/api/health` 없음. [철회] (1차 전만).
  - [ ] dev-op(새): 판정 중 행 "판정 중" → 의견을 치는 동안 판정이 와도 의견 유지 → [승인] confirm → "✓ 승인했습니다" → 행은 결재 대기에서 빠지고 패널은 남는다.
  - [ ] [유효 권한] 거르기 · 회수 사유 필수 · [다시 판정]은 1차 전만.
  - [ ] 요약 카드 누르면 그 등급만, 다시 누르면 전체. 검색. 거르기 바꾸면 첫 항목 선택.
  - [ ] 390px: 행 클릭 → 서랍, 3 · 4 · 6번째 칸 숨김 (Review Focus 5).
  - [ ] 종 숫자 · 사이드바 건수 툴팁이 옛 화면과 같다.
- [ ] **Step 7:** `make front-test`. Commit — "권한 신청 — 결재함 · 내 신청 · 검토 현황 공통 목록"

---

### Task 6: 검토 현황 (정책 관리 · 로그 감시)

**Files:**
- Create: `features/review/items.ts` · `constants.ts` · `ReviewPanel.tsx` · `DecisionLog.tsx` · `RunButton.tsx` · `api.ts`, `shared/ui/ModuleTables.tsx`, `app/Footer.tsx` 내용
- Modify: `app/queue/useQueue.ts`, `app/RightPanel.tsx`, `app/queue/QueueHead.tsx`(`#run` 연결)
- Test: `features/review/items.test.ts`

**Interfaces:**
```ts
export function policyItems(r: Results): QueueItem[]   // 873–880
export function serverItems(r: Results): QueueItem[]   // 882–888
export function eventItems(r: Results): QueueItem[]    // 889–901
export const DECISIONS, DECISION_SET, VIEW_KIND        // 694–700, 1767
export function useDecide(): mutate({ it: QueueItem, action: string | "cancel", comment })   // 1337–1353: 성공 시 ["results"].decisions 캐시를 고치고, decision_log가 있으면(총책임자) invalidate
// shared/ui/ModuleTables.tsx: <ModuleTables snapshot/> (1219–1232), moduleState(snap): string
```

- [ ] **Step 1: `items.test.ts`** — `eventItems`: `id:"abc@2026-10-20"` → id "LOG-abc"; `detail.events:"a\nb\n"` → what "로그 2건 — reason"; `stage:"fast"` → sub "1차 판정 · 확정 대기", 아니면 ""; `decisions.event[key]`가 있으면 decision. `serverItems`: gaps 2개 → what "정책과 다른 곳 2 — reason", 0개 → reason. `policyItems`: id "ISSUE-1", who "FW-004 ↔ FW-005". `EMPTY_RESULTS` → 모두 `[]` (Review Focus 3).
- [ ] **Step 2:** 실패 확인 → 구현 → 통과.
- [ ] **Step 3:** 화면 구현 (1137–1216, 1234–1244, 1775–1801). 지킬 것:
  - `ReviewPanel`은 type별 섹션(정책 · 서버 gaps/unjudged · 로그 줄 + [이 사용자의 최근 한 달 로그] → `openLogs`). `stage:"fast"`면 결정 버튼 대신 안내 문구(FRONTEND_GUIDE §5).
  - 모델이 "정상"으로 적은 gap은 뺀다 (CLAUDE.md 서버 점검).
  - 결정 버튼의 색 클래스는 `DECISION_SET`. [취소]도 기록. 보안 총책임자는 `DecisionLog`(결정 기록 전부).
  - `RunButton`: `runButton(jobs, view)` 결과를 그대로. 클릭 → `useStartJob`. 시작 응답이 `running` 없음이거나 실패(`alert`)면 즉시 `invalidate(["results"])`.
  - `Footer`: `mainTab === "queue" && RESULT_VIEWS.has(view)`일 때만. 문구는 `footerWarnings`.
- [ ] **Step 4: 옛 화면과 비교**:
  - [ ] 정책 관리 · 로그 감시 목록 행 · 등급 점 · 결정자 이름 · 결정.
  - [ ] [정책 관리 검토 실행] → "정책 관리 검토 중… 3/8" → 끝나면 목록 갱신. 모델 서버가 꺼져 있으면 하단에 "… 실패 — …".
  - [ ] 근거 칩을 눌렀을 때 조항 원문이 옛 화면과 글자 단위로 같다.
  - [ ] 결정 · 취소 → 행 · 패널 · 종 숫자. dev-root 결정 기록.
  - [ ] 1차 판정 행 표시 · 패널 안내 · 결정 버튼 없음.
  - [ ] 자동 감시 중 버튼 "로그 감시(자동) 중…". 30초 뒤 빠른 감시 끝나면 목록 갱신.
- [ ] **Step 5:** `make front-test`. Commit — "검토 현황 — 정책 관리 · 로그 감시 패널 · 운영자 결정 · 검토 실행"

---

### Task 7: 노드

**Files:**
- Create: `features/nodes/nodeState.ts` · `NodesTab.tsx` · `NodesPanel.tsx` · `NodeKey.tsx` · `api.ts`
- Modify: `app/Workspace.tsx` · `app/RightPanel.tsx`
- Test: `features/nodes/nodeState.test.ts`

**Interfaces:** `nodeState(n: NodeRow, now?: Date): string` (1843–1849, 상태 다섯 가지 — 수집 중 · 끊김 · 꺼짐 · 키 없음 · 기다리는 중); `useNodeAction(): mutate({ name, action: "key" | "enable" | "disable" })`, `useCreateNode()` — 성공 시 `invalidate(["nodes"])`.

- [ ] **Step 1: `nodeState.test.ts`** — 1843–1849의 분기마다 fixture 하나씩, 문구 그대로 고정.
- [ ] **Step 2:** 구현 (1843–2011). `nodesQuery` · `nodeQuery(name)`는 `refetchOnMount:"always"` (탭에 들어올 때마다 다시 받음, 2440). 키 복사는 `navigator.clipboard` + http 대비 `select()` 대체(1949–1952). 설치 명령은 `location.origin`(개발 중엔 `:5173`이 보이는 것이 맞다). `<키>` 글자는 JSX 텍스트. [지금 점검]은 `useStartJob("nodes")`.
- [ ] **Step 3: 옛 화면과 비교** (`make dev-sim` 뒤): 표 · 상태 · 마지막 수집 · 판정 / 노드 등록 → 키 / 끄기 · 켜기 / 키 다시 발급 / 복사 / [검토 현황에서 보기] → 그 행 선택 / 패널 ×로 선택 해제 / 390px 서랍.
- [ ] **Step 4:** `make front-test`. Commit — "노드 탭"

---

### Task 8: 로그 조회

**Files:**
- Create: `features/logs/constants.ts` · `LogsTab.tsx` · `LogsPanel.tsx` · `lib.ts`, `shared/ui/Periods.tsx`
- Modify: `app/Workspace.tsx` · `app/RightPanel.tsx`

- [ ] **Step 1:** 구현 (2014–2033, 2320–2417). `logsQuery(params)`: `staleTime:0 · refetchOnMount:false · gcTime:Infinity · placeholderData:keepPreviousData` — "탭에 처음 들어올 때 한 번, 조건이 바뀔 때마다" 그대로라 감사 기록 수가 옛 화면과 같다. `openLogs`는 `invalidate(["logs"])`. 고르기 칸은 controlled, 고른 값이 `options`에 없어도 유지(2335). 페이지 바꾸면 표 맨 위로 `scrollIntoView`(ref).
- [ ] **Step 2: 옛 화면과 비교**: 기간 7개 · 사용자 · 솔루션 · 행위 → 건수 · 100건 · 이전 · 다음 / 줄 클릭 → 원본 → [집계로 돌아가기] / 로그 감시 패널 [이 사용자의 최근 한 달 로그] → 조건 / 390px 솔루션 · 위치 · 행위 칸 숨김. `/api/logs` 호출 수가 같은 조작에서 옛 화면과 같다 (Network).
- [ ] **Step 3:** `make front-test`. Commit — "로그 조회 탭"

---

### Task 9: 질의 3종

**Files:**
- Create: `features/ask/config.ts` · `criteria.ts` · `useAsk.ts` · `AskTab.tsx` · `AskPanel.tsx` · `Evidence.tsx`
- Modify: `app/Workspace.tsx` · `app/RightPanel.tsx` · `app/MainTabs.tsx`(탭 이름 1599)
- Test: `features/ask/criteria.test.ts` · `useAsk.test.ts`(순수 부분)

**Interfaces:** `askMode(view): "policy"|"server"|"log"` (1589); `askWaitLabel(startedAt, now): string` (1592 — "답변 생성 중… 12초"); `criteriaText(c): string` (1636); 대기 항목은 보내기 전에 `["qa", kind]` 캐시에 `{ id, q, started }`로 넣고 응답이 오면 같은 id를 바꾼다 (탭을 떠나도 남는다). 경과 초는 `useNow(1000, busy)`.

- [ ] **Step 1:** 테스트 — `askMode("policies")` "server"? (1589를 옮겨 그대로 고정: qa → policy, policies → server, events → log); `askWaitLabel(t, t+12400)` → "답변 생성 중… 12초"; `criteriaText({ user:"박민수", since:"2026-10-01" })` → "사용자 박민수 · 부터 2026-10-01"(1636의 구분자 그대로).
- [ ] **Step 2:** 구현 (1589–1765). 질의 로그는 새 항목이 생기면 아래로 스크롤(`useLayoutEffect` + ref). 예시 버튼은 입력과 같은 경로. `.cite` 클래스는 `askSource`가 있을 때만. 답에는 등급 배지 없음.
- [ ] **Step 3: 옛 화면과 비교**: 세 질의의 지난 기록이 먼저 보임 / 보내는 동안 입력 막힘 + 경과 초 / 근거 칩 → 패널(조항 · 집계 · 기록 줄) / 탭 바꾸면 인용 패널 닫힘 / 새 화면에서 질의 → 옛 화면 새로고침 → 같은 기록 / 실패 문구 "질의 실패: …".
- [ ] **Step 4:** `make front-test`. Commit — "질의 3종 — 정책 · 서버 · 로그"

---

### Task 10: 통계 2탭

**Files:**
- Create: `features/stats/*`, `shared/ui/charts/*`
- Modify: `app/Workspace.tsx` · `app/RightPanel.tsx`
- Test: `features/stats/lib.test.ts`

**Interfaces:** `periodDays(d): string[]` (2076 — 2106은 중복이라 하나만); `trendMark(p): string` (2041 — ±10 넘으면 ▲ · ▼); `safetyTone(score): "ok"|"warn"|"bad"` (80 · 50); `mergeDays(...)` (2136–2141). 차트: `<HBars rows …/>`(2085) · `<Legend/>`(2099) · `<Meter segs total/>`(2104) · `<TableView>`(2103, `<details>` uncontrolled) · `<Sparkline points/>`(2153 · 2196 · 2266의 polyline) · `<DataTable head rows empty/>`(2067).

- [ ] **Step 1:** 테스트 — `trendMark` 경계(+10 → 없음, +11 → ▲, −11 → ▼ — 2041의 글자 그대로); `safetyTone(80)` ok · `(79)` warn · `(49)` bad; `periodDays` 기간별 길이.
- [ ] **Step 2:** 구현 (2035–2318). `statsQuery(kind, period)`는 `refetchOnMount:"always"`, `placeholderData`는 같은 kind일 때만 직전 값(기간 바꿀 때 0.55 투명도, 2122). SVG 속성은 camelCase(`strokeWidth` · `vectorEffect` · `preserveAspectRatio`). `style="flex:…"`는 문자열로. `.safety`가 비면 **자식 · 공백 없이**(`:empty`). 막대 클릭은 `.hbar`, 키보드는 `.track`(`activateProps`). 다른 메뉴로 이동은 `useUi().gotoNode · openLogs · gotoActiveGrant · gotoEvent`.
- [ ] **Step 3: 옛 화면과 비교**: 두 탭 × 기간 4개의 숫자 전부 / 안전 점수 · 깎은 대상 클릭 / 타일 · 세로 막대 · 가로 막대 · 꺾은선 / [표로 보기] / 막대 → 패널 → [노드 탭에서 보기] · [이 사용자의 로그 조회] · 보유 권한 → 결재함 유효 권한 / [지금 예측] 진행 → 갱신 / kind를 바꾸면 선택 해제.
- [ ] **Step 4:** `make front-test`. Commit — "통계 — 보안 통계 · 사용자 위협"

---

### Task 11: 권한 목록 · 계정 관리

**Files:**
- Create: `features/catalog/items.ts` · `AccessPanel.tsx` · `api.ts`, `features/accounts/items.ts` · `UserPanel.tsx` · `api.ts`
- Modify: `app/queue/useQueue.ts` · `app/RightPanel.tsx` · `app/queue/QueueHead.tsx`(`#add-user` · `#add-access`)
- Test: `features/accounts/items.test.ts`

- [ ] **Step 1:** 테스트 — `userItem`: `is_active:false` → judge "정지"; `locked_until` 미래 → "잠김"; 아니면 "활성"; `must_change_password` → sub "비밀번호 변경 전"; `is_root` → typeLabel "보안 총책임자 · 루트". `accessItem`: `is_active` → "켜짐"/"꺼짐", category · description 둘 다 없으면 what "—".
- [ ] **Step 2:** 구현 (1383–1502, 1541–1572). 폼은 uncontrolled(`defaultValue`), `key = entityId + dataUpdatedAt`로 저장 뒤 서버 값으로 다시 그린다(1443 · 1451). 저장 뒤 `selectSilent(key)`. 루트 · 자기 계정의 역할 · 활성 잠금은 1384–1400 조건 그대로.
- [ ] **Step 3: 옛 화면과 비교** (dev-root): 권한 등록(코드 패턴 `[A-Za-z0-9_.\-]+`) · 고치기 · 끄기 → dev-user 신청서에서 사라짐 / 새 계정 → 임시 비밀번호 → 그 계정 로그인 → 강제 변경 / 루트 · 자기 계정 잠금 / `log_id` 겹침 → 400 `detail` 그대로 / 비밀번호 초기화 → 칸이 비워짐.
- [ ] **Step 4:** `make front-test`. Commit — "권한 목록 · 계정 관리"

---

### Task 12: 전체 맞춰 보기

- [ ] **Step 1:** `FRONTEND_GUIDE.md` §10 목록을 세 역할 × 1440 · 390px × 키보드만으로 전부 확인. 틀린 곳은 고치고 해당 기능의 테스트에 추가.
- [ ] **Step 2:** `npm run build && npm run preview` — preview 서버에서도 같은 화면(`server.proxy`를 `preview.proxy`에도 둔다).
- [ ] **Step 3:** 콘솔 경고 0, Network에 다른 출처 0, 390px 가로 스크롤 없음.
- [ ] **Step 4:** Commit — "이식 확인 — §10 전 항목"

---

### Task 13: 정리 (리팩토링)

사용자 요구: 옮긴 뒤 불필요 · 중복 코드를 합쳐 읽기 쉽게. 동작은 바꾸지 않는다 (작업 12를 다시 통과해야 한다).

- [ ] **Step 1:** 중복 찾기 — 기능 폴더를 가로질러 같은 JSX 덩어리(10줄 이상)가 둘 이상이면 `shared/ui`로 올린다. 후보: 패널 머리 · 섹션 · kv 표 · 기록 단계 · 기간 버튼 · "빈 목록" 문구 · 저장 뒤 메시지 처리(`useMutation` + `panelMsg` 래퍼).
- [ ] **Step 2:** 안 쓰는 것 지우기 — `tsc`의 `noUnusedLocals · noUnusedParameters`(템플릿 기본) + `npx knip`으로 안 쓰는 export · 파일. CSS는 빌드 결과에서 쓰이지 않는 선택자를 찾아 지우되(브라우저 Coverage), **클래스 이름은 바꾸지 않는다**(리디자인 때).
- [ ] **Step 3:** 크기 기준 — 컴포넌트 파일 300줄 · 함수 60줄을 넘으면 나눈다. 패널 컴포넌트는 type별 섹션 컴포넌트로.
- [ ] **Step 4:** 이름 — 옛 `render*` 이름이 남아 있으면 역할이 보이는 이름으로. 주석은 "~합니다"체, 이유만.
- [ ] **Step 5:** `make front-test` + 작업 12의 §10 목록 다시. Commit — "정리 — 중복 부품 통합 · 안 쓰는 코드 삭제"

---

### Task 14: 전환 · 문서

**Files:**
- Modify: `frontend/vite.config.ts`, `Makefile`, `CLAUDE.md`, `FRONTEND_GUIDE.md`, `README.md`, `NOTES.md`
- Delete(빌드가 덮음): `sentinelai/web/static/index.html`

- [ ] **Step 1:** `vite.config.ts` — `build: { outDir: "../sentinelai/web/static", emptyOutDir: true, sourcemap: false }`. (outDir가 root 밖이라 `emptyOutDir`를 명시해야 비운다. 옛 `index.html`은 `ui-legacy` 태그에 남는다.)
- [ ] **Step 2:** `Makefile` — `front-build: cd frontend && npm ci && npm run build`, `front-check: $(MAKE) front-build && git status --porcelain sentinelai/web/static | (! grep .)` (소스를 안 바꿨으면 빌드 결과도 안 바뀌어야 한다). `help` 갱신.
- [ ] **Step 3:** `make front-build` → `sentinelai/web/static/index.html` + `assets/*.js|css`. `make dev`만으로(Node 없이) `127.0.0.1:8001`에 새 화면. `/api/*` 동작(mount가 마지막이라 그대로).
- [ ] **Step 4:** §10 목록을 8001에서 다시.
- [ ] **Step 5:** 문서:
  - `CLAUDE.md` §1 트리: `static/index.html 단일 파일 대시보드` → `static/`(빌드 결과, 커밋) + `frontend/` 하위 트리. §2 "화면 필드의 출처"의 `ASK_EXAMPLES` → `features/ask/config.ts`. §3에 `make front-install · front · front-test · front-build`. §4 "React · Tailwind · 빌드 도구 금지" → "React + Vite(TS). 빌드 결과를 커밋해 서버에 Node 불필요. 화면 소스를 고치면 `make front-build` 결과를 함께 커밋. Tailwind 등 새 의존성은 리디자인 때 정한다". §4 화면 규칙의 `.ldot` 등 언급은 그대로(클래스 이름 유지).
  - `FRONTEND_GUIDE.md`: 3줄("지금 화면은 … 한 파일") · 31줄(§4 메모) 갱신, §5 함수 이름은 "`ui-legacy` 태그의 index.html" 기준임을 적고 새 파일 경로를 덧붙임, §9에 `make front` · `front-build`와 `127.0.0.1` ↔ `localhost` 쿠키 메모.
  - `README.md`: 화면 소스는 `frontend/`, `make web`은 커밋된 빌드 결과를 서빙한다는 한 줄.
  - `NOTES.md`: 빌드 결과를 커밋하는 이유(팀 서버에 Node · 외부망이 없을 수 있음).
- [ ] **Step 6:** Commit — "화면 전환 — React 빌드 결과를 static/에, 문서 갱신". 그 뒤 사용자에게 `main` 병합 · 푸시 여부를 묻는다 (푸시는 사용자 지시가 있을 때만).
