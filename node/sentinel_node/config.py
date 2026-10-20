"""노드 설정 — /etc/sentinel-node/node.conf (INI)."""
from __future__ import annotations

import configparser
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from .collect import MODULES

DEFAULT_PATH = "/etc/sentinel-node/node.conf"
NAME = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@dataclass
class Config:
    name: str
    server: str
    token: str
    interval_min: int = 30
    modules: List[str] = field(default_factory=lambda: list(MODULES))
    state_dir: Path = Path("/var/lib/sentinel-node")

    @property
    def key_file(self) -> Path:
        return self.state_dir / "node.key"

    @property
    def spool_dir(self) -> Path:
        return self.state_dir / "spool"


def load(path: str = DEFAULT_PATH) -> Config:
    parser = configparser.ConfigParser()
    if not parser.read(path, encoding="utf-8"):
        raise SystemExit(f"설정 파일이 없습니다: {path} (install.sh 가 만듭니다)")
    s = parser["node"] if parser.has_section("node") else {}
    missing = [k for k in ("name", "server", "token") if not s.get(k)]
    if missing:
        raise SystemExit(f"{path}: [node] 에 {', '.join(missing)} 가 없습니다")
    if not NAME.match(s["name"]):
        raise SystemExit(f"노드 이름은 영문 · 숫자 · . _ - 1~64자입니다: {s['name']!r}")
    modules = [m.strip() for m in s.get("modules", ",".join(MODULES)).split(",") if m.strip()]
    unknown = [m for m in modules if m not in MODULES]
    if unknown:
        raise SystemExit(f"모르는 모듈: {', '.join(unknown)} (가능: {', '.join(MODULES)})")
    return Config(
        name=s["name"], server=s["server"].rstrip("/"), token=s["token"],
        interval_min=max(1, int(s.get("interval_min", "30"))), modules=modules,
        state_dir=Path(s.get("state_dir", "/var/lib/sentinel-node")),
    )
