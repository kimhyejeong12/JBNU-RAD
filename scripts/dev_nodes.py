"""노드 수집 시험 — 시험 환경(.dev/)의 노드 키 꺼내기 · 노드 흉내.

    python scripts/dev_nodes.py key 이름            노드 키 (없으면 등록해 발급) — make dev-targets 가 컨테이너에 넣습니다
    python scripts/dev_nodes.py sim [-n 3] [-r 3] [-e 5]   흉내 노드 n 대가 e 초마다 r 번 보냅니다 (make dev-sim)

흉내 노드는 잠근 Ubuntu 서버(target-strict 컨테이너와 비슷한 BASE)의 원문에서 시작해, 차례마다 설정을 조금씩 바꿔(UFW 끄기 ·
root 로그인 열기 · NOPASSWD 더하기 · 실패 잠금 빼기 등) 진짜 노드와 같은 주소로 보냅니다. 서버의 받기 · 바뀐 것 세기 · 주기 점검 · 화면을
진짜 서버 없이 시험합니다. 진짜 수집은 make dev-targets (컨테이너 안에서 노드가 root 로 읽음).
위치는 Makefile 의 DEV_ENV 를 따릅니다 (진짜 DB 를 건드리지 않음).
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from sentinelai.db import User, nodes, open_main_db  # noqa: E402
from sentinelai.engine import Settings  # noqa: E402

# 흉내 노드의 첫 상태 — 노드가 보내는 원문 그대로의 모양 (ufw status verbose · sshd -T 일부 · pam.d · sudoers).
BASE = {
    "ufw": "Status: active\nLogging: on (low)\nDefault: deny (incoming), allow (outgoing), deny (routed)\nNew profiles: skip\n\n"
           "To                         Action      From\n--                         ------      ----\n"
           "22/tcp                     ALLOW IN    10.0.0.0/8",
    "sshd": "port 22\nusepam yes\nmaxauthtries 3\npermitrootlogin no\npubkeyauthentication yes\npasswordauthentication no\n"
            "kbdinteractiveauthentication no\npermitemptypasswords no",
    "pam": "==> /etc/pam.d/common-auth <==\nauth required pam_faillock.so preauth deny=5 unlock_time=900\n"
           "auth [success=1 default=ignore] pam_unix.so\nauth requisite pam_deny.so\n"
           "==> /etc/pam.d/common-password <==\npassword requisite pam_pwquality.so retry=3\n"
           "password [success=1 default=ignore] pam_unix.so obscure use_authtok yescrypt remember=5\n"
           "==> /etc/pam.d/su <==\nauth required pam_wheel.so\n==> /etc/security/pwquality.conf <==\nminlen = 12",
    "accounts": "==> uid0 <==\nroot\n==> groups <==\nsudo:x:27:ops\n==> /etc/sudoers <==\nroot ALL=(ALL:ALL) ALL\n%sudo ALL=(ALL:ALL) ALL",
}

# 차례마다 하나씩 골라 원문에 적용합니다. (이름, 바꾸기) — 바뀌면 서버의 "직전 수집과 달라진 설정"에 잡힙니다.
DRIFTS = [
    ("UFW 끄기", lambda s: {**s, "ufw": "Status: inactive"}),
    ("root 로그인 열기", lambda s: {**s, "sshd": re.sub(r"^permitrootlogin .*$", "permitrootlogin yes", s["sshd"], flags=re.M)}),
    ("비밀번호 로그인 열기", lambda s: {**s, "sshd": re.sub(r"^passwordauthentication .*$", "passwordauthentication yes", s["sshd"], flags=re.M)}),
    ("NOPASSWD 더하기", lambda s: {**s, "accounts": s["accounts"] + "\n==> /etc/sudoers.d/temp <==\ntemp ALL=(ALL) NOPASSWD: ALL"}),
    ("실패 잠금 빼기", lambda s: {**s, "pam": "\n".join(l for l in s["pam"].splitlines() if "pam_faillock" not in l)}),
]


def node_key(name: str) -> str:
    """시험 환경의 노드 키. 없으면 등록, 해시만 남은 예전 키면 다시 발급합니다."""
    db = open_main_db(Settings.load().db_path)
    with db.connection() as conn:
        root = User.of(conn.execute("SELECT * FROM users WHERE is_root = 1").fetchone())
    if not any(n["name"] == name for n in nodes.list_nodes(db)):
        return nodes.create(db, root, name)[1]
    return nodes.key_of(db, root, name) or nodes.reissue_key(db, root, name)[1]


def _send(server: str, key: str, payload: dict) -> str:
    req = urllib.request.Request(f"{server}/api/nodes/snapshots", data=json.dumps(payload, ensure_ascii=False).encode(),
                                 method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            answer = json.loads(res.read())
            return f"저장 {answer['stored']}"
    except urllib.error.HTTPError as exc:
        return f"거부 {exc.code}: {exc.read().decode()[:120]}"
    except OSError as exc:
        return f"보내지 못함: {exc} (make dev 가 떠 있나요?)"


def simulate(count: int, rounds: int, every: float, server: str, seed: int) -> int:
    rng = random.Random(seed)
    sims = []
    for i in range(count):
        name = f"sim-{i + 1:02d}"
        sims.append({"name": name, "key": node_key(name), "host": name, "sections": dict(BASE)})
    for r in range(1, rounds + 1):
        for sim in sims:
            drift = ""
            # 첫 차례는 바탕 그대로 보내고, 그 뒤로는 반쯤 확률로 설정 하나를 바꿉니다.
            if r > 1 and rng.random() < 0.5:
                drift, change = rng.choice(DRIFTS)
                sim["sections"] = change(sim["sections"])
            payload = {"format": "sentinel-node 1", "agent_version": "sim", "host": sim["host"], "ip": "",
                       "collected_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "collected_by": "root",
                       "interval_min": max(1, round(every / 60)), "sections": sim["sections"]}
            print(f"[{r}/{rounds}] {sim['name']:7s} {drift or '그대로':10s} → {_send(server, sim['key'], payload)}")
        if r < rounds:
            time.sleep(every)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    k = sub.add_parser("key", help="노드 키 (없으면 등록해 발급)")
    k.add_argument("name")
    s = sub.add_parser("sim", help="흉내 노드로 보내기")
    s.add_argument("-n", "--nodes", type=int, default=3, help="흉내 노드 수 (기본 3)")
    s.add_argument("-r", "--rounds", type=int, default=3, help="보내는 차례 수 (기본 3)")
    s.add_argument("-e", "--every", type=float, default=5, help="차례 사이 초 (기본 5)")
    s.add_argument("--seed", type=int, default=1, help="설정을 바꾸는 순서 (같으면 같게 흔들림)")
    args = p.parse_args()
    if args.command == "key":
        print(node_key(args.name))
        return 0
    return simulate(args.nodes, args.rounds, args.every, f"http://127.0.0.1:{os.environ.get('DEV_PORT', '8001')}", args.seed)


if __name__ == "__main__":
    sys.exit(main())
