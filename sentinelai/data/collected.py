"""수집 노드(node/sentinel_node)가 보낸 본문 → 모듈별 상태.

노드는 명령 · 설정 파일을 그대로 옮겨 오기만 하고, 무엇을 뽑을지는 여기서 정합니다.
뽑는 항목을 바꿔도 노드를 다시 깔 필요가 없고, 쌓아 둔 원문(sections)을 다시 읽으면 되기 때문입니다.
판정에 쓰는 값은 원문을 줄인 문장입니다. 설치 안 됨 · 권한이 없어 못 읽음은 서로 다른 값으로 남겨
모델이 "설정 없음"으로 잘못 읽지 않게 합니다.
"""
from __future__ import annotations

import json
import re
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
    return "(읽을 수 없음" in text or "need to be root" in text


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

    node 를 주면(수집 API 의 주소에 든 이름) 본문의 node 와 같아야 합니다.
    """
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError(f"수집 노드 본문이 아닙니다 (format 이 {FORMAT!r} 이어야 함)")
    name = node or payload.get("node", "")
    if not NODE_NAME.match(str(name)) or payload.get("node") != name:
        raise ValueError("노드 이름이 없거나 주소의 이름과 다릅니다")
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


def load_collected(target: Any) -> LoadResult:
    """노드가 export 한 파일(*.json) 폴더 — 망이 막힌 서버의 수집을 손으로 넣을 때 씁니다. 폴더가 없으면 FileNotFoundError."""
    folder = Path(target)
    if not folder.is_dir():
        raise FileNotFoundError(f"수집 폴더가 없습니다: {folder}")
    result = LoadResult(source=folder.name)
    for path in sorted(folder.glob("*.json")):
        try:
            result.records.append(snapshot_from_payload(json.loads(path.read_text(encoding="utf-8"))))
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
            if key == "읽은 파일" or old.get(key) == new.get(key):
                continue
            out.append(f"[{MODULE_LABELS.get(module, module)}] {key}: {old.get(key, '없음')} → {new.get(key, '없음')}")
    return out
