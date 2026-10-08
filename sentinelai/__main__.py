import os

# Milvus Lite 의 gRPC 경고를 숨깁니다. pymilvus 를 가져오기 전에 정해야 합니다.
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from .cli import Cli  # noqa: E402

raise SystemExit(Cli.run())
