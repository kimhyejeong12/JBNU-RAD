"""SentinelAI 코어 CLI — `python -m sentinelai <command>`

엔진 명령(health · index · ask …)에 data 와 engine 을 함께 쓰는 명령을 더합니다.
대상 파일을 주지 않으면 .env 의 SENTINELAI_*_SOURCE 를 쓰고, 정책 관리 검토 · 로그 감시 판정은 AI 결과 DB(SENTINELAI_RESULTS_DB_PATH)에 쌓습니다 (웹과 같은 DB).
엔진만 들어 있는 환경에서는 `python -m sentinelai.engine.cli` 를 씁니다.
"""
from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path
from typing import Any

from . import db, pipeline
from .data import load_collected, parse_datetime
from .data.collected import FORMAT
from .engine.cli import Cli as EngineCli


def _show(item: dict[str, Any]) -> None:
    if item["failed"]:
        print(f"  판정 실패: {item['error']}")
        return
    print(f"  {item['level']} ({item['elapsed_sec']}초) {item['reason']}")
    print(f"  권고: {item['recommendation']}")
    print(f"  근거: {', '.join(item['sources']) or '없음'}")


class Cli(EngineCli):
    PROG = "sentinelai"
    DESCRIPTION = "SentinelAI — 보안 정책 이해 · 로그 감시 코어"

    @staticmethod
    def commands(sub: argparse._SubParsersAction) -> None:
        EngineCli.commands(sub)
        source_help = "대상 파일 (.csv · .json · .jsonl). 없으면 .env 의 값"

        policies = sub.add_parser("index-policies", help="솔루션 정책 규칙을 RAG 에 적재 (바뀐 것만)")
        policies.add_argument("source", nargs="?", help=source_help)
        policies.set_defaults(command="index_policies")

        requests = sub.add_parser("review-requests", help="CSV 권한 신청 전 건 판정 — 평가용, DB에 쓰지 않음 (정책 이해)")
        requests.add_argument("source", nargs="?", help=source_help)
        requests.add_argument("--out", help="판정 결과를 이 JSON 파일로도 남김")
        requests.set_defaults(command="review_requests")

        review = sub.add_parser("review-policies", help="기준 문서 · 솔루션 정책 적재 + 정책 간 중복 · 충돌 · 과도한 허용 (정책 이해)")
        review.add_argument("source", nargs="?", help="솔루션 정책 파일 · 폴더. 없으면 .env 의 값")
        review.set_defaults(command="review_policies")

        nodes = sub.add_parser("check-nodes", help="새 수집이 온 노드의 서버 점검 1회 (웹이 떠 있으면 웹이 주기적으로 함)")
        nodes.set_defaults(command="check_nodes")

        imports = sub.add_parser("import-snapshots", help="망이 막힌 노드가 export 한 수집 파일(*.json) 넣기")
        imports.add_argument("folder", help="수집 파일 폴더")
        imports.set_defaults(command="import_snapshots")

        monitor = sub.add_parser("monitor", help="보안 솔루션 로그를 정책과 비교해 사용자별로 판정 (로그 감시)")
        monitor.add_argument("source", nargs="?", help=source_help)
        monitor.add_argument("--since", help="이 시각 이후 로그만 (UTC, ISO 8601). 없으면 지난 감시 이후")
        monitor.add_argument("--until", help="이 시각까지 (UTC, ISO 8601)")
        monitor.add_argument("--full", action="store_true", help="지난 감시 시각을 무시하고 전부 판정")
        monitor.set_defaults(command="monitor")

        logs = sub.add_parser("ask-logs", help="보안 솔루션 로그에 질문 (로그 감시). 건수 · 합계는 코드가 셉니다")
        logs.add_argument("question", help="질문 (예: 홍길동이 이번 주에 출력을 몇 번 했어?)")
        logs.add_argument("--source", help=source_help)
        logs.set_defaults(command="ask_logs")

        root = sub.add_parser("create-root", help="초기 루트 계정(보안 총책임자) 생성 — 서버에서 한 번만")
        root.add_argument("--login", required=True, help="로그인 ID")
        root.add_argument("--name", required=True, help="표시 이름")
        root.add_argument("--department", default="", help="부서")
        root.set_defaults(command="create_root")

    @property
    def results_db(self) -> db.Database:
        return db.open_results_db(self.engine.settings.results_db_path)

    def index_policies(self, args: argparse.Namespace) -> int:
        loaded, report = pipeline.index_policies(self.engine, args.source or self.engine.settings.policies_source)
        print(loaded)
        for issue in loaded.issues:
            print(f"  {issue}")
        print(report)
        return 0

    def review_requests(self, args: argparse.Namespace) -> int:
        def progress(n: int, total: int, review: dict[str, Any]) -> None:
            print(f"\n[{n}/{total}] {review['id']} {review['requester']} → {review['requested_access']}")
            _show(review)

        section = pipeline.review_requests(self.engine, args.source or self.engine.settings.requests_source, progress)
        failed = sum(r["failed"] for r in section["reviews"])
        self._load_issues(section)
        if args.out:
            Path(args.out).write_text(json.dumps(section, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"\n{args.out} 에 저장 — 판정 실패 {failed}건")
        else:
            print(f"\n판정 실패 {failed}건 (저장하지 않음 — 남기려면 --out 파일)")
        return 1 if failed else 0

    def review_policies(self, args: argparse.Namespace) -> int:
        s = self.engine.settings

        def progress(n: int, total: int, item: dict[str, Any]) -> None:
            if item["failed"]:
                print(f"정책 간 검토 실패: {item['error']}")
                return
            print(f"{item['summary']} ({item['elapsed_sec']}초)")
            for issue in item["issues"]:
                print(f"  {issue['kind']} · {issue['level']} {' ↔ '.join(issue['policy_ids'])}: {issue['reason']}")

        section = pipeline.review_policies(self.engine, args.source or s.policies_source, progress)
        results_db = self.results_db
        db.results.save_policy_review(results_db, section, s.model)
        return self._done(section, int(section["failed"]), results_db)

    def check_nodes(self, args: argparse.Namespace) -> int:
        s = self.engine.settings
        results_db = self.results_db
        pending = db.results.pending_snapshots(results_db, db.nodes.enabled_names(db.open_main_db(s.db_path)))
        if not pending:
            print("새 수집이 온 노드가 없습니다.")
            return 0

        def progress(n: int, total: int, item: dict[str, Any]) -> None:
            db.results.save_node_finding(results_db, item, s.model)
            print(f"\n[{n}/{total}] 노드 {item['node']} ({item['host']})")
            if item["failed"]:
                print(f"  판정 실패: {item['error']}")
                return
            print(f"  {item['level']} ({item['elapsed_sec']}초) {item['summary']}")
            for gap in item["gaps"]:
                print(f"  - {gap['level']} {gap['item']}: {gap['current']} → {gap['required']} ({gap['source']})")
                print(f"    바꿀 것: {gap['change']}")
            if item["unjudged"]:
                print(f"  조항이 없어 판단하지 않음: {', '.join(item['unjudged'])}")

        run = pipeline.check_nodes(self.engine, pending, s.policies_source, s.servers_source, progress)
        return self._done(run, sum(f["failed"] for f in run["findings"]), results_db)

    def import_snapshots(self, args: argparse.Namespace) -> int:
        """노드가 export 한 파일을 수집 API 와 같은 규칙으로 넣습니다. 등록부에 없는 노드는 키 없이 등록해 둡니다 (화면에서 끌 수 있음)."""
        s = self.engine.settings
        results_db, main_db = self.results_db, db.open_main_db(s.db_path)
        loaded = load_collected(args.folder)
        stored = 0
        for snap in sorted(loaded.records, key=lambda x: x.collected_at):
            payload = {**snap.model_dump(mode="json", exclude={"raw", "modules"}), "format": FORMAT}
            row = pipeline.snapshot_row(payload, snap.node, db.results.latest_snapshot(results_db, snap.node))
            db.nodes.ensure(main_db, snap.node, row)
            _, inserted = db.results.save_snapshot(results_db, row)
            if inserted:
                db.nodes.mark_collected(main_db, snap.node, row["collected_at"])
            stored += inserted
        self._load_issues({"load_issues": [str(i) for i in loaded.issues]})
        print(f"{loaded.source}: 수집 {len(loaded.records)}건 중 새로 넣음 {stored}건 → {results_db.path}")
        return 1 if loaded.issues else 0

    def monitor(self, args: argparse.Namespace) -> int:
        results_db = self.results_db
        if args.since:
            since = parse_datetime(args.since)
        else:
            since = None if args.full else db.results.next_monitor_since(results_db)
        if since:
            print(f"{since.isoformat()} 이후 로그만 판정합니다.")

        def progress(n: int, total: int, finding: dict[str, Any]) -> None:
            print(f"\n[{n}/{total}] {finding['subject']} — 로그 {finding['events'].count(chr(10)) + 1}건")
            _show(finding)

        until = parse_datetime(args.until) if args.until else None
        run = pipeline.monitor(self.engine, args.source or self.engine.settings.events_source, since, until, progress)
        db.results.save_monitor_run(results_db, run, self.engine.settings.model,
                                    since.isoformat() if since else None, until.isoformat() if until else None)
        if not run["findings"]:
            print("판정할 새 로그가 없습니다.")
        return self._done(run, sum(f["failed"] for f in run["findings"]), results_db)

    def ask_logs(self, args: argparse.Namespace) -> int:
        result = pipeline.ask_logs(self.engine, args.source or self.engine.settings.events_source, args.question)
        print(result["answer"])
        if result["criteria"]:
            print("\n조건:", ", ".join(f"{k}={v}" for k, v in result["criteria"].items()))
        if result["facts"] is not None:
            print(f"해당 로그 {result['facts']['count']}건 ({result['elapsed_sec']}초)")
            for line in result["evidence"]:
                print(f"  {line}")
        return 1 if result["failed"] else 0

    def create_root(self, args: argparse.Namespace) -> int:
        main_db = db.open_main_db(self.engine.settings.db_path)
        # 터미널이 아니면(파이프) 화면 표시 없이 한 줄씩 읽습니다.
        ask = getpass.getpass if sys.stdin.isatty() else (lambda prompt: sys.stdin.readline().rstrip("\n"))
        password = ask("비밀번호: ")
        if password != ask("비밀번호 확인: "):
            print("두 비밀번호가 다릅니다.", file=sys.stderr)
            return 1
        try:
            user = db.auth.create_root(main_db, args.login, password, args.name, args.department)
        except db.Denied as exc:
            print(f"만들지 못했습니다: {exc}", file=sys.stderr)
            return 1
        print(f"루트 계정을 만들었습니다: {user.login_id} ({user.display_name}) → {main_db.path}")
        return 0

    @staticmethod
    def _load_issues(section: dict[str, Any]) -> None:
        for issue in section["load_issues"]:
            print(f"  읽기 실패 {issue}")

    def _done(self, section: dict[str, Any], failed: int, results_db: db.Database) -> int:
        self._load_issues(section)
        print(f"\n{results_db.path} 에 저장 — 판정 실패 {failed}건")
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(Cli.run())
