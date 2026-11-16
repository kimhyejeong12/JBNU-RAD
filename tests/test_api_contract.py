"""API 응답 모델 — 선언한 칸이 DB 가 주는 칸과 같고, 화면 타입 파일이 지금 코드에서 만든 것과 같은지 봅니다."""
from __future__ import annotations

from sentinelai import dev
from sentinelai.db import auth, catalog, decisions, nodes, permissions, regulations, watch
from sentinelai.web.api_nodes import Node
from sentinelai.web.api_permissions import AccessItem, DecisionRecord, Me, UserRow, WatchFlag, WatchPerson
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
        Node: nodes.create(main_db, people["manager"], "web-01")[0],
        DecisionRecord: decisions.record(main_db, people["manager"], "event", "event_findings/1", "act", ai_level="위험"),
    }
    for model, row in rows.items():
        assert set(row) == set(model.model_fields), model.__name__
        model.model_validate(row)


def test_watch_people_fit_the_model(main_db, people):
    """확인할 사람 — 걸린 일(flags)마다 칸이 조금씩 달라 모델보다 많지만 않으면 됩니다."""
    root, user = people["root"], people["user"]
    item = catalog.create(main_db, root, "HR_SALARY_READ", "급여 테이블 조회")
    no = permissions.submit(main_db, user, item["code"], "급여 정산 업무")["request_no"]
    permissions.decide(main_db, people["manager"], no, "approve")
    permissions.decide(main_db, people["top"], no, "approve")
    auth.update_user(main_db, root, user.id, department="영업팀", left_on="2020-01-01")
    person = next(p for p in permissions.watch_people(main_db) if p["id"] == user.id)
    assert set(person) == set(WatchPerson.model_fields)
    assert {f["kind"] for f in person["flags"]} == {"leave", "move"}
    for flag in person["flags"]:
        assert set(flag) <= set(WatchFlag.model_fields)
    WatchPerson.model_validate(person)
