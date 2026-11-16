"""API 응답 모델 — 선언한 칸이 DB 가 주는 칸과 같고, 화면 타입 파일이 지금 코드에서 만든 것과 같은지 봅니다."""
from __future__ import annotations

from sentinelai import dev
from sentinelai.db import auth, catalog, regulations, watch
from sentinelai.web.api_permissions import AccessItem, Me, UserRow
from sentinelai.web.api_regulations import Regulation
from sentinelai.web.main import AuditRow


def test_frontend_types_are_current():
    current = dev.API_TYPES.read_text(encoding="utf-8")
    assert dev.api_types_text() == current, "요청 · 응답 모델이 바뀌었습니다 — python -m sentinelai.dev api-types 로 화면 타입을 다시 만드세요"


def test_response_models_declare_every_column(main_db, people):
    """응답 모델에 없는 칸은 응답에서 빠지므로, DB 에 칸을 더하면 모델에도 더해야 합니다."""
    root = people["root"]
    item = catalog.create(main_db, root, "HR_SALARY_READ", "급여 테이블 조회")
    regulations.create(main_db, root, "a.md", "가")
    rows = {
        Me: root.public(),
        UserRow: auth.list_users(main_db, root)[0],
        AccessItem: item,
        Regulation: regulations.list_all(main_db)[0],
        AuditRow: watch.history(main_db, "user", str(people["user"].id))[0],
    }
    for model, row in rows.items():
        assert set(row) == set(model.model_fields), model.__name__
        model.model_validate(row)
