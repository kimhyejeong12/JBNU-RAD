"""권한 DB API — 세션 토큰은 화면 스크립트가 볼 수 없게 HttpOnly 쿠키로만 주고받습니다."""
from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from sentinelai.db import Denied, User, auth, catalog, decisions, permissions

from . import notify

COOKIE = "sentinelai_session"

router = APIRouter(prefix="/api")

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Role = Literal["user", "manager", "top"]
Level = Literal["정상", "주의", "위험"]


# --- 응답 모양 — 여기 적은 칸이 API 명세(/openapi.json)에 나오고, 화면 타입(frontend/src/shared/api/schema.ts)은 거기서 만듭니다.
# 적지 않은 칸은 응답에서 빠지므로 DB 가 주는 칸과 같게 둡니다 (tests/test_api_contract.py 가 봅니다).


class Ok(BaseModel):
    """돌려줄 내용 없이 끝난 일."""

    ok: bool


class Me(BaseModel):
    """로그인한 사람 · 계정을 만들거나 고친 결과."""

    id: int
    login_id: str
    display_name: str
    department: str
    role: Role
    is_root: bool
    must_change_password: bool


class UserRow(Me):
    """계정 목록의 한 줄."""

    is_active: bool
    locked_until: str | None
    last_login_at: str | None
    created_at: str
    log_id: str
    job: str
    left_on: str
    email: str


class WatchFlag(BaseModel):
    """확인할 사람에게 걸린 일 하나 — 퇴사 · 이동 · 보유 권한 · 결재 중 신청."""

    kind: Literal["leave", "move", "grant", "request"]
    level: Level
    at: str
    text: str
    request_no: str | None = None


class WatchPerson(BaseModel):
    """확인할 사람 한 명 — level · at 은 걸린 일 중 가장 높은 등급 · 가장 늦은 날."""

    id: int
    login_id: str
    name: str
    department: str
    job: str
    is_active: bool
    left_on: str
    level: Level
    at: str
    flags: list[WatchFlag]


class DecisionRecord(BaseModel):
    """운영자 결정 한 건 (권한 DB 의 결정 기록 한 줄)."""

    id: int
    kind: Literal["policy", "event", "server", "suspect"]
    item_key: str
    subject: str
    action: str
    comment: str
    ai_level: Level | None
    decider_id: int
    decider_name: str
    decider_department: str
    decided_at: str


class DecisionResult(BaseModel):
    """결정을 적은 결과 — decision 은 지금 결정이고 취소면 null."""

    kind: str
    item_key: str
    decision: DecisionRecord | None


class AccessItem(BaseModel):
    """권한 목록의 한 건."""

    id: int
    code: str
    name: str
    system: str
    category: str
    description: str
    is_active: bool
    created_by: int
    created_at: str
    updated_at: str


def _denied(exc: Denied) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _session_user(request: Request) -> User:
    user = auth.session_user(request.app.state.main_db, request.cookies.get(COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return user


def logged_in(request: Request) -> User:
    """비밀번호를 바꿔야 하는 상태면 403 입니다."""
    user = _session_user(request)
    if user.must_change_password:
        raise HTTPException(status_code=403, detail="비밀번호를 먼저 바꾸세요")
    return user


def role(*roles: str):
    def check(user: Annotated[User, Depends(logged_in)]) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="이 기능을 쓸 수 있는 역할이 아닙니다")
        return user
    return check


Approver = Annotated[User, Depends(role("manager", "top"))]
Anyone = Annotated[User, Depends(logged_in)]


# --- 로그인 ---


class LoginBody(BaseModel):
    login_id: Name
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.post("/auth/login", response_model=Me)
def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    try:
        token, user = auth.login(request.app.state.main_db, body.login_id, body.password,
                                 request.client.host if request.client else None, request.headers.get("user-agent"))
    except Denied as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None
    response.set_cookie(COOKIE, token, max_age=int(auth.SESSION_TTL.total_seconds()), httponly=True,
                        samesite="strict", secure=request.url.scheme == "https", path="/")
    return user.public()


@router.post("/auth/logout", response_model=Ok)
def logout(request: Request, response: Response) -> dict[str, bool]:
    auth.logout(request.app.state.main_db, request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me", response_model=Me)
def me(request: Request) -> dict[str, Any]:
    return _session_user(request).public()


class PasswordBody(BaseModel):
    current: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    new: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.post("/auth/password", response_model=Me)
def change_password(body: PasswordBody, request: Request) -> dict[str, Any]:
    user = _session_user(request)
    try:
        auth.change_password(request.app.state.main_db, user, body.current, body.new, request.cookies.get(COOKIE))
    except Denied as exc:
        raise _denied(exc) from None
    return _session_user(request).public()


# --- 계정 (일반 사용자 계정은 보안 운영자 이상, 역할과 보안 운영자 이상 계정은 보안 총책임자) ---


class NewUser(BaseModel):
    login_id: Name
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    display_name: Name
    department: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    job: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)] = ""
    role: str


class UserChange(BaseModel):
    display_name: Name | None = None
    department: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    job: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    role: str | None = None
    is_active: bool | None = None
    log_id: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    left_on: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10)] | None = None
    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=254)] | None = None


class PasswordReset(BaseModel):
    temporary_password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.get("/users", response_model=list[UserRow])
def list_users(request: Request, user: Anyone) -> list[dict]:
    try:
        return auth.list_users(request.app.state.main_db, user)
    except Denied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


@router.post("/users", status_code=201, response_model=Me)
def create_user(body: NewUser, request: Request, user: Anyone) -> dict[str, Any]:
    try:
        return auth.create_user(request.app.state.main_db, user, body.login_id, body.password,
                                body.display_name, body.department, body.role, body.job, body.email).public()
    except Denied as exc:
        raise _denied(exc) from None


@router.patch("/users/{user_id}", response_model=Me)
def update_user(user_id: int, body: UserChange, request: Request, user: Anyone) -> dict[str, Any]:
    changes = body.model_dump(exclude_none=True)
    if "is_active" in changes:
        changes["is_active"] = int(changes["is_active"])
    try:
        changed = auth.update_user(request.app.state.main_db, user, user_id, **changes)
    except Denied as exc:
        raise _denied(exc) from None
    # 부서 · 직무를 옮겼으면 예전 업무로 받은 권한을 다시 판정합니다.
    if "department" in changes or "job" in changes:
        request.app.state.engine.enqueue_grants(user_id)
    return changed.public()


@router.post("/users/{user_id}/reset-password", response_model=Ok)
def reset_password(user_id: int, body: PasswordReset, request: Request, user: Anyone) -> dict[str, bool]:
    try:
        auth.reset_password(request.app.state.main_db, user, user_id, body.temporary_password)
    except Denied as exc:
        raise _denied(exc) from None
    return {"ok": True}


# --- 권한 목록 (관리는 보안 운영자 이상) ---


class NewAccess(BaseModel):
    code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    name: Name
    system: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    description: Text = ""


class AccessChange(BaseModel):
    name: Name | None = None
    system: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    description: Text | None = None
    is_active: bool | None = None


@router.get("/access-catalog", response_model=list[AccessItem])
def list_access(request: Request, user: Anyone) -> list[dict]:
    return catalog.list_items(request.app.state.main_db, user)


@router.post("/access-catalog", status_code=201, response_model=AccessItem)
def create_access(body: NewAccess, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return catalog.create(request.app.state.main_db, user, **body.model_dump())
    except Denied as exc:
        raise _denied(exc) from None


@router.patch("/access-catalog/{code}", response_model=AccessItem)
def update_access(code: str, body: AccessChange, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return catalog.update(request.app.state.main_db, user, code, **body.model_dump(exclude_none=True))
    except Denied as exc:
        raise _denied(exc) from None


# --- 권한 신청 · 결재 · 회수 ---


def _with_verdict(request: Request, req: dict, user: User) -> dict:
    """판정 중이면 judging = True 를 붙이고, 일반 사용자에게는 AI 칸을 모두 뺍니다."""
    if user.role == "user":
        return {**{k: v for k, v in req.items() if k not in ("ai_verdict", "grant_review")},
                "approvals": [{k: v for k, v in a.items() if k != "ai_level"} for a in req["approvals"]]}
    review = req.get("grant_review")
    if review and review["cause"] == "move":
        review = {**review, "judging": request.app.state.engine.pending(f"grant:{req['request_no']}:{review['move']['id']}")}
    return {**req, "grant_review": review, "judging": request.app.state.engine.pending(req["request_no"])}


@router.get("/people", dependencies=[Depends(role("manager", "top"))], response_model=list[WatchPerson])
def people(request: Request) -> list[dict[str, Any]]:
    return permissions.watch_people(request.app.state.main_db)


class NewRequest(BaseModel):
    access_code: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    reason: Text = ""
    period_start: Annotated[str, StringConstraints(pattern=r"^(\d{4}-\d{2}-\d{2})?$")] = ""
    period_end: Annotated[str, StringConstraints(pattern=r"^(\d{4}-\d{2}-\d{2})?$")] = ""


@router.post("/requests", status_code=201)
def submit(body: NewRequest, request: Request, background: BackgroundTasks,
           user: Annotated[User, Depends(role("user"))]) -> dict[str, Any]:
    # 업무상 필요한지는 결재자가 사유를 보고 판단하므로 비면 받지 않습니다.
    if not body.reason:
        raise HTTPException(status_code=400, detail="신청 사유를 적으세요 — 결재자가 업무상 필요한지 판단하는 근거입니다")
    try:
        req = permissions.submit(request.app.state.main_db, user, **body.model_dump())
    except Denied as exc:
        raise _denied(exc) from None
    request.app.state.engine.enqueue_request(req["request_no"])
    background.add_task(notify.notify_waiting, request.app.state.slack_url, req)
    return _with_verdict(request, req, user)


@router.get("/requests")
def list_requests(request: Request, user: Anyone, stage: str | None = None, mine: bool = False) -> list[dict]:
    try:
        rows = permissions.list_requests(request.app.state.main_db, user, stage, mine)
    except Denied as exc:
        raise _denied(exc) from None
    return [_with_verdict(request, r, user) for r in rows]


@router.post("/requests/{request_no}/withdraw")
def withdraw(request_no: str, request: Request, user: Anyone) -> dict[str, Any]:
    try:
        return _with_verdict(request, permissions.withdraw(request.app.state.main_db, user, request_no), user)
    except Denied as exc:
        raise _denied(exc) from None


class DecisionBody(BaseModel):
    action: str
    comment: Text = ""


@router.post("/requests/{request_no}/decision")
def decide(request_no: str, body: DecisionBody, request: Request, background: BackgroundTasks, user: Approver) -> dict[str, Any]:
    try:
        req = permissions.decide(request.app.state.main_db, user, request_no, body.action, body.comment)
    except Denied as exc:
        raise _denied(exc) from None
    background.add_task(notify.notify_waiting, request.app.state.slack_url, req)
    background.add_task(notify.notify_result, request.app.state.mail, request.app.state.main_db, req)
    return _with_verdict(request, req, user)


class RevokeBody(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


@router.post("/requests/{request_no}/revoke")
def revoke(request_no: str, body: RevokeBody, request: Request, background: BackgroundTasks, user: Approver) -> dict[str, Any]:
    try:
        req = permissions.revoke(request.app.state.main_db, user, request_no, body.reason)
    except Denied as exc:
        raise _denied(exc) from None
    background.add_task(notify.notify_result, request.app.state.mail, request.app.state.main_db, req)
    return _with_verdict(request, req, user)


@router.post("/requests/{request_no}/rejudge", status_code=202)
def rejudge(request_no: str, request: Request, user: Approver) -> dict[str, Any]:
    try:
        permissions.get(request.app.state.main_db, user, request_no)
    except Denied as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    if not permissions.rejudgeable(request.app.state.main_db, request_no):
        raise HTTPException(status_code=400, detail="1차 결재 뒤에는 다시 판정할 수 없습니다")
    request.app.state.engine.enqueue_request(request_no)
    return {"request_no": request_no, "judging": True}



# --- 정책 관리 · 로그 감시 결정 ---


class ReviewDecision(BaseModel):
    kind: str
    item_key: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    action: str
    subject: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    comment: Text = ""
    ai_level: str | None = None


@router.post("/decisions", response_model=DecisionResult)
def record_decision(body: ReviewDecision, request: Request, user: Approver) -> dict[str, Any]:
    """응답은 지금 결정입니다 (취소면 null)."""
    try:
        decision = decisions.record(request.app.state.main_db, user, **body.model_dump())
    except Denied as exc:
        raise _denied(exc) from None
    return {"kind": body.kind, "item_key": body.item_key, "decision": decision}
