"""SentinelAI 코어 CLI — `python -m sentinelai <command>`

엔진 명령(health · index · ask …)에 data 와 engine 을 함께 쓰는 명령(index-policies · monitor)을 더합니다.
엔진만 들어 있는 환경에서는 `python -m sentinelai.engine.cli` 를 씁니다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import pipeline
from .data import parse_datetime
from .engine.cli import Cli as EngineCli


class Cli(EngineCli):
    PROG = "sentinelai"
    DESCRIPTION = "SentinelAI — 보안 정책 이해 · 로그 감시 코어 (전북대학교 RAD · SK쉴더스)"

    @staticmethod
    def commands(sub: argparse._SubParsersAction) -> None:
        EngineCli.commands(sub)

        policies = sub.add_parser("index-policies", help="솔루션 정책 규칙을 RAG 에 적재 (바뀐 것만)")
        policies.add_argument("source", help="정책 파일 (.csv · .json · .jsonl)")
        policies.set_defaults(command="index_policies")

        monitor = sub.add_parser("monitor", help="보안 솔루션 로그를 정책과 비교해 사용자별로 판정")
        monitor.add_argument("source", help="로그 파일 (.csv · .json · .jsonl)")
        monitor.add_argument("--since", help="이 시각 이후 로그만 (UTC, ISO 8601). --state 보다 우선")
        monitor.add_argument("--until", help="이 시각까지 (UTC, ISO 8601)")
        monitor.add_argument("--state", help="마지막 판정 시각을 읽고 쓰는 파일. 주기 실행용")
        monitor.add_argument("-o", "--out", help="결과를 JSON 으로 저장할 경로")
        monitor.set_defaults(command="monitor")

    def index_policies(self, args: argparse.Namespace) -> int:
        loaded, report = pipeline.index_policies(self.engine, args.source)
        print(loaded)
        for issue in loaded.issues:
            print(f"  {issue}")
        print(report)
        return 0

    def monitor(self, args: argparse.Namespace) -> int:
        state = pipeline.Watermark(args.state) if args.state else None
        since = parse_datetime(args.since) if args.since else (state.load() if state else None)
        until = parse_datetime(args.until) if args.until else None
        if since:
            print(f"{since.isoformat()} 이후 로그만 판정합니다.")

        def show(f: pipeline.Finding) -> None:
            print(f"\n{f.subject} ({f.user}) — {f.elapsed_sec}초")
            if f.verdict is None:
                print(f"  판정 실패: {f.error}")
                return
            print(f"  {f.verdict.level} {f.verdict.reason}")
            print(f"  권고: {f.verdict.recommendation}")
            print(f"  근거: {', '.join(f.verdict.sources) or '없음'}")

        run = pipeline.monitor(self.engine, args.source, since, until, on_finding=show)
        print(f"\n{run.loaded}")
        for issue in run.loaded.issues:
            print(f"  {issue}")
        if not run.findings:
            print("판정할 로그가 없습니다.")
        if run.last_event_at:
            if state:
                state.save(run.last_event_at)
                print(f"마지막 판정 시각 {run.last_event_at.isoformat()} → {state.path}")
            else:
                print(f"다음 실행: --since {run.last_event_at.isoformat()}")
        if args.out:
            Path(args.out).write_text(json.dumps(run.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{args.out} 생성됨")
        failed = sum(f.verdict is None for f in run.findings)
        return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(Cli.run())
