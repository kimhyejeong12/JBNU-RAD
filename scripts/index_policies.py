"""솔루션 정책 규칙을 RAG 저장소에 적재합니다 — `make index-policies SRC=정책파일`

기준 문서(`make index`)와 같은 컬렉션에 "rules:<파일 이름>" 으로 쌓습니다. 바뀌지 않았으면 건너뜁니다.
Milvus Lite 는 DB 파일을 한 프로세스만 열 수 있으므로 `make web` 을 끄고 실행하세요.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

os.environ.setdefault("GRPC_VERBOSITY", "NONE")  # Milvus Lite 의 gRPC 경고를 숨깁니다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sentinelai.data import load_policies  # noqa: E402
from sentinelai.engine import Engine  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="정책 파일 (.csv · .json · .jsonl)")
    args = parser.parse_args()

    loaded = load_policies(args.source)
    print(loaded)
    for issue in loaded.issues:
        print(f"  {issue}")
    if not loaded.records:
        print("적재할 정책이 없습니다.", file=sys.stderr)
        return 1

    report = Engine().documents.index_rules(loaded.source, [r.describe() for r in loaded.records])
    print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
