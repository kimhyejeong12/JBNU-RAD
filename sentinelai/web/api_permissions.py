"""로그인 · 계정 · 권한 신청 · 결재 · 회수 · 정책 · 로그 결정 API (권한 DB).

세션 토큰은 HttpOnly · SameSite=Strict 쿠키로만 주고받습니다. 화면 스크립트는 토큰을 볼 수 없습니다.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from sentinelai.db import Denied, User, auth, decisions, logs, permissions

COOKIE = "sentinelai_session"

router = APIRouter(prefix="/api")

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


def _denied(exc: Denied) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _session_user(request: Request) -> User:
    user = auth.session_user(request.app.state.main_db, request.cookies.get(COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    return user


def logged_in(request: Request) -> User:
    """로그인했고, 비밀번호를 바꿔야 하는 상태가 아닌 사용자."""
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


# --- 로그인 -----------------------------------------------------------------


class LoginBody(BaseModel):
    login_id: Name
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.post("/auth/login")
def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    try:
        token, user = auth.login(request.app.state.main_db, body.login_id, body.password,
                                 request.client.host if request.client else None, request.headers.get("user-agent"))
    except Denied as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None
    response.set_cookie(COOKIE, token, max_age=int(auth.SESSION_TTL.total_seconds()), httponly=True,
                        samesite="strict", secure=request.url.scheme == "https", path="/")
    return user.public()


@router.post("/auth/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    auth.logout(request.app.state.main_db, request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(request: Request) -> dict[str, Any]:
    return _session_user(request).public()


class PasswordBody(BaseModel):
    current: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    new: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.post("/auth/password")
def change_password(body: PasswordBody, request: Request) -> dict[str, Any]:
    user = _session_user(request)
    try:
        auth.change_password(request.app.state.main_db, user, body.current, body.new, request.cookies.get(COOKIE))
    except Denied as exc:
        raise _denied(exc) from None
    return _session_user(request).public()


# --- 계정 (루트) ------------------------------------------------------------


class NewUser(BaseModel):
    login_id: Name
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    display_name: Name
    department: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] = ""
    role: str


class UserChange(BaseModel):
    display_name: Name | None = None
    department: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    role: str | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    temporary_password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


@router.get("/users")
def list_users(request: Request, user: Anyone) -> list[dict]:
    try:
        return auth.list_users(request.app.state.main_db, user)
    except Denied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from None


@router.post("/users", status_code=201)
def create_user(body: NewUser, request: Request, user: Anyone) -> dict[str, Any]:
    try:
        return auth.create_user(request.app.state.main_db, user, body.login_id, body.password,
                                body.display_name, body.department, body.role).public()
    except Denied as exc:
        raise _denied(exc) from None


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserChange, request: Request, user: Anyone) -> dict[str, Any]:
    changes = body.model_dump(exclude_none=True)
    if "is_active" in changes:
        changes["is_active"] = int(changes["is_active"])
    try:
        return auth.update_user(request.app.state.main_db, user, user_id, **changes).public()
    except Denied as exc:
        raise _denied(exc) from None


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: PasswordReset, request: Request, user: Anyone) -> dict[str, bool]:
    try:
        auth.reset_password(request.app.state.main_db, user, user_id, body.temporary_password)
    except Denied as exc:
        raise _denied(exc) from None
    return {"ok": True}


# --- 권한 신청 · 결재 · 회수 -------------------------------------------------


def _with_verdict(request: Request, req: dict, user: User) -> dict:
    """신청에 최신 AI 판정(Log DB)을 붙입니다. 판정 중이면 judging = True

    AI 판정은 결재자를 위한 것이라 일반사용자에게는 주지 않습니다.
    """
    if user.role == "user":
        return req
    return {
        **req,
        "ai_verdict": logs.latest_request_verdict(request.app.state.log_db, req["request_no"]),
        "judging": request.app.state.verdicts.pending(req["request_no"]),
    }


class NewRequest(BaseModel):
    requested_access: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    current_access: Text = ""
    reason: Text = ""
    period_start: Annotated[str, StringConstraints(pattern=r"^(\d{4}-\d{2}-\d{2})?$")] = ""
    period_end: Annotated[str, StringConstraints(pattern=r"^(\d{4}-\d{2}-\d{2})?$")] = ""


@router.post("/requests", status_code=201)
def submit(body: NewRequest, request: Request, user: Annotated[User, Depends(role("user"))]) -> dict[str, Any]:
    try:
        req = permissions.submit(request.app.state.main_db, user, **body.model_dump())
    except Denied as exc:
        raise _denied(exc) from None
    request.app.state.verdicts.enqueue(req["request_no"])
    return _with_verdict(request, req, user)


@router.get("/requests")
def list_requests(request: Request, user: Anyone, stage: str | None = None, mine: bool = False) -> list[dict]:
    try:
        rows = permissions.list_requests(request.app.state.main_db, user, stage, mine)
    except Denied as exc:
        raise _denied(exc) from None
    return [_with_verdict(request, r, user) for r in rows]


@router.get("/requests/{request_no}")
def get_request(request_no: str, request: Request, user: Anyone) -> dict[str, Any]:
    try:
        return _with_verdict(request, permissions.get(request.app.state.main_db, user, request_no), user)
    except Denied as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None


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
def decide(request_no: str, body: DecisionBody, request: Request, user: Approver) -> dict[str, Any]:
    # 결재자가 본 판정은 지금 화면에 띄운 최신 판정입니다. 판정이 아직 없으면 빈 채로 남깁니다.
    verdict = logs.latest_request_verdict(request.app.state.log_db, request_no)
    try:
        req = permissions.decide(
            request.app.state.main_db, user, request_no, body.action, body.comment,
            f"request_verdicts/{verdict['id']}" if verdict else None,
            verdict["level"] if verdict and not verdict["failed"] else None,
        )
    except Denied as exc:
        raise _denied(exc) from None
    return _with_verdict(request, req, user)


class RevokeBody(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


@router.post("/requests/{request_no}/revoke")
def revoke(request_no: str, body: RevokeBody, request: Request, user: Approver) -> dict[str, Any]:
    try:
        return _with_verdict(request, permissions.revoke(request.app.state.main_db, user, request_no, body.reason), user)
    except Denied as exc:
        raise _denied(exc) from None


@router.post("/requests/{request_no}/rejudge", status_code=202)
def rejudge(request_no: str, request: Request, user: Approver) -> dict[str, Any]:
    try:
        permissions.get(request.app.state.main_db, user, request_no)
    except Denied as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    request.app.state.verdicts.enqueue(request_no)
    return {"request_no": request_no, "judging": True}


@router.get("/grants")
def grants(request: Request, user: Approver) -> list[dict]:
    return [_with_verdict(request, g, user) for g in permissions.active_grants(request.app.state.main_db, user)]


# --- 정책 관리 · 로그 감시 결정 -----------------------------------------------


class ReviewDecision(BaseModel):
    kind: str
    item_key: Annotated[str, StringConstraints(min_length=1, max_length=300)]
    action: str
    subject: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    comment: Text = ""
    ai_level: str | None = None


@router.post("/decisions")
def record_decision(body: ReviewDecision, request: Request, user: Approver) -> dict[str, Any]:
    """정책 문제 · 로그 판정에 대한 운영자 결정. 취소(cancel)도 기록으로 남깁니다. 응답은 지금 결정(취소면 null)."""
    try:
        decision = decisions.record(request.app.state.main_db, user, **body.model_dump())
    except Denied as exc:
        raise _denied(exc) from None
    return {"kind": body.kind, "item_key": body.item_key, "decision": decision}
