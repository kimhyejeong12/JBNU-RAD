"""입력 크기 — 판정 입력의 길이 · 줄 수 · 자르는 순서를 모두 여기서 정합니다."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# qwen3:14b 로 잰 한국어 판정 입력은 토큰당 약 1.5자라 조금 낮춰 잡습니다.
CHARS_PER_TOKEN = 1.4
# 설정이 작아도 대상 · 조항은 넣어야 해서 이보다 줄이지 않습니다.
MIN_CHARS = 4000

# 칸마다 넣는 줄 수 · 한 줄에 옮기는 글자 수입니다.
THREAT_LINES = 15
DECISION_LINES = 20
COMMENT_CHARS = 100
REVIEW_CHARS = 120

# 넘치면 작은 수의 칸부터 오래된 줄(앞)을 뺍니다. 여기 없는 칸(대상 · 조항 · 규칙)은 자르지 않습니다.
TRIM = {"requests": 0, "decisions": 0, "events": 1, "threats": 2}


@dataclass
class Section:
    """key 가 같은 칸은 차례대로 이어 붙여 한 입력이 됩니다. cut = TRIM 의 이름, empty = 비었을 때 넣을 글."""

    key: str
    lines: list[str]
    cut: str | None = None
    empty: str | None = None
    dropped: int = field(default=0, init=False)

    @property
    def trim(self) -> int | None:
        return TRIM.get(self.cut) if self.cut else None


@dataclass
class Built:
    inputs: dict[str, str]
    trimmed: dict[str, int]
    chars: int
    limit: int


def limit(settings: Any, prompt: Any) -> int:
    """num_ctx 에서 출력 몫(num_predict)과 프롬프트 글을 빼고 남는 글자 수입니다."""
    template = sum(len(getattr(m, "prompt", m).template) for m in prompt.messages if hasattr(getattr(m, "prompt", m), "template"))
    tokens = settings.num_ctx - settings.num_predict
    return max(MIN_CHARS, int(tokens * CHARS_PER_TOKEN) - template)


def _size(sections: list[Section]) -> int:
    return sum(len(line) + 1 for s in sections for line in s.lines)


def fit(sections: list[Section], budget: int) -> Built:
    """넘치면 TRIM 순서대로 앞줄부터 빼고, 뺀 칸 맨 앞에 몇 줄 뺐는지 적습니다."""
    over = _size(sections) - budget
    for s in sorted((s for s in sections if s.trim is not None), key=lambda s: s.trim):
        while over > 0 and s.lines:
            over -= len(s.lines.pop(0)) + 1
            s.dropped += 1
        if over <= 0:
            break
    trimmed: dict[str, int] = {}
    for s in sections:
        if s.dropped:
            indent = s.lines[0][: len(s.lines[0]) - len(s.lines[0].lstrip())] if s.lines else ""
            s.lines.insert(0, f"{indent}(오래된 {s.dropped}줄은 입력 한도로 뺐습니다)")
            trimmed[s.key] = trimmed.get(s.key, 0) + s.dropped
    inputs: dict[str, list[str]] = {}
    empty: dict[str, str] = {}
    for s in sections:
        inputs.setdefault(s.key, []).extend(s.lines)
        if s.empty is not None:
            empty[s.key] = s.empty
    text = {k: "\n".join(v) for k, v in inputs.items()}
    for k, v in empty.items():
        if not text[k].strip():
            text[k] = v
    return Built(text, trimmed, sum(map(len, text.values())), budget)
