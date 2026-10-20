"""sentinel-node — `python3 -m sentinel_node <명령>`

  run      데몬: 설정한 간격마다 읽어 보냄 (systemd 가 부름)
  once     한 번 읽어 보냄
  show     한 번 읽어 화면에 출력만 (보내지 않음 — 무엇을 보내는지 확인)
  export   한 번 읽어 파일로 남김 (망이 막힌 서버 — SentinelAI 서버에서 import-snapshots)
"""
from __future__ import annotations

import argparse
import json
import logging
import random
import signal
import sys
import threading
from pathlib import Path

from . import VERSION, client, collect, config


def _payload(cfg: config.Config) -> dict:
    return collect.collect(cfg.server, cfg.modules, cfg.interval_min)


def run(cfg: config.Config) -> int:
    stop = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    logging.getLogger("sentinel-node").info("시작: → %s, %d분마다 (%s)", cfg.server, cfg.interval_min, ", ".join(cfg.modules))
    while not stop.is_set():
        try:
            client.deliver(cfg, _payload(cfg))
        except Exception:  # 한 번 실패해도 데몬은 계속 돕니다.
            logging.getLogger("sentinel-node").exception("수집 · 전송 중 오류")
        # 노드가 많으면 같은 시각에 몰리지 않게 조금씩 흩뜨립니다.
        stop.wait(cfg.interval_min * 60 + random.uniform(0, min(60, cfg.interval_min * 6)))
    return 0


def main(argv: list | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sentinel-node", description=f"SentinelAI 수집 노드 {VERSION}")
    parser.add_argument("command", choices=["run", "once", "show", "export"])
    parser.add_argument("-c", "--config", default=config.DEFAULT_PATH, help=f"설정 파일 (기본 {config.DEFAULT_PATH})")
    parser.add_argument("-o", "--out", default=".", help="export 결과 폴더")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stderr)
    cfg = config.load(args.config)
    if args.command == "run":
        return run(cfg)
    payload = _payload(cfg)
    if args.command == "show":
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 0
    if args.command == "export":
        print(client.write_file(Path(args.out), payload))
        return 0
    return 0 if client.deliver(cfg, payload) else 1


if __name__ == "__main__":
    sys.exit(main())
