"""알림 카드 모양 — 같은 알림(Alert)을 글 · Slack 블록 · Teams 적응형 카드 · 메일 HTML 로 씁니다 (보내기는 notify.py)."""
from __future__ import annotations

import html
from dataclasses import dataclass
from datetime import datetime, timezone

#: 색은 "지금 봐야 하는가" 하나의 뜻 — 위험 · 주의만 색, 나머지(결재 대기 · 기록 · 결과 메일)는 회색. 종류는 배지 글자로 구분합니다.
#: (왼쪽 줄 색, 배지 · 이름표 글자색, 연한 바탕, Teams 상자 스타일, Teams 글자색)
TONES = {
    "risk": ("#EA002C", "#EA002C", "#FDECEF", "attention", "attention"),
    "warn": ("#FF7A00", "#E06A00", "#FFF3E6", "warning", "warning"),
    "plain": ("#C4C4C9", "#55555C", "#F3F3F4", "emphasis", "default"),
}
#: 목록은 여기까지만 보이고 나머지는 "외 N건" — 길면 핵심이 묻힙니다.
MAX_ITEMS = 5


@dataclass(frozen=True)
class Alert:
    """알림 하나 — 모든 알림이 같은 순서로 읽힙니다: 윗줄(badge · ref) → 제목 → 한 문장 상자(summary) → 2단 항목(facts) → 목록(items) → 닫는 줄(todo) → 끝 글(note)."""

    title: str
    tone: str = "plain"
    badge: str = ""                             # 윗줄 등급 배지 — 위험 · 주의 · 결재 대기 · 기록
    ref: str = ""                               # 윗줄 번호 — 판정 번호 · 신청 번호
    summary: tuple[str, str] | None = None      # (이름표, 한 문장) — AI 요약 · 반려 의견
    facts: tuple[tuple[str, str], ...] = ()     # 2단 항목 — 꼭 필요한 것만
    items: tuple[str, ...] = ()
    todo: str = ""                              # 어디서 무엇을
    note: str = ""                              # 작은 끝 글 (메일 안내)
    at: str = ""                                # 발생 시각(ISO) — 보는 사람 시간대로 보이게 채널 기능을 씀

    @property
    def headline(self) -> str:
        """휴대폰 알림 · 채널 미리보기에 이 줄만 보이므로 여기서 핵심이 끝나야 합니다."""
        return self.title

    @property
    def top(self) -> str:
        return " · ".join(x for x in (self.badge, self.ref) if x)

    @property
    def shown(self) -> tuple[str, ...]:
        rest = len(self.items) - MAX_ITEMS
        return self.items if rest <= 0 else (*self.items[:MAX_ITEMS], f"외 {rest}건")


def alert_text(a: Alert) -> str:
    """카드를 못 그리는 곳(알림 미리보기 · 메일의 글 부분 · 로그)에 쓰는 글."""
    lines = [a.headline]
    if a.top:
        lines.append(a.top)
    if a.summary:
        lines.append(f"{a.summary[0]}: {a.summary[1]}")
    lines += [f"{k}: {v}" for k, v in a.facts]
    lines += [f"- {item}" for item in a.shown]
    lines += [x for x in (a.todo, a.note) if x]
    return "\n".join(lines)


def _utc(iso: str) -> datetime | None:
    try:
        at = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def _pairs(rows: list) -> list[list]:
    """2단으로 놓게 둘씩 묶음."""
    return [rows[i:i + 2] for i in range(0, len(rows), 2)]


# --- Slack ---

def _s(text: str) -> str:
    """Slack 글 이스케이프 — 권한 · 문서 이름에 <!channel> 이 있어도 호출되지 않게."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _section(text: str) -> dict:
    return {"type": "section", "text": {"type": "mrkdwn", "text": text}}


def _context(text: str) -> dict:
    return {"type": "context", "elements": [{"type": "mrkdwn", "text": text}]}


def slack_payload(a: Alert) -> dict:
    """Incoming Webhook 본문 — 왼쪽 색 줄(attachment) 안에 윗줄 · 제목 · 한 문장 · 2단 항목 · 목록 · 닫는 줄."""
    blocks = []
    if a.top:
        blocks.append(_context(" · ".join(x for x in (f"*{_s(a.badge)}*" if a.badge else "", _s(a.ref)) if x)))
    blocks.append(_section(f"*{_s(a.headline)}*"))
    if a.summary:
        # 인용 줄(>)이 시안의 연한 상자 자리
        quoted = "\n".join(f"> {line}" for line in _s(a.summary[1]).splitlines())
        blocks.append(_section(f"*{_s(a.summary[0])}*\n{quoted}"))
    fields = [f"*{_s(k)}*\n{_s(v)}" for k, v in a.facts]
    at = _utc(a.at) if a.at else None
    if at:
        # 보는 사람의 시간대로 바꿔 보임 — 못 바꾸는 곳은 | 뒤 글
        fields.append(f"*발생 시각*\n<!date^{int(at.timestamp())}^{{date_num}} {{time}}|{at:%Y-%m-%d %H:%M} UTC>")
    if fields:
        blocks.append({"type": "section", "fields": [{"type": "mrkdwn", "text": f} for f in fields]})
    if a.items:
        blocks.append(_section("\n".join(f"• {_s(item)}" for item in a.shown)))
    blocks += [_context(_s(x)) for x in (a.todo, a.note) if x]
    # text 는 알림 미리보기에 뜨는 글 — 여기도 Slack 글로 읽히므로 이스케이프함
    return {"text": _s(alert_text(a)), "attachments": [{"color": TONES[a.tone][0], "blocks": blocks}]}


# --- Teams ---

def _text(text: str, **more: object) -> dict:
    return {"type": "TextBlock", "text": text, "wrap": True, **more}


def _pair(label: str, value: str) -> dict:
    return {"type": "Column", "width": "stretch",
            "items": [_text(label, isSubtle=True, size="Small", spacing="None"), _text(value, weight="Bolder", spacing="None")]}


def teams_payload(a: Alert) -> dict:
    """워크플로 웹훅 · 예전 수신 웹훅이 함께 받는 적응형 카드 — 왼쪽 색 줄을 못 그려 배지 글자색과 한 문장 상자 바탕으로 급한 정도를 보입니다."""
    _, _, _, box, ink = TONES[a.tone]
    body: list[dict] = []
    if a.top:
        cols = [{"type": "Column", "width": "auto", "items": [_text(a.badge, weight="Bolder", size="Small", color=ink)]}] if a.badge else []
        if a.ref:
            cols.append({"type": "Column", "width": "stretch", "items": [_text(a.ref, isSubtle=True, size="Small")]})
        body.append({"type": "ColumnSet", "columns": cols})
    body.append(_text(a.headline, weight="Bolder", size="Medium", spacing="Small"))
    if a.summary:
        body.append({"type": "Container", "style": box,
                     "items": [_text(a.summary[0], weight="Bolder", size="Small"), _text(a.summary[1], spacing="Small")]})
    cells = [_pair(k, v) for k, v in a.facts]
    at = _utc(a.at) if a.at else None
    if at:
        stamp = f"{at:%Y-%m-%dT%H:%M:%SZ}"
        cells.append(_pair("발생 시각", f"{{{{DATE({stamp}, COMPACT)}}}} {{{{TIME({stamp})}}}}"))
    body += [{"type": "ColumnSet", "columns": row} for row in _pairs(cells)]
    if a.items:
        body.append({"type": "Container", "items": [_text(f"- {item}", spacing="None") for item in a.shown]})
    body += [_text(x, isSubtle=True, size="Small", separator=(n == 0)) for n, x in enumerate(x for x in (a.todo, a.note) if x)]
    card = {"$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard", "version": "1.4", "body": body}
    return {"type": "message", "attachments": [{"contentType": "application/vnd.microsoft.card.adaptive", "content": card}]}


# --- 메일 ---

def _h(text: str) -> str:
    return html.escape(text).replace("\n", "<br>")


_FONT = "font-family:-apple-system,'Segoe UI','Malgun Gothic','Apple SD Gothic Neo',sans-serif"
_LABEL = "font-size:12px;color:#6b6b72;padding:0 0 2px"
_PAD = "padding:0 22px"


def mail_html(a: Alert) -> str:
    """메일 본문 — 표로 짜고 스타일은 인라인만 (외부 이미지 · 폰트 · 주소 없음)."""
    bar, color, tint, _, _ = TONES[a.tone]
    rows = []
    if a.top:
        badge = (f'<span style="display:inline-block;background:{tint};color:{color};font-size:12px;font-weight:700;'
                 f'padding:2px 8px;border-radius:4px">{_h(a.badge)}</span>') if a.badge else ""
        ref = f'<span style="font-size:13px;color:#6b6b72;padding-left:8px">{_h(a.ref)}</span>' if a.ref else ""
        rows.append(f'<tr><td style="padding:18px 22px 0">{badge}{ref}</td></tr>')
    rows.append(f'<tr><td style="padding:8px 22px 0;font-size:18px;font-weight:700;line-height:1.4">{_h(a.headline)}</td></tr>')
    if a.summary:
        rows.append(f'<tr><td style="padding:14px 0 0"><div style="background:{tint};padding:12px 22px">'
                    f'<div style="font-size:13px;font-weight:700;color:{color};padding:0 0 4px">{_h(a.summary[0])}</div>'
                    f'<div style="font-size:15px;line-height:1.55">{_h(a.summary[1])}</div></div></td></tr>')
    for pair in _pairs(list(a.facts)):
        cells = "".join(f'<td width="50%" style="vertical-align:top;padding:0 12px 0 0"><div style="{_LABEL}">{_h(k)}</div>'
                        f'<div style="font-size:15px;font-weight:700;line-height:1.4">{_h(v)}</div></td>' for k, v in pair)
        rows.append(f'<tr><td style="{_PAD};padding-top:14px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>{cells}</tr></table></td></tr>')
    if a.items:
        items = "".join(f'<div style="font-size:14px;line-height:1.7">· {_h(item)}</div>' for item in a.shown)
        rows.append(f'<tr><td style="{_PAD};padding-top:12px">{items}</td></tr>')
    tail = "".join(f'<div style="font-size:13px;color:#6b6b72;line-height:1.6">{_h(x)}</div>' for x in (a.todo, a.note) if x)
    rows.append(f'<tr><td style="padding:16px 22px 18px">{tail}</td></tr>')
    return (f'<div style="background:#f4f4f5;padding:24px 12px;{_FONT};color:#1c1c1f">'
            '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
            f'style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e3e6;border-left:4px solid {bar}">'
            f'{"".join(rows)}</table></div>')
