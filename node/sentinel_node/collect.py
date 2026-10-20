"""모듈 상태 읽기 — 명령 출력 · 설정 파일을 그대로 옮겨 옵니다.

무엇을 뽑아 판정할지는 SentinelAI 서버(sentinelai/data/collected.py)가 정합니다. 노드는 원문만 보내므로
판정 항목을 바꿔도 노드를 다시 깔 필요가 없습니다.
없는 것("(없음: …)")과 권한이 없어 못 읽은 것("(읽을 수 없음: …)")은 다르게 남깁니다.
새 모듈은 MODULES 에 함수 하나를 더하고, 서버의 PARSERS 에도 같은 이름을 더합니다.
"""
from __future__ import annotations

import glob
import os
import pwd
import re
import shutil
import socket
import subprocess
from datetime import datetime, timezone
from typing import Callable, Dict, List

from . import FORMAT, VERSION

_COMMENT = re.compile(r"^\s*(#|$)")


def _run(*cmd: str) -> str:
    if shutil.which(cmd[0]) is None:
        return f"(없음: {cmd[0]})"
    try:
        done = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"(읽을 수 없음: {' '.join(cmd)} — {exc})"
    return (done.stdout + done.stderr).strip()


def _conf(*paths: str) -> List[str]:
    """설정 파일의 주석 · 빈 줄을 뺀 내용을 "==> 경로 <==" 묶음으로. 없는 파일은 건너뜁니다."""
    out = []
    for path in paths:
        if not os.path.exists(path):
            continue
        out.append(f"==> {path} <==")
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                out += [line.rstrip() for line in f if not _COMMENT.match(line) and not line.startswith("#include")]
        except OSError:
            out.append(f"(읽을 수 없음: {path})")
    return out


def ufw() -> str:
    return _run("ufw", "status", "verbose")


def sshd() -> str:
    if shutil.which("sshd") is None:
        return "(없음: sshd)"
    text = _run("sshd", "-T")
    # sshd -T 는 root 가 아니면 호스트 키를 못 읽어 실패합니다.
    return text if re.search(r"^permitrootlogin ", text, re.M) else "(읽을 수 없음: sshd -T)"


def pam() -> str:
    return "\n".join(_conf(
        "/etc/pam.d/common-auth", "/etc/pam.d/common-password", "/etc/pam.d/system-auth", "/etc/pam.d/password-auth",
        "/etc/pam.d/sshd", "/etc/pam.d/su", "/etc/pam.d/sudo",
        "/etc/security/faillock.conf", "/etc/security/pwquality.conf",
    ))


def accounts() -> str:
    out = ["==> uid0 <=="]
    out += [p.pw_name for p in pwd.getpwall() if p.pw_uid == 0]
    out.append("==> groups <==")
    for name in ("sudo", "wheel", "admin"):
        line = _run("getent", "group", name)
        if line and not line.startswith("("):
            out.append(line)
    out += _conf("/etc/sudoers", *sorted(glob.glob("/etc/sudoers.d/*")))
    if os.path.isdir("/etc/sudoers.d") and not os.access("/etc/sudoers.d", os.R_OK):
        out.append("(읽을 수 없음: /etc/sudoers.d)")
    return "\n".join(out)


MODULES: Dict[str, Callable[[], str]] = {"ufw": ufw, "sshd": sshd, "pam": pam, "accounts": accounts}


def _ip(server: str) -> str:
    """서버로 나가는 쪽 주소. 연결하지 않고 경로만 봅니다 (UDP)."""
    host = re.sub(r"^\w+://", "", server).split("/")[0].split(":")[0] or "8.8.8.8"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((host, 9))
            return s.getsockname()[0]
    except OSError:
        return ""


def collect(server: str, modules: List[str], interval_min: int) -> dict:
    """한 번 읽은 결과 = 서버로 보내는 본문. 노드 이름은 싣지 않습니다 (서버가 키로 찾음)."""
    return {
        "format": FORMAT,
        "agent_version": VERSION,
        "host": socket.gethostname().split(".")[0],
        "ip": _ip(server),
        "collected_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "collected_by": pwd.getpwuid(os.geteuid()).pw_name,
        "interval_min": interval_min,
        "sections": {name: MODULES[name]() for name in modules if name in MODULES},
    }
