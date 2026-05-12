#!/usr/bin/env python3
from __future__ import annotations

"""
Rebuild the entire agentsam_artifacts table from its current rows.

This is intentionally NOT filtered to plan artifacts.

What it does:
1. Reads PRAGMA table_info(agentsam_artifacts).
2. Pulls every row from agentsam_artifacts.
3. Writes a JSON backup report locally.
4. Generates a full D1 SQL rebuild:
   - CREATE backup table as agentsam_artifacts_backup_YYYYMMDD_HHMMSS
   - DROP TABLE agentsam_artifacts
   - CREATE TABLE agentsam_artifacts with the current canonical schema below
   - INSERT every pulled row back in, preserving IDs and all known columns
   - Normalizes missing new columns with safe defaults
5. Dry-run by default. Use --apply to execute.

Important:
- This only rebuilds D1 metadata rows.
- It does not delete, rewrite, copy, rename, or touch R2 objects.
- It does not hard-filter anything out.
- It preserves all pulled rows.
- It refuses to apply if zero rows are pulled unless --allow-empty is passed.

Usage:
  python3 scripts/rebuild_all_agentsam_artifacts.py
  python3 scripts/rebuild_all_agentsam_artifacts.py --apply
  python3 scripts/rebuild_all_agentsam_artifacts.py --apply --allow-empty

Optional env:
  IAM_D1_DB=inneranimalmedia-business
  IAM_WRANGLER_CONFIG=wrangler.production.toml
  IAM_D1_REMOTE=1
"""

import argparse
import datetime as dt
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path.cwd()
DEFAULT_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
DEFAULT_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
DEFAULT_REMOTE = os.getenv("IAM_D1_REMOTE", "1").lower() not in {"0", "false", "no"}

CANONICAL_CREATE_SQL = """
CREATE TABLE "agentsam_artifacts" (
  id TEXT PRIMARY KEY DEFAULT ('art_' || lower(hex(randomblob(8)))),
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  workspace_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  artifact_type TEXT NOT NULL DEFAULT 'html',
  r2_key TEXT NOT NULL,
  public_url TEXT,
  source TEXT NOT NULL,
  tags TEXT DEFAULT '[]',
  is_public INTEGER DEFAULT 0,
  file_size_bytes INTEGER,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  workspace_slug TEXT,
  project_key TEXT,
  artifact_status TEXT DEFAULT 'draft',
  visibility TEXT DEFAULT 'private',
  mime_type TEXT,
  content_hash TEXT,
  preview_r2_key TEXT,
  preview_url TEXT,
  thumbnail_r2_key TEXT,
  thumbnail_url TEXT,
  source_run_id TEXT,
  source_session_id TEXT,
  source_message_id TEXT,
  source_workflow_id TEXT,
  source_tool_key TEXT,
  source_model_key TEXT,
  validation_status TEXT DEFAULT 'untested',
  published_at INTEGER,
  archived_at INTEGER,
  metadata_json TEXT DEFAULT '{}',
  source_skill_id TEXT
);
""".strip()

CANONICAL_COLUMNS = [
    "id",
    "user_id",
    "tenant_id",
    "workspace_id",
    "name",
    "description",
    "artifact_type",
    "r2_key",
    "public_url",
    "source",
    "tags",
    "is_public",
    "file_size_bytes",
    "created_at",
    "updated_at",
    "workspace_slug",
    "project_key",
    "artifact_status",
    "visibility",
    "mime_type",
    "content_hash",
    "preview_r2_key",
    "preview_url",
    "thumbnail_r2_key",
    "thumbnail_url",
    "source_run_id",
    "source_session_id",
    "source_message_id",
    "source_workflow_id",
    "source_tool_key",
    "source_model_key",
    "validation_status",
    "published_at",
    "archived_at",
    "metadata_json",
    "source_skill_id",
]

TEXT_EXT_MIME = {
    ".html": ("html", "text/html;charset=UTF-8"),
    ".htm": ("html", "text/html;charset=UTF-8"),
    ".css": ("css", "text/css;charset=UTF-8"),
    ".js": ("javascript", "application/javascript;charset=UTF-8"),
    ".mjs": ("javascript", "application/javascript;charset=UTF-8"),
    ".json": ("json", "application/json"),
    ".md": ("markdown", "text/markdown;charset=UTF-8"),
    ".txt": ("text", "text/plain;charset=UTF-8"),
    ".svg": ("svg", "image/svg+xml"),
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".webp": ("image", "image/webp"),
    ".gif": ("image", "image/gif"),
    ".pdf": ("pdf", "application/pdf"),
    ".excalidraw": ("excalidraw", "application/json"),
}


def utc_stamp() -> str:
    return dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def wrangler_base(args: argparse.Namespace) -> list[str]:
    cmd = ["npx", "wrangler", "d1", "execute", args.db]
    if args.remote:
        cmd.append("--remote")
    cmd += ["-c", args.config]
    return cmd


def wrangler_json(args: argparse.Namespace, sql: str) -> list[dict[str, Any]]:
    cmd = wrangler_base(args) + ["--json", "--command", sql]
    if args.verbose:
        print("$", " ".join(shlex.quote(x) for x in cmd), file=sys.stderr)
    p = run(cmd)
    if p.returncode != 0:
        raise RuntimeError(f"wrangler JSON query failed\nSQL:\n{sql}\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")
    try:
        payload = json.loads(p.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Could not parse wrangler JSON output:\n{p.stdout}") from exc
    if isinstance(payload, list) and payload:
        first = payload[0]
        if isinstance(first, dict) and isinstance(first.get("results"), list):
            return first["results"]
    if isinstance(payload, dict) and isinstance(payload.get("results"), list):
        return payload["results"]
    return []


def wrangler_file(args: argparse.Namespace, sql: str) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
        tmp = f.name
    try:
        cmd = wrangler_base(args) + ["--file", tmp]
        if args.verbose:
            print("$", " ".join(shlex.quote(x) for x in cmd), file=sys.stderr)
        p = run(cmd)
        if p.returncode != 0:
            raise RuntimeError(f"wrangler apply failed\nTEMP_SQL={tmp}\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")
        return p.stdout
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def q(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def table_exists(args: argparse.Namespace, table: str) -> bool:
    rows = wrangler_json(args, f"SELECT name FROM sqlite_master WHERE type='table' AND name={q(table)};")
    return bool(rows)


def table_columns(args: argparse.Namespace) -> list[str]:
    rows = wrangler_json(args, "PRAGMA table_info(agentsam_artifacts);")
    return [str(r["name"]) for r in rows if r.get("name")]


def fetch_all_artifacts(args: argparse.Namespace, columns: list[str]) -> list[dict[str, Any]]:
    select_cols = ", ".join(f'"{c}"' for c in columns)
    rows = wrangler_json(
        args,
        f"""
        SELECT {select_cols}
        FROM agentsam_artifacts
        ORDER BY
          COALESCE(updated_at, 0) ASC,
          COALESCE(created_at, 0) ASC,
          id ASC;
        """,
    )
    return rows


def infer_artifact_type_and_mime(row: dict[str, Any]) -> tuple[str, str | None]:
    current_type = str(row.get("artifact_type") or "").strip()
    current_mime = row.get("mime_type")
    key = str(row.get("r2_key") or row.get("public_url") or row.get("name") or "").lower()

    ext = ""
    m = re.search(r"(\.[a-z0-9]+)(?:$|\?)", key)
    if m:
        ext = m.group(1)

    inferred_type, inferred_mime = TEXT_EXT_MIME.get(ext, ("other", None))
    artifact_type = current_type or inferred_type or "other"
    mime_type = str(current_mime).strip() if current_mime not in (None, "") else inferred_mime

    if artifact_type == "json" and key.endswith(".excalidraw"):
        artifact_type = "excalidraw"
        mime_type = "application/json"

    return artifact_type, mime_type


def safe_json_text(value: Any, default: str) -> str:
    if value is None or value == "":
        return default
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"))
    s = str(value).strip()
    try:
        parsed = json.loads(s)
        return json.dumps(parsed, separators=(",", ":"))
    except Exception:
        return default


def normalize_row(row: dict[str, Any], index: int) -> dict[str, Any]:
    out = {c: row.get(c) for c in CANONICAL_COLUMNS}
    artifact_type, mime_type = infer_artifact_type_and_mime(row)

    out["id"] = out.get("id") or f"art_rebuilt_{index:06d}"
    out["user_id"] = out.get("user_id") or "unknown_user"
    out["tenant_id"] = out.get("tenant_id") or "unknown_tenant"
    out["name"] = out.get("name") or Path(str(out.get("r2_key") or "")).name or f"Artifact {index}"
    out["artifact_type"] = artifact_type or "other"
    out["r2_key"] = out.get("r2_key") or f"artifacts/rebuilt/missing-r2-key/{out['id']}"
    out["source"] = out.get("source") or "recovered_artifact"

    out["tags"] = safe_json_text(out.get("tags"), "[]")
    out["metadata_json"] = safe_json_text(out.get("metadata_json"), "{}")
    out["is_public"] = int(out.get("is_public") or 0)
    out["artifact_status"] = out.get("artifact_status") or "draft"
    out["visibility"] = out.get("visibility") or ("public" if out["is_public"] else "private")
    out["mime_type"] = mime_type
    out["validation_status"] = out.get("validation_status") or "untested"
    out["public_url"] = out.get("public_url") or f"/api/artifacts/{out['id']}/content"

    now_unix = int(dt.datetime.now(dt.UTC).timestamp())
    out["created_at"] = out.get("created_at") or now_unix
    out["updated_at"] = out.get("updated_at") or now_unix

    return out


def insert_sql(row: dict[str, Any]) -> str:
    cols = ", ".join(f'"{c}"' for c in CANONICAL_COLUMNS)
    vals = ", ".join(q(row.get(c)) for c in CANONICAL_COLUMNS)
    return f"INSERT INTO agentsam_artifacts ({cols}) VALUES ({vals});"


def build_rebuild_sql(rows: list[dict[str, Any]], backup_table: str) -> str:
    inserts = "\n".join(insert_sql(row) for row in rows)
    # Cloudflare D1 import rejects explicit BEGIN/COMMIT/SAVEPOINT statements.
    # Wrangler import already wraps/rolls back failed imports, so keep this file as plain statements.
    return f"""
PRAGMA foreign_keys=OFF;

CREATE TABLE "{backup_table}" AS
SELECT *
FROM agentsam_artifacts;

DROP TABLE agentsam_artifacts;

{CANONICAL_CREATE_SQL}

{inserts}

PRAGMA foreign_keys=ON;
""".strip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Rebuild all agentsam_artifacts rows into the canonical schema.")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--config", default=DEFAULT_CONFIG)
    ap.add_argument("--remote", action=argparse.BooleanOptionalAction, default=DEFAULT_REMOTE)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--allow-empty", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    print("Rebuild ALL agentsam_artifacts")
    print(f"db={args.db} config={args.config} remote={args.remote} apply={args.apply}")

    if not table_exists(args, "agentsam_artifacts"):
        raise SystemExit("agentsam_artifacts does not exist")

    current_cols = table_columns(args)
    print(f"current_columns={len(current_cols)}")

    rows = fetch_all_artifacts(args, current_cols)
    print(f"pulled_rows={len(rows)}")

    if not rows and not args.allow_empty:
        raise SystemExit("Refusing to rebuild zero rows. Pass --allow-empty if this is intentional.")

    normalized = [normalize_row(r, i + 1) for i, r in enumerate(rows)]

    out_dir = ROOT / "reports" / "artifact-rebuild"
    out_dir.mkdir(parents=True, exist_ok=True)

    stamp = utc_stamp()
    backup_table = f"agentsam_artifacts_backup_{stamp}"
    json_path = out_dir / f"agentsam_artifacts_export_{stamp}.json"
    sql_path = out_dir / f"agentsam_artifacts_rebuild_all_{stamp}.sql"

    json_path.write_text(
        json.dumps(
            {
                "generated_at": dt.datetime.utcnow().isoformat() + "Z",
                "db": args.db,
                "remote": args.remote,
                "backup_table": backup_table,
                "current_columns": current_cols,
                "canonical_columns": CANONICAL_COLUMNS,
                "row_count": len(normalized),
                "rows": normalized,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    sql = build_rebuild_sql(normalized, backup_table)
    sql_path.write_text(sql, encoding="utf-8")

    type_counts: dict[str, int] = {}
    source_counts: dict[str, int] = {}
    for r in normalized:
        type_counts[str(r.get("artifact_type"))] = type_counts.get(str(r.get("artifact_type")), 0) + 1
        source_counts[str(r.get("source"))] = source_counts.get(str(r.get("source")), 0) + 1

    print(f"backup_table={backup_table}")
    print(f"wrote_json={json_path}")
    print(f"wrote_sql={sql_path}")
    print("artifact_type_counts=" + json.dumps(type_counts, sort_keys=True))
    print("source_counts_top=" + json.dumps(dict(sorted(source_counts.items(), key=lambda kv: kv[1], reverse=True)[:20]), sort_keys=True))

    if not args.apply:
        print("DRY RUN ONLY. Review the SQL, then rerun with --apply.")
        return 0

    print("Applying rebuild now...")
    stdout = wrangler_file(args, sql)
    print(stdout)

    verify = wrangler_json(
        args,
        """
        SELECT artifact_type, source, visibility, artifact_status, validation_status, COUNT(*) AS n
        FROM agentsam_artifacts
        GROUP BY artifact_type, source, visibility, artifact_status, validation_status
        ORDER BY n DESC
        LIMIT 50;
        """,
    )
    total = wrangler_json(args, "SELECT COUNT(*) AS n FROM agentsam_artifacts;")
    print("VERIFY_TOTAL=" + json.dumps(total, indent=2))
    print("VERIFY_GROUPS=" + json.dumps(verify, indent=2))
    print(f"backup_table={backup_table}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
