"""SQLite storage for the labeling platform.

One file, one connection pool guarded by a lock. The dataset is small
(hundreds of tasks, tens of annotators), so simplicity beats cleverness here.
"""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

DB_PATH = os.environ.get("LABELER_DB", "/root/labeler/data/labeler.db")

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    role       TEXT NOT NULL DEFAULT 'annotator',   -- admin | annotator
    status     TEXT NOT NULL DEFAULT 'active',      -- active | paused
    color      TEXT NOT NULL DEFAULT '#6558dc',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    ord         INTEGER NOT NULL,
    payload     TEXT NOT NULL,          -- JSON: the LabelingTask as the frontend sees it
    required    INTEGER NOT NULL DEFAULT 3,
    is_control  INTEGER NOT NULL DEFAULT 0,
    control_answer TEXT,                -- yes | no | unsure ; NULL until the admin labels it
    meta        TEXT,                   -- JSON: provenance (input_text, hypothesis, ...)
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
    task_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    value       TEXT NOT NULL,
    task_type   TEXT NOT NULL DEFAULT 'boolean',
    answered_at TEXT NOT NULL,
    ms_spent    INTEGER,
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_annotations_task ON annotations(task_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user ON annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ord ON tasks(ord);
"""

DEFAULT_SETTINGS = {
    "project": "Произношение бренда: ООО МФК Быстроденьги",
    "default_overlap": "3",
    # How many regular tasks between two honeypots in an annotator queue.
    "honeypot_every": "7",
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.executescript(SCHEMA)
            for key, value in DEFAULT_SETTINGS.items():
                _conn.execute(
                    "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (key, value)
                )
            _conn.commit()
        return _conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    conn = connect()
    with _lock:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def get_setting(key: str, default: str = "") -> str:
    row = connect().execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    with tx() as conn:
        conn.execute(
            "INSERT INTO settings(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, str(value)),
        )


PALETTE = [
    "#6558dc", "#2f9a6b", "#e7795d", "#4388c9", "#b45bad",
    "#d09737", "#6c7a89", "#c9556e", "#3aa8a0", "#8a6ad4",
]


def make_token() -> str:
    # Short enough to paste into a chat, long enough not to be guessed.
    return secrets.token_urlsafe(9)


def slugify(name: str) -> str:
    keep = [c if c.isalnum() else "-" for c in name.lower()]
    slug = "".join(keep).strip("-").replace("--", "-")
    return slug or "user"


def create_user(name: str, role: str = "annotator", user_id: str | None = None) -> dict[str, Any]:
    conn = connect()
    base = user_id or slugify(name)
    uid = base
    n = 2
    while conn.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone():
        uid = f"{base}-{n}"
        n += 1
    count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    token = make_token()
    with tx() as c:
        c.execute(
            "INSERT INTO users(id, name, token, role, status, color, created_at) "
            "VALUES (?, ?, ?, ?, 'active', ?, ?)",
            (uid, name, token, role, PALETTE[count % len(PALETTE)], now()),
        )
    return dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())


def user_by_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    row = connect().execute("SELECT * FROM users WHERE token = ?", (token,)).fetchone()
    return dict(row) if row else None


def all_users() -> list[dict[str, Any]]:
    return [dict(r) for r in connect().execute("SELECT * FROM users ORDER BY role DESC, created_at")]


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    """The shape the frontend's AppUser expects (never leaks the token)."""
    return {
        "id": row["id"],
        "name": row["name"],
        "email": f'{row["id"]}@labeler.local',
        "role": row["role"],
        "status": row["status"],
        "color": row["color"],
    }


def task_row_to_payload(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    payload = json.loads(row["payload"])
    payload["requiredAnnotations"] = row["required"]
    return payload


def all_tasks() -> list[dict[str, Any]]:
    return [dict(r) for r in connect().execute("SELECT * FROM tasks ORDER BY ord, id")]


def annotations_for_export() -> list[dict[str, Any]]:
    rows = connect().execute(
        "SELECT task_id, user_id, value, task_type, answered_at, ms_spent FROM annotations "
        "ORDER BY answered_at"
    )
    return [
        {
            "taskId": r["task_id"],
            "userId": r["user_id"],
            "value": r["value"],
            "taskType": r["task_type"],
            "answeredAt": r["answered_at"],
            "msSpent": r["ms_spent"],
        }
        for r in rows
    ]
