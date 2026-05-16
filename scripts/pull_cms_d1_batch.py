#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def run(cmd: list[str], cwd: Path) -> str:
    print("")
    print("RUN:", " ".join(cmd))

    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if proc.returncode != 0:
        print("")
        print("FAILED")
        print("STDERR:")
        print(proc.stderr)
        print("STDOUT:")
        print(proc.stdout)
        raise SystemExit(proc.returncode)

    return proc.stdout


def parse_wrangle_json(raw: str) -> Any:
    raw = raw.strip()

    if not raw:
        return None

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    first_array = raw.find("[")
    first_object = raw.find("{")

    starts = [x for x in [first_array, first_object] if x >= 0]

    if not starts:
        return None

    return json.loads(raw[min(starts):])


def extract_rows(payload: Any) -> list[dict[str, Any]]:
    if payload is None:
        return []

    if isinstance(payload, list):
        out: list[dict[str, Any]] = []
        for item in payload:
            out.extend(extract_rows(item))
        return out

    if isinstance(payload, dict):
        if isinstance(payload.get("results"), list):
            return payload["results"]

        if isinstance(payload.get("result"), list):
            out: list[dict[str, Any]] = []
            for item in payload["result"]:
                out.extend(extract_rows(item))
            return out

        if isinstance(payload.get("result"), dict):
            return extract_rows(payload["result"])

    return []


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def d1(
    repo: Path,
    db: str,
    config: str,
    sql: str,
    remote: bool,
) -> list[dict[str, Any]]:
    cmd = ["npx", "wrangler", "d1", "execute", db]

    if remote:
        cmd.append("--remote")

    if config:
        cmd.extend(["-c", config])

    cmd.extend(["--json", "--command", sql])

    stdout = run(cmd, cwd=repo)
    payload = parse_wrangle_json(stdout)
    return extract_rows(payload)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("WROTE:", path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--db", default="inneranimalmedia-business")
    parser.add_argument("--config", default="wrangler.production.toml")
    parser.add_argument("--out", default="artifacts/cms_d1_pull")
    parser.add_argument("--local", action="store_true")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    out = repo / args.out
    remote = not args.local

    out.mkdir(parents=True, exist_ok=True)

    tables = d1(
        repo=repo,
        db=args.db,
        config=args.config,
        sql="""
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table'
          AND name LIKE 'cms_%'
        ORDER BY name;
        """,
        remote=remote,
    )

    write_json(out / "00_cms_tables.json", tables)

    all_results: dict[str, Any] = {
        "db": args.db,
        "mode": "remote" if remote else "local",
        "tables": [],
    }

    for table in tables:
        name = table["name"]
        quoted = q(name)

        print("")
        print("=" * 80)
        print("TABLE:", name)
        print("=" * 80)

        table_dir = out / "tables" / name
        table_dir.mkdir(parents=True, exist_ok=True)

        columns = d1(
            repo=repo,
            db=args.db,
            config=args.config,
            sql=f"PRAGMA table_info({quoted});",
            remote=remote,
        )

        indexes = d1(
            repo=repo,
            db=args.db,
            config=args.config,
            sql=f"PRAGMA index_list({quoted});",
            remote=remote,
        )

        foreign_keys = d1(
            repo=repo,
            db=args.db,
            config=args.config,
            sql=f"PRAGMA foreign_key_list({quoted});",
            remote=remote,
        )

        count_rows = d1(
            repo=repo,
            db=args.db,
            config=args.config,
            sql=f"SELECT COUNT(*) AS row_count FROM {quoted};",
            remote=remote,
        )

        sample_rows = d1(
            repo=repo,
            db=args.db,
            config=args.config,
            sql=f"SELECT * FROM {quoted} LIMIT 5;",
            remote=remote,
        )

        create_sql = table.get("sql")

        table_payload = {
            "name": name,
            "create_sql": create_sql,
            "columns": columns,
            "indexes": indexes,
            "foreign_keys": foreign_keys,
            "row_count": count_rows[0]["row_count"] if count_rows else None,
            "sample_rows": sample_rows,
        }

        write_json(table_dir / "create_sql.json", {"name": name, "sql": create_sql})
        write_json(table_dir / "columns.json", columns)
        write_json(table_dir / "indexes.json", indexes)
        write_json(table_dir / "foreign_keys.json", foreign_keys)
        write_json(table_dir / "row_count.json", count_rows)
        write_json(table_dir / "sample_rows.json", sample_rows)
        write_json(table_dir / "table_pull.json", table_payload)

        all_results["tables"].append(table_payload)

    write_json(out / "cms_d1_pull_all.json", all_results)

    print("")
    print("DONE")
    print("OUTPUT:", out)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("cancelled", file=sys.stderr)
        raise SystemExit(130)