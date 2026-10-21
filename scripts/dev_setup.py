"""로컬 시험 환경 — `make dev-setup` 이 부릅니다.

진짜 DB · 벡터 DB 는 건드리지 않고 .dev/ 에 따로 만듭니다 (위치는 Makefile 의 DEV_ENV).
역할마다 시험 계정 · 시험용 권한 목록과 이 컴퓨터에서 돌릴 노드 설정(.dev/node.conf)을 넣고, 모델 서버에 닿으면 기준 문서도 적재합니다.
노드 수집은 make dev-targets (컨테이너) · make dev-sim (흉내 노드)로 넣습니다.
다시 만들려면 `make dev-setup RESET=1`.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("GRPC_VERBOSITY", "NONE")

from sentinelai.db import User, auth, catalog, nodes  # noqa: E402
from sentinelai.engine import Engine  # noqa: E402

DEV = ROOT / ".dev"
PASSWORD = "dev-pass-1234"
ACCOUNTS = [("dev-op", "보안 운영자", "manager"), ("dev-user", "일반 사용자", "user")]
PORT = os.environ.get("DEV_PORT", "8001")
# 일반 사용자가 고를 시험용 권한 목록 — 기준 문서의 조항(3.2 인사 · 3.3 급여 · 4.3 관리자 · 6.2 PAM)에 걸리게 골랐습니다.
CATALOG = [
    ("HR_MASTER_READ", "인사정보 조회", "인사 시스템", "인사정보", "HR_MASTER 테이블 읽기"),
    ("HR_SALARY_READ", "급여 테이블 조회", "인사 시스템", "급여정보", "HR_SALARY 테이블 읽기"),
    ("HR_SALARY_WRITE", "급여 테이블 수정", "인사 시스템", "급여정보", "HR_SALARY 테이블 쓰기"),
    ("PROD_DB_ADMIN", "운영 DB 관리자", "운영 DB", "관리자", "운영 DB 스키마 변경 · 계정 관리"),
    ("PAM_SERVER_ADMIN", "PAM 경유 서버 관리자", "PAM", "관리자", "PAM 을 거쳐 운영 서버에 관리자로 접속"),
    ("FW_POLICY_CHANGE", "방화벽 정책 변경", "방화벽", "관리자", "방화벽 규칙 추가 · 수정 · 삭제"),
    ("CRM_READ", "CRM 조회", "CRM", "고객정보", "고객 · 계약 정보 읽기"),
]


def main() -> int:
    if DEV.exists():
        if os.environ.get("RESET") != "1":
            print(f"{DEV} 가 이미 있습니다. 다시 만들려면: make dev-setup RESET=1")
            return 1
        shutil.rmtree(DEV)
    DEV.mkdir()
    engine = Engine()
    db = engine.main_db

    root = auth.create_root(db, "dev-root", PASSWORD, "시험 총책임자", "보안팀")
    for login, name, role in ACCOUNTS:
        auth.create_user(db, root, login, PASSWORD, name, "보안팀", role)
    # 시험 계정은 첫 로그인 비밀번호 변경을 건너뜁니다.
    with db.transaction() as conn:
        conn.execute("UPDATE users SET must_change_password = 0")
    with db.connection() as conn:
        root = User.of(conn.execute("SELECT * FROM users WHERE is_root = 1").fetchone())

    for item in CATALOG:
        catalog.create(db, root, *item)

    _, key = nodes.create(db, root, "dev-local")
    (DEV / "node.conf").write_text(
        f"[node]\nserver = http://127.0.0.1:{PORT}\nkey = {key}\ninterval_min = 1\nstate_dir = {DEV / 'node-state'}\n",
        encoding="utf-8")

    try:
        indexed = str(engine.index())
    except Exception as exc:  # 모델 서버가 꺼져 있어도 계정 · 노드로 화면은 볼 수 있습니다.
        indexed = f"건너뜀 ({type(exc).__name__}: {exc}) — 모델 서버를 켠 뒤 화면의 [정책 관리 검토 실행]이 적재합니다"
    finally:
        engine.documents.close()

    print(f"""시험 환경을 만들었습니다 → {DEV}
  계정 (비밀번호 {PASSWORD}): dev-root (보안 총책임자 · 루트) · dev-op (보안 운영자) · dev-user (일반 사용자)
  권한 목록 {len(CATALOG)}건 (일반 사용자가 신청서에서 고름)
  이 컴퓨터용 노드 dev-local (설정 .dev/node.conf)
  기준 문서: {indexed}

  make dev        웹 http://127.0.0.1:{PORT} (진짜 DB 대신 .dev/)
  make dev-targets · make dev-sim · make dev-node   노드 수집 넣기 (make dev 가 떠 있을 때)""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
