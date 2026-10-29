# index.html → React 이식 계획

## Context

지금 화면은 `sentinelai/web/static/index.html` 한 파일이다. 2,751줄(CSS 470 · 마크업 170 · JS 2,090, 함수 96개)이고 `sentinelai/web/main.py:191`이 그대로 서빙한다. 팀은 화면을 React로 리디자인하기로 했고(10/23), 현성님이 옮길 기능 · API · 제약을 `FRONTEND_GUIDE.md`에 정리해 두었다.
이번 단계는 **기능 · 모양을 그대로 옮기는 것**까지다. 리디자인(Tailwind 포함)은 다음 단계다. 옮기는 동안 옛 화면과 새 화면을 같은 백엔드에 붙여 나란히 놓고 맞춰 본다.

## 정한 것

| 항목 | 결정 | 누가 |
|---|---|---|
| 범위 | 먼저 그대로 옮기기, 리디자인은 다음 | 사용자 |
| 폴더 구조 | 기능(메뉴)별 폴더 — FSD 아님 | 사용자 |
| CSS | 지금 CSS를 클래스 이름 그대로 영역별 파일로 나눔. Tailwind는 리디자인 때 | 사용자 |
| 소스 위치 | 맨 위 `frontend/` (빈 `rad_web/`은 쓰지 않음) | 사용자 |
| 언어 · 도구 | TypeScript · Vite · @vitejs/plugin-react · Vitest | 내 판단 |
| 서버 상태 · 폴링 | TanStack Query (`refetchInterval`) | 내 판단 (FRONTEND_GUIDE §6 제안) |
| UI 상태 | React context + reducer (전역 상태 라이브러리 없음) | 내 판단 |
| 라우터 | 이번에는 두지 않는다 — 지금도 URL 상태가 없고, `StaticFiles(html=True)`는 깊은 경로 새로고침을 404로 낸다. 리디자인 때 해시 라우팅을 붙일 수 있게 `{view, mainTab, selected}`를 한 곳에 둔다 | 내 판단 |
| 빌드 결과 | 마지막 전환 단계에서 `sentinelai/web/static/`에 빌드해 git에 커밋 — 팀 서버에 Node 불필요, main.py 그대로 | 내 판단, 전환 때 바꿀 수 있음 |

## 폴더 구조

```
frontend/
├── index.html · vite.config.ts · package.json · tsconfig.json
└── src/
    ├── main.tsx              createRoot · QueryClientProvider · app/styles.css (CSS를 import하는 유일한 곳)
    ├── app/                  App(부팅 · 게이트) · AppShell · TopBar(종 · 엔진 경고) · Sidebar · Seg · MainTabs
    │   │                     Workspace · RightPanel(패널 자리 · 고르기) · Footer · DocsModal · TooltipLayer
    │   │                     useBoot · useJobsWatcher · views.ts(VIEWS · ROLE_VIEWS) · queryClient.ts
    │   ├── ui/               uiReducer(순수) · UiContext(useUi 동작: 메뉴 · 탭 · 선택 · 서랍 · 메뉴 간 이동)
    │   └── queue/            검토 현황 공통 — useQueue · select(inView · visible · openRisks · viewCounts)
    │                         emptyText · QueueTab · QueueHead · SummaryCards · QueueTable
    ├── shared/
    │   ├── api/              http.ts(getJSON · send · 401 → 로그인) · types.ts · queries.ts · jobs.ts
    │   ├── lib/              format(stamp · pct) · request(isActive · STEP) · levels · labels
    │   │                     clause(clauseText · chipLabel · ruleText) · hooks(useNow · useMediaQuery) · tooltip
    │   ├── ui/               Icon · LevelDot · KvTable · Section · PanelHead · PanelMsg · History
    │   │                     SourceChips · ModuleTables · Periods · charts/(HBars · Meter · Legend · Sparkline · TableView)
    │   └── styles/           base · layout · components · panel · forms · responsive
    └── features/             서로 import하지 않는다 (shared · app/ui만)
        ├── auth/             Gate · LoginForm · PasswordForm
        ├── requests/         RequestPanel(결재 · 회수 · 다시 판정) · RequestForm(내 신청) · accessOptions · items
        ├── review/           ReviewPanel(정책 · 서버 점검 · 로그 감시) · DecisionLog · RunButton · items
        ├── nodes/            NodesTab · NodesPanel · NodeKey · nodeState
        ├── logs/             LogsTab · LogsPanel
        ├── ask/              AskTab · AskPanel · Evidence · useAsk · config(ASK 예시 질문)
        ├── stats/            StatsTab · SystemStats · UserStats · SafetyBand · StatsPanel
        ├── catalog/          AccessPanel · items
        └── accounts/         UserPanel · items
```

여러 기능이 같이 쓰는 것:
- 검토 현황 목록 · 요약 카드 · 사이드바 건수 · 종은 `app/queue/`에 둔다. 각 기능은 항목으로 바꾸는 순수 함수만 내보낸다.
- 근거 칩 · 조항 원문은 `shared/ui/SourceChips` · `shared/lib/clause`, 모듈 표는 `shared/ui/ModuleTables`에 둔다.
- 작업(jobs)은 `shared/api/jobs.ts` + `app/useJobsWatcher.ts`에 둔다.

함수 → 파일 대응표(줄 번호 포함)는 설계 검토 결과를 따른다. 이식할 때 `index.html`의 같은 함수를 열어 놓고 옮긴다.

## 상태

**TanStack Query 기본값**: `refetchOnWindowFocus:false · retry:false · staleTime:Infinity`.
`/api/logs`는 조회마다 감사 기록을 남긴다. 기본값(창 포커스 때 다시 받기 · 재시도)을 그대로 두면 옛 화면에 없던 감사 행이 생긴다.

| 키 | 다시 받기 |
|---|---|
| `me` · `health` · `regulations` · `users` · `catalog` · `qa/{kind}` | 한 번만, 바꾼 뒤에 invalidate |
| `requests` | 판정 중(`judging`)인 신청이 있으면 3초마다 |
| `jobs` | 작업이 돌면 2초, 아니면 30초 |
| `results` | `useJobsWatcher`가 작업이 끝나거나 `fast.last.events_fast.finished_at`이 바뀌면 invalidate, 결정 뒤 |
| `nodes` · `stats/{kind,period}` | 탭에 들어올 때마다 (`refetchOnMount:'always'`) |
| `logs/{조건}` | 조건이 바뀔 때만 |

- **UI 상태**는 `uiReducer`(순수 함수, 단위 시험)에 둔다. 동작은 `NAVIGATE`(메뉴를 바꾸면 거르기 초기화 · 첫 항목 선택) · `SELECT` / `SELECT_SILENT`(저장 뒤 "✓ …" 메시지 유지) · `CLOSE_PANEL` · `OPEN_LOGS` · `GOTO_*`.
- **입력 중인 결재 의견**은 `RequestPanel`의 key를 항목 key로만 두어 지킨다. 그러면 폴링으로 다시 그려도 지워지지 않는다.
- **질의 대기("답변 생성 중… 12초")**: 보내기 전에 대기 항목을 `qa/{kind}` 캐시에 넣는다. 탭을 바꿔도 남는다.
- **로그인 · 로그아웃 · 비밀번호 변경** 뒤에는 옛 화면처럼 `location.reload()`를 한다. 다른 사람의 캐시가 남지 않게 하기 위해서다.

## CSS — 그대로 옮길 때 깨지는 곳

- `app/styles.css`는 `@import`만 둔다. 원래 순서를 지켜야 한다. 1150px 블록이 늦게 와서 덮어쓰는 규칙이 많으므로 `responsive.css`는 맨 마지막에 둔다.
- **확인**: `sed -n 14,484p index.html | sort`와 나눈 파일들을 이어 붙여 정렬한 것을 diff한다. `#root` 규칙 하나만 달라야 한다.
- **body 그리드**: 지금은 body가 그리드다. `#root { display: contents }`를 더하고, 자식 순서(TopBar → Sidebar → Workspace → 서랍 배경 → 덮개)를 지키며, 감싸는 div를 두지 않는다. `body.solo` · `body.drawer-open`은 effect에서 단다.
- **`#run` · `#add-user` · `#add-access`**: 빼지 말고 `hidden`으로 숨긴다. `.run + .run` 여백 규칙이 숨은 형제에 기대고 있다.
- **`.tr > :nth-child(3|4|6)`**: 좁은 화면에서 칸을 위치로 숨기므로 행마다 자식 6개를 그대로 둔다.
- **`id="who-name"`** · **`.safety:empty`**: 그대로 둔다.
- 툴팁 · 게이트 · 모달은 opacity · transform이 걸린 요소 밖에 그린다.

## innerHTML → JSX 주의

- `esc()` · `innerHTML` · `paintIcons`는 쓰지 않는다. JSX 글자와 `<Icon/>` 컴포넌트로 바꾼다. `dangerouslySetInnerHTML`은 쓰지 않는다.
- `data-*` 이벤트 위임은 `onClick`으로 바꾼다. `data-tip` · `data-tip-pos`는 남긴다. TooltipLayer가 document에서 `closest("[data-tip]")`로 그대로 처리한다.
- **공백**: 템플릿 줄바꿈이 만들던 공백(결재 기록 `.history .step` 등)은 `{" "}`로 살린다.
- **키보드로 고르는 행**(Enter · Space)은 `activateProps`로 처리한다.
- **고르기 칸**: 고르기 칸은 controlled로 바꾼다. 막힌 권한이 아니면 앞 선택을 유지한다.
- **브라우저 기본 창**: `confirm()` · `alert()`는 그대로 쓴다.
- **안 쓰는 코드는 옮기지 않는다**: `levelsText` · `LEVEL_SEGS` · 두 번 정의된 `periodDays`.

## 순서 — 한 단계씩 옛 화면과 맞춰 보고 넘어간다

- **준비**: `make dev-setup RESET=1` → `make dev`(:8001, 옛 화면) → `make front`(:5173, 새 화면).
- **세션 분리**: 쿠키는 포트가 아니라 호스트별이다. 그래서 옛 화면은 `127.0.0.1:8001`, 새 화면은 `localhost:5173`으로 열어 세션을 나눈다.
- **화면 폭**: 1440px · 390px에서 비교한다.

| # | 단계 | 맞춰 볼 것 |
|---|---|---|
| 0 | 브랜치 `react-port`, `git tag ui-legacy` | — |
| 1 | 뼈대 — Vite react-ts · TanStack Query · Vitest, `/api` · `/internal` 프록시. `.gitignore`(node_modules · dist) · `.dockerignore`, Makefile `front-install` · `front` · `front-test` | 프록시로 `/api/auth/me` 401 |
| 2 | 공통 — CSS 나누기(정렬 diff), `shared/api` · `lib` · `ui`, lib 단위 시험 | `npm test` · `tsc` · `build` 통과 |
| 3 | 껍데기 + 로그인 — Gate · useBoot · UiContext · useQueue · TopBar · Sidebar · Seg · MainTabs · RightPanel · Footer · DocsModal · 툴팁 · 서랍 | 역할별 메뉴 · 첫 로그인 비밀번호 변경 · 쿠키 지우면 로그인으로 · 종 건수 · 엔진 경고 |
| 4 | 권한 신청 — 결재함(3초 폴링 · 결재 · 회수 · 다시 판정) → 내 신청(일반 사용자) | 판정이 와도 입력 중 의견 유지 · 일반 사용자에 AI 흔적 · `/api/health` 없음 |
| 5 | 검토 현황 — 정책 관리 · 로그 감시 패널 · 운영자 결정 · 결정 기록 · [정책 관리 검토 실행] · 작업 감시 · 하단 경고 | "… 중 3/8" · 끝나면 갱신 · 1차 판정 구별 · 근거 칩 조항 글자 같음 |
| 6 | 노드 (`make dev-sim`) | 등록 · 키 복사 · 끄기/켜기 · 다시 발급 · [지금 점검] |
| 7 | 로그 조회 | 건수 · 페이지 · 원본 · 로그 감시 패널에서 열기 |
| 8 | 질의 3종 | 지난 기록 · 경과 초 · 근거 패널 |
| 9 | 통계 2탭 | 기간 4개 숫자 같음 · 막대 → 패널 → 다른 메뉴 이동 · 표로 보기 · [지금 예측] |
| 10 | 권한 목록 · 계정 관리 (보안 총책임자) | 루트 · 자기 계정 잠금 · `log_id` 겹침 400 |
| 11 | 전체 확인 — FRONTEND_GUIDE §10을 세 역할 · 두 폭 · 키보드로 | 콘솔 깨끗 · 다른 출처 요청 없음 · 390px 가로 스크롤 없음 |
| 11.5 | 정리 — 기능 폴더를 가로지르는 중복 JSX를 `shared/ui`로, 안 쓰는 export · CSS 삭제, 큰 파일 나누기 (동작 불변, 사용자 요구 10/29) | §10 다시 통과 |
| 12 | 전환 — `build.outDir: ../sentinelai/web/static`(+ `emptyOutDir`) → 옛 index.html은 `ui-legacy` 태그에 남는다. `make front-build`, 빌드 결과 커밋 | Node 없이 `make dev`만으로 새 화면 · §10 다시 |

단계마다 커밋한다. 4~10단계는 기능 하나씩이다 (CLAUDE.md §4 "하나씩 바꾸고 확인").

## 시험

- **Vitest** — 순수 함수만 시험한다. `TZ=Asia/Seoul`로 돌린다.
  - `clause`(조항 여러 개 · 제목 단계 · 번호 없음), `isActive`(기간 끝 = 오늘), `select`(역할별 결재 대기 · 검색 · 종), `uiReducer` 동작
  - 항목 변환(판정 중 · 판정 실패 · 1차 판정 표시), `emptyText`, 작업 버튼 문구 · 폴링 간격, `accessOptions`, `nodeState`, `trendMark`, `placeTip`
- **손으로** — 옛 화면과 나란히 놓고 확인한다.
  - dev-user: 신청 · 철회
  - dev-op: 판정 중 의견 입력 · 1차 결재 · 검토 실행 · 결정 · 노드 · 로그 · 질의 · 통계
  - dev-root: 최종 결재 · 회수 · 결정 기록 · 권한 목록 · 계정
  - 모델 서버가 꺼져 있으면 실패 경로(엔진 경고 · 판정 실패 · 작업 실패)를 확인한다.

## 전환 때 고칠 문서

- **CLAUDE.md**
  - §1 트리: `static/index.html 단일 파일` 대신 `frontend/` + `static/`(빌드 결과)
  - §2: `ASK_EXAMPLES` 등 위치
  - §3: `make front*`
  - §4: "React · 빌드 도구 금지"를 "React + Vite, 빌드 결과 커밋, 서버에 Node 불필요, Tailwind는 리디자인 때"로 바꾼다
- **FRONTEND_GUIDE**: 첫 줄 · §1 끝 메모 · §5 함수 이름(→ `ui-legacy` 태그) · §9 개발 명령
- **README**: 화면 소스 위치 한 줄
- **NOTES.md**: 빌드 결과를 커밋하는 이유

## 이식 뒤 (10/29)

- **파일 정리**: 위 폴더 구조의 작은 파일을 합쳤다 (소스 105 → 83개). 지금 구조는 CLAUDE.md §1, 기준은 NOTES.md.
