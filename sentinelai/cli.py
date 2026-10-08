"""SentinelAI 코어 CLI — `python -m sentinelai <command>`

엔진 명령(health · index · ask …)에 data 와 engine 을 함께 쓰는 명령을 더합니다.
대상 파일을 주지 않으면 .env 의 SENTINELAI_*_SOURCE 를 쓰고, 판정 결과는 SENTINELAI_RESULTS_PATH 에 쌓습니다 (웹과 같은 파일).
엔진만 들어 있는 환경에서는 `python -m sentinelai.engine.cli` 를 씁니다.
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from . import pipeline
from .data import parse_datetime
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
    DESCRIPTION = "SentinelAI — 보안 정책 이해 · 로그 감시 코어 (전북대학교 RAD · SK쉴더스)"

    @staticmethod
    def commands(sub: argparse._SubParsersAction) -> None:
        EngineCli.commands(sub)
        source_help = "대상 파일 (.csv · .json · .jsonl). 없으면 .env 의 값"

        policies = sub.add_parser("index-policies", help="솔루션 정책 규칙을 RAG 에 적재 (바뀐 것만)")
        policies.add_argument("source", nargs="?", help=source_help)
        policies.set_defaults(command="index_policies")

        requests = sub.add_parser("review-requests", help="권한 신청 전 건 판정 (정책 이해)")
        requests.add_argument("source", nargs="?", help=source_help)
        requests.set_defaults(command="review_requests")

        review = sub.add_parser("review-policies", help="정책 간 중복 · 충돌 · 과도한 허용 판정 (정책 이해)")
        review.add_argument("source", nargs="?", help=source_help)
        review.set_defaults(command="review_policies")

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

    @property
    def store(self) -> pipeline.ResultStore:
        return pipeline.ResultStore(self.engine.settings.results_path)

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
        self.store.put("requests", section)
        return self._done(section, sum(r["failed"] for r in section["reviews"]))

    def review_policies(self, args: argparse.Namespace) -> int:
        section = pipeline.review_policies(self.engine, args.source or self.engine.settings.policies_source)
        self.store.put("policies", section)
        if section["failed"]:
            print(f"판정 실패: {section['error']}")
        else:
            print(f"{section['summary']} ({section['elapsed_sec']}초)")
            for issue in section["issues"]:
                print(f"  {issue['kind']} · {issue['level']} {' ↔ '.join(issue['policy_ids'])}: {issue['reason']}")
        return self._done(section, int(section["failed"]))

    def monitor(self, args: argparse.Namespace) -> int:
        store = self.store
        if args.since:
            since = parse_datetime(args.since)
        else:
            since = None if args.full else store.last_event_at()
        if since:
            print(f"{since.isoformat()} 이후 로그만 판정합니다.")

        def progress(n: int, total: int, finding: dict[str, Any]) -> None:
            print(f"\n[{n}/{total}] {finding['subject']} — 로그 {finding['events'].count(chr(10)) + 1}건")
            _show(finding)

        until = parse_datetime(args.until) if args.until else None
        run = pipeline.monitor(self.engine, args.source or self.engine.settings.events_source, since, until, progress)
        store.add_events(run)
        if not run["findings"]:
            print("판정할 새 로그가 없습니다.")
        return self._done(run, sum(f["failed"] for f in run["findings"]))

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

    def _done(self, section: dict[str, Any], failed: int) -> int:
        for issue in section["load_issues"]:
            print(f"  읽기 실패 {issue}")
        print(f"\n{self.store.path} 에 저장 — 판정 실패 {failed}건")
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(Cli.run())
