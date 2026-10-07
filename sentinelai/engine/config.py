from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path

from .. import ROOT

CASTS = {"str": str, "int": int, "float": float}
#: pymilvus 가 python-dotenv 로 .env 를 주입하기 전의 환경변수.
BOOT_ENV = dict(os.environ)


@dataclass(frozen=True)
class Settings:
    """`.env` 또는 SENTINELAI_ 환경변수에서 읽는 설정. 코드에 기본값은 없습니다."""

    PREFIX = "SENTINELAI_"

    ollama_base_url: str
    model: str
    embedding_model: str
    temperature: float
    num_ctx: int
    num_predict: int
    keep_alive: str
    milvus_uri: str
    milvus_collection: str
    chunk_size: int
    chunk_overlap: int
    top_k: int

    @staticmethod
    def env_file() -> Path:
        return Path(os.environ.get("SENTINELAI_ENV_FILE", ROOT / ".env"))

    @classmethod
    def _from_file(cls) -> dict[str, str]:
        path = cls.env_file()
        if not path.is_file():
            return {}
        values = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("\"'")
        return values

    @classmethod
    def load(cls) -> Settings:
        from_file = cls._from_file()
        values: dict[str, object] = {}
        missing: list[str] = []
        for f in fields(cls):
            key = f"{cls.PREFIX}{f.name.upper()}"
            raw = BOOT_ENV.get(key) or from_file.get(key)
            if raw:
                values[f.name] = CASTS[f.type](raw)
            else:
                missing.append(key)
        if missing:
            raise RuntimeError(
                f"설정값이 없습니다: {', '.join(missing)}\n"
                f"`cp .env.example .env` 또는 환경변수로 지정하세요 (찾은 위치: {cls.env_file()})"
            )
        return cls(**values)

    @property
    def milvus_is_server(self) -> bool:
        return self.milvus_uri.startswith(("http://", "https://", "tcp://", "unix:"))

    @property
    def milvus_path(self) -> Path:
        path = Path(self.milvus_uri)
        return path if path.is_absolute() else ROOT / path

    @property
    def milvus_target(self) -> str:
        return self.milvus_uri if self.milvus_is_server else str(self.milvus_path)

    @property
    def llm_options(self) -> dict[str, object]:
        return {
            "base_url": self.ollama_base_url,
            "model": self.model,
            "temperature": self.temperature,
            "num_ctx": self.num_ctx,
            "num_predict": self.num_predict,
            "keep_alive": self.keep_alive,
        }
