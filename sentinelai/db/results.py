"""AI 결과 DB — 정책 관리 검토 · 로그 감시 판정 · 질의 기록.

pipeline 이 돌려준 dict 를 그대로 받아 쌓습니다. 행은 고치지 않습니다 (트리거).
권한 DB의 운영자 결정은 여기 행을 `policy_issues/{id}` · `event_findings/{id}` 로 가리킵니다.
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
        rid = conn.execute(
            "INSERT INTO policy_reviews (source, load_issues, rules, summary, failed, error, model, elapsed_sec, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (str(review.get("source", "")), _json(review.get("load_issues", [])), _json(review.get("rules", [])),
             review.get("summary", ""), int(review["failed"]), review.get("error"), model, review.get("elapsed_sec"), now()),
        ).lastrowid
        conn.executemany(
            "INSERT INTO policy_issues (review_id, seq, kind, level, policy_ids, reason, recommendation) VALUES (?,?,?,?,?,?,?)",
            [(rid, n, i["kind"], i["level"], _json(i.get("policy_ids", [])), i.get("reason", ""), i.get("recommendation", ""))
             for n, i in enumerate(review.get("issues", []), start=1)],
        )
    return rid


def latest_policy_review(db: Database) -> dict[str, Any] | None:
    """마지막 정책 관리 검토와 그 문제 목록. 문제마다 운영자 결정이 가리킬 key 를 붙입니다."""
    with db.connection() as conn:
        row = conn.execute("SELECT * FROM policy_reviews ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        issues = conn.execute("SELECT * FROM policy_issues WHERE review_id = ? ORDER BY seq", (row["id"],)).fetchall()
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
