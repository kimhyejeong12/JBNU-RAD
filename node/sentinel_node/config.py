"""노드 설정 — /etc/sentinel-node/node.conf (INI)."""
from __future__ import annotations

import configparser
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from .collect import MODULES

DEFAULT_PATH = "/etc/sentinel-node/node.conf"


@dataclass
class Config:
    server: str
    key: str
    interval_min: int = 30
    modules: List[str] = field(default_factory=lambda: list(MODULES))
    state_dir: Path = Path("/var/lib/sentinel-node")

    @property
    def spool_dir(self) -> Path:
        return self.state_dir / "spool"


def load(path: str = DEFAULT_PATH) -> Config:
    parser = configparser.ConfigParser()
    if not parser.read(path, encoding="utf-8"):
        raise SystemExit(f"설정 파일이 없습니다: {path} (install.sh 가 만듭니다)")
    s = parser["node"] if parser.has_section("node") else {}
    missing = [k for k in ("server", "key") if not s.get(k)]
    if missing:
        raise SystemExit(f"{path}: [node] 에 {', '.join(missing)} 가 없습니다 (key 는 SentinelAI 정책 관리 → [노드]에서 발급)")
    modules = [m.strip() for m in s.get("modules", ",".join(MODULES)).split(",") if m.strip()]
    unknown = [m for m in modules if m not in MODULES]
    if unknown:
        raise SystemExit(f"모르는 모듈: {', '.join(unknown)} (가능: {', '.join(MODULES)})")
    return Config(
        server=s["server"].rstrip("/"), key=s["key"],
        interval_min=max(1, int(s.get("interval_min", "30"))), modules=modules,
        state_dir=Path(s.get("state_dir", "/var/lib/sentinel-node")),
    )
