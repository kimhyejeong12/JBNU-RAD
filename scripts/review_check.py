"""review_chain 재현 스크립트.

소형 모델(qwen2.5:7b)에서 관찰된 두 문제를 같은 입력으로 다시 돌려봅니다.
  1. 출력이 반복 루프에 빠져 JSON 이 잘리고 파싱에 실패하는 것 (크래시)
  2. 같은 입력인데 실행할 때마다 등급이 달라지는 것

사용법 (프로젝트 루트에서):
  .venv/bin/python scripts/review_check.py            # 기본 설정 vs repeat_penalty 각 3회
  .venv/bin/python scripts/review_check.py -n 5       # 회수 변경
  .venv/bin/python scripts/review_check.py --repeat-penalty 1.1
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Milvus Lite 가 긴 LLM 호출 중에 찍는 gRPC keepalive 경고를 숨깁니다 (동작에는 영향 없음).
os.environ.setdefault("GRPC_VERBOSITY", "NONE")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain_ollama import ChatOllama  # noqa: E402

from rad_lmengine import Engine  # noqa: E402

# 기대 등급은 docs/접근권한_관리기준.md 3.2 / 3.3 / 4.2 기준.
CASES = [
    {
        "name": "case1 영업팀 → 급여 테이블 (직무 무관, 미승인)",
        "expected": "위험",
        "input": {
            "requester": "영업팀 대리 김철수",
            "requested_access": "급여 테이블(HR_SALARY) 조회 권한",
            "current_access": "CRM 조회/수정, 영업 실적 대시보드",
        },
    },
    {
        "name": "case2 인사팀 → 인사 정보 (팀장 승인 완료)",
        "expected": "정상",
        "input": {
            "requester": "인사팀 과장 이영희 (인사팀장 승인 완료)",
            "requested_access": "인사 정보(HR_MASTER) 조회 권한",
            "current_access": "인사 시스템 기본 조회",
        },
    },
]


def run(label: str, chain, runs: int) -> list[dict]:
    rows = []
    for case in CASES:
        levels, fails, times = [], 0, []
        for i in range(runs):
            started = time.time()
            try:
                verdict = chain.invoke(case["input"])
                levels.append(verdict.level)
                status = f"{verdict.level} ({len(verdict.reason)}자)"
            except Exception as exc:
                fails += 1
                status = f"실패 {type(exc).__name__}"
            elapsed = time.time() - started
            times.append(elapsed)
            print(f"  [{label}] {case['name']} #{i + 1}: {status} — {elapsed:.0f}초", flush=True)
        rows.append({
            "config": label,
            "case": case["name"],
            "expected": case["expected"],
            "ok": runs - fails,
            "runs": runs,
            "levels": levels,
            "time": f"{min(times):.0f}~{max(times):.0f}초",
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-n", "--runs", type=int, default=3, help="사례당 반복 회수 (기본 3)")
    parser.add_argument("--repeat-penalty", type=float, default=1.15, help="비교할 repeat_penalty 값 (기본 1.15)")
    args = parser.parse_args()

    engine = Engine()
    s = engine.settings
    print(f"서버 {s.ollama_base_url} / 모델 {s.model} / temperature {s.temperature} / num_predict {s.num_predict}")
    if engine.documents.is_empty():
        print("컬렉션이 비어 있습니다. 먼저 `make index` 를 실행하세요.", file=sys.stderr)
        return 1

    print(f"\n== 기본 설정 (repeat_penalty 없음) × {args.runs}회")
    rows = run("기본", engine.review_chain(), args.runs)

    print(f"\n== repeat_penalty={args.repeat_penalty} × {args.runs}회")
    tuned = ChatOllama(**{**s.llm_options, "repeat_penalty": args.repeat_penalty})
    rows += run(f"rp={args.repeat_penalty}", engine.review_chain(llm=tuned), args.runs)

    print("\n== 요약")
    print(f"{'설정':10s} {'사례':44s} {'성공':7s} {'기대':4s} {'관측 등급':22s} 소요")
    for r in rows:
        observed = " / ".join(r["levels"]) if r["levels"] else "-"
        mark = "" if all(l == r["expected"] for l in r["levels"]) and r["levels"] else " ← 불일치"
        print(f"{r['config']:10s} {r['case']:44s} {r['ok']}/{r['runs']:<5d} {r['expected']:4s} {observed:22s} {r['time']}{mark}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
