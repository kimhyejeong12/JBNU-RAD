"""검토 대상 CSV(data/)를 읽어 dict 로 돌려줍니다."""
from __future__ import annotations

import csv
from pathlib import Path

from .. import ROOT

DATA_DIR = ROOT / "data"

PERMISSION_COLUMNS = ["id", "requester", "requested_access", "current_access", "신청일"]
POLICY_COLUMNS = [
    "policy_id", "solution", "source", "destination", "service", "action", "expires_at",
]

# review_chain 의 입력 키. permissions.csv 의 같은 이름 컬럼과 그대로 대응합니다.
REVIEW_INPUT_KEYS = ["requester", "requested_access", "current_access"]


def _read(path: Path, expected: list[str]) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"검토 대상 파일이 없습니다: {path}")
    # utf-8-sig: 엑셀에서 저장한 BOM 포함 CSV 도 읽습니다.
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = [
            {k: (v or "").strip() for k, v in row.items() if k is not None}
            for row in csv.DictReader(f)
        ]
    if not rows:
        raise ValueError(f"내용이 비어 있습니다: {path}")
    missing = [c for c in expected if c not in rows[0]]
    if missing:
        raise ValueError(f"{path.name} 에 컬럼이 없습니다: {', '.join(missing)}")
    return rows


def load_permissions() -> list[dict[str, str]]:
    return _read(DATA_DIR / "permissions.csv", PERMISSION_COLUMNS)


def load_policies() -> list[dict[str, str]]:
    return _read(DATA_DIR / "policies.csv", POLICY_COLUMNS)


def review_input(row: dict[str, str]) -> dict[str, str]:
    return {k: row[k] for k in REVIEW_INPUT_KEYS}


def format_policies(rows: list[dict[str, str]]) -> str:
    """정책 표를 한 줄에 한 건씩 텍스트로 풀어 씁니다 (policy_chain 의 policies 인자)."""
    lines = []
    for r in rows:
        expires = r["expires_at"] or "만료일 없음"
        lines.append(
            f"- {r['policy_id']} [{r['solution']}] "
            f"출발지 {r['source']} → 목적지 {r['destination']} / "
            f"서비스 {r['service']} / 동작 {r['action']} / 만료 {expires}"
        )
    return "\n".join(lines)
