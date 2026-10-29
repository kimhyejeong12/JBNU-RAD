# Tailwind 전환 작업 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 스타일을 지금 CSS 18개 파일에서 Tailwind CSS v4 유틸리티로 옮기되 화면은 픽셀 단위로 그대로 둠.

**Architecture:** 먼저 비교 도구로 지금 화면을 기준으로 기록함. Tailwind를 기본 스타일 초기화(preflight) 없이 깔고 옛 CSS를 낮은 cascade layer에 넣어 함께 둠. 컴포넌트 묶음 하나씩 className을 유틸리티로 바꾸고 안 쓰게 된 옛 규칙을 지움. 마지막에 preflight를 켜고 달라진 곳을 고친 뒤 문서를 정리함.

**Tech Stack:** React 19 · TypeScript · Vite 8 · Tailwind CSS 4.3 (`@tailwindcss/vite`) · clsx 2 · tailwind-merge 3 · Vitest · Playwright + pixelmatch (작업 공간 도구)

**Spec:** `design/tailwind-design.md`

## Global Constraints

- **화면이 바뀌면 실패**. 모든 작업은 비교 도구의 차이 0으로 끝남 (`node $S/tw/compare.mjs` → `diff states: 0`)
- 값은 바꾸지 않음. 글자 크기 · 간격 · 둥글기 · 그림자는 지금 값을 그대로 (`text-[12.5px]`, `px-[18px]`, `shadow-[0_1px_2px_rgba(0,0,0,.08)]`). Tailwind 기본 단위와 정확히 같을 때만 기본 클래스 사용
- 색은 아래 토큰만 씀 (hex를 className에 직접 쓰지 않음). rgba는 그림자 · 배경막 안에서만 그대로
- 클래스는 소스에 **전체 문자열**로 둠. `bg-${tone}`처럼 조각으로 만들지 않음 (Tailwind가 소스에서 못 찾음). 등급 · 상태별 모양은 `Record<키, "완성된 클래스 문자열">` 표로
- 조건부 · 덮어쓰기 클래스는 `cn()`으로 (`@/shared/lib/cn`). `@apply` · `@utility`로 새 CSS 클래스를 만들지 않음 (진입 CSS의 `body` 등 React 밖 요소는 예외)
- 여러 기능 폴더에서 되풀이되는 모양은 `shared/ui/base/styles.ts`의 상수로 (아래 표). 한 폴더 안에서만 되풀이되면 그 파일의 상수로
- 반응형은 두 변형만: `narrow:` = `@media (max-width: 1150px)`, `phone:` = `@media (max-width: 760px)`. JS의 `NARROW`(`app/ui/state/UiContext.ts`)와 같은 쿼리
- id · `role` · `aria-*` · `data-view` · `data-tip` 같은 속성은 지우지 않음 (시험 흐름 · 동작이 기댐)
- 버전: `tailwindcss` · `@tailwindcss/vite` `^4.3.3`, `clsx` `^2.1.1`, `tailwind-merge` `^3.7.0`
- 문서는 명사형 개조식, 코드 주석은 "~합니다"체, 커밋은 `type: 한국어 요약` 한 줄 50자 이내 (`CLAUDE.md` §4)
- 화면 소스를 고친 커밋에는 `make front-build` 결과(`sentinelai/web/static/`)를 함께 넣음
- 서버 코드(`sentinelai/` 중 `web/static` 밖) · `docs/`는 건드리지 않음
- `$S` = `/private/tmp/claude-501/-Users-hj-kim-JBNU-2026-2-JBNU-RAD-LMENGINE/b88674a1-61ff-413e-bb63-d6c420e1e490/scratchpad` (비교 도구 자리, 저장소 밖)

### 색 토큰 (`@theme static`, Task 1)

| 토큰 | 값 | 옛 이름 · 쓰임 |
|---|---|---|
| `ink` | `#111111` | `--ink` |
| `ink-dim` | `#666666` | `--ink-dim` |
| `ink-soft` | `#333333` | 상세 내용 칸 · 결재 의견 |
| `ink-faint` | `#999999` | 분류 칸 작은 글자 |
| `ink-ghost` | `#BBBBBB` | 행 끝 화살표 |
| `surface` | `#FFFFFF` | `--bg` |
| `canvas` | `#F5F5F6` | `--bg-soft` |
| `row-hover` | `#FAFAFB` | 목록 행 hover |
| `line` | `#E4E4E7` | `--line` |
| `risk` | `#EA002C` | `--accent` (위험 · 강조 · CI) |
| `warn` | `#FF7A00` | `--sub` |
| `ok` | `#2E7D5B` | `--ok` |
| `risk-tint` · `warn-tint` · `ok-tint` | `#FFF4F6` · `#FFF6EE` · `#EFF7F3` | 같은 이름 |
| `ok-line` | `#9CCDB5` | 승인 · good 버튼 테두리 |
| `warn-line` · `warn-ink` | `#FFC999` · `#B85600` | 조건부 승인 버튼 |
| `idle` | `#B5B5BA` | 판정 없음 점 |
| `mark-etc` | `#D4D4D8` | 막대의 "그 외" 조각 |
| `bar-ink` · `bar-line` · `bar-line-hover` · `bar-hover` | `#DDDDDD` · `#3A3A3A` · `#888888` · `#262626` | 상단 검은 바 |
| `tip-dim` | `#CFCFCF` | 툴팁 설명 글자 |

흰색 글자는 Tailwind 기본 `white`(`#fff`).

### 공통 클래스 상수 (`shared/ui/base/styles.ts`)

처음 필요한 작업에서 만들고 뒤 작업은 가져다 씀.

| 상수 | 옛 클래스 |
|---|---|
| `card` | `.card` |
| `cardHead` · `cardTitle` · `cardCount` | `.logs-head` · `.logs-head h3` · `.logs-count` |
| `toolButton` | `.rerun` |
| `select` | `.select` |
| `field` · `input` | `.form-grid label` · 입력 칸 (`input` · `textarea` · `select`) |
| `actionButton` · `primaryButton` · `dangerButton` · `goodButton` | `.form-actions button` · `button.primary` · `button.danger` · `button.good` |
| `note` · `meta` · `subject` · `box` · `empty` · `num` · `warn` | 같은 이름 |
| `formMsg` · `formMsgOk` | `.form-msg` · `.form-msg.ok` |
| `chips` · `chip` · `clause` | 같은 이름 |
| `ltableWrap` · `ltable` · `lth` · `ltd` · `lrow` | `.ltable-wrap` · `.ltable` · `th` · `td` · `tbody tr` (hover · `aria-current`) |
| `levelDot` · `levelText` · `markTone` | `.ldot.<등급>` (+ `none`) · 등급 글자색 · `.mk.<등급>` (+ `기타`) — `Record` 표 |

## Review Focus

- **hover · 포커스 상태** — 가만히 찍은 화면에는 안 나옴. 비교 상태에 행 hover · 칩 hover · 검색창 focus · 입력 칸 focus · 사이드바 메뉴 hover를 넣음 (Task 0 상태 목록)
- **경계 폭** — 760 · 761 · 1150 · 1151px에서 반응형 · 서랍이 지금과 같아야 함. 비교 상태에 네 폭을 넣음 (Task 0)
- **데이터로 정해지는 모양** — 등급(정상 · 주의 · 위험 · none) · 노드 상태(on · stale · off · wait) · 결정 버튼(approve · cond · reject) · 막대 조각(기타). 시험 데이터에 없는 값은 화면 비교로 못 잡음 → 표의 키가 빠짐없는지 단위 시험 (Task 2 · 6) + 조각 클래스 금지 시험 (Task 1)
- **`hidden` 속성과 display 유틸리티** — preflight 없이 `flex` 등을 주면 `hidden`이 풀림. 진입 CSS에 `[hidden]` 규칙을 Task 1부터 둠 + 숨은 요소가 있는 상태(일반 사용자 화면의 세그먼트 · 정책 관리 밖의 실행 버튼)를 비교에 넣음
- **툴팁 · 서랍 · 모달** — 크기를 재서 자리를 정하는 툴팁, 전환 효과가 있는 서랍. 비교 상태에 툴팁이 뜬 화면 · 390px 서랍 · 기준 문서 창을 넣음 (Task 0)

---

### Task 0: 비교 도구 · 기준 기록 (작업 공간, 커밋 없음)

**Files:**
- Create: `$S/tw/compare.mjs` · `$S/tw/states.json` · `$S/tw/sweep.mjs` · `$S/tw/sweeps/*.json` · `$S/tw/legacy_usage.py`
- Create: `$S/tw/baseline/` — `git archive 69c4cd3 sentinelai/web/static | tar -x -C $S/tw/baseline`

**Interfaces:**
- Produces:
  - `node $S/tw/compare.mjs [--only <상태 id 앞부분>]` — 상태마다 번들 A(`$S/tw/baseline/sentinelai/web/static`)와 B(저장소 `sentinelai/web/static`)를 같은 서버에서 번갈아 띄워 찍고 pixelmatch(threshold 0.1, 안티앨리어싱 무시)로 비교. `상태id: N px` 줄과 마지막 `diff states: K`, K>0이면 종료 코드 1, 차이 그림은 `$S/tw/out/<id>-diff.png`
  - `node $S/tw/sweep.mjs` — 시험 흐름 8개를 A · B로 돌려 화면 글자를 공백 지우고 비교, 다르면 `DIFF` 줄 · 종료 코드 1
  - `python3 $S/tw/legacy_usage.py` — 옛 CSS에 남은 클래스마다 그것을 className에 쓰는 TSX 파일, 그리고 어디서도 안 쓰는 클래스 목록
- 번들 바꾸기: Playwright `context.route("http://127.0.0.1:8001/**")`에서 `/api`로 시작하면 `route.continue()`, 나머지는 번들 폴더의 파일 (`/`는 `index.html`)

- [ ] **Step 1: 시험 서버를 자동 작업 없이 다시 띄움**
  - 지금 8001 서버를 끄고 `make dev DEV_CHECK_MIN=0`을 백그라운드로 (자동 위협 예측 · 서버 점검이 데이터를 바꾸지 않게)
  - Run: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8001/` → Expected: `200`
- [ ] **Step 2: 기준 번들 꺼내기** — 위 `git archive` 명령. Expected: `$S/tw/baseline/sentinelai/web/static/index.html`이 `index-DahljjX9.js`를 가리킴
- [ ] **Step 3: `states.json` 작성** — 상태 = `{id, login, width, steps[], mask[]}`. 최소 목록:
  - 로그인 화면 (1440 · 390), 비밀번호 변경 창 (상단 바 버튼, 1440)
  - `dev-user`: 내 신청 (1440 · 390), 신청 행 선택 (1440 · 390 서랍)
  - `dev-op`: 결재함 빈 목록 · 정책 관리 검토 현황 · 서버 점검 행 패널 · 요약 카드 누름 · 검색창 focus · 행 hover · 노드 탭 + 노드 선택 · 서버 질의 탭 · 로그 감시 행 패널 · 로그 조회 한 달 + 줄 선택 · 로그 질의 근거 패널 · 정책 질의 근거 패널 · 통계 막대 선택 · 사용자 위협 사람 선택 · 종 알림 · 기준 문서 창 · 사이드바 메뉴 툴팁 · 칩 hover (1440). 그중 정책 관리 · 노드 · 로그 조회 · 통계 · 사용자 위협 · 정책 질의 · 기준 문서는 390도
  - `dev-root`: 유효 권한 선택 + 빈 회수 사유 메시지 · 정책 관리 결정 기록 · 권한 목록 선택 · 권한 등록 · 계정 선택 · 자기 계정 · 새 계정 (1440), 권한 목록 · 계정은 390도
  - 경계 폭: 정책 관리 검토 현황 · 보안 통계를 760 · 761 · 1150 · 1151
  - 마스크: 분 단위로 바뀌는 글자 (계정의 마지막 로그인 등)
  - 공통: `fullPage: true`, `animations: "disabled"`, `caret: "hide"`. 툴팁 · hover는 이동 뒤 300ms 기다림
- [ ] **Step 4: 도구가 차이를 잡는지 확인** — B를 기준 번들 사본으로 두되 CSS 한 곳(`#EA002C` → `#EA002D`)만 바꿔 한 번 돌림
  - Expected: `diff states:` 1 이상, 종료 코드 1
- [ ] **Step 5: 기준 확인** — 원래 B(저장소 `static/`, 지금은 기준과 같음)로 돌림
  - Run: `node $S/tw/compare.mjs` → Expected: `diff states: 0`
- [ ] **Step 6: 시험 흐름 옮기기** — `$S/shots/sweep-*.json` 8개를 A · B 두 번들 모두에 있는 것(id · `role` · `aria-*` · `data-view` · 글자)으로만 요소를 찾게 고쳐 `$S/tw/sweeps/`에. `className`을 출력하는 부분은 뺌
  - Run: `node $S/tw/sweep.mjs` → Expected: `DIFF` 없음
- [ ] **Step 7: 옛 클래스 목록** — Run: `python3 $S/tw/legacy_usage.py` → Expected: 클래스 160여 개와 쓰는 파일이 나옴

### Task 1: Tailwind · 토큰 · shadcn 바탕 (화면 변화 없음)

**Files:**
- Modify: `frontend/package.json` · `frontend/package-lock.json` · `frontend/vite.config.ts` · `frontend/src/app/styles.css`
- Modify: 옛 CSS 전부의 `var(--accent)` → `var(--brand)` (`base.css`의 `--accent:` 정의 포함), `features/stats/StatsPanel.tsx` · `SystemStats.tsx`의 `stroke="var(--accent)"`
- Create: `frontend/src/shared/lib/cn.ts` · `frontend/src/shared/lib/cn.test.ts` · `frontend/components.json`

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string` — `twMerge(clsx(inputs))`
  - 색 토큰(위 표) → `bg-ink` · `text-ink-dim` · `border-line` 등, CSS 변수 `--color-<토큰>`
  - `font-sans` = 지금 글꼴 줄, 변형 `narrow:` · `phone:`
- 진입 CSS 순서 (`app/styles.css`):

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
/* 옛 CSS — 지금 순서 그대로, Task 9 까지 하나씩 지웁니다 */
@import "../shared/styles/base.css" layer(components);
/* … 지금 @import 18줄을 같은 순서로, 모두 layer(components) … */
@theme static { /* 색 토큰 · --font-sans */ }
@custom-variant narrow (@media (max-width: 1150px));
@custom-variant phone (@media (max-width: 760px));
:root { /* shadcn 색 변수 */ }
@theme inline { /* --color-background: var(--background); … */ }
@layer base { [hidden]:where(:not([hidden="until-found"])) { display: none !important; } }
```

- shadcn 색 변수: `--background` `#F5F5F6` · `--foreground` `#111111` · `--card` · `--popover` `#FFFFFF` (+ `-foreground` `#111111`) · `--primary` `#111111` · `--primary-foreground` `#FFFFFF` · `--secondary` · `--muted` · `--accent` `#F5F5F6` (+ `-foreground`: secondary · accent `#111111`, muted `#666666`) · `--destructive` `#EA002C` · `--border` · `--input` `#E4E4E7` · `--ring` `#111111` · `--radius` `8px`
- `components.json`: `{"$schema":"https://ui.shadcn.com/schema.json","style":"new-york","rsc":false,"tsx":true,"tailwind":{"config":"","css":"src/app/styles.css","baseColor":"neutral","cssVariables":true,"prefix":""},"aliases":{"components":"@/shared/ui","ui":"@/shared/ui/shadcn","utils":"@/shared/lib/cn","lib":"@/shared/lib","hooks":"@/shared/lib"},"iconLibrary":"lucide"}`. CLI는 쓰지 않음 (진입 CSS를 덮어씀)

- [ ] **Step 1: 실패하는 시험 작성** (`shared/lib/cn.test.ts`)

```ts
test("cn: 뒤 클래스가 같은 속성을 이김", () => expect(cn("p-2 text-ink", "p-4")).toBe("text-ink p-4"));
test("cn: 거짓 값은 빠짐", () => expect(cn("a", false && "b", undefined, "c")).toBe("a c"));
test("cn: 색 토큰과 글자 크기는 서로 지우지 않음", () =>
  expect(cn("text-ink-dim", "text-[12.5px]")).toBe("text-ink-dim text-[12.5px]"));
test("클래스 이름을 조각으로 만들지 않음 — Tailwind 가 소스에서 못 찾음", () =>
  expect(fragmentClasses("src")).toEqual([]));
```
  - `fragmentClasses(dir)`: 시험 파일 안 도우미. `src`의 `.ts` · `.tsx`에서 `/\b(?:bg|text|border|shadow|fill|stroke|ring|outline|from|to)-\$\{/`에 걸리는 `파일:줄` 목록
- [ ] **Step 2: 시험 실패 확인** — Run: `cd frontend && TZ=Asia/Seoul npx vitest run src/shared/lib/cn.test.ts` → Expected: FAIL (`cn` 없음)
- [ ] **Step 3: 설치** — `npm install -D tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3` · `npm install clsx@^2.1.1 tailwind-merge@^3.7.0`
- [ ] **Step 4: `cn` 구현** → Step 1 시험 통과
- [ ] **Step 5: `vite.config.ts`에 `tailwindcss()` 플러그인, 진입 CSS를 위 순서로, `--accent` → `--brand` 이름 바꾸기, `components.json`**
- [ ] **Step 6: 확인**
  - Run: `make front-test` → Expected: 시험 전부 통과 · 타입 · 린트 깨끗
  - Run: `make front-build && node $S/tw/compare.mjs && node $S/tw/sweep.mjs` → Expected: `diff states: 0`, `DIFF` 없음
- [ ] **Step 7: 커밋** — `chore: Tailwind v4 · shadcn 바탕 세팅` (`frontend/` · `sentinelai/web/static/`)

### Task 2: 공통 부품

**Files:**
- Create: `frontend/src/shared/ui/base/styles.ts` · `frontend/src/shared/ui/base/styles.test.ts`
- Modify: `shared/ui/base/Icon.tsx` · `shared/ui/base/parts.tsx` · `shared/ui/charts/HBars.tsx` · `shared/ui/charts/parts.tsx` · `shared/ui/server/ModuleTables.tsx` · `app/ui/panel/Panel.tsx` · `app/ui/panel/SourceChips.tsx`
- Modify: `app/styles.css` (charts.css 줄 삭제), 옛 CSS에서 다 옮긴 규칙 삭제 · `shared/ui/charts/charts.css` 삭제

**Interfaces:**
- Consumes: `cn` · 색 토큰 · `phone:` (Task 1)
- Produces:
  - `styles.ts`의 이 작업에 필요한 상수 (위 표의 `levelDot` · `levelText` · `markTone` · `box` · `note` · `meta` · `subject` · `empty` · `num` · `warn` · `chips` · `chip` · `clause` · `formMsg` · `formMsgOk` · `ltableWrap` · `ltable` · `lth` · `ltd` · `lrow` · `toolButton`)
  - `levelDot: Record<Level | "none", string>`, `levelText: Record<Level, string>`, `markTone: Record<Level | "기타", string>`
  - `Section` · `KvTable` · `History` · `Periods` · `PanelHead` · `PanelMsg` · `PanelFoot` · `SourceChips`가 `className?: string`을 받아 `cn()`으로 합침 (쓰는 곳의 덧씌우기: `.qa .chips`의 가로 줄, `.gap .kv th` 너비 52px 등)
  - `Icon`의 `sm` 크기는 지금처럼 prop/className으로 (18px · 15px)

- [ ] **Step 1: 실패하는 시험 작성** (`styles.test.ts`)

```ts
test("등급 표가 모든 키를 덮음", () => {
  expect(Object.keys(levelDot).sort()).toEqual(["none", "위험", "정상", "주의"]);
  expect(Object.keys(markTone).sort()).toEqual(["기타", "위험", "정상", "주의"]);
  for (const v of [...Object.values(levelDot), ...Object.values(markTone), ...Object.values(levelText)]) expect(v).not.toBe("");
});
```
- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/shared/ui/base/styles.test.ts` → Expected: FAIL (모듈 없음)
- [ ] **Step 3: 옛 클래스 확인** — Run: `python3 $S/tw/legacy_usage.py` → 위 파일들이 쓰는 클래스 목록
- [ ] **Step 4: `styles.ts` 작성, 위 컴포넌트의 className을 유틸리티 · 상수로 바꿈** (값은 옛 CSS 그대로, 쓰는 곳의 문맥 규칙 `.stat .label .ldot` 등은 그 자리에서 `className`으로)
- [ ] **Step 5: 확인** — `make front-test` 통과 · `make front-build && node $S/tw/compare.mjs` → `diff states: 0`
- [ ] **Step 6: 옛 규칙 지우기** — `legacy_usage.py`가 "안 씀"으로 내놓는 규칙을 지우고 다시 Step 5 → 같은 결과
- [ ] **Step 7: 커밋** — `refactor: 공통 부품을 Tailwind로`

### Task 3: 화면 틀 · 겹쳐 뜨는 것

**Files:**
- Modify: `app/layout/AppShell.tsx` · `TopBar.tsx` · `Sidebar.tsx` · `Workspace.tsx` · `MainTabs.tsx` · `RightPanel.tsx` · `Footer.tsx` · `app/overlays/DocsModal.tsx` · `TooltipLayer.tsx`
- Modify: `app/styles.css` — `body` 그리드 · `#root` · `body` 상태를 `@layer base`로 옮김
- Delete: `app/layout/topbar.css` · `sidebar.css` · `app/overlays/overlays.css`, `layout.css` · `panel.css` · `responsive.css`의 옮긴 규칙

**Interfaces:**
- Consumes: `card` · `toolButton` 등 (Task 2)
- Produces:
  - `body` 상태: `document.body.dataset.solo` · `dataset.drawerOpen` (`"true"` / 지움). 진입 CSS가 `body[data-solo]` · `body[data-drawer-open]`로 그리드 · 넘침을 정함 (`narrow` 쿼리 포함)
  - 툴팁 즉시 표시 구역: 사이드바 · 상단 바에 `data-tip-instant` 속성, `TooltipLayer`는 `closest("[data-tip-instant]")`. 보임 상태는 `data-show` 속성
  - 정책 질의 탭의 넓은 질의 · 인용 패널: `Workspace`가 아는 탭 · 인용 상태로 클래스를 정함 (`[data-tab="ask"]:not(.cite)` 선택자 없앰)

- [ ] **Step 1: 옛 클래스 확인** — `legacy_usage.py`
- [ ] **Step 2: 바꾸기** — 위 파일들의 className, `body` 규칙을 진입 CSS로, `.show` · `.open` · `.cite` 클래스 토글을 `cn()` 조건 · `data-` 속성으로
- [ ] **Step 3: 확인** — `make front-test` · `make front-build && node $S/tw/compare.mjs && node $S/tw/sweep.mjs` → `diff states: 0`, `DIFF` 없음. 툴팁 · 서랍 · 기준 문서 창 · 경계 폭 상태를 눈으로도 한 번 봄
- [ ] **Step 4: 옛 규칙 · 파일 지우기 → Step 3 다시**
- [ ] **Step 5: 커밋** — `refactor: 화면 틀을 Tailwind로`

### Task 4: 검토 현황 목록

**Files:**
- Modify: `app/queue/QueueTab.tsx` · `QueueHead.tsx` · `QueueTable.tsx` · `SummaryCards.tsx`
- Delete: `app/queue/queue.css`

**Interfaces:**
- Consumes: Task 2 상수 · `levelDot`
- 위치로 칸을 숨기던 `.tr > :nth-child(3|4|6)`은 그 칸(머리 · 행 모두)에 `narrow:hidden`. 행 열 너비 `grid-cols-[84px_minmax(200px,1.4fr)_minmax(160px,1.3fr)_92px_112px_16px]` · `narrow:grid-cols-[70px_minmax(0,1fr)_100px]`
- 숨은 실행 버튼에 기대던 `.run + .run` 여백은 `QueueHead`가 보이는 버튼을 알고 정함
- 요약 카드의 등급별 눌림 모양은 `Record<Level, string>` 표

- [ ] **Step 1: 옛 클래스 확인 → Step 2: 바꾸기 → Step 3: 확인** (Task 3 Step 3과 같은 명령, 결재함 · 행 hover · 요약 카드 · 경계 폭 상태) **→ Step 4: 옛 규칙 · 파일 지우기 → Step 5: 커밋** — `refactor: 검토 현황 목록을 Tailwind로`

### Task 5: 로그인 · 권한 신청

**Files:**
- Modify: `features/auth/Gate.tsx` · `features/requests/RequestForm.tsx` · `RequestPanel.tsx`
- Delete: `features/auth/auth.css` · `features/requests/requests.css`, `forms.css`의 옮긴 규칙

**Interfaces:**
- Consumes: `field` · `input` · `actionButton` · `primaryButton` · `dangerButton` · `formMsg` · `select` (Task 2에 없으면 여기서 `styles.ts`에 더함)

- [ ] **Step 1~5**: Task 4와 같은 순서 (로그인 · 비밀번호 변경 · 내 신청 · 결재 패널 · 회수 메시지 상태) — 커밋 `refactor: 로그인 · 권한 신청을 Tailwind로`

### Task 6: 정책 관리 판정 · 노드

**Files:**
- Modify: `features/review/ReviewPanel.tsx` · `DecisionLog.tsx` · `features/nodes/NodesTab.tsx` · `NodesPanel.tsx` · `NodeKey.tsx` · `features/nodes/lib.ts` (상태 표)
- Create · Modify: `features/review/lib.test.ts` · `features/nodes/lib.test.ts`에 표 시험 추가
- Delete: `features/review/review.css` · `features/nodes/nodes.css`

**Interfaces:**
- Produces:
  - `nodeStateTone: Record<NodeStateClass, string>` (`features/nodes/lib.ts`) — on `text-ok` · stale `text-warn` · off · wait `text-ink-dim`
  - `decisionTone: Record<"approve" | "cond" | "reject", string>` (`features/review/lib.ts`) — 지금 `DECISION_SET` 값(CSS 클래스 이름)을 이 표의 키로 씀

- [ ] **Step 1: 실패하는 시험** — `expect(Object.keys(nodeStateTone).sort()).toEqual(["off","on","stale","wait"])`, `expect(Object.keys(decisionTone).sort()).toEqual(["approve","cond","reject"])`
- [ ] **Step 2: 실패 확인 → Step 3~6**: Task 4와 같은 순서 (서버 점검 패널 · 결정 기록 · 노드 · 노드 키 상태) — 커밋 `refactor: 정책 관리 판정 · 노드를 Tailwind로`

### Task 7: 로그 조회 · 질의

**Files:**
- Modify: `features/logs/LogsTab.tsx` · `LogsPanel.tsx` · `features/ask/AskTab.tsx` · `AskPanel.tsx` · `Evidence.tsx`
- Delete: `features/logs/logs.css` · `features/ask/ask.css`

**Interfaces:**
- 로그 표의 `.col-sol · .col-where · .col-how` 숨김은 그 칸에 `narrow:hidden`
- 질의 기록의 문맥 규칙(`.qa .box` 줄바꿈 · `.qa .chips` 가로 · `.qa .chip` 너비)은 쓰는 자리에서 `cn(box, "whitespace-pre-wrap")` 식으로

- [ ] **Step 1~5**: Task 4와 같은 순서 (로그 조회 · 줄 선택 · 로그 질의 · 정책 질의 · 근거 패널 · 칩 hover 상태) — 커밋 `refactor: 로그 조회 · 질의를 Tailwind로`

### Task 8: 통계 · 권한 목록 · 계정

**Files:**
- Modify: `features/stats/StatsTab.tsx` · `SystemStats.tsx` · `UserStats.tsx` · `SafetyBand.tsx` · `Tile.tsx` · `StatsPanel.tsx` · `features/catalog/AccessPanel.tsx` · `features/accounts/UserPanel.tsx`
- Modify: Sparkline `stroke="var(--brand)"` → `"var(--color-risk)"`, `"var(--ink-dim)"` → `"var(--color-ink-dim)"`
- Delete: `features/stats/stats.css`, `components.css` · `forms.css` · `layout.css`에 남은 규칙

**Interfaces:**
- 안전 점수 큰 숫자의 등급 색은 `levelText` (Task 2)

- [ ] **Step 1~5**: Task 4와 같은 순서 (보안 통계 · 사용자 위협 · 막대 선택 · 경계 폭 · 권한 목록 · 계정 상태) — 커밋 `refactor: 통계 · 권한 목록 · 계정을 Tailwind로`

### Task 9: preflight 켜기 · 마무리 · 문서

**Files:**
- Modify: `frontend/src/app/styles.css` — `@import "tailwindcss/preflight.css" layer(base);`를 theme 다음에 더함, 옛 CSS `@import`가 남았으면 정리, `base.css`의 남은 규칙(`*` box-sizing · `html, body` · `button` 글꼴 · 커서)을 `@layer base`로 옮기고 `shared/styles/` 삭제
- Modify: preflight로 달라진 요소의 className (제목 굵기 · 크기, 패딩 없던 버튼, 목록 글머리표, 인라인 SVG, 입력 칸 placeholder 색 등 — 비교 도구가 짚는 곳)
- Modify: `CLAUDE.md` §1 · §4, `FRONTEND_GUIDE.md` §7 · §9 · §10 (CSS 설명 · 지원 브라우저 Chrome · Edge 111+ · Safari 16.4+ · Firefox 128+ · `build.target`으로 못 낮춤, "Tailwind는 리디자인 때" 문구 삭제)
- Delete: `design/tailwind-design.md` · `design/tailwind-tasks.md`

- [ ] **Step 1: 옛 CSS가 남지 않음** — Run: `python3 $S/tw/legacy_usage.py` → Expected: 남은 클래스 0, `find frontend/src -name '*.css'` → `app/styles.css` 하나
- [ ] **Step 2: preflight 켜고 비교** — `make front-build && node $S/tw/compare.mjs` → 달라진 상태 목록 확인
- [ ] **Step 3: 달라진 곳마다 그 요소에 지금 값을 유틸리티로 명시 → Step 2 다시** → Expected: `diff states: 0`
- [ ] **Step 4: 전체 확인** — `make front-test` · `node $S/tw/sweep.mjs` (`DIFF` 없음) · `make front-check` (커밋된 빌드와 같음) · 브라우저 Network에 다른 출처 없음
- [ ] **Step 5: 문서 고치기 · 설계 문서 두 개 삭제**
- [ ] **Step 6: 커밋** — 화면: `refactor: preflight 켜고 옛 CSS 정리`, 문서: `docs: Tailwind 전환 반영`
