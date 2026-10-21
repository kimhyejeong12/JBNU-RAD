"""수집 노드(node/sentinel_node)가 보낸 본문 → 모듈별 상태.

노드는 명령 · 설정 파일을 그대로 옮겨 오기만 하고, 무엇을 뽑을지는 여기서 정합니다.
뽑는 항목을 바꿔도 노드를 다시 깔 필요가 없고, 쌓아 둔 원문(sections)을 다시 읽으면 되기 때문입니다.
판정에 쓰는 값은 원문을 줄인 문장입니다. 설치 안 됨 · 권한이 없어 못 읽음은 서로 다른 값으로 남겨
모델이 "설정 없음"으로 잘못 읽지 않게 합니다.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from .mapper import parse_datetime
from .types import MODULE_LABELS, LoadIssue, LoadResult, ServerSnapshot

FORMAT = "sentinel-node 1"
NODE_NAME = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
MISSING = "설치 안 됨"
UNREADABLE = "확인 못함 (읽을 권한 없음 — root 로 수집해야 함)"
NONE = "설정 없음"

_FILE = re.compile(r"^==> (.+?) <==\s*$", re.M)
# 유형 · 제어 · 모듈 · 인자. 제어 칸은 [success=1 default=ignore] 처럼 대괄호 안에 공백이 들어갈 수 있습니다.
_PAM_LINE = re.compile(r"^-?(\w+)\s+(\[[^\]]*\]|\S+)\s+(\S+)\s*(.*)$")
_SSHD_KEYS = ("permitrootlogin", "passwordauthentication", "permitemptypasswords", "pubkeyauthentication",
              "kbdinteractiveauthentication", "maxauthtries", "port", "allowusers", "allowgroups", "usepam")


def _blocks(text: str) -> dict[str, str]:
    """"==> 이름 <==" 로 나뉜 묶음 → 이름 → 내용."""
    parts = _FILE.split(text)
    return {parts[i].strip(): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}


def _missing(text: str) -> bool:
    return text.strip().startswith("(없음:")


def _unreadable(text: str) -> bool:
    return any(m in text for m in ("(읽을 수 없음", "need to be root", "must be root", "problem running iptables"))


def ufw(text: str) -> dict[str, str]:
    if _missing(text):
        return {"상태": MISSING}
    if _unreadable(text):
        return {"상태": UNREADABLE}
    if re.search(r"^Status: inactive", text, re.M):
        return {"상태": "꺼짐"}
    facts = {"상태": "켜짐" if re.search(r"^Status: active", text, re.M) else text.strip().splitlines()[0]}
    if m := re.search(r"^Default: (.+)$", text, re.M):
        # "deny (incoming), allow (outgoing), disabled (routed)" → "수신 deny · 송신 allow · 라우팅 disabled"
        names = {"incoming": "수신", "outgoing": "송신", "routed": "라우팅"}
        facts["기본 정책"] = " · ".join(f"{names.get(d, d)} {v}" for v, d in re.findall(r"(\w+) \((\w+)\)", m.group(1)))
    rules, anywhere = [], []
    table = text.split("\n--", 1)[1].split("\n", 1)[1] if "\n--" in text else ""
    for line in table.splitlines():
        cols = re.split(r"\s{2,}", line.strip())
        if len(cols) < 3:
            continue
        to, action, source = cols[0], cols[1], cols[2]
        rules.append(f"{to} {action} ← {source}")
        if action.upper().startswith("ALLOW") and source.startswith("Anywhere"):
            anywhere.append(to.replace(" (v6)", ""))
    facts["규칙"] = "; ".join(rules) or "없음"
    facts["어디서나 허용"] = ", ".join(dict.fromkeys(anywhere)) or "없음"
    return facts


def sshd(text: str) -> dict[str, str]:
    if _missing(text):
        return {"상태": MISSING}
    if _unreadable(text):
        return {"상태": UNREADABLE}
    values: dict[str, str] = {}
    for line in text.splitlines():
        key, _, value = line.strip().partition(" ")
        if key.lower() in _SSHD_KEYS and value:
            # allowusers 처럼 여러 줄로 나오는 항목은 이어 붙입니다.
            values[key.lower()] = f"{values[key.lower()]} {value}" if key.lower() in values else value
    return {k: values[k] for k in _SSHD_KEYS if k in values}


def _pam_lines(blocks: dict[str, str]) -> list[tuple[str, str, str, list[str]]]:
    """pam.d 파일의 (파일, 유형, 모듈, 인자). include · substack 줄은 다른 파일을 부르는 것이라 뺍니다."""
    out = []
    for path, body in blocks.items():
        if "/pam.d/" not in path or _unreadable(body):
            continue
        for line in body.splitlines():
            m = _PAM_LINE.match(line.strip())
            if m and m.group(3).endswith(".so"):
                out.append((path, m.group(1), m.group(3).removesuffix(".so"), m.group(4).split()))
    return out


def _conf_values(body: str) -> list[str]:
    return [re.sub(r"\s*=\s*", "=", line.strip()) for line in body.splitlines() if line.strip()]


def pam(text: str) -> dict[str, str]:
    blocks = _blocks(text)
    if not blocks:
        return {"상태": "읽은 PAM 설정 파일 없음"}
    lines = _pam_lines(blocks)
    used = lambda *names: [(p, t, m, a) for p, t, m, a in lines if m in names]  # noqa: E731
    facts: dict[str, str] = {}

    lock = used("pam_faillock", "pam_tally2")
    conf = _conf_values(blocks.get("/etc/security/faillock.conf", ""))
    if lock:
        args = sorted({x for *_, a in lock for x in a if "=" in x} | set(conf))
        facts["로그인 실패 잠금"] = f"켜짐 — {lock[0][2]}" + (f" ({', '.join(args)})" if args else " (기본값)")
    else:
        facts["로그인 실패 잠금"] = NONE

    quality = used("pam_pwquality", "pam_cracklib")
    conf = _conf_values(blocks.get("/etc/security/pwquality.conf", ""))
    if quality:
        args = sorted({x for *_, a in quality for x in a if "=" in x} | set(conf))
        facts["비밀번호 복잡도"] = f"켜짐 — {quality[0][2]}" + (f" ({', '.join(args)})" if args else " (기본값)")
    else:
        facts["비밀번호 복잡도"] = NONE

    remember = sorted({x for *_, a in used("pam_unix", "pam_pwhistory") for x in a if x.startswith("remember=")})
    facts["이전 비밀번호 재사용 제한"] = ", ".join(remember) or NONE
    facts["빈 비밀번호 로그인"] = "허용 (nullok)" if any("nullok" in a for _, t, _, a in used("pam_unix") if t == "auth") else "허용 안 함"
    if any(p.endswith("/su") for p in blocks):
        wheel = [a for p, _, _, a in used("pam_wheel") if p.endswith("/su")]
        facts["su 제한"] = f"wheel 그룹만 ({' '.join(wheel[0])})".replace(" ()", "") if wheel else "제한 없음"
    unreadable = [p for p, body in blocks.items() if _unreadable(body)]
    if unreadable:
        facts["못 읽은 파일"] = ", ".join(unreadable)
    facts["읽은 파일"] = ", ".join(p for p in blocks if p not in unreadable)
    return facts


def accounts(text: str) -> dict[str, str]:
    blocks = _blocks(text)
    facts = {"UID 0 계정": ", ".join(blocks.get("uid0", "").split()) or "없음"}
    groups = []
    for line in blocks.get("groups", "").splitlines():
        name, *_, members = line.split(":") if line.count(":") >= 3 else (line, "")
        groups.append(f"{name}: {members.replace(',', ', ') or '구성원 없음'}")
    facts["관리자 그룹"] = " · ".join(groups) or "없음"
    sudoers = {p: body for p, body in blocks.items() if p.startswith("/etc/sudoers")}
    if not sudoers or all(_unreadable(b) for b in sudoers.values()) or "(읽을 수 없음: /etc/sudoers.d)" in text:
        facts["sudo 규칙"] = UNREADABLE
        return facts
    rules = [" ".join(line.split()) for body in sudoers.values() if not _unreadable(body) for line in body.splitlines()
             if line.strip() and not line.startswith(("Defaults", "@include"))]
    facts["sudo 규칙"] = "; ".join(rules) or "없음"
    facts["암호 없이 sudo"] = "; ".join(r for r in rules if "NOPASSWD" in r) or "없음"
    return facts


PARSERS = {"ufw": ufw, "sshd": sshd, "pam": pam, "accounts": accounts}


def snapshot_from_payload(payload: dict, node: str | None = None) -> ServerSnapshot:
    """노드가 보낸 본문 하나 → ServerSnapshot. 형식이 맞지 않으면 ValueError.

    node = 이 수집의 노드 이름 (수집 API 는 키로 찾은 노드, import 는 지정한 이름). 노드는 본문에 이름을 싣지 않으므로
    주지 않으면 본문의 node(예전 형식 · 연습용 파일)를 씁니다.
    """
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError(f"수집 노드 본문이 아닙니다 (format 이 {FORMAT!r} 이어야 함)")
    name = node or payload.get("node", "")
    if not NODE_NAME.match(str(name)):
        raise ValueError("어느 노드의 수집인지 모릅니다 — 노드 이름을 지정하세요")
    sections = payload.get("sections")
    if not isinstance(sections, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in sections.items()):
        raise ValueError("sections 는 모듈 이름 → 원문(문자열)이어야 합니다")
    if not payload.get("host") or not payload.get("collected_at"):
        raise ValueError("호스트 · 수집 시각이 없습니다")
    return ServerSnapshot(
        node=name, host=str(payload["host"]), ip=str(payload.get("ip", "")), collected_at=parse_datetime(str(payload["collected_at"])),
        collected_by=str(payload.get("collected_by", "")), sections=sections,
        modules={m: parse(sections[m]) for m, parse in PARSERS.items() if m in sections},
    )


def load_collected(target: Any, node: str | None = None) -> LoadResult:
    """노드가 export 한 파일(*.json) 폴더 — 망이 막힌 서버의 수집을 손으로 넣을 때 씁니다. node = 이 파일들의 노드 이름.
    폴더가 없으면 FileNotFoundError."""
    folder = Path(target)
    if not folder.is_dir():
        raise FileNotFoundError(f"수집 폴더가 없습니다: {folder}")
    result = LoadResult(source=folder.name)
    for path in sorted(folder.glob("*.json")):
        try:
            result.records.append(snapshot_from_payload(json.loads(path.read_text(encoding="utf-8")), node))
        except ValueError as exc:  # json.JSONDecodeError 도 ValueError 입니다.
            result.issues.append(LoadIssue(0, f"{path.name}: {exc}"))
    return result


def changes(before: dict[str, dict[str, str]] | None, after: dict[str, dict[str, str]]) -> list[str]:
    """지난 수집 대비 바뀐 항목 (예: "[UFW] 상태: 켜짐 → 꺼짐"). 인자는 ServerSnapshot.modules. 처음 수집이면 빈 목록."""
    if before is None:
        return []
    out = []
    for module in dict.fromkeys([*before, *after]):
        old, new = before.get(module, {}), after.get(module, {})
        for key in dict.fromkeys([*old, *new]):
            # 한쪽에만 "없음" 값이 있는 칸은 없는 칸과 같은 뜻이라 바뀐 것으로 세지 않습니다.
            if key == "읽은 파일" or old.get(key, "없음") == new.get(key, "없음"):
                continue
            out.append(f"[{MODULE_LABELS.get(module, module)}] {key}: {old.get(key, '없음')} → {new.get(key, '없음')}")
    return out


# --- 서버 질의 ------------------------------------------------------------------
# 서버 질의도 로그 질의처럼 모델이 세지 않습니다. 건수 · 등급 분포 · 바뀐 설정은 여기서 세고, 모델은 그 결과로 답만 씁니다.


def _stamp(at: str) -> str:
    # 운영자가 읽는 답이라 화면과 같은 서버 현지 시각(KST)으로 적습니다. 판정 입력(describe)은 그대로 UTC 입니다.
    if not at:
        return "없음"
    local = datetime.fromisoformat(at).astimezone()
    return f"{local:%Y-%m-%d %H:%M} {local.tzname()}"


def _in_module(item: str, module: str) -> bool:
    """모듈을 고른 질문이면 그 모듈 항목만 봅니다. 모듈 표시([UFW] 등)가 없는 판정 항목은 어느 모듈인지 몰라 남깁니다."""
    if not module:
        return True
    return item.startswith(f"[{module}]") or not item.startswith("[")


def server_digest(current: list[dict[str, Any]], history: dict[str, Any], module: str = "") -> dict[str, Any]:
    """노드별 지금 상태 · 기간 안 기록 → 서버 질의 답의 근거.

    current = 노드마다 {node, host, ip, status, modules(가장 늦은 수집), finding(마지막 판정 또는 None)},
    history = db.results.server_history, module = MODULE_LABELS 의 값 하나 또는 "" (전체).
    → {facts: 코드가 센 값, state: 노드별 지금 상태 문장, lines: 기간 안 바뀐 설정 · 판정 기록 (오래된 것부터)}
    """
    keys = {label: key for key, label in MODULE_LABELS.items()}
    state, latest_levels = [], {}
    for n in current:
        f = n.get("finding")
        level = "판정 실패" if f and f["failed"] else (f["level"] if f else "판정 없음")
        latest_levels[level] = latest_levels.get(level, 0) + 1
        lines = [f"## {n['node']} ({n['host'] or '호스트 모름'}{', ' + n['ip'] if n['ip'] else ''}) — {n['status']}, "
                 f"마지막 수집 {_stamp(n.get('collected_at', ''))}"]
        for mod, facts in (n.get("modules") or {}).items():
            if module and keys.get(module) != mod:
                continue
            lines += [f"- [{MODULE_LABELS.get(mod, mod)}] {k}: {v}" for k, v in facts.items() if k != "읽은 파일"]
        if f:
            lines.append(f"- 마지막 서버 점검 ({_stamp(f['created_at'])}): {level} — {f['summary'] or f.get('error') or ''}".rstrip())
            for g in f["gaps"]:
                if g.get("level") != "정상" and _in_module(g.get("item", ""), module):
                    lines.append(f"  - 정책과 다른 곳: {g.get('item')} — 지금 {g.get('current')} / 기준 {g.get('required')}"
                                 f" ({g.get('level')}, {g.get('source') or '근거 없음'})")
            if f.get("unjudged"):
                lines.append(f"  - 판단하지 않은 항목: {', '.join(f['unjudged'])}")
        state.append("\n".join(lines))

    per_node: dict[str, dict[str, Any]] = {n["node"]: {"수집": 0, "설정이 바뀐 수집": 0, "바뀐 설정": 0, "판정": {}} for n in current}
    events = []
    for s in history["snapshots"]:
        row = per_node.setdefault(s["node"], {"수집": 0, "설정이 바뀐 수집": 0, "바뀐 설정": 0, "판정": {}})
        row["수집"] += 1
        picked = [c for c in s["changes"] if _in_module(c, module)]
        if picked:
            row["설정이 바뀐 수집"] += 1
            row["바뀐 설정"] += len(picked)
            events += [(s["collected_at"], f"- {_stamp(s['collected_at'])} {s['node']} 설정 바뀜: {c}") for c in picked]
    for f in history["findings"]:
        level = "판정 실패" if f["failed"] else f["level"]
        row = per_node.setdefault(f["node"], {"수집": 0, "설정이 바뀐 수집": 0, "바뀐 설정": 0, "판정": {}})
        row["판정"][level] = row["판정"].get(level, 0) + 1
        gaps = [g for g in f["gaps"] if g.get("level") != "정상" and _in_module(g.get("item", ""), module)]
        events.append((f["created_at"], f"- {_stamp(f['created_at'])} {f['node']} 서버 점검: {level}, 정책과 다른 곳 {len(gaps)}"
                       + (f" ({', '.join(g.get('item', '') for g in gaps)})" if gaps else "")))
    collected = [s["collected_at"] for s in history["snapshots"]]
    facts = {
        "노드 수": len(current),
        "마지막 판정 등급별 노드 수": latest_levels,
        "기간 안 첫 수집": collected[0] if collected else None,
        "기간 안 마지막 수집": collected[-1] if collected else None,
        "노드별": per_node,
    }
    return {"facts": facts, "state": state, "lines": [line for _, line in sorted(events)]}
