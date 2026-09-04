#!/usr/bin/env python3
"""Admin CLI for the TTS labeling platform.

Everything the browser UI does can also be driven from here: importing tasks,
creating annotator links, flagging honeypots and exporting results.

    python3 cli.py users
    python3 cli.py import --predictions .../predictions.jsonl --bucket brand_mfk
    python3 cli.py pick-honeypots --count 15
    python3 cli.py export --csv -o /root/labeler/data/results.csv
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import shutil
import sys
from pathlib import Path
from typing import Any, Iterable

sys.path.insert(0, str(Path(__file__).resolve().parent))

import db  # noqa: E402

DEFAULT_QUESTION = 'Правильно ли в аудио произнесена фраза "ООО МФК Быстроденьги"?'
DEFAULT_HINT = (
    "Эталон: «о-о-о эм-фэ-ка бы́стро де́ньги» — сначала три отдельные буквы «О», "
    "затем побуквенно «эм фэ ка», затем «быстро деньги». "
    "Отвечайте «Нет», если слышите: слитное «оо» вместо трёх «О»; пропущенную или лишнюю букву; "
    "невнятный слог вместо побуквенного чтения — «мэфэка», «эмфка», «нфк»; "
    "«быстроденьги» одним смазанным словом или «быстрые деньги». "
    "Оценивайте только эту фразу — не голос, не интонацию и не качество записи. "
    "«Не разобрать» — если фразу физически не слышно."
)


def base_url() -> str:
    return os.environ.get("LABELER_PUBLIC_URL", "").rstrip("/")


def print_user(row: dict[str, Any]) -> None:
    link = f"{base_url()}/?t={row['token']}"
    print(f"  {row['role']:<9} {row['name']:<24} {row['status']:<7} {link}")


# --------------------------------------------------------------------------- users


def cmd_add_user(args: argparse.Namespace) -> None:
    for name in args.names:
        created = db.create_user(name, role=args.role)
        print_user(created)


def cmd_users(_: argparse.Namespace) -> None:
    users = db.all_users()
    if not users:
        print("Пользователей пока нет. Создайте: cli.py add-user 'Имя'")
        return
    print(f"Пользователей: {len(users)}")
    for u in users:
        print_user(u)


def cmd_reset_token(args: argparse.Namespace) -> None:
    token = db.make_token()
    with db.tx() as conn:
        cur = conn.execute("UPDATE users SET token = ? WHERE id = ?", (token, args.user_id))
        if cur.rowcount == 0:
            sys.exit(f"Нет пользователя {args.user_id}")
    print(f"{base_url()}/?t={token}")


# --------------------------------------------------------------------------- import


def read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"  пропущена строка {line_no}: {exc}", file=sys.stderr)


def dig(record: dict[str, Any], dotted: str) -> Any:
    node: Any = record
    for part in dotted.split("."):
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    return node


def resolve_audio(record: dict[str, Any], audio_root: Path | None) -> Path | None:
    raw = record.get("audio_path") or record.get("audio") or record.get("wav")
    if raw:
        candidate = Path(str(raw))
        if not candidate.is_absolute() and audio_root:
            candidate = audio_root / candidate
        if candidate.is_file():
            return candidate.resolve()
        if audio_root:
            fallback = audio_root / candidate.name
            if fallback.is_file():
                return fallback.resolve()
    if audio_root and record.get("id"):
        for ext in (".wav", ".WAV"):
            fallback = audio_root / f"{record['id']}{ext}"
            if fallback.is_file():
                return fallback.resolve()
    return None


def opaque_name(batch: str, task_id: str) -> str:
    """Filename that hides which batch an audio came from (blind labeling)."""
    return hashlib.sha1(f"{batch}|{task_id}".encode()).hexdigest()[:16] + ".wav"


def cmd_import(args: argparse.Namespace) -> None:
    path = Path(args.predictions).expanduser()
    if not path.is_file():
        sys.exit(f"Нет файла {path}")
    audio_root = Path(args.audio_root).expanduser().resolve() if args.audio_root else None
    media_dir = Path(args.media_dir).expanduser().resolve() if args.media_dir else None
    if media_dir:
        media_dir.mkdir(parents=True, exist_ok=True)

    if args.replace:
        with db.tx() as conn:
            conn.execute("DELETE FROM annotations")
            conn.execute("DELETE FROM tasks")
        print("Старые задания и ответы удалены (--replace)")

    conn = db.connect()
    start_ord = (conn.execute("SELECT COALESCE(MAX(ord), 0) AS m FROM tasks").fetchone()["m"]) + 1

    overlap = args.overlap or int(db.get_setting("default_overlap", "3"))
    imported = skipped_bucket = skipped_audio = 0
    rows: list[tuple[Any, ...]] = []

    for record in read_jsonl(path):
        if args.bucket:
            bucket = dig(record, args.bucket_field)
            if bucket != args.bucket:
                skipped_bucket += 1
                continue
        wav = resolve_audio(record, audio_root)
        if wav is None:
            skipped_audio += 1
            print(f"  ! нет аудио для {record.get('id')}", file=sys.stderr)
            continue

        raw_id = str(record.get("id") or wav.stem)
        task_id = f"{args.batch}:{raw_id}" if args.batch else raw_id
        # Copy out of the (read-only) benchmark tree under an opaque name so the
        # annotator cannot tell which batch a clip belongs to.
        if media_dir:
            served = media_dir / opaque_name(args.batch or "", raw_id)
            if not served.exists():
                shutil.copy2(wav, served)
        else:
            served = wav
        text = (
            record.get(args.text_field)
            or record.get("reference_text")
            or record.get("input_text")
            or ""
        )
        payload = {
            "id": task_id,
            "type": "boolean",
            "text": text,
            "question": args.question,
            "hint": args.hint,
            "audio": {"src": f"/audio{served.as_posix()}", "label": "Аудио"},
        }
        meta = {
            "batch": args.batch,
            "source_id": raw_id,
            "input_text": record.get("input_text"),
            "reference_text": record.get("reference_text"),
            "hypothesis": record.get("hypothesis"),
            "focus_reference": dig(record, "metrics.focus.reference"),
            "focus_hypothesis": dig(record, "metrics.focus.hypothesis"),
            "focus_exact": dig(record, "metrics.focus.exact"),
            "origin_audio": wav.as_posix(),
            "served_audio": served.as_posix(),
            "groups": record.get("groups"),
        }
        rows.append(
            (task_id, start_ord + imported, json.dumps(payload, ensure_ascii=False), overlap,
             json.dumps(meta, ensure_ascii=False), db.now())
        )
        imported += 1

    if not rows:
        sys.exit("Нечего импортировать — проверьте --bucket и --audio-root")

    with db.tx() as c:
        c.executemany(
            "INSERT INTO tasks(id, ord, payload, required, meta, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, "
            "required = excluded.required, meta = excluded.meta",
            rows,
        )
    print(
        f"Импортировано заданий: {imported} (перекрытие {overlap}). "
        f"Пропущено по bucket: {skipped_bucket}, без аудио: {skipped_audio}."
    )
    total = db.connect().execute("SELECT COUNT(*) AS c FROM tasks").fetchone()["c"]
    print(f"Всего заданий в базе: {total}")


# --------------------------------------------------------------------------- honeypots


def cmd_pick_honeypots(args: argparse.Namespace) -> None:
    conn = db.connect()
    if args.ids:
        chosen = list(args.ids)
    else:
        pool = [r["id"] for r in conn.execute("SELECT id FROM tasks ORDER BY ord, id")]
        if len(pool) < args.count:
            sys.exit(f"В базе только {len(pool)} заданий, нужно минимум {args.count}")
        rng = random.Random(args.seed)
        chosen = sorted(rng.sample(pool, args.count))
    with db.tx() as c:
        if args.exclusive:
            c.execute("UPDATE tasks SET is_control = 0, control_answer = NULL")
        c.executemany("UPDATE tasks SET is_control = 1 WHERE id = ?", [(i,) for i in chosen])
    print(f"Помечено контрольными: {len(chosen)}")
    for task_id in chosen:
        print(f"  {task_id}")
    print("\nТеперь задайте эталонные ответы: откройте платформу под админом → раздел «Контроль».")


STRATA: list[tuple[str, str]] = [
    # (label, regex over metrics.focus.hypothesis)
    ("чисто", r"^\s*ооо\s+мфк\s+быстро\s+деньги\s*$"),
    ("явный брак", r"нфк|мво|быстрые|быстроденьги|вооо"),
    ("спорно \u00abвоо\u00bb", r"^\s*в[оа]{1,2}\s*мфк|^\s*в[оа]{1,2}\s+мфк"),
]


def cmd_suggest_honeypots(args: argparse.Namespace) -> None:
    """Stratified honeypot pick: clean / clearly broken / disputed."""
    rows = db.connect().execute("SELECT id, payload, meta FROM tasks ORDER BY ord, id").fetchall()
    buckets: dict[str, list[dict[str, Any]]] = {label: [] for label, _ in STRATA}
    buckets["прочее"] = []

    for row in rows:
        meta = json.loads(row["meta"]) if row["meta"] else {}
        focus = (meta.get("focus_hypothesis") or "").strip().lower()
        placed = False
        for label, pattern in STRATA:
            if re.search(pattern, focus):
                buckets[label].append({"id": row["id"], "focus": focus, "meta": meta})
                placed = True
                break
        if not placed:
            buckets["прочее"].append({"id": row["id"], "focus": focus, "meta": meta})

    rng = random.Random(args.seed)
    order = [label for label, _ in STRATA] + ["прочее"]
    for label in order:
        rng.shuffle(buckets[label])

    chosen: list[dict[str, Any]] = []
    while len(chosen) < args.count:
        added = False
        for label in order:
            if len(chosen) >= args.count:
                break
            if buckets[label]:
                item = buckets[label].pop()
                item["stratum"] = label
                chosen.append(item)
                added = True
        if not added:
            break

    if args.apply:
        with db.tx() as conn:
            if args.exclusive:
                conn.execute("UPDATE tasks SET is_control = 0, control_answer = NULL")
            conn.executemany(
                "UPDATE tasks SET is_control = 1 WHERE id = ?", [(c["id"],) for c in chosen]
            )

    print(f"Наполнение страт: " + ", ".join(f"{label}={len(buckets[label])}" for label in order))
    print(f"Отобрано контрольных: {len(chosen)}"
          + (" (помечены в базе)" if args.apply else " (только предпросмотр, добавьте --apply)"))
    print()
    print(f"{'#':<3} {'страта':<16} {'id':<40} {'ASR на месте бренда':<32} аудио")
    for i, item in enumerate(sorted(chosen, key=lambda c: (c["stratum"], c["id"])), 1):
        print(f"{i:<3} {item['stratum']:<16} {item['id']:<40} {item['focus'][:30]:<32} "
              f"{item['meta'].get('origin_audio', '')}")
    print()
    print("Эталонные ответы не проставлены — их задаёт человек в разделе «Контроль».")


def cmd_set_control(args: argparse.Namespace) -> None:
    value = None if args.value == "clear" else args.value
    with db.tx() as conn:
        cur = conn.execute(
            "UPDATE tasks SET is_control = 1, control_answer = ? WHERE id = ?",
            (value, args.task_id),
        )
        if cur.rowcount == 0:
            sys.exit(f"Нет задания {args.task_id}")
    print(f"{args.task_id} → эталон {value or 'сброшен'}")


def cmd_controls(_: argparse.Namespace) -> None:
    rows = db.connect().execute(
        "SELECT id, control_answer, payload FROM tasks WHERE is_control = 1 ORDER BY ord, id"
    ).fetchall()
    if not rows:
        print("Контрольных заданий нет.")
        return
    labeled = sum(1 for r in rows if r["control_answer"])
    print(f"Контрольных: {len(rows)}, с эталоном: {labeled}")
    for r in rows:
        text = json.loads(r["payload"]).get("text", "")[:60]
        print(f"  {r['id']:<28} {r['control_answer'] or '—':<7} {text}")


# --------------------------------------------------------------------------- output


def cmd_stats(_: argparse.Namespace) -> None:
    conn = db.connect()
    tasks = conn.execute("SELECT COUNT(*) AS c FROM tasks").fetchone()["c"]
    controls = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE is_control = 1").fetchone()["c"]
    anns = conn.execute("SELECT COUNT(*) AS c FROM annotations").fetchone()["c"]
    done = conn.execute(
        "SELECT COUNT(*) AS c FROM (SELECT t.id FROM tasks t JOIN annotations a ON a.task_id = t.id "
        "GROUP BY t.id HAVING COUNT(*) >= t.required)"
    ).fetchone()["c"]
    print(f"Проект:        {db.get_setting('project')}")
    print(f"Задания:       {tasks} (контрольных {controls})")
    print(f"Ответы:        {anns}")
    print(f"Закрыто:       {done}/{tasks} заданий набрали нужное перекрытие")
    print("По разметчикам:")
    for r in conn.execute(
        "SELECT u.name, u.id, COUNT(a.task_id) AS n FROM users u "
        "LEFT JOIN annotations a ON a.user_id = u.id WHERE u.role = 'annotator' "
        "GROUP BY u.id ORDER BY n DESC"
    ):
        print(f"  {r['name']:<24} {r['n']}")


def cmd_export(args: argparse.Namespace) -> None:
    import app as api  # imported lazily: pulls fastapi

    admin = db.connect().execute("SELECT * FROM users WHERE role = 'admin' LIMIT 1").fetchone()
    if not admin:
        sys.exit("Нет админа — создайте: cli.py add-user 'Имя' --role admin")

    class FakeRequest:
        headers = {"x-token": admin["token"]}
        query_params: dict[str, str] = {}

    response = api.export(FakeRequest(), format="csv" if args.csv else "json")
    body = response.body
    if args.out:
        Path(args.out).write_bytes(body)
        print(f"Записано: {args.out} ({len(body)} байт)")
    else:
        sys.stdout.write(body.decode("utf-8-sig" if args.csv else "utf-8"))


def cmd_set(args: argparse.Namespace) -> None:
    db.set_setting(args.key, args.value)
    print(f"{args.key} = {args.value}")


# --------------------------------------------------------------------------- main


def main() -> None:
    parser = argparse.ArgumentParser(description="Админ-CLI платформы разметки")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("add-user", help="создать пользователя и выдать ссылку")
    p.add_argument("names", nargs="+")
    p.add_argument("--role", choices=["annotator", "admin"], default="annotator")
    p.set_defaults(func=cmd_add_user)

    p = sub.add_parser("users", help="список пользователей со ссылками")
    p.set_defaults(func=cmd_users)

    p = sub.add_parser("reset-token", help="выдать новую ссылку пользователю")
    p.add_argument("user_id")
    p.set_defaults(func=cmd_reset_token)

    p = sub.add_parser("import", help="импорт заданий из predictions.jsonl")
    p.add_argument("--predictions", required=True)
    p.add_argument("--bucket", default=None, help="значение фильтра, напр. brand_mfk")
    p.add_argument("--bucket-field", default="groups.bucket")
    p.add_argument("--audio-root", default=None)
    p.add_argument("--text-field", default="reference_text")
    p.add_argument("--question", default=DEFAULT_QUESTION)
    p.add_argument("--hint", default=DEFAULT_HINT)
    p.add_argument("--overlap", type=int, default=None)
    p.add_argument("--batch", default=None,
                   help="метка партии: попадает в id и meta, разметчику не видна")
    p.add_argument("--media-dir", default="/root/labeler/media",
                   help="куда скопировать wav под обезличенным именем ('' — не копировать)")
    p.add_argument("--replace", action="store_true", help="удалить прежние задания и ответы")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("pick-honeypots", help="пометить задания контрольными")
    p.add_argument("--count", type=int, default=15)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--ids", nargs="*", default=None, help="явный список id вместо случайных")
    p.add_argument("--exclusive", action="store_true", help="снять пометку с остальных")
    p.set_defaults(func=cmd_pick_honeypots)

    p = sub.add_parser("suggest-honeypots",
                       help="стратифицированный подбор ханипотов (чисто / брак / спорно)")
    p.add_argument("--count", type=int, default=15)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--apply", action="store_true", help="пометить отобранные контрольными")
    p.add_argument("--exclusive", action="store_true", help="снять пометку с остальных")
    p.set_defaults(func=cmd_suggest_honeypots)

    p = sub.add_parser("set-control", help="задать эталонный ответ контрольного задания")
    p.add_argument("task_id")
    p.add_argument("value", choices=["yes", "no", "unsure", "clear"])
    p.set_defaults(func=cmd_set_control)

    p = sub.add_parser("controls", help="список контрольных заданий")
    p.set_defaults(func=cmd_controls)

    p = sub.add_parser("stats", help="сводка по проекту")
    p.set_defaults(func=cmd_stats)

    p = sub.add_parser("export", help="выгрузка результатов")
    p.add_argument("--csv", action="store_true")
    p.add_argument("-o", "--out", default=None)
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("set", help="изменить настройку (project, default_overlap, honeypot_every)")
    p.add_argument("key")
    p.add_argument("value")
    p.set_defaults(func=cmd_set)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
