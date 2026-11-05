"""로컬 시험 환경 — 진짜 DB · 벡터 DB 대신 시험 DB(sentinelai_dev) · .dev/ 를 씁니다 (모델 서버 주소 등 나머지는 .env 그대로).

    .venv/bin/python scripts/dev.py setup [--reset]          시험 계정 · 권한 목록 · 이 컴퓨터용 노드 설정 만들기 (dev_setup.py)
    .venv/bin/python scripts/dev.py web [--check-min 5]      시험 환경으로 웹 http://127.0.0.1:8001 (서버 점검 · 로그 감시 5분마다)
    .venv/bin/python scripts/dev.py test                     DB 시험 (시험 DB sentinelai_test, 시험마다 새 스키마)
    .venv/bin/python scripts/dev.py sim [-n 3] [-r 3] [-e 5] 흉내 노드가 설정을 조금씩 바꿔 가며 보냄 (dev_nodes.py)
    .venv/bin/python scripts/dev.py targets [up|down]        점검 대상 컨테이너 2대(weak · strict) — 진짜 노드가 root 로 수집해 보냄 (podman compose)
    .venv/bin/python scripts/dev.py node                     이 컴퓨터를 노드로 한 번 보내기 (root 가 아니면 SSH · sudo 는 확인 못함)

PostgreSQL 은 `docker compose up -d --wait postgres` 로 먼저 띄웁니다. sim · targets · node 는 web 이 떠 있을 때.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
PORT = os.environ.get("DEV_PORT", "8001")
DEV_URL = os.environ.get("DEV_DATABASE_URL", "postgresql://sentinelai:sentinelai-dev@127.0.0.1:5432/sentinelai_dev")
TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://sentinelai:sentinelai-dev@127.0.0.1:5432/sentinelai_test")
TARGETS = ROOT / "node" / "testenv"


def dev_env(check_min: int = 5) -> dict[str, str]:
    """.env 보다 환경변수가 먼저라, 시험 DB · 벡터 DB 위치를 환경변수로 넘깁니다."""
    return {**os.environ, "SENTINELAI_DB_PATH": DEV_URL, "SENTINELAI_RESULTS_DB_PATH": DEV_URL,
            "SENTINELAI_MILVUS_URI": ".dev/milvus.db", "SENTINELAI_MONITOR_INTERVAL_MIN": str(check_min), "DEV_PORT": PORT}


def run(cmd: list[str], env: dict[str, str] | None = None, cwd: Path = ROOT) -> int:
    return subprocess.call(cmd, env=env or dev_env(), cwd=cwd)


def targets(action: str) -> int:
    podman = os.environ.get("PODMAN", "podman")
    compose = [podman, "compose", "--env-file", "targets.env"]
    if action == "down":
        return run(compose + ["down"], cwd=TARGETS)
    env_file = TARGETS / "targets.env"
    if not env_file.exists():
        if not (ROOT / ".dev").exists():
            print("먼저 scripts/dev.py setup (또는 node/testenv/targets.env.example 을 targets.env 로 복사해 키를 넣으세요)")
            return 1
        key = lambda name: subprocess.check_output([PY, "scripts/dev_nodes.py", "key", name], env=dev_env(), cwd=ROOT, text=True).strip()  # noqa: E731
        env_file.write_text(f"SERVER=http://host.containers.internal:{PORT}\nKEY_WEAK={key('target-weak')}\n"
                            f"KEY_STRICT={key('target-strict')}\nINTERVAL=1\n")
        print("node/testenv/targets.env 를 시험 환경 키로 만들었습니다")
    server = next((line.split("=", 1)[1] for line in env_file.read_text().splitlines() if line.startswith("SERVER=")), "")
    port = server.rsplit(":", 1)[-1].strip("/")
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2)
    except OSError:
        print(f"경고: 127.0.0.1:{port} 에 SentinelAI 가 없습니다 — targets.env 의 SERVER 를 확인하세요 (키는 그 서버 화면에서 발급한 것)")
    # podman compose 는 docker-compose 를 쓰므로 사용자 podman 소켓이 떠 있어야 합니다.
    subprocess.call(["systemctl", "--user", "start", "podman.socket"], stderr=subprocess.DEVNULL)
    code = run(compose + ["up", "-d", "--build"], cwd=TARGETS)
    print(f"기록: cd node/testenv && {podman} compose --env-file targets.env logs -f")
    return code


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("setup").add_argument("--reset", action="store_true", help="있던 시험 환경을 지우고 새로")
    sub.add_parser("web").add_argument("--check-min", type=int, default=5, help="서버 점검 · 로그 감시 간격 (분)")
    sub.add_parser("test")
    s = sub.add_parser("sim")
    s.add_argument("-n", "--nodes", default="3")
    s.add_argument("-r", "--rounds", default="3")
    s.add_argument("-e", "--every", default="5")
    sub.add_parser("targets").add_argument("action", nargs="?", choices=["up", "down"], default="up")
    sub.add_parser("node")
    args = p.parse_args()

    if args.command == "setup":
        return run([PY, "scripts/dev_setup.py"], {**dev_env(), **({"RESET": "1"} if args.reset else {})})
    if args.command == "web":
        if not (ROOT / ".dev").exists():
            print("먼저 scripts/dev.py setup")
            return 1
        return run([PY, "-m", "uvicorn", "sentinelai.web.main:app", "--reload", "--port", PORT], dev_env(args.check_min))
    if args.command == "test":
        return run([PY, "-m", "pytest", "tests"], {**os.environ, "SENTINELAI_TEST_DATABASE_URL": TEST_URL})
    if args.command == "sim":
        return run([PY, "scripts/dev_nodes.py", "sim", "-n", args.nodes, "-r", args.rounds, "-e", args.every])
    if args.command == "targets":
        return targets(args.action)
    return run(["python3", "-m", "sentinel_node", "once", "-c", "../.dev/node.conf"], cwd=ROOT / "node")


if __name__ == "__main__":
    sys.exit(main())
