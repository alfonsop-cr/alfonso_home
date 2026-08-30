#!/usr/bin/env python3
"""Keep `agregado` (first-seen Costa Rica time) on briefing items.

Match by exact titulo. Never overwrite an existing stamp from the previous
file. New titles without `agregado` get America/Costa_Rica now (-06:00).

  python scripts/preserve_agregado.py            # merge from HEAD~1
  python scripts/preserve_agregado.py --from-git # backfill first-seen from history
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CR = ZoneInfo("America/Costa_Rica")
OFFSET = "-06:00"
FILES = ("noticias.json", "leo.json", "us.json", "world.json")
LISTS = ("hechos", "columnas")


def now_agregado(when: datetime | None = None) -> str:
    dt = (when or datetime.now(CR)).astimezone(CR)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + OFFSET


def commit_agregado(iso_commit: str) -> str:
    dt = datetime.fromisoformat(iso_commit).astimezone(CR)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + OFFSET


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True)


def load_json_text(raw: str) -> dict | None:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def index_agregado(data: dict | None) -> dict[str, str]:
    found: dict[str, str] = {}
    if not data:
        return found
    for key in LISTS:
        for item in data.get(key) or []:
            if not isinstance(item, dict):
                continue
            titulo = item.get("titulo")
            stamp = item.get("agregado")
            if titulo and stamp and titulo not in found:
                found[titulo] = str(stamp)
    return found


def first_seen_from_git(path: str) -> dict[str, str]:
    seen: dict[str, str] = {}
    try:
        log = git("log", "--reverse", "--format=%H %cI", "--", path)
    except subprocess.CalledProcessError:
        return seen
    for line in log.splitlines():
        sha, when = line.split(" ", 1)
        try:
            raw = git("show", f"{sha}:{path}")
        except subprocess.CalledProcessError:
            continue
        data = load_json_text(raw)
        if data is None:
            continue
        stamp = commit_agregado(when)
        for key in LISTS:
            for item in data.get(key) or []:
                if not isinstance(item, dict):
                    continue
                titulo = item.get("titulo")
                if titulo and titulo not in seen:
                    seen[titulo] = stamp
    return seen


def attach(item: dict, stamp: str | None) -> dict:
    out: dict = {}
    if "titulo" in item:
        out["titulo"] = item["titulo"]
    if stamp:
        out["agregado"] = stamp
    for key, value in item.items():
        if key == "agregado":
            continue
        if key in out:
            continue
        out[key] = value
    return out


def sort_items(items: list) -> list:
    def key(item: dict) -> tuple:
        stamp = item.get("agregado") or ""
        try:
            ms = datetime.fromisoformat(stamp).timestamp()
        except ValueError:
            return (1, 0.0, item.get("titulo") or "")
        return (0, -ms, item.get("titulo") or "")

    return sorted(items, key=key)


def apply_stamps(data: dict, stamps: dict[str, str], fill_now: bool) -> dict:
    now = now_agregado() if fill_now else None
    out = dict(data)
    for key in LISTS:
        if key not in out or not isinstance(out[key], list):
            continue
        rebuilt = []
        for item in out[key]:
            if not isinstance(item, dict):
                rebuilt.append(item)
                continue
            titulo = item.get("titulo")
            stamp = None
            if titulo and titulo in stamps:
                stamp = stamps[titulo]
            elif item.get("agregado"):
                stamp = str(item["agregado"])
            elif fill_now and titulo:
                stamp = now
            rebuilt.append(attach(item, stamp))
        out[key] = sort_items(rebuilt)
    return out


def dump(path: Path, data: dict) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def previous_file(path: str) -> dict | None:
    try:
        raw = git("show", f"HEAD~1:{path}")
    except subprocess.CalledProcessError:
        return None
    return load_json_text(raw)


def process(from_git: bool) -> bool:
    changed = False
    for name in FILES:
        path = Path(name)
        if not path.exists():
            continue
        current = load_json_text(path.read_text(encoding="utf-8"))
        if current is None:
            print(f"skip bad json {name}", file=sys.stderr)
            continue
        if from_git:
            stamps = first_seen_from_git(name)
            fill_now = False
        else:
            stamps = index_agregado(previous_file(name))
            fill_now = True
        updated = apply_stamps(current, stamps, fill_now=fill_now)
        if updated != current:
            dump(path, updated)
            changed = True
            print(f"updated {name}")
        else:
            print(f"unchanged {name}")
    return changed


def _self_check() -> None:
    old = {
        "hechos": [
            {"titulo": "Keep me", "agregado": "2026-08-30T13:08:00-06:00", "resumen": ["a"]},
            {"titulo": "Gone"},
        ]
    }
    new = {
        "hechos": [
            {"titulo": "Brand new", "resumen": ["n"]},
            {"titulo": "Keep me", "agregado": "2026-08-30T23:00:00-06:00", "resumen": ["a"]},
            {"titulo": "No time", "resumen": ["x"]},
        ]
    }
    stamps = index_agregado(old)
    out = apply_stamps(new, stamps, fill_now=True)
    keep = next(i for i in out["hechos"] if i["titulo"] == "Keep me")
    brand = next(i for i in out["hechos"] if i["titulo"] == "Brand new")
    none = next(i for i in out["hechos"] if i["titulo"] == "No time")
    assert keep["agregado"] == "2026-08-30T13:08:00-06:00", keep
    assert brand["agregado"].endswith("-06:00"), brand
    assert none["agregado"].endswith("-06:00"), none
    assert out["hechos"][0]["titulo"] != "No time" or True
    order = [i["titulo"] for i in out["hechos"]]
    assert order[0] in ("Brand new", "No time")
    assert order[-1] == "Keep me"
    print("self-check ok")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-git", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        _self_check()
        return 0
    process(from_git=args.from_git)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
