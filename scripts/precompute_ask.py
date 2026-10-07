"""권한 질의 예시 답변을 미리 계산해 data/ask_results.json 에 저장합니다 — `make precompute-ask`

화면의 예시 질문 버튼은 이 파일의 답을 바로 보여줍니다 (시연 중 모델을 돌리지 않음).
예시 질문 목록은 여기 한 곳에만 둡니다. 화면은 이 파일에서 버튼을 만듭니다.
data/results.json 은 건드리지 않습니다. Milvus Lite 는 DB 파일을 한 프로세스만 열 수 있으므로 `make web` 을 끄고 실행하세요.
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

from sentinelai.web.loader import DATA_DIR  # noqa: E402
from sentinelai.web.review import answer_question  # noqa: E402

ASK_JSON = DATA_DIR / "ask_results.json"

# permissions.csv 에 있는 이름은 쓰지 않습니다. 대기열 판정과 헷갈리기 때문입니다.
QUESTIONS = [
    "인사팀 김민수가 급여 테이블(HR_SALARY)에 접근할 수 있어?",
    "감사팀 담당자가 인사 정보(HR_MASTER)를 조회할 수 있어?",
    "개발팀 사원이 운영 DB 관리자 권한을 받아도 돼?",
]


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

    chain = engine.rag_chain(structured=True)
    asks = []
    failures = 0
    for n, question in enumerate(QUESTIONS, start=1):
        print(f"\n[{n}/{len(QUESTIONS)}] {question}", flush=True)
        result, error = answer_question(chain, question)
        failures += error is not None
        asks.append({**result, "failed": error is not None})
        print(f"  ({result['elapsed_sec']}초) {result['answer']}")
        for source in result["sources"]:
            print(f"  근거: {' '.join(source.split())}")

    ASK_JSON.write_text(
        json.dumps(
            {
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "model": engine.settings.model,
                "base_url": engine.settings.ollama_base_url,
                "asks": asks,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"\n{ASK_JSON} 생성됨 — {len(asks)}건, 답변 실패 {failures}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
