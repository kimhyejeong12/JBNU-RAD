"""판정 결과를 미리 계산해 data/results.json 에 저장합니다 — `make precompute`

화면은 이 파일만 읽습니다 (시연 중 재계산하지 않음). 판정 실패 건수를 집계해 출력합니다.
Milvus Lite 는 DB 파일을 한 프로세스만 열 수 있으므로 `make web` 을 끄고 실행하세요.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

os.environ.setdefault("GRPC_VERBOSITY", "NONE")  # Milvus Lite 의 gRPC 경고를 숨깁니다.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sentinelai.engine import Engine  # noqa: E402

from sentinelai.web.loader import DATA_DIR, load_permissions, load_policies  # noqa: E402
from sentinelai.web.review import review_permission, review_policies  # noqa: E402

RESULTS_JSON = DATA_DIR / "results.json"
LEVELS = ["정상", "주의", "위험"]


def build(engine: Engine) -> tuple[dict, list[str]]:
    permission_rows = load_permissions()
    policy_rows = load_policies()
    steps = len(permission_rows) + 1
    failures: list[str] = []

    review = engine.review_chain()
    permissions = []
    for n, row in enumerate(permission_rows, start=1):
        print(f"[{n}/{steps}] {row['id']} 판정 중…", end="", flush=True)
        result, error = review_permission(review, row)
        if error:
            failures.append(f"{row['id']}: {error}")
        print(f" {result['level']} ({result['elapsed_sec']}초)", flush=True)
        permissions.append(result)

    print(f"[{steps}/{steps}] 정책 {len(policy_rows)}건 검토 중…", end="", flush=True)
    policy_review, error = review_policies(engine.policy_chain(), policy_rows)
    if error:
        failures.append(f"정책 검토: {error}")
    issues = policy_review["issues"]
    print(f" 문제 {len(issues)}건 ({policy_review['elapsed_sec']}초)", flush=True)

    levels = [p["level"] for p in permissions] + [i["level"] for i in issues]
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "model": engine.settings.model,
        "base_url": engine.settings.ollama_base_url,
        "summary": {
            "total": len(levels),
            **{level: levels.count(level) for level in LEVELS},
            "permission_count": len(permissions),
            "policy_issue_count": len(issues),
            "failed": len(failures),
        },
        "permissions": permissions,
        "policy_review": policy_review,
        "policies": policy_rows,
    }, failures


def main() -> int:
    engine = Engine()
    print(f"서버 {engine.settings.ollama_base_url} / 모델 {engine.settings.model}")
    if engine.documents.is_empty():
        print(
            "인덱스를 열 수 없거나 비어 있습니다. `make web` 이 떠 있으면 끄고, "
            "아니면 `make index` 를 먼저 실행하세요.",
            file=sys.stderr,
        )
        return 1

    results, failures = build(engine)
    RESULTS_JSON.write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    summary = results["summary"]
    print(f"\n{RESULTS_JSON} 생성됨")
    print(
        f"전체 {summary['total']}건 — "
        + " / ".join(f"{level} {summary[level]}" for level in LEVELS)
        + f" (권한 {summary['permission_count']} · 정책 문제 {summary['policy_issue_count']})"
    )
    print(f"판정 실패 {summary['failed']}건")
    for f in failures:
        print(f"  {f}")
    for issue in results["policy_review"]["issues"]:
        print(f"  정책 {' ↔ '.join(issue['policy_ids'])}: {issue['kind']} ({issue['level']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
