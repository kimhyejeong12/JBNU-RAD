"""이슈어 — 데이터 계층에서 판정할 것을 읽어 알맞은 큐에 잡을 쌓고, 정한 간격마다 예약합니다. 수집 받기 · 집계(모델 없음)도 여기서 읽고 바로 돌려줍니다."""
from __future__ import annotations

import logging
import threading
from collections import Counter
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..db import User, auth, nodes, permissions, results
from ..sources import (FORMAT, Collected, People, between, browse, group_by_user, group_subject, latest, load_collected,
                       period_since, snapshot_row)
from .queue import Batch, Job, Progress, Queues
from .resource import Resources

log = logging.getLogger(__name__)

# 위협 예측의 기록 칸(로그 위험 · 주의 수 등)을 세는 기간입니다.
SUSPECT_DAYS = 35


def _unreadable(exc: Exception) -> str:
    log.exception("판정 입력을 읽지 못했습니다")
    return f"판정 입력을 읽지 못했습니다 — {type(exc).__name__}: {exc}"


def _iso(at: datetime | None) -> str | None:
    return at.isoformat() if at else None


class Issuer:
    def __init__(self, resources: Resources, queues: Queues) -> None:
        self.res = resources
        self.queues = queues
        self._schedule: dict[str, dict[str, Any]] = {}
        self._wake = threading.Event()
        self._stopping = False
        # 웹이 돌릴 때만 수집 받기가 서버 점검을 바로 쌓습니다 (CLI 는 큐를 돌리지 않음).
        self.live = False

    # --- 묶음 (여러 건을 한 번에 판정하는 실행) ---

    def issue(self, kind: str, auto: bool = False, progress: Progress | None = None, **options: Any) -> Batch | None:
        """같은 종류가 이미 열려 있으면 None. 데이터를 못 읽으면 실패로 닫은 묶음을 돌려줍니다."""
        batch = self.queues.open(kind, auto, progress)
        if batch is None:
            return None
        try:
            items, context = getattr(self, f"_{kind}")(**options)
        except Exception as exc:  # 로그 파일 없음 · 컬럼 없음 등은 화면 last 에 그대로 보여줍니다.
            log.exception("%s 을 쌓지 못했습니다", kind)
            self.queues.discard(batch, f"{type(exc).__name__}: {exc}")
            return batch
        self.queues.fill(batch, items, **context)
        return batch

    def _events(self, since: datetime | None = None, until: datetime | None = None, full: bool = False,
                stage: str = "final") -> tuple[list[tuple[str, Any]], dict[str, Any]]:
        """since 가 없으면 지난 감시 이후만, full 이면 처음부터. 사용자 묶음마다 잡 하나."""
        if since is None and not full:
            since = results.next_monitor_since(self.res.results_db, stage)
        loaded = self.res.sources.events()
        people = self.res.sources.people(loaded.records)
        window = between(loaded.records, since, until)
        items = []
        for user, events in group_by_user(window).items():
            last = latest(events)
            finding = {
                # 같은 사용자가 다음 실행에도 나올 수 있어 마지막 로그 시각을 붙입니다.
                "id": f"{user}@{last.isoformat()}", "user": user, "first_event_at": events[0].occurred_at.isoformat(),
                "last_event_at": last.isoformat(), "subject": group_subject(events), "events": "\n".join(e.describe() for e in events),
            }
            items.append((f"{'events_fast' if stage == 'fast' else 'events'}:{user}",
                          {"events": events, "person": people.get(log_id=user), "finding": finding}))
        context = {"source": loaded.source, "load_issues": [str(i) for i in loaded.issues], "last_event_at": _iso(latest(window)),
                   "since": _iso(since), "until": _iso(until)}
        return items, context

    def _events_fast(self, **options: Any) -> tuple[list[tuple[str, Any]], dict[str, Any]]:
        """빠른 감시 — 시작점은 지난 빠른 감시와 정밀 감시 중 늦은 쪽."""
        return self._events(stage="fast", **options)

    def _nodes(self) -> tuple[list[tuple[str, Any]], dict[str, Any]]:
        """켜 둔 노드 중 지난 점검 뒤 새 수집이 온 노드만, 그 노드의 가장 늦은 수집 한 건."""
        src = self.res.sources
        return [(f"nodes:{row['node']}", {"row": row, "decided": src.server_decisions(row["node"])})
                for row in src.pending_servers()], {}

    def _suspects(self) -> tuple[list[tuple[str, Any]], dict[str, Any]]:
        recent = (datetime.now(timezone.utc) - timedelta(days=SUSPECT_DAYS)).isoformat(timespec="seconds")
        people = self.res.sources.people()
        targets = people.suspects(results.user_findings(self.res.results_db, recent),
                                  permissions.user_requests(self.res.main_db, recent))
        return [(f"suspects:{info['key']}", {"info": info, "person": people.get(info["account_id"], info["log_id"] or "")})
                for info in targets], {}

    def _policies(self) -> tuple[list[tuple[str, Any]], dict[str, Any]]:
        return [("policies:review", {"decided": self.res.sources.policy_decisions()})], {}

    # --- 단독 잡 (권한 신청 · 보유 권한 재검토 · 기준 문서 적재) ---

    def request(self, request_no: str, people: People | None = None) -> None:
        """사람 기록은 신청 시각까지로 자릅니다. 신청이 없거나 이미 쌓였으면 그대로 둡니다."""
        if self.queues.pending(request_no):
            return
        row = permissions.judge_input(self.res.main_db, request_no)
        if row is None:
            return
        data = {"request_no": request_no, "row": row}
        try:
            data["person"] = (people or self.res.sources.people()).get(row["requester_id"], before=row["submitted_at"])
        except Exception as exc:  # 로그를 못 읽으면 판정 실패로 남겨 화면에 보이고 다음 시작 때 다시 돕니다.
            data["error"] = _unreadable(exc)
        self.queues.submit(Job("request", request_no, data))

    def grants(self, user_id: int | None = None, people: People | None = None) -> None:
        """이동 뒤 재검토할 보유 권한 — 회수 · 만료됐거나 더 늦은 이동이 있으면 건너뜁니다."""
        for task in permissions.pending_grant_reviews(self.res.main_db, user_id):
            if self.queues.pending(task):
                continue
            _, request_no, move_id = task.split(":")
            row = permissions.grant_input(self.res.main_db, request_no, int(move_id))
            if row is None:
                continue
            data = {"request_no": request_no, "move_id": int(move_id), "row": row}
            try:
                people = people or self.res.sources.people()
                data["person"] = people.get(row["requester_id"])
            except Exception as exc:
                data["error"] = _unreadable(exc)
            self.queues.submit(Job("grant", task, data))

    def resume(self) -> None:
        """판정이 없거나 실패한 신청과 재검토가 없는 보유 권한을 다시 쌓습니다 (사람 자료는 한 번만 읽음)."""
        try:
            people: People | None = self.res.sources.people()
        except Exception:  # 로그를 못 읽어도 웹은 뜹니다. 신청마다 판정 실패로 남습니다.
            log.exception("판정 못한 신청을 다시 쌓으려다 사람 기록을 읽지 못했습니다")
            people = None
        for request_no in permissions.unjudged(self.res.main_db):
            self.request(request_no, people)
        self.grants(people=people)

    def exclusive(self, key: str, work: Callable[[], Any]) -> Job:
        """다른 AI 일과 겹치면 안 되는 일(기준 문서 적재)을 쌓습니다. 끝나기는 Job.wait 로."""
        return self.queues.submit(Job("index", key, work=work))[0]

    # --- 예약 ---

    def every(self, kind: str, minutes: int) -> None:
        """지금 한 번, 그 뒤 minutes 분마다 (0 이하면 끔). 같은 종류가 열려 있으면 그 차례는 건너뜁니다."""
        if minutes > 0:
            self._schedule[kind] = {"every_min": minutes, "next_at": datetime.now()}

    def schedule(self) -> dict[str, dict[str, Any]]:
        return {k: {"every_min": v["every_min"], "next_at": v["next_at"].isoformat(timespec="seconds")} for k, v in self._schedule.items()}

    def start(self) -> None:
        self.live = True
        threading.Thread(target=self._loop, daemon=True, name="issuer").start()

    def stop(self) -> None:
        self._stopping = True
        self._wake.set()

    def _loop(self) -> None:
        while not self._stopping:
            now = datetime.now()
            for kind, s in list(self._schedule.items()):
                if s["next_at"] <= now:
                    s["next_at"] = now + timedelta(minutes=s["every_min"])
                    self.issue(kind, auto=True)
            due = min((s["next_at"] for s in self._schedule.values()), default=now + timedelta(minutes=1))
            self._wake.wait(max(0.1, min((due - datetime.now()).total_seconds(), 60)))

    # --- 수집 받기 ---

    def receive_snapshot(self, presented: str, payload: dict[str, Any]) -> dict[str, Any]:
        """키로 노드를 찾아 쌓고, 새 수집이면 서버 점검을 바로 쌓습니다. 형식 오류 ValueError · 모르는 키 Unauthorized · 꺼진 노드 Denied."""
        main_db, results_db = self.res.main_db, self.res.results_db
        snapshot_row(payload, "_", None)
        name = nodes.authenticate(main_db, presented, payload)["name"]
        row = snapshot_row(payload, name, results.latest_snapshot(results_db, name))
        _, stored = results.save_snapshot(results_db, row)
        if stored:
            nodes.mark_collected(main_db, name, row["collected_at"])
            if self.live:
                self.issue("nodes", auto=True)
        return {"node": name, "stored": stored}

    def import_snapshots(self, folder: str | Path, node: str | None = None) -> tuple[Collected, int]:
        """망이 막힌 노드의 export 파일 — 등록부에 없는 노드는 키 없이 등록합니다. → (읽은 결과, 새로 넣은 수)"""
        main_db, results_db = self.res.main_db, self.res.results_db
        loaded = load_collected(folder, node)
        stored = 0
        for snap in sorted(loaded.records, key=lambda x: x.collected_at):
            payload = {**snap.model_dump(mode="json", exclude={"raw", "modules"}), "format": FORMAT}
            row = snapshot_row(payload, snap.node, results.latest_snapshot(results_db, snap.node))
            nodes.ensure(main_db, snap.node, row)
            _, inserted = results.save_snapshot(results_db, row)
            if inserted:
                nodes.mark_collected(main_db, snap.node, row["collected_at"])
            stored += inserted
        return loaded, stored

    # --- 집계 (모델 없음, 큐에 넣지 않음) ---

    @staticmethod
    def _since(period: str) -> tuple[datetime | None, str | None]:
        since = period_since(period, datetime.now(timezone.utc))
        return since, since.isoformat(timespec="seconds") if since else None

    def stats(self, period: str) -> dict[str, Any]:
        """위협 로그 비율 · 빈도와 노드 위협."""
        main_db, results_db = self.res.main_db, self.res.results_db
        since, at = self._since(period)
        # 로그를 읽지 못하면 비율 없이 건수만 보여줍니다.
        try:
            logs = self.res.sources.events(since).records
            total = {"count": len(logs), "days": dict(Counter(e.occurred_at.astimezone().date().isoformat() for e in logs))}
        except (FileNotFoundError, ValueError) as exc:
            total = {"count": None, "days": {}, "error": str(exc)}
        found = results.threat_stats(results_db, at)
        registry = [n for n in nodes.list_nodes(main_db) if n["enabled"]]
        safety = results.server_safety(results_db, [n["name"] for n in registry], {n["name"] for n in registry if nodes.is_stale(n)}, at)
        return {"period": period, "since": at, "logs": total, "safety": safety,
                "events": {k: v for k, v in found["events"].items() if k != "users"}, "servers": found["servers"]}

    def user_stats(self, period: str) -> dict[str, Any]:
        main_db, results_db = self.res.main_db, self.res.results_db
        _, at = self._since(period)
        suspects = results.latest_suspects(results_db)
        held = permissions.held_by_account(main_db)
        for p in suspects:
            # 사람 키가 account:{id} 가 아니면 계정 미연결이라 권한을 알 수 없습니다.
            p["held"] = held.get(int(p["key"].split(":", 1)[1]), []) if p["key"].startswith("account:") else None
        return {"period": period, "since": at, "events": {"users": results.threat_stats(results_db, at)["events"]["users"]},
                "requests": permissions.request_stats(main_db, at), "suspects": suspects, "safety": results.user_safety(results_db, at)}

    def browse_logs(self, user: User, period: str, who: str = "", solution: str = "", how: str = "", page: int = 1,
                    ip: str | None = None) -> dict[str, Any]:
        """조회 조건을 감사 기록에 남깁니다."""
        result = browse(self.res.settings.events_source, period, who, solution, how, page)
        auth.record_log_view(self.res.main_db, user, {"period": period, **result["criteria"], "page": page}, ip)
        return result


__all__ = ["Issuer"]
