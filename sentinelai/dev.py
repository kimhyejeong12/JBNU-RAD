"""로컬 시험 환경 — 진짜 DB · 벡터 DB 대신 시험 DB(sentinelai_dev) · .dev/ 를 씁니다."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from . import ROOT

DEV = ROOT / ".dev"
# 시험 환경에 넣는 예시 기준 문서입니다. 운영 웹은 읽지 않습니다.
EXAMPLES = ROOT / "data" / "example-regulations"
PORT = os.environ.get("DEV_PORT", "8001")
DEV_URL = os.environ.get("DEV_DATABASE_URL", "postgresql://sentinelai:sentinelai-dev@127.0.0.1:5432/sentinelai_dev")
TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://sentinelai:sentinelai-dev@127.0.0.1:5432/sentinelai_test")
TARGETS = ROOT / "node" / "testenv"
PASSWORD = "dev-pass-1234"
# 합성 로그의 사용자 이름과 겹치지 않게 골랐습니다.
ACCOUNTS = [("dev-op", "양현성", "manager"), ("dev-user", "김혜정", "user")]
# 기준 문서의 조항(3.2 · 3.3 · 4.3 · 6.2)에 걸리게 골랐습니다.
CATALOG = [
    ("HR_MASTER_READ", "인사정보 조회", "인사 시스템", "인사정보", "HR_MASTER 테이블 읽기"),
    ("HR_SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보", "HR_SALARY 테이블 읽기"),
    ("HR_SALARY_WRITE", "급여 테이블 수정", "인사 시스템", "급여정보", "HR_SALARY 테이블 쓰기"),
    ("PROD_DB_ADMIN", "운영 DB 관리자", "운영 DB", "관리자", "운영 DB 스키마 변경 · 계정 관리"),
    ("PAM_SERVER_ADMIN", "PAM 경유 서버 관리자", "PAM", "관리자", "PAM 을 거쳐 운영 서버에 관리자로 접속"),
    ("FW_POLICY_CHANGE", "방화벽 정책 변경", "방화벽", "관리자", "방화벽 규칙 추가 · 수정 · 삭제"),
    ("CRM_READ", "CRM 조회", "CRM", "고객정보", "고객 · 계약 정보 읽기"),
]


# 시험 환경도 compose 의 Milvus 를 쓰고, 컬렉션만 진짜와 나눕니다.
DEV_MILVUS = "http://127.0.0.1:19530"


def dev_env(check_min: int = 5) -> dict[str, str]:
    """.env 보다 환경변수가 먼저라, 시험 DB · 벡터 DB 위치를 환경변수로 넘깁니다."""
    return {**os.environ, "GRPC_VERBOSITY": "NONE", "SENTINELAI_DB_PATH": DEV_URL, "SENTINELAI_RESULTS_DB_PATH": DEV_URL,
            "SENTINELAI_MILVUS_URI": DEV_MILVUS, "SENTINELAI_MILVUS_COLLECTION": "sentinelai_dev",
            "SENTINELAI_MONITOR_INTERVAL_MIN": str(check_min)}


def _use_dev() -> None:
    """pymilvus 가 .env 를 읽으므로 sentinelai.engine · db 를 가져오기 전에 불러야 합니다."""
    os.environ.update(dev_env())


def _reset_db(url: str, schema: str) -> None:
    """진짜 DB 를 지우지 않게 이름에 dev 가 든 DB 만 지웁니다."""
    import psycopg
    from psycopg.conninfo import conninfo_to_dict

    name = conninfo_to_dict(url).get("dbname", "")
    if "dev" not in name:
        raise SystemExit(f"시험 DB 가 아닙니다 ({name}) — DEV_DATABASE_URL 을 확인하세요")
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")


def add_regulations(engine, folder: Path) -> list[str]:
    """폴더의 .md · .txt 를 권한 DB 기준 문서로 넣습니다 — 같은 이름은 덮어쓰지 않습니다. → 넣은 이름"""
    from .db import regulations

    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in (".md", ".txt"))
    return [f.name for f in files if regulations.create(engine.main_db, None, f.name, f.read_text(encoding="utf-8"))]


def setup(reset: bool) -> int:
    _use_dev()
    from .db import User, auth, catalog
    from .engine import Engine, Settings

    if DEV.exists():
        if not reset:
            print(f"{DEV} 가 이미 있습니다. 다시 만들려면: python -m sentinelai.dev setup --reset")
            return 1
        shutil.rmtree(DEV)
    DEV.mkdir()
    settings = Settings.load()
    _reset_db(settings.db_path, "main")
    _reset_db(settings.results_db_path, "results")
    engine = Engine()
    db = engine.main_db

    root = auth.create_root(db, "dev-root", PASSWORD, "서준원", "보안팀")
    for login, name, role in ACCOUNTS:
        auth.create_user(db, root, login, PASSWORD, name, "보안팀", role)
    # 시험 계정은 첫 로그인 비밀번호 변경을 건너뜁니다.
    with db.transaction() as conn:
        conn.execute("UPDATE users SET must_change_password = 0")
    with db.connection() as conn:
        root = User.of(conn.execute("SELECT * FROM users WHERE is_root = 1").fetchone())
    for item in CATALOG:
        catalog.create(db, root, *item)

    added = add_regulations(engine, EXAMPLES)
    try:
        indexed = f"{', '.join(added)} — {engine.index()}"
    except Exception as exc:  # 모델 서버가 꺼져 있어도 계정으로 화면은 볼 수 있습니다. 웹이 뜰 때 적재합니다.
        indexed = f"{', '.join(added)} 넣음, 적재는 건너뜀 ({type(exc).__name__}: {exc})"
    finally:
        engine.documents.close()

    print(f"""시험 환경을 만들었습니다 → {DEV}
  계정 (비밀번호 {PASSWORD}): dev-root (보안 총책임자 · 루트) · dev-op (보안 운영자) · dev-user (일반 사용자)
  권한 목록 {len(CATALOG)}건 (일반 사용자가 신청서에서 고름)
  기준 문서: {indexed}

  python -m sentinelai.dev web       웹 http://127.0.0.1:{PORT}
  python -m sentinelai.dev targets   점검 대상 컨테이너로 노드 수집 넣기 (web 이 떠 있을 때)""")
    return 0


def _node_key(name: str) -> str:
    """없으면 등록하고, 해시만 남은 예전 키면 다시 발급합니다."""
    _use_dev()
    from .db import User, nodes, open_main_db
    from .engine import Settings

    db = open_main_db(Settings.load().db_path)
    with db.connection() as conn:
        root = User.of(conn.execute("SELECT * FROM users WHERE is_root = 1").fetchone())
    if not any(n["name"] == name for n in nodes.list_nodes(db)):
        return nodes.create(db, root, name)[1]
    return nodes.key_of(db, root, name) or nodes.reissue_key(db, root, name)[1]


def targets(action: str) -> int:
    podman = os.environ.get("PODMAN", "podman")
    compose = [podman, "compose", "--env-file", "targets.env"]
    if action == "down":
        return subprocess.call(compose + ["down"], cwd=TARGETS)
    env_file = TARGETS / "targets.env"
    if not env_file.exists():
        if not DEV.exists():
            print("먼저 python -m sentinelai.dev setup (또는 node/testenv/targets.env.example 을 targets.env 로 복사해 키를 넣으세요)")
            return 1
        env_file.write_text(f"SERVER=http://host.containers.internal:{PORT}\nKEY_WEAK={_node_key('target-weak')}\n"
                            f"KEY_STRICT={_node_key('target-strict')}\nINTERVAL=1\n")
        print("node/testenv/targets.env 를 시험 환경 키로 만들었습니다")
    server = next((line.split("=", 1)[1] for line in env_file.read_text().splitlines() if line.startswith("SERVER=")), "")
    port = server.rsplit(":", 1)[-1].strip("/")
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2)
    except OSError:
        print(f"경고: 127.0.0.1:{port} 에 SentinelAI 가 없습니다 — targets.env 의 SERVER 를 확인하세요 (키는 그 서버 화면에서 발급한 것)")
    # podman compose 는 docker-compose 를 쓰므로 사용자 podman 소켓이 떠 있어야 합니다.
    subprocess.call(["systemctl", "--user", "start", "podman.socket"], stderr=subprocess.DEVNULL)
    code = subprocess.call(compose + ["up", "-d", "--build"], cwd=TARGETS)
    print(f"기록: cd node/testenv && {podman} compose --env-file targets.env logs -f")
    return code


API_TYPES = ROOT / "frontend" / "src" / "shared" / "api" / "schema.ts"
_TS_NAME = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")


def _ts(schema: dict) -> str:
    """JSON Schema 한 조각 → TypeScript 타입 글 (FastAPI 가 내는 모양만 다룹니다)."""
    if "$ref" in schema:
        return re.sub(r"\W", "_", schema["$ref"].rsplit("/", 1)[-1])
    for key, joiner in (("anyOf", " | "), ("oneOf", " | "), ("allOf", " & ")):
        if key in schema:
            return joiner.join(dict.fromkeys(_ts(s) for s in schema[key]))
    if "enum" in schema:
        return " | ".join(json.dumps(v, ensure_ascii=False) for v in schema["enum"])
    if "const" in schema:
        return json.dumps(schema["const"], ensure_ascii=False)
    kind = schema.get("type")
    if kind in ("integer", "number"):
        return "number"
    if kind in ("string", "boolean", "null"):
        return kind
    if kind == "array":
        item = _ts(schema.get("items", {}))
        return f"({item})[]" if " " in item else f"{item}[]"
    if kind == "object" or "properties" in schema:
        if "properties" in schema:
            return "{ " + " ".join(_ts_fields(schema)) + " }"
        extra = schema.get("additionalProperties")
        return f"Record<string, {_ts(extra) if isinstance(extra, dict) else 'unknown'}>"
    return "unknown"


def _ts_fields(schema: dict) -> list[str]:
    required = set(schema.get("required", []))
    return [f"{name if _TS_NAME.fullmatch(name) else json.dumps(name, ensure_ascii=False)}{'' if name in required else '?'}: {_ts(prop)};"
            for name, prop in schema["properties"].items()]


def api_types_text() -> str:
    """지금 코드의 API 명세(요청 · 응답 모델)를 화면 타입 파일의 글로 — 이름 순이라 줄 차이로 바뀐 칸이 보입니다."""
    from .web.main import app

    out = ["// 자동 생성 — 손으로 고치지 않습니다. 백엔드의 요청 · 응답 모델을 고친 뒤 `python -m sentinelai.dev api-types` 로 다시 만듭니다.", ""]
    for name, schema in sorted(app.openapi()["components"]["schemas"].items()):
        title = (schema.get("description") or "").strip().splitlines()
        if title:
            out.append(f"/** {title[0]} */")
        name = re.sub(r"\W", "_", name)
        if "properties" in schema:
            out += [f"export interface {name} {{", *(f"  {line}" for line in _ts_fields(schema)), "}", ""]
        else:
            out += [f"export type {name} = {_ts(schema)};", ""]
    return "\n".join(out)


def api_types() -> int:
    """응답 모양을 고친 뒤 돌립니다 — 화면 타입 파일을 다시 씁니다 (Node 없이 됩니다)."""
    API_TYPES.write_text(api_types_text(), encoding="utf-8")
    print(f"화면 타입 → {API_TYPES}")
    return 0


# 조건이 있어야 답하는 조회입니다 — 로그 조회는 서버의 감사 기록에 조회로 남습니다.
CHECK_QUERY = {"/api/logs": "?period=week"}
CHECK_SKIP = {"/api/audit"}
CHECK_NODES = 5


def api_check(base: str, login: str) -> int:
    """떠 있는 서버에 로그인해 읽기 API 를 하나씩 받아 선언과 대조합니다 — 선언을 바꾼 뒤나 새 환경에 올리기 전에 돌립니다."""
    import getpass
    import http.cookiejar
    import urllib.error
    from urllib.parse import quote

    from .web import contract
    from .web import responses as shapes
    from .web.main import app

    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    unreachable = (urllib.error.URLError, TimeoutError)   # HTTPError 는 URLError 라 먼저 받습니다

    def call(path: str, body: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(base.rstrip("/") + path, data=data, headers={"Content-Type": "application/json"})
        with opener.open(request, timeout=120) as response:
            return json.load(response)

    password = os.environ.get("SENTINELAI_CHECK_PASSWORD") or getpass.getpass(f"{login} 비밀번호: ")
    checks = [(path + CHECK_QUERY.get(path, ""), model, enforced) for path, model, enforced in contract.declared(app) if path not in CHECK_SKIP]
    bad = missing = 0
    try:
        call("/api/auth/login", {"login_id": login, "password": password})
        while checks:
            path, model, enforced = checks.pop(0)
            try:
                payload = call(path)
            except urllib.error.HTTPError as exc:
                missing += 1
                print(f"- {path}: 받지 못함 ({exc.code})")
                continue
            found = (contract.unfit if enforced else contract.mismatch)(model, payload)
            bad += bool(found)
            print(f"{'✗' if found else '✓'} {path}{'' if enforced else ' (응답 그대로)'}: {f'어긋남 {len(found)}' if found else '일치'}")
            for line in found[:10]:
                print(f"    {line}")
            # 목록에서 하나씩 들어가는 조회도 봅니다.
            if path == "/api/nodes":
                checks += [(f"/api/nodes/{quote(n['name'])}", shapes.NodeDetail, False) for n in payload[:CHECK_NODES]]
            if path == "/api/qa" and payload:
                checks.append((f"/api/qa?conversation={payload[0]['conversation_id']}", model, False))
    except urllib.error.HTTPError as exc:
        print(f"로그인하지 못했습니다 ({exc.code})")
        return 1
    except unreachable as exc:
        print(f"서버에 닿지 않습니다: {base} ({getattr(exc, 'reason', exc)})")
        return 1
    finally:
        # 대조에 쓴 세션을 서버에 2일 남기지 않습니다.
        try:
            call("/api/auth/logout", {})
        except unreachable:
            pass
    print(f"어긋난 API {bad}개" + (f", 받지 못한 API {missing}개 (이 서버가 예전 코드면 없는 API)" if missing else ""))
    return 1 if bad else 0


def main() -> int:
    p = argparse.ArgumentParser(prog="python -m sentinelai.dev", description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("setup").add_argument("--reset", action="store_true", help="있던 시험 환경을 지우고 새로")
    sub.add_parser("web").add_argument("--check-min", type=int, default=5, help="서버 점검 · 로그 감시 간격 (분)")
    sub.add_parser("test", help="뒤에 붙인 인자는 pytest 에 그대로 넘깁니다 (예: test -k ground -x)")
    sub.add_parser("targets").add_argument("action", nargs="?", choices=["up", "down"], default="up")
    sub.add_parser("api-types", help="백엔드의 요청 · 응답 모델에서 화면 타입(frontend/src/shared/api/schema.ts)을 다시 만듭니다")
    check = sub.add_parser("api-check", help="떠 있는 서버의 실제 응답이 선언한 모양과 같은지 대조합니다 (읽기만)")
    check.add_argument("url", help="서버 주소 (예: http://localhost:8000)")
    check.add_argument("--login", required=True, help="보안 운영자 이상 계정의 아이디 — 비밀번호는 화면 표시 없이 묻습니다")
    args, extra = p.parse_known_args()
    if extra and args.command != "test":
        p.error(f"모르는 인자: {' '.join(extra)}")

    if args.command == "setup":
        return setup(args.reset)
    if args.command == "web":
        if not DEV.exists():
            print("먼저 python -m sentinelai.dev setup")
            return 1
        return subprocess.call([sys.executable, "-m", "uvicorn", "sentinelai.web.main:app", "--reload", "--port", PORT],
                               env=dev_env(args.check_min), cwd=ROOT)
    if args.command == "test":
        return subprocess.call([sys.executable, "-m", "pytest", "tests", *extra], env={**os.environ, "SENTINELAI_TEST_DATABASE_URL": TEST_URL}, cwd=ROOT)
    if args.command == "api-types":
        return api_types()
    if args.command == "api-check":
        return api_check(args.url, args.login)
    return targets(args.action)


if __name__ == "__main__":
    sys.exit(main())
