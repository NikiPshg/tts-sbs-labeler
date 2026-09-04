"""Backend for the TTS labeling platform.

Serves the built React frontend, the audio files, and a small REST API backed
by SQLite. Authentication is a per-user opaque token that lives in the URL
(`/?t=<token>`) and is then kept in the browser's localStorage.
"""

from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

import db

DIST_DIR = Path(os.environ.get("LABELER_DIST", "/root/labeler/app/dist"))
# Directories the server is allowed to read audio from. Read-only: the labeler
# never writes anywhere near the benchmark run directories.
AUDIO_ROOTS = [
    Path(p).resolve()
    for p in os.environ.get(
        "LABELER_AUDIO_ROOTS", "/root/labeler/media:/root/labeler/data/audio"
    ).split(":")
    if p
]

BOOL_VALUES = {"yes", "no", "unsure"}

app = FastAPI(title="TTS labeler", docs_url=None, redoc_url=None)


# --------------------------------------------------------------------------- auth


def current_user(request: Request, token: str | None = None) -> dict[str, Any]:
    raw = token or request.headers.get("x-token") or request.query_params.get("t") or ""
    user = db.user_by_token(raw.strip())
    if not user:
        raise HTTPException(status_code=401, detail="Неизвестный код доступа")
    if user["status"] != "active" and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Доступ приостановлен администратором")
    return user


def require_admin(request: Request) -> dict[str, Any]:
    user = current_user(request)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Нужны права администратора")
    return user


# --------------------------------------------------------------------------- queue


def _rotation_offset(user_id: str, size: int) -> int:
    if size <= 0:
        return 0
    digest = hashlib.sha1(user_id.encode()).hexdigest()
    return int(digest, 16) % size


def build_queue(user_id: str) -> list[dict[str, Any]]:
    """Deterministic per-user task queue.

    Control tasks never enter the regular pool: the calibration set stays
    invisible to annotators. Only controls that were given a reference answer
    *and* promoted are sprinkled between the regular tasks. Regular tasks are
    handed out until the required overlap is reached; each annotator starts at
    a different offset so that parallel workers do not all pile onto the same
    first task.
    """
    conn = db.connect()
    tasks = db.all_tasks()
    counts = {
        r["task_id"]: r["n"]
        for r in conn.execute("SELECT task_id, COUNT(*) AS n FROM annotations GROUP BY task_id")
    }
    mine = {
        r["task_id"]
        for r in conn.execute("SELECT task_id FROM annotations WHERE user_id = ?", (user_id,))
    }

    controls = [
        t for t in tasks if t["is_control"] and t["control_answer"] and t["control_active"]
    ]
    regular = [t for t in tasks if not t["is_control"]]

    open_regular = [
        t for t in regular if t["id"] in mine or counts.get(t["id"], 0) < t["required"]
    ]
    offset = _rotation_offset(user_id, len(open_regular))
    rotated = open_regular[offset:] + open_regular[:offset]

    every = int(db.get_setting("honeypot_every", "7") or 0)
    out: list[dict[str, Any]] = []
    ci = 0
    for i, task in enumerate(rotated):
        out.append(task)
        if every and (i + 1) % every == 0 and ci < len(controls):
            out.append(controls[ci])
            ci += 1
    out.extend(controls[ci:])
    return out


def annotator_payload(task: dict[str, Any], user_id: str) -> dict[str, Any]:
    """Task as the annotator sees it: no honeypot marker, no reference answer."""
    payload = db.task_row_to_payload(task)
    payload["assigneeIds"] = [user_id]
    payload.pop("control", None)
    return payload


def admin_payload(task: dict[str, Any]) -> dict[str, Any]:
    payload = db.task_row_to_payload(task)
    payload["isControl"] = bool(task["is_control"])
    payload["controlAnswer"] = task["control_answer"]
    payload["controlActive"] = bool(task["control_active"])
    # The raw id carries the batch name, which would tell the admin which
    # variant a calibration clip came from. Reference them by an opaque code.
    payload["code"] = hashlib.sha1(task["id"].encode()).hexdigest()[:6]
    if task["meta"]:
        payload["meta"] = json.loads(task["meta"])
    return payload


# --------------------------------------------------------------------------- api


@app.get("/api/bootstrap")
def bootstrap(request: Request) -> dict[str, Any]:
    user = current_user(request)
    project = db.get_setting("project")
    overlap = int(db.get_setting("default_overlap", "3"))

    if user["role"] == "admin":
        tasks = db.all_tasks()
        return {
            "user": db.public_user(user),
            "project": project,
            "defaultOverlap": overlap,
            "users": [db.public_user(u) for u in db.all_users()],
            "tasks": [
                {**admin_payload(t), "assigneeIds": []} for t in tasks
            ],
            "annotations": db.annotations_for_export(),
            "quality": quality_report(),
            "controlPending": sum(1 for t in tasks if t["is_control"] and not t["control_answer"]),
            "controlActive": sum(1 for t in tasks if t["is_control"] and t["control_active"]),
        }

    queue = build_queue(user["id"])
    conn = db.connect()
    mine = [
        {
            "taskId": r["task_id"],
            "userId": r["user_id"],
            "value": r["value"],
            "taskType": r["task_type"],
            "answeredAt": r["answered_at"],
        }
        for r in conn.execute(
            "SELECT task_id, user_id, value, task_type, answered_at FROM annotations "
            "WHERE user_id = ?",
            (user["id"],),
        )
    ]
    return {
        "user": db.public_user(user),
        "project": project,
        "defaultOverlap": overlap,
        "users": [db.public_user(user)],
        "tasks": [annotator_payload(t, user["id"]) for t in queue],
        "annotations": mine,
    }


@app.post("/api/answer")
def answer(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    user = current_user(request)
    task_id = str(body.get("taskId") or "")
    value = str(body.get("value") or "")
    ms_spent = body.get("msSpent")

    row = db.connect().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Задание не найдено")
    task_type = json.loads(row["payload"]).get("type", "boolean")
    allowed = BOOL_VALUES if task_type == "boolean" else {"a", "b", "tie"}
    if value not in allowed:
        raise HTTPException(status_code=400, detail=f"Недопустимый ответ: {value}")

    with db.tx() as conn:
        conn.execute(
            "INSERT INTO annotations(task_id, user_id, value, task_type, answered_at, ms_spent) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(task_id, user_id) DO UPDATE SET "
            "value = excluded.value, answered_at = excluded.answered_at, ms_spent = excluded.ms_spent",
            (task_id, user["id"], value, task_type, db.now(), ms_spent),
        )
    return {"ok": True}


@app.post("/api/control")
def set_control(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Admin sets (or clears) the reference answer of a honeypot."""
    require_admin(request)
    task_id = str(body.get("taskId") or "")
    value = body.get("value")
    if value is not None and value not in BOOL_VALUES:
        raise HTTPException(status_code=400, detail=f"Недопустимый эталон: {value}")
    with db.tx() as conn:
        cur = conn.execute(
            "UPDATE tasks SET is_control = 1, control_answer = ? WHERE id = ?", (value, task_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Задание не найдено")
    return {"ok": True, "taskId": task_id, "controlAnswer": value}


@app.post("/api/control/flag")
def flag_control(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Mark or unmark a task as a honeypot without setting the reference answer."""
    require_admin(request)
    task_id = str(body.get("taskId") or "")
    is_control = 1 if body.get("isControl", True) else 0
    with db.tx() as conn:
        conn.execute(
            "UPDATE tasks SET is_control = ?, control_answer = CASE WHEN ? = 0 THEN NULL "
            "ELSE control_answer END WHERE id = ?",
            (is_control, is_control, task_id),
        )
    return {"ok": True}


@app.post("/api/users")
def add_user(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    require_admin(request)
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите имя")
    role = "admin" if body.get("role") == "admin" else "annotator"
    created = db.create_user(name, role=role)
    return {"user": db.public_user(created), "token": created["token"]}


@app.get("/api/users")
def list_users(request: Request) -> dict[str, Any]:
    require_admin(request)
    return {
        "users": [
            {**db.public_user(u), "token": u["token"], "link": f"/?t={u['token']}"}
            for u in db.all_users()
        ]
    }


@app.post("/api/users/toggle")
def toggle_user(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    require_admin(request)
    uid = str(body.get("userId") or "")
    with db.tx() as conn:
        conn.execute(
            "UPDATE users SET status = CASE status WHEN 'active' THEN 'paused' ELSE 'active' END "
            "WHERE id = ? AND role = 'annotator'",
            (uid,),
        )
    return {"ok": True}


@app.post("/api/settings")
def update_settings(request: Request, body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    require_admin(request)
    if "defaultOverlap" in body:
        overlap = max(1, min(7, int(body["defaultOverlap"])))
        db.set_setting("default_overlap", overlap)
        with db.tx() as conn:
            conn.execute("UPDATE tasks SET required = ? WHERE is_control = 0", (overlap,))
    if "project" in body:
        db.set_setting("project", str(body["project"]))
    return {"ok": True}


def quality_report() -> dict[str, Any]:
    """Per-annotator honeypot accuracy plus overall counts."""
    conn = db.connect()
    controls = {
        r["id"]: r["control_answer"]
        for r in conn.execute(
            "SELECT id, control_answer FROM tasks "
            "WHERE is_control = 1 AND control_answer IS NOT NULL AND control_active = 1"
        )
    }
    per_user: dict[str, dict[str, Any]] = {}
    for r in conn.execute("SELECT task_id, user_id, value FROM annotations"):
        if r["task_id"] not in controls:
            continue
        bucket = per_user.setdefault(r["user_id"], {"checked": 0, "correct": 0, "misses": []})
        bucket["checked"] += 1
        if r["value"] == controls[r["task_id"]]:
            bucket["correct"] += 1
        else:
            bucket["misses"].append(
                {"taskId": r["task_id"], "expected": controls[r["task_id"]], "got": r["value"]}
            )
    for bucket in per_user.values():
        bucket["accuracy"] = (
            round(100 * bucket["correct"] / bucket["checked"]) if bucket["checked"] else None
        )
    return {
        "controlsTotal": conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE is_control = 1"
        ).fetchone()["c"],
        "controlsActive": len(controls),
        "controlsLabeled": conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE is_control = 1 AND control_answer IS NOT NULL"
        ).fetchone()["c"],
        "perUser": per_user,
    }


@app.get("/api/quality")
def quality(request: Request) -> dict[str, Any]:
    require_admin(request)
    return quality_report()


@app.get("/api/export")
def export(request: Request, format: str = Query("json")) -> Response:
    require_admin(request)
    conn = db.connect()
    tasks = db.all_tasks()
    annotations = db.annotations_for_export()
    by_task: dict[str, list[dict[str, Any]]] = {}
    for a in annotations:
        by_task.setdefault(a["taskId"], []).append(a)

    controls = {t["id"]: t["control_answer"] for t in tasks if t["is_control"]}
    rows = []
    for t in tasks:
        payload = db.task_row_to_payload(t)
        votes = by_task.get(t["id"], [])
        tally = Counter(v["value"] for v in votes)
        ranked = tally.most_common()
        top = ranked[0] if ranked else None
        is_tie = len(ranked) > 1 and ranked[1][1] == ranked[0][1]
        rows.append(
            {
                "id": t["id"],
                "text": payload.get("text"),
                "audio": (payload.get("audio") or {}).get("src"),
                "isControl": bool(t["is_control"]),
                "controlAnswer": t["control_answer"],
                "required": t["required"],
                "collected": len(votes),
                "votes": {v["userId"]: v["value"] for v in votes},
                "tally": dict(tally),
                "consensus": None if (not top or is_tie) else top[0],
                "isTie": is_tie,
                "confidence": round(100 * top[1] / len(votes)) if votes and top else 0,
                "meta": json.loads(t["meta"]) if t["meta"] else None,
            }
        )

    if format == "csv":
        import csv
        import io

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            ["id", "text", "audio", "is_control", "control_answer", "collected",
             "consensus", "is_tie", "confidence", "yes", "no", "unsure"]
        )
        for r in rows:
            writer.writerow(
                [r["id"], r["text"], r["audio"], int(r["isControl"]), r["controlAnswer"] or "",
                 r["collected"], r["consensus"] or "", int(r["isTie"]), r["confidence"],
                 r["tally"].get("yes", 0), r["tally"].get("no", 0), r["tally"].get("unsure", 0)]
            )
        return Response(
            buf.getvalue().encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="labeler-results.csv"'},
        )

    return JSONResponse(
        {
            "project": db.get_setting("project"),
            "exportedAt": db.now(),
            "defaultOverlap": int(db.get_setting("default_overlap", "3")),
            "users": [db.public_user(u) for u in db.all_users()],
            "quality": quality_report(),
            "tasks": rows,
            "annotations": annotations,
            "controls": controls,
        },
        headers={"Content-Disposition": 'attachment; filename="labeler-results.json"'},
    )


# --------------------------------------------------------------------------- audio


@app.get("/audio/{path:path}")
def audio(path: str) -> FileResponse:
    target = Path("/" + path.lstrip("/")).resolve()
    if not any(target.is_relative_to(root) for root in AUDIO_ROOTS):
        raise HTTPException(status_code=403, detail="Путь вне разрешённых каталогов")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(target, media_type="audio/wav")


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    conn = db.connect()
    return {
        "ok": True,
        "tasks": conn.execute("SELECT COUNT(*) AS c FROM tasks").fetchone()["c"],
        "annotations": conn.execute("SELECT COUNT(*) AS c FROM annotations").fetchone()["c"],
        "users": conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"],
    }


# --------------------------------------------------------------------------- static

if (DIST_DIR / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str) -> FileResponse:
    candidate = (DIST_DIR / full_path).resolve()
    if full_path and candidate.is_file() and candidate.is_relative_to(DIST_DIR.resolve()):
        return FileResponse(candidate)
    index = DIST_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="Фронтенд ещё не собран (npm run build)")
    return FileResponse(index, media_type="text/html")
