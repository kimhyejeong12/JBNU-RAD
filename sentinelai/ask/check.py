"""답 검증 — 답의 숫자 · 인용한 문서가 도구 결과나 질문에 있는지 코드로 봅니다 (어긋난 것만 돌려줌)."""
from __future__ import annotations

import re

NUMBER = re.compile(r"\d+(?:\.\d+)?")
DOCUMENT = re.compile(r"[\w가-힣.\-]+\.(?:md|txt)")


def _numbers(text: str) -> set[str]:
    # 09 와 9 를 같게 봅니다.
    return {n.lstrip("0") or "0" for n in NUMBER.findall(text)}


def check(answer: str, question: str, texts: list[str]) -> list[str]:
    seen = "\n".join(texts)
    known = _numbers(seen) | _numbers(question)
    out = []
    missing = sorted(_numbers(answer) - known, key=lambda n: (len(n), n))
    if missing:
        out.append(f"도구 결과에 없는 숫자: {', '.join(missing)}")
    docs = [d for d in dict.fromkeys(DOCUMENT.findall(answer)) if d not in seen]
    if docs:
        out.append(f"찾지 않은 문서를 인용: {', '.join(docs)}")
    return out


__all__ = ["check"]
