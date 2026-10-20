"""SentinelAI CLI — `python -m sentinelai <명령>`

웹이 꺼져 있을 때 서버에서 쓰는 최소한의 명령만 둡니다. 판정은 웹과 같은 Engine 기능을 부르고 같은 DB 에 쌓습니다.
웹이 떠 있으면 벡터 DB 를 웹이 쥐고 있어 health · index · review-policies · check-nodes · monitor 는 실패합니다 (Milvus Lite 는 한 프로세스만).
대상 위치 · 모델 · DB 는 모두 .env 에서 나옵니다.
"""
from __future__ import annotations

import argparse
import getpass
import sys
from typing import Any

from . import db
from .data import parse_datetime
from .engine import Engine


def _show(item: dict[str, Any]) -> None:
    """판정 한 건 (Verdict · ServerReview)."""
    if item["failed"]:
        print(f"  판정 실패: {item['error']}")
        return
    print(f"  {item['level']} ({item['elapsed_sec']}초) {item.get('summary') or item.get('reason', '')}")
    for gap in item.get("gaps", []):
        print(f"  - {gap['level']} {gap['item']}: {gap['current']} → {gap['required']} ({gap['source']})")
        print(f"    바꿀 것: {gap['change']}")
    if item.get("recommendation"):
        print(f"  권고: {item['recommendation']}")
    if item.get("unjudged"):
        print(f"  조항이 없어 판단하지 않음: {', '.join(item['unjudged'])}")


def _issues(issues: list[str]) -> None:
    for issue in issues:
        print(f"  읽기 실패 {issue}")


def health(engine: Engine, args: argparse.Namespace) -> int:
    h = engine.health()
    s = engine.settings
    print(f"서버        : {h['base_url']} — {'연결됨' if h['connected'] else f'연결 실패 ({h['error']})'}")
    for label, key, name in (("판정 모델", "model_ready", s.model), ("질답 모델", "qa_model_ready", s.qa_model),
                             ("임베딩 모델", "embedding_ready", s.embedding_model)):
        print(f"{label:9s}: {name} {'OK' if h[key] else '없음'}")
    print(f"벡터 DB     : {s.milvus_target} — {'OK' if h['index_ready'] else '비어 있음 (index 로 적재)'}")
    print(f"권한 DB     : {s.db_path} · AI 결과 DB: {s.results_db_path}")
    return 0 if h["ok"] else 1


def index(engine: Engine, args: argparse.Namespace) -> int:
    report = engine.index(args.source, rebuild=args.rebuild)
    print(report)
    for name in report.indexed:
        print(f"  갱신   {name}")
    for name in report.skipped:
        print(f"  건너뜀 {name}")
    if args.rebuild:
        print("규칙까지 지웠습니다. review-policies 로 솔루션 정책을 다시 적재하세요.")
    return 0


def review_policies(engine: Engine, args: argparse.Namespace) -> int:
    def progress(n: int, total: int, item: dict[str, Any]) -> None:
        if item["failed"]:
            print(f"정책 간 검토 실패: {item['error']}")
            return
        print(f"{item['summary']} ({item['elapsed_sec']}초)")
        for issue in item["issues"]:
            print(f"  {issue['kind']} · {issue['level']} {' ↔ '.join(issue['policy_ids'])}: {issue['reason']}")

    review = engine.run_policies(progress)
    _issues(review["load_issues"])
    print(f"\n{engine.results_db.path} 에 저장")
    return 1 if review["failed"] else 0


def check_nodes(engine: Engine, args: argparse.Namespace) -> int:
    def progress(n: int, total: int, item: dict[str, Any]) -> None:
        print(f"\n[{n}/{total}] 노드 {item['node']} ({item['host']})")
        _show(item)

    run = engine.run_nodes(progress)
    _issues(run["load_issues"])
    if not run["findings"]:
        print("새 수집이 온 노드가 없습니다.")
    failed = sum(f["failed"] for f in run["findings"])
    print(f"\n{engine.results_db.path} 에 저장 — 판정 실패 {failed}건")
    return 1 if failed else 0


def monitor(engine: Engine, args: argparse.Namespace) -> int:
    def progress(n: int, total: int, finding: dict[str, Any]) -> None:
        print(f"\n[{n}/{total}] {finding['subject']} — 로그 {finding['events'].count(chr(10)) + 1}건")
        _show(finding)

    run = engine.run_events(parse_datetime(args.since) if args.since else None,
                            parse_datetime(args.until) if args.until else None, args.full, progress)
    if run["since"]:
        print(f"({run['since']} 이후 로그)")
    _issues(run["load_issues"])
    if not run["findings"]:
        print("판정할 새 로그가 없습니다.")
    failed = sum(f["failed"] for f in run["findings"])
    print(f"\n{engine.results_db.path} 에 저장 — 판정 실패 {failed}건")
    return 1 if failed else 0


def import_snapshots(engine: Engine, args: argparse.Namespace) -> int:
    loaded, stored = engine.import_snapshots(args.folder)
    _issues([str(i) for i in loaded.issues])
    print(f"{loaded.source}: 수집 {len(loaded.records)}건 중 새로 넣음 {stored}건 → {engine.results_db.path}")
    return 1 if loaded.issues else 0


def create_root(engine: Engine, args: argparse.Namespace) -> int:
    # 터미널이 아니면(파이프) 화면 표시 없이 한 줄씩 읽습니다.
    ask = getpass.getpass if sys.stdin.isatty() else (lambda prompt: sys.stdin.readline().rstrip("\n"))
    password = ask("비밀번호: ")
    if password != ask("비밀번호 확인: "):
        print("두 비밀번호가 다릅니다.", file=sys.stderr)
        return 1
    try:
        user = db.auth.create_root(engine.main_db, args.login, password, args.name, args.department)
    except db.Denied as exc:
        print(f"만들지 못했습니다: {exc}", file=sys.stderr)
        return 1
    print(f"루트 계정을 만들었습니다: {user.login_id} ({user.display_name}) → {engine.main_db.path}")
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sentinelai", description="SentinelAI — 웹이 꺼져 있을 때 서버에서 쓰는 명령")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("health", help="Ollama 연결 · 모델 · 벡터 DB 확인").set_defaults(run=health)
    cmd = sub.add_parser("index", help="기준 문서(docs/) 적재 — 바뀐 파일만")
    cmd.add_argument("source", nargs="?", help="문서 파일 · 폴더 (.md · .txt). 없으면 docs/")
    cmd.add_argument("--rebuild", action="store_true", help="컬렉션을 비우고 전부 새로 (규칙도 지워짐)")
    cmd.set_defaults(run=index)
    sub.add_parser("review-policies", help="정책 관리 검토 — 문서 · 솔루션 정책 적재 + 정책 간 검토").set_defaults(run=review_policies)
    sub.add_parser("check-nodes", help="서버 점검 — 새 수집이 온 노드만").set_defaults(run=check_nodes)
    cmd = sub.add_parser("monitor", help="로그 감시 — 지난 감시 이후 로그만 (cron 용)")
    cmd.add_argument("--since", help="이 시각 이후 (UTC, ISO 8601)")
    cmd.add_argument("--until", help="이 시각까지 (UTC, ISO 8601)")
    cmd.add_argument("--full", action="store_true", help="지난 감시 시각을 무시하고 처음부터")
    cmd.set_defaults(run=monitor)
    cmd = sub.add_parser("import-snapshots", help="망이 막힌 노드가 export 한 수집 파일(*.json) 넣기")
    cmd.add_argument("folder", help="수집 파일 폴더")
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
