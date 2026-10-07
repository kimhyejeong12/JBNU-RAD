"""보안 솔루션 로그를 사용자별로 묶어 event_chain 으로 판정합니다 — `make review-events SRC=... [SINCE=...]`

--since 에 지난 실행이 출력한 마지막 시각을 넘기면 그 이후 로그만 판정합니다.
Milvus Lite 는 DB 파일을 한 프로세스만 열 수 있으므로 `make web` 을 끄고 실행하세요.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

os.environ.setdefault("GRPC_VERBOSITY", "NONE")  # Milvus Lite 의 gRPC 경고를 숨깁니다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rad_data import event_review_input, group_by_user, latest, load_events, parse_datetime  # noqa: E402
from rad_lmengine import Engine  # noqa: E402

RETRIES = 2


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source", help="로그 파일 (.csv · .json · .jsonl)")
    parser.add_argument("--since", help="이 시각 이후 로그만 (UTC, ISO 8601)")
    parser.add_argument("--until", help="이 시각까지 (UTC, ISO 8601)")
    parser.add_argument("-o", "--out", help="결과를 JSON 으로 저장할 경로")
    args = parser.parse_args()

    loaded = load_events(
        args.source,
        since=parse_datetime(args.since) if args.since else None,
        until=parse_datetime(args.until) if args.until else None,
    )
    print(loaded)
    for issue in loaded.issues:
        print(f"  {issue}")
    if not loaded.records:
        print("판정할 로그가 없습니다.")
        return 0

    engine = Engine()
    print(f"서버 {engine.settings.ollama_base_url} / 모델 {engine.settings.model}")
    if engine.documents.is_empty():
        print("인덱스를 열 수 없거나 비어 있습니다. `make web` 을 끄거나 `make index` 를 먼저 실행하세요.",
              file=sys.stderr)
        return 1

    chain = engine.event_chain()
    groups = group_by_user(loaded.records)
    results = []
    for n, (user, events) in enumerate(groups.items(), start=1):
        inputs = event_review_input(events)
        print(f"\n[{n}/{len(groups)}] {inputs['subject']} — 로그 {len(events)}건", flush=True)
        started, verdict, error = time.time(), None, None
        for _ in range(RETRIES + 1):
            try:
                verdict = chain.invoke(inputs)
                break
            except Exception as exc:  # 구조화 출력 파싱 실패 · 연결 오류 모두 다시 시도합니다.
                error = f"{type(exc).__name__}: {exc}"
        elapsed = round(time.time() - started, 1)
        if verdict is None:
            print(f"  판정 실패 ({elapsed}초): {error}")
            results.append({"user": user, **inputs, "failed": True, "error": error})
            continue
        # 알림(rad_lmengine/alert.py 의 Notifier)을 구축하면 주의 · 위험을 여기서 보냅니다.
        print(f"  {verdict.level} ({elapsed}초) {verdict.reason}")
        print(f"  권고: {verdict.recommendation}")
        print(f"  근거: {', '.join(verdict.sources) or '없음'}")
        results.append({"user": user, **inputs, **verdict.model_dump(), "elapsed_sec": elapsed, "failed": False})

    last = latest(loaded.records)
    print(f"\n다음 실행: --since {last.isoformat()}")
    if args.out:
        Path(args.out).write_text(
            json.dumps(
                {
                    "generated_at": datetime.now().isoformat(timespec="seconds"),
                    "source": loaded.source,
                    "last_event_at": last.isoformat(),
                    "results": results,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"{args.out} 생성됨")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
