"""화면에 없는 일만 하는 CLI — 첫 계정 · 망이 막힌 노드 수집 넣기 · RAG 다시 만들기 · cron 로그 감시."""
from __future__ import annotations

import argparse
import getpass
import sys
from typing import Any

from . import db
from .sources import parse_datetime
from .engine import Engine


def _show(item: dict[str, Any]) -> None:
    """로그 감시 판정 한 건을 출력합니다."""
    if item["failed"]:
        print(f"  판정 실패: {item['error']}")
        return
    print(f"  {item['level']} ({item['elapsed_sec']}초) {item.get('reason', '')}")
    if item.get("recommendation"):
        print(f"  권고: {item['recommendation']}")


def _issues(issues: list[str]) -> None:
    for issue in issues:
        print(f"  읽기 실패 {issue}")


def _saved(engine: Engine, items: list[dict[str, Any]], empty: str) -> int:
    """판정 묶음의 끝 — 저장한 곳과 실패 건수를 적고, 실패가 있으면 1."""
    if not items:
        print(empty)
    failed = sum(bool(i["failed"]) for i in items)
    print(f"\n{engine.results_db.label} 에 저장 — 판정 {len(items)}건, 실패 {failed}건")
    return 1 if failed else 0


def index(engine: Engine, args: argparse.Namespace) -> int:
    report = engine.index(rebuild=args.rebuild)
    print(report)
    for name in report.indexed:
        print(f"  갱신   {name}")
    for name in report.skipped:
        print(f"  건너뜀 {name}")
    for name in report.removed:
        print(f"  뺌     {name}")
    return 0


def monitor(engine: Engine, args: argparse.Namespace) -> int:
    def progress(n: int, total: int, finding: dict[str, Any]) -> None:
        print(f"\n[{n}/{total}] {finding['subject']} — 로그 {finding['events'].count(chr(10)) + 1}건")
        _show(finding)

    run = engine.run_events(parse_datetime(args.since) if args.since else None,
                            parse_datetime(args.until) if args.until else None, args.full, progress)
    if run["since"]:
        print(f"({run['since']} 이후 로그)")
    _issues(run["load_issues"])
    return _saved(engine, run["findings"], "판정할 새 로그가 없습니다.")


def import_snapshots(engine: Engine, args: argparse.Namespace) -> int:
    loaded, stored = engine.import_snapshots(args.folder, args.node)
    _issues([str(i) for i in loaded.issues])
    print(f"{loaded.source}: 수집 {len(loaded.records)}건 중 새로 넣음 {stored}건 → {engine.results_db.label}")
    return 1 if loaded.issues else 0


def create_root(engine: Engine, args: argparse.Namespace) -> int:
    # 터미널이 아니면(파이프) 화면 표시 없이 한 줄씩 읽습니다.
    read = getpass.getpass if sys.stdin.isatty() else (lambda prompt: sys.stdin.readline().rstrip("\n"))
    password = read("비밀번호: ")
    if password != read("비밀번호 확인: "):
        print("두 비밀번호가 다릅니다.", file=sys.stderr)
        return 1
    try:
        user = db.auth.create_root(engine.main_db, args.login, password, args.name, args.department)
    except db.Denied as exc:
        print(f"만들지 못했습니다: {exc}", file=sys.stderr)
        return 1
    print(f"루트 계정을 만들었습니다: {user.login_id} ({user.display_name}) → {engine.main_db.label}")
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sentinelai", description="SentinelAI — 화면에 없는 일만 하는 서버 명령. monitor 는 웹이 떠 있으면 웹 작업 큐와 따로 모델을 칩니다")
    sub = p.add_subparsers(dest="command", required=True)
    cmd = sub.add_parser("index", help="권한 DB 의 기준 문서를 RAG 에 적재 — 바뀐 문서만")
    cmd.add_argument("--rebuild", action="store_true", help="컬렉션을 비우고 전부 새로")
    cmd.set_defaults(run=index)
    cmd = sub.add_parser("monitor", help="로그 감시 — 지난 감시 이후 로그만 (cron 용)")
    cmd.add_argument("--since", help="이 시각 이후 (ISO 8601, 시간대 없으면 UTC)")
    cmd.add_argument("--until", help="이 시각까지 (ISO 8601, 시간대 없으면 UTC)")
    cmd.add_argument("--full", action="store_true", help="지난 감시 시각을 무시하고 처음부터")
    cmd.set_defaults(run=monitor)
    cmd = sub.add_parser("import-snapshots", help="망이 막힌 노드가 export 한 수집 파일(*.json) 넣기")
    cmd.add_argument("folder", help="수집 파일 폴더")
    cmd.add_argument("--node", help="이 파일들의 노드 이름 (노드는 본문에 이름을 싣지 않습니다. 화면에 등록한 이름)")
    cmd.set_defaults(run=import_snapshots)
    cmd = sub.add_parser("create-root", help="초기 루트 계정(보안 총책임자) 만들기 — 서버에서 한 번만")
    cmd.add_argument("--login", required=True, help="로그인 ID")
    cmd.add_argument("--name", required=True, help="표시 이름")
    cmd.add_argument("--department", default="", help="부서")
    cmd.set_defaults(run=create_root)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return int(args.run(Engine(), args))
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(f"오류: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
