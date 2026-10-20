"""AI 결과 DB — 정책 관리 검토 · 로그 감시 판정 · 질의 기록.

pipeline 이 돌려준 dict 를 그대로 받아 쌓습니다. 행은 고치지 않습니다 (트리거).
수집 노드가 보낸 수집(server_snapshots, 노드 · 수집 시각이 같으면 한 번만)과 노드 점검 판정(node_findings)도 여기 쌓습니다.
권한 DB의 운영자 결정은 여기 행을 `policy_issues/{id}` · `node_findings/{id}` · `event_findings/{id}` 로 가리킵니다.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .auth import User
from .core import Database, now


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _utc(stamp: str | None) -> str | None:
    """시각을 UTC ISO 문자열로 맞춥니다. 문자열 비교가 곧 시각 비교가 되도록 합니다. 시간대가 없으면 UTC 로 봅니다."""
    if not stamp:
        return None
    moment = datetime.fromisoformat(stamp)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).isoformat(timespec="seconds")


# --- 정책 관리 검토 -----------------------------------------------------------


def save_policy_review(db: Database, review: dict[str, Any], model: str) -> int:
    """pipeline.review_policies 결과 1회를 쌓습니다. → policy_reviews.id"""
    with db.transaction() as conn:
        servers = review.get("servers") or {}
        rid = conn.execute(
            "INSERT INTO policy_reviews (source, load_issues, rules, summary, failed, error, model, elapsed_sec, created_at,"
            " servers_source, servers_load_issues) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (str(review.get("source", "")), _json(review.get("load_issues", [])), _json(review.get("rules", [])),
             review.get("summary", ""), int(review["failed"]), review.get("error"), model, review.get("elapsed_sec"), now(),
             str(servers.get("source", "")), _json(servers.get("load_issues", []))),
        ).lastrowid
        # 서버 점검은 차이(gaps)마다 근거 조항 · 바꿀 것을 따로 둡니다. reason 에는 요약, sources 에는 차이들의 조항을 모읍니다.
        conn.executemany(
            "INSERT INTO server_findings (review_id, seq, host, ip, state, matched, level, reason, recommendation, sources,"
            " failed, error, elapsed_sec, gaps, unjudged, snapshot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(rid, n, f["host"], f.get("ip", ""), _json(f.get("state", {})), f.get("matched", ""), f.get("level"),
              f.get("summary", ""), "", _json(list(dict.fromkeys(g["source"] for g in f.get("gaps", []) if g.get("source")))),
              int(f["failed"]), f.get("error"), f.get("elapsed_sec"), _json(f.get("gaps", [])), _json(f.get("unjudged", [])),
              _json(f.get("snapshot") or {}))
             for n, f in enumerate(servers.get("findings", []), start=1)],
        )
        conn.executemany(
            "INSERT INTO policy_issues (review_id, seq, kind, level, policy_ids, reason, recommendation) VALUES (?,?,?,?,?,?,?)",
            [(rid, n, i["kind"], i["level"], _json(i.get("policy_ids", [])), i.get("reason", ""), i.get("recommendation", ""))
             for n, i in enumerate(review.get("issues", []), start=1)],
        )
    return rid


def latest_policy_review(db: Database) -> dict[str, Any] | None:
    """마지막 정책 관리 검토 — 정책 문제 목록과 서버 점검. 항목마다 운영자 결정이 가리킬 key 를 붙입니다."""
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM policy_reviews ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        issues = conn.execute("SELECT * FROM policy_issues WHERE review_id = ? ORDER BY seq", (row["id"],)).fetchall()
        servers = conn.execute("SELECT * FROM server_findings WHERE review_id = ? ORDER BY seq", (row["id"],)).fetchall()
    return {
        "id": row["id"],
        "generated_at": row["created_at"],
        "source": row["source"],
        "load_issues": json.loads(row["load_issues"]),
        "rules": json.loads(row["rules"]),
        "summary": row["summary"],
        "failed": bool(row["failed"]),
        "error": row["error"],
        "model": row["model"],
        "elapsed_sec": row["elapsed_sec"],
        "issues": [
            {"key": f"policy_issues/{i['id']}", "seq": i["seq"], "kind": i["kind"], "level": i["level"],
             "policy_ids": json.loads(i["policy_ids"]), "reason": i["reason"], "recommendation": i["recommendation"]}
            for i in issues
        ],
        "servers": {
            "source": row["servers_source"],
            "load_issues": json.loads(row["servers_load_issues"]),
            "findings": [
                {"key": f"server_findings/{s['id']}", "seq": s["seq"], "host": s["host"], "ip": s["ip"],
                 "state": json.loads(s["state"]), "matched": s["matched"], "level": s["level"], "reason": s["reason"],
                 "recommendation": s["recommendation"], "sources": json.loads(s["sources"]), "failed": bool(s["failed"]),
                 "error": s["error"], "elapsed_sec": s["elapsed_sec"], "gaps": json.loads(s["gaps"]),
                 "unjudged": json.loads(s["unjudged"]), "snapshot": json.loads(s["snapshot"])}
                for s in servers
            ],
        },
    }


# --- 수집 노드 -----------------------------------------------------------------


def _snapshot(r: Any) -> dict[str, Any]:
    return {"id": r["id"], "node": r["node"], "host": r["host"], "ip": r["ip"], "collected_at": r["collected_at"],
            "collected_by": r["collected_by"], "modules": json.loads(r["modules"]), "changes": json.loads(r["changes"])}


def latest_snapshot(db: Database, node: str) -> dict[str, Any] | None:
    """이 노드의 가장 늦은 수집 — 다음 수집의 바뀐 것을 셀 때 견줍니다."""
    with db.connection() as conn:
        r = conn.execute("SELECT * FROM server_snapshots WHERE node = ? ORDER BY collected_at DESC LIMIT 1", (node,)).fetchone()
    return _snapshot(r) if r else None


def save_snapshot(db: Database, snap: dict[str, Any]) -> tuple[int | None, bool]:
    """pipeline.snapshot_row 가 만든 수집 기록 한 건. 같은 노드 · 수집 시각이 이미 있으면 넣지 않습니다. → (id, 넣었는지)"""
    with db.transaction() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO server_snapshots (node, host, ip, collected_at, collected_by, file, modules, sections, changes, loaded_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (snap["node"], snap["host"], snap.get("ip", ""), _utc(snap["collected_at"]), snap.get("collected_by", ""), "",
             _json(snap.get("modules", {})), _json(snap.get("sections", {})), _json(snap.get("changes", [])), now()),
        )
        if cur.rowcount:
            return cur.lastrowid, True
        r = conn.execute("SELECT id FROM server_snapshots WHERE node = ? AND collected_at = ?",
                         (snap["node"], _utc(snap["collected_at"]))).fetchone()
        return (r["id"] if r else None), False


def pending_snapshots(db: Database, nodes: set[str]) -> list[dict[str, Any]]:
    """점검할 차례 — 노드마다 가장 늦은 수집 중 아직 판정하지 않은 것. 그사이 여러 번 왔어도 마지막 것만 봅니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT s.* FROM server_snapshots s WHERE s.node <> ''"
            " AND s.collected_at = (SELECT max(collected_at) FROM server_snapshots WHERE node = s.node)"
            " AND NOT EXISTS (SELECT 1 FROM node_findings f WHERE f.snapshot_id = s.id) ORDER BY s.node"
        ).fetchall()
    return [_snapshot(r) for r in rows if r["node"] in nodes]


def save_node_finding(db: Database, f: dict[str, Any], model: str) -> int:
    """pipeline.check_nodes 의 판정 한 건. 쌓기만 합니다."""
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO node_findings (node, snapshot_id, host, ip, state, matched, level, summary, gaps, unjudged, sources,"
            " failed, error, elapsed_sec, model, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (f["node"], f["snapshot_id"], f.get("host", ""), f.get("ip", ""), _json(f.get("state", {})), f.get("matched", ""),
             f.get("level"), f.get("summary", ""), _json(f.get("gaps", [])), _json(f.get("unjudged", [])),
             _json(list(dict.fromkeys(g["source"] for g in f.get("gaps", []) if g.get("source")))),
             int(f["failed"]), f.get("error"), f.get("elapsed_sec"), model, now()),
        ).lastrowid


def latest_node_findings(db: Database) -> list[dict[str, Any]]:
    """노드마다 마지막 판정과 그때 본 수집 — 정책 관리 화면의 서버 점검. 운영자 결정은 `node_findings/{id}` 를 가리킵니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT f.*, s.collected_at, s.collected_by, s.modules, s.changes FROM node_findings f"
            " JOIN server_snapshots s ON s.id = f.snapshot_id"
            " WHERE f.id = (SELECT max(id) FROM node_findings WHERE node = f.node) ORDER BY f.node"
        ).fetchall()
    return [{"key": f"node_findings/{r['id']}", "node": r["node"], "host": r["host"], "ip": r["ip"],
             "state": json.loads(r["state"]), "matched": r["matched"], "level": r["level"], "summary": r["summary"],
             "gaps": json.loads(r["gaps"]), "unjudged": json.loads(r["unjudged"]), "sources": json.loads(r["sources"]),
             "failed": bool(r["failed"]), "error": r["error"], "elapsed_sec": r["elapsed_sec"], "created_at": r["created_at"],
             "snapshot": {"collected_at": r["collected_at"], "collected_by": r["collected_by"],
                          "modules": json.loads(r["modules"]), "changes": json.loads(r["changes"])}}
            for r in rows]


def node_history(db: Database, node: str, limit: int = 20) -> dict[str, Any]:
    """노드 화면 — 최근 수집(바뀐 것) · 판정 등급 기록과 가장 늦은 수집의 모듈 상태."""
    with db.connection() as conn:
        snaps = conn.execute("SELECT * FROM server_snapshots WHERE node = ? ORDER BY collected_at DESC LIMIT ?", (node, limit)).fetchall()
        findings = conn.execute("SELECT f.id, f.snapshot_id, f.level, f.failed, f.summary, f.created_at FROM node_findings f"
                                " WHERE f.node = ? ORDER BY f.id DESC LIMIT ?", (node, limit)).fetchall()
    return {
        "latest": _snapshot(snaps[0]) if snaps else None,
        "snapshots": [{"id": r["id"], "collected_at": r["collected_at"], "changes": json.loads(r["changes"])} for r in snaps],
        "findings": [{"key": f"node_findings/{r['id']}", "snapshot_id": r["snapshot_id"], "level": r["level"],
                      "failed": bool(r["failed"]), "summary": r["summary"], "created_at": r["created_at"]} for r in findings],
    }


# --- 로그 감시 ---------------------------------------------------------------


def save_monitor_run(db: Database, run: dict[str, Any], model: str,
                     since: str | None = None, until: str | None = None) -> int:
    """pipeline.monitor 결과 1회를 쌓습니다. → monitor_runs.id"""
    with db.transaction() as conn:
        rid = conn.execute(
            "INSERT INTO monitor_runs (source, load_issues, since, until, last_event_at, model, created_at) VALUES (?,?,?,?,?,?,?)",
            (str(run.get("source", "")), _json(run.get("load_issues", [])), _utc(since), _utc(until),
             _utc(run.get("last_event_at")), model, now()),
        ).lastrowid
        conn.executemany(
            "INSERT INTO event_findings (run_id, user, subject, first_event_at, last_event_at, events, level, reason,"
            " recommendation, sources, failed, error, elapsed_sec) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(rid, f["user"], f.get("subject", ""), _utc(f["first_event_at"]), _utc(f["last_event_at"]), f.get("events", ""),
              f.get("level"), f.get("reason", ""), f.get("recommendation", ""), _json(f.get("sources", [])),
              int(f["failed"]), f.get("error"), f.get("elapsed_sec"))
             for f in run.get("findings", [])],
        )
    return rid


def next_monitor_since(db: Database) -> datetime | None:
    """다음 로그 감시의 시작점 — 지금까지 읽은 로그 중 가장 늦은 시각. 감시한 적이 없으면 None"""
    with db.connection() as conn:
        last = conn.execute("SELECT max(last_event_at) FROM monitor_runs").fetchone()[0]
    return datetime.fromisoformat(last) if last else None


def monitor_findings(db: Database) -> dict[str, Any] | None:
    """쌓인 로그 감시 판정 전부와 마지막 감시 실행. 감시한 적이 없으면 None"""
    with db.connection() as conn:
        run = conn.execute("SELECT * FROM monitor_runs ORDER BY id DESC LIMIT 1").fetchone()
        if run is None:
            return None
        last = conn.execute("SELECT max(last_event_at) FROM monitor_runs").fetchone()[0]
        rows = conn.execute("SELECT * FROM event_findings ORDER BY id").fetchall()
    return {
        "generated_at": run["created_at"],
        "source": run["source"],
        "load_issues": json.loads(run["load_issues"]),
        "last_event_at": last,
        "findings": [
            {"key": f"event_findings/{r['id']}", "id": f"{r['user']}@{r['last_event_at']}", "user": r["user"],
             "subject": r["subject"], "first_event_at": r["first_event_at"], "last_event_at": r["last_event_at"],
             "events": r["events"], "level": r["level"], "reason": r["reason"], "recommendation": r["recommendation"],
             "sources": json.loads(r["sources"]), "failed": bool(r["failed"]), "error": r["error"],
             "elapsed_sec": r["elapsed_sec"]}
            for r in rows
        ],
    }


# --- 질의 기록 ---------------------------------------------------------------

QA_KINDS = ("policy", "logs")


def save_qa(db: Database, kind: str, question: str, result: dict[str, Any], model: str, asker: User) -> int:
    """정책 질의(rag_chain 의 Answer) · 로그 질의(pipeline.ask_logs) 1건을 남깁니다."""
    if kind not in QA_KINDS:
        raise ValueError(f"kind 는 {', '.join(QA_KINDS)} 중 하나입니다")
    with db.transaction() as conn:
        return conn.execute(
            "INSERT INTO qa_records (kind, question, answer, sources, criteria, facts, evidence, failed, error, model,"
            " elapsed_sec, asker_id, asker_name, asker_department, asked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (kind, question, result.get("answer", ""), _json(result.get("sources", [])), _json(result.get("criteria", {})),
             _json(result["facts"]) if result.get("facts") is not None else None, _json(result.get("evidence", [])),
             int(bool(result.get("failed"))), result.get("error"), model, result.get("elapsed_sec"),
             asker.id, asker.display_name, asker.department, now()),
        ).lastrowid


def my_qa(db: Database, asker: User, kind: str, limit: int = 50) -> list[dict[str, Any]]:
    """내 질의 기록 (최근 것부터). 다른 사람의 기록은 돌려주지 않습니다."""
    with db.connection() as conn:
        rows = conn.execute(
            "SELECT * FROM qa_records WHERE asker_id = ? AND kind = ? ORDER BY id DESC LIMIT ?", (asker.id, kind, limit)
        ).fetchall()
    out = []
    for r in rows:
        record = dict(r)
        for k in ("sources", "criteria", "evidence"):
            record[k] = json.loads(record[k])
        record["facts"] = json.loads(record["facts"]) if record["facts"] is not None else None
        record["failed"] = bool(record["failed"])
        out.append(record)
    return out
