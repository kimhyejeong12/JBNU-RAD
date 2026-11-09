"""판정 근거 확인 — 모델이 댄 근거 조항(문서 이름 · 조항 번호)이 실제 입력 조항에 있는지 코드로 봅니다 (어긋난 것만 checks 로)."""
from __future__ import annotations

import re
from typing import Any

from ..context import Built

DOCUMENT = re.compile(r"[\w가-힣.\-]+\.(?:md|txt)")
CLAUSE = re.compile(r"(?<![\d.])\d+(?:\.\d+)+(?![\d])")
# 조항이 든 칸입니다 — 근거 조항을 이 칸에서 찾습니다.
CLAUSE_KEYS = ("context", "documents")


def _parts(result: dict[str, Any]) -> list[tuple[str, list[str]]]:
    """→ (이름, 댄 근거 조항) — 판정 전체 또는 차이 · 문제 한 건마다."""
    if "gaps" in result:
        return [(f"차이 {g.get('item', '?')}", [g["source"]] if g.get("source") else []) for g in result.get("gaps") or []]
    if "issues" in result:
        return [(f"문제 {i.get('kind', '?')} {', '.join(i.get('policy_ids') or [])}", i.get("policy_ids") or [])
                for i in result.get("issues") or []]
    return [("판정", result.get("sources") or [])]


def _known(source: str, clauses: str) -> bool:
    docs, numbers = DOCUMENT.findall(source), CLAUSE.findall(DOCUMENT.sub("", source))
    return all(d in clauses for d in docs) and all(re.search(rf"(?<![\d.]){re.escape(n)}(?![\d])", clauses) for n in numbers)


def ground(result: dict[str, Any], built: Built) -> dict[str, Any]:
    """→ {checks: 입력에 없는 조항}"""
    clauses = "\n".join(built.inputs.get(k, "") for k in CLAUSE_KEYS)
    checks: list[str] = []
    for name, sources in _parts(result):
        missing = [s for s in sources if not _known(s, clauses)]
        if missing:
            checks.append(f"{name}: 입력에 없는 조항 {', '.join(missing)}")
    return {"checks": checks}


__all__ = ["ground"]
