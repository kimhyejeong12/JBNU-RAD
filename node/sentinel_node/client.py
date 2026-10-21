"""SentinelAI 서버로 보내기 — 못 보낸 수집은 쌓아 두었다가 다음 차례에 먼저 보냅니다.

노드는 이름을 보내지 않고, SentinelAI 화면에서 발급한 키만 보냅니다. 서버가 키로 어느 노드인지 찾습니다.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from pathlib import Path

from .config import Config

log = logging.getLogger("sentinel-node")
SPOOL_LIMIT = 200          # 서버가 오래 꺼져 있어도 디스크를 채우지 않게 오래된 것부터 버립니다
TIMEOUT = 20


class Rejected(Exception):
    """서버가 받지 않음 (모르는 키 · 꺼진 노드 · 형식). 다시 보내도 같으므로 쌓지 않습니다."""


def post(cfg: Config, payload: dict) -> dict:
    """한 건 보내기. 네트워크 · 서버 오류는 OSError, 받지 않으면 Rejected."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{cfg.server}/api/nodes/snapshots", data=body, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg.key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            answer = json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code >= 500:
            raise OSError(f"서버 오류 {exc.code}: {detail}") from None
        raise Rejected(f"{exc.code}: {detail}") from None
    return answer


def spool(cfg: Config, payload: dict) -> None:
    cfg.spool_dir.mkdir(parents=True, exist_ok=True)
    name = payload["collected_at"].replace(":", "") + ".json"
    (cfg.spool_dir / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    for old in sorted(cfg.spool_dir.glob("*.json"))[:-SPOOL_LIMIT]:
        old.unlink(missing_ok=True)


def flush(cfg: Config) -> int:
    """쌓아 둔 수집을 오래된 것부터 보냅니다. 네트워크가 또 끊기면 거기서 멈춥니다. → 보낸 수"""
    sent = 0
    for path in sorted(cfg.spool_dir.glob("*.json")) if cfg.spool_dir.is_dir() else []:
        try:
            post(cfg, json.loads(path.read_text(encoding="utf-8")))
        except OSError:
            break
        except (Rejected, ValueError) as exc:
            log.warning("쌓아 둔 수집 %s 을 서버가 받지 않아 버립니다: %s", path.name, exc)
        path.unlink(missing_ok=True)
        sent += 1
    return sent


def deliver(cfg: Config, payload: dict) -> bool:
    """밀린 것부터 보내고 이번 것을 보냅니다. 못 보내면 쌓아 둡니다. → 이번 것을 보냈는지"""
    flush(cfg)
    try:
        answer = post(cfg, payload)
    except OSError as exc:
        log.warning("서버에 보내지 못해 쌓아 둡니다: %s", exc)
        spool(cfg, payload)
        return False
    except Rejected as exc:
        log.error("서버가 받지 않았습니다: %s", exc)
        return False
    log.info("보냄 %s → 노드 %s (서버 저장: %s)", payload["collected_at"], answer.get("node"), answer.get("stored"))
    return True


def write_file(out_dir: Path, payload: dict) -> Path:
    """망이 막힌 서버용 — 보내지 않고 파일로 남깁니다. SentinelAI 서버에서 `python -m sentinelai import-snapshots 폴더 --node 이름` 으로 넣습니다."""
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{payload['host']}_{payload['collected_at'].replace(':', '')}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return path
