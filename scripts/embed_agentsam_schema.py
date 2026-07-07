#!/usr/bin/env python3
"""
embed_agentsam_schema.py
────────────────────────
Backfill NULL embeddings on Supabase **agentsam** schema tables using
OpenAI text-embedding-3-large @ **1536** dimensions (matches table DDL).

Legacy public.* Ollama 1024-dim backfill was removed; this is the canonical
agentsam-schema embed path (OpenAI text-embedding-3-large @ 1536).

Presets:
  agentsam_projects  — summary → embedding (active rows, status != archived)
  agentsam_memory    — content  → embedding (non-archived)

Usage (pretest — 3 rows, writes + cosine sanity check):
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py \\
    --table agentsam_projects --pretest

  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py \\
    --table agentsam_memory --pretest

Full backfill:
  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py \\
    --table agentsam_projects

  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py \\
    --table agentsam_memory

Dry-run (counts only):
  python3 scripts/embed_agentsam_schema.py --table agentsam_projects --dry-run

Requires: SUPABASE_DB_URL (session pooler :5432), OPENAI_API_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]

EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMS = 1536
DEFAULT_SCHEMA = "agentsam"
DEFAULT_BATCH = 16

TABLE_PRESETS: dict[str, dict[str, Any]] = {
    "agentsam_projects": {
        "schema": "agentsam",
        "text_col": "summary",
        "id_col": "id",
        "where": """
            embedding IS NULL
            AND summary IS NOT NULL
            AND length(trim(summary)) >= 20
            AND status IS DISTINCT FROM 'archived'
        """,
        "build_text": lambda row: str(row["summary"]).strip()[:4000],
        "after_update_sql": """
            UPDATE {fq}
            SET embedding = %s::vector,
                embedded_at = now(),
                embedding_dirty = false,
                embedding_model = %s
            WHERE id = %s
        """,
        "vector_slug": "agentsam_project",
    },
    "agentsam_memory": {
        "schema": "agentsam",
        "text_col": "content",
        "id_col": "id",
        "where": """
            embedding IS NULL
            AND content IS NOT NULL
            AND length(trim(content)) >= 20
            AND is_archived = false
        """,
        "build_text": lambda row: " | ".join(
            p
            for p in [
                f"[{row.get('memory_type')}]" if row.get("memory_type") else "",
                f"key:{row.get('memory_key')}" if row.get("memory_key") else "",
                str(row.get("title") or "").strip(),
                str(row.get("content") or "").strip()[:3500],
            ]
            if p
        )[:4000],
        "after_update_sql": """
            UPDATE {fq}
            SET embedding = %s::vector,
                embedded_at = now()
            WHERE id = %s
        """,
        "vector_slug": "agentsam_memory",
    },
}


def load_env_cloudflare() -> None:
    env_path = REPO_ROOT / ".env.cloudflare"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def require_db_url() -> str:
    load_env_cloudflare()
    url = (os.environ.get("SUPABASE_DB_URL") or "").strip()
    if not url:
        print(
            "Missing SUPABASE_DB_URL. Run:\n"
            "  ./scripts/with-cloudflare-env.sh python3 scripts/embed_agentsam_schema.py ...",
            file=sys.stderr,
        )
        sys.exit(1)
    if "db.dpmuvynqixblxsilnlut.supabase.co" in url:
        print(
            "SUPABASE_DB_URL uses direct db.* host (IPv6-only). "
            "Use aws-1-us-east-2.pooler.supabase.com:5432",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def require_openai_key() -> str:
    load_env_cloudflare()
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        print("Missing OPENAI_API_KEY (1536-dim OpenAI lane).", file=sys.stderr)
        sys.exit(1)
    return key


def sanitize_text(text: str) -> str:
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", str(text))
    return re.sub(r"\s{4,}", "   ", t).strip()


def post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 300) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def embed_openai(texts: list[str], *, timeout: int = 300, retries: int = 3) -> list[list[float]]:
    key = require_openai_key()
    clean = [sanitize_text(t) for t in texts]
    last_err: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            out = post_json(
                "https://api.openai.com/v1/embeddings",
                {"model": EMBED_MODEL, "input": clean, "dimensions": EMBED_DIMS},
                headers={"Authorization": f"Bearer {key}"},
                timeout=timeout,
            )
            rows = sorted(out["data"], key=lambda x: x["index"])
            vecs = [r["embedding"] for r in rows]
            if len(vecs) != len(clean):
                raise RuntimeError(f"OpenAI returned {len(vecs)} vectors for {len(clean)} inputs")
            for i, vec in enumerate(vecs):
                if len(vec) != EMBED_DIMS:
                    raise RuntimeError(f"Row {i}: expected {EMBED_DIMS} dims, got {len(vec)}")
            return vecs
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(min(2 * attempt, 10))

    raise SystemExit(f"OpenAI embed failed after {retries} attempts: {last_err}")


def fq_table(schema: str, table: str) -> str:
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", schema):
        raise ValueError(f"invalid schema: {schema}")
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", table):
        raise ValueError(f"invalid table: {table}")
    return f"{schema}.{table}"


def get_conn(db_url: str):
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        import subprocess

        subprocess.run([sys.executable, "-m", "pip", "install", "psycopg2-binary"], check=False)
        import psycopg2
        import psycopg2.extras

    conn = psycopg2.connect(db_url, connect_timeout=20)
    conn.autocommit = False
    return conn, psycopg2.extras.RealDictCursor


def count_pending(cur, fq: str, where: str) -> int:
    cur.execute(f"SELECT COUNT(*) AS c FROM {fq} WHERE {where}")
    row = cur.fetchone()
    return int(row["c"] if row else 0)


def fetch_rows(cur, fq: str, preset: dict, limit: int) -> list[dict]:
    id_col = preset["id_col"]
    cur.execute(
        f"""
        SELECT *
        FROM {fq}
        WHERE {preset["where"]}
        ORDER BY updated_at DESC NULLS LAST
        LIMIT %s
        """,
        (limit,),
    )
    return list(cur.fetchall())


def vector_to_pg(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


def run_embed_batch(cur, fq: str, preset: dict, rows: list[dict], *, dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        print(f"  [dry-run] would embed {len(rows)} rows")
        return 0

    passages = []
    for row in rows:
        text = preset["build_text"](row)
        if len(text) < 20:
            continue
        passages.append({"row": row, "text": text})

    if not passages:
        print("  [skip] no rows with sufficient text after build_text")
        return 0

    updated = 0
    sql_template = preset["after_update_sql"].format(fq=fq)

    for i in range(0, len(passages), DEFAULT_BATCH):
        batch = passages[i : i + DEFAULT_BATCH]
        vecs = embed_openai([p["text"] for p in batch])
        for p, vec in zip(batch, vecs):
            row = p["row"]
            row_id = row[preset["id_col"]]
            if preset["vector_slug"] == "agentsam_project":
                cur.execute(sql_template, (vector_to_pg(vec), EMBED_MODEL, row_id))
            else:
                cur.execute(sql_template, (vector_to_pg(vec), row_id))
            updated += 1
        print(f"  batch {i // DEFAULT_BATCH + 1}: {min(i + DEFAULT_BATCH, len(passages))}/{len(passages)}")

    return updated


def cosine_search_smoke(cur, fq: str, preset: dict, query: str) -> list[dict]:
    """Nearest-neighbor smoke on rows that now have embeddings."""
    vec = embed_openai([query])[0]
    cur.execute(
        f"""
        SELECT {preset["id_col"]} AS id,
               left({preset["text_col"]}, 120) AS preview,
               1 - (embedding <=> %s::vector) AS similarity
        FROM {fq}
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> %s::vector
        LIMIT 3
        """,
        (vector_to_pg(vec), vector_to_pg(vec)),
    )
    return list(cur.fetchall())


def print_counts(cur, fq: str, preset: dict) -> None:
    cur.execute(
        f"""
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
          COUNT(*) FILTER (WHERE embedding IS NULL) AS missing
        FROM {fq}
        """
    )
    row = cur.fetchone() or {}
    pending = count_pending(cur, fq, preset["where"])
    print(
        f"  totals: {row.get('total', 0)} rows | "
        f"embedded={row.get('embedded', 0)} | missing={row.get('missing', 0)} | "
        f"eligible_pending={pending}"
    )


def resolve_preset(args: argparse.Namespace) -> dict[str, Any]:
    if args.table in TABLE_PRESETS:
        preset = dict(TABLE_PRESETS[args.table])
    else:
        if not args.text_col:
            raise SystemExit(f"Unknown table {args.table!r} — pass --text-col or use a preset.")
        preset = {
            "schema": args.schema,
            "text_col": args.text_col,
            "id_col": args.id_col or "id",
            "where": f"embedding IS NULL AND {args.text_col} IS NOT NULL AND length(trim({args.text_col})) >= 20",
            "build_text": lambda row, col=args.text_col: str(row[col]).strip()[:4000],
            "after_update_sql": """
                UPDATE {fq}
                SET embedding = %s::vector,
                    embedded_at = now()
                WHERE id = %s
            """,
            "vector_slug": "custom",
        }
    if args.schema:
        preset["schema"] = args.schema
    if args.text_col:
        preset["text_col"] = args.text_col
        preset["build_text"] = lambda row, col=args.text_col: str(row[col]).strip()[:4000]
    return preset


def main() -> int:
    ap = argparse.ArgumentParser(description="Embed agentsam schema tables (OpenAI 1536-dim)")
    ap.add_argument("--schema", default=DEFAULT_SCHEMA, help=f"Postgres schema (default: {DEFAULT_SCHEMA})")
    ap.add_argument(
        "--table",
        required=True,
        choices=list(TABLE_PRESETS.keys()),
        help="Target table (preset configs)",
    )
    ap.add_argument("--text-col", help="Override text column (optional)")
    ap.add_argument("--id-col", help="Override id column (default: id)")
    ap.add_argument("--limit", type=int, default=0, help="Max rows (0 = all eligible)")
    ap.add_argument("--pretest", action="store_true", help="Embed only 3 rows + cosine smoke query")
    ap.add_argument("--dry-run", action="store_true", help="Count eligible rows only; no OpenAI writes")
    ap.add_argument(
        "--smoke-query",
        default="",
        help="Query text for post-embed cosine smoke (default: table-specific)",
    )
    args = ap.parse_args()

    preset = resolve_preset(args)
    schema = preset["schema"]
    table = args.table
    fq = fq_table(schema, table)
    limit = 3 if args.pretest else (args.limit if args.limit > 0 else 10_000)

    db_url = require_db_url()
    if not args.dry_run:
        require_openai_key()

    print(f"\n{'═' * 56}")
    print(f"  agentsam embed — {fq}")
    print(f"  model: {EMBED_MODEL} @ {EMBED_DIMS}d (OpenAI)")
    print(f"  mode: {'pretest(3)' if args.pretest else 'dry-run' if args.dry_run else f'limit={limit}'}")
    print(f"{'═' * 56}\n")

    conn, cursor_factory = get_conn(db_url)
    cur = conn.cursor(cursor_factory=cursor_factory)

    print("Before:")
    print_counts(cur, fq, preset)

    rows = fetch_rows(cur, fq, preset, limit)
    print(f"\nSelected {len(rows)} row(s) for this run.")
    if args.dry_run:
        for r in rows[:5]:
            preview = preset["build_text"](r)[:100].replace("\n", " ")
            print(f"  • {r[preset['id_col']]}: {preview}…")
        if len(rows) > 5:
            print(f"  … and {len(rows) - 5} more")
        cur.close()
        conn.close()
        return 0

    if not rows:
        print("\nNothing to embed — all eligible rows already have embeddings.")
        cur.close()
        conn.close()
        return 0

    try:
        updated = run_embed_batch(cur, fq, preset, rows, dry_run=False)
        conn.commit()
        print(f"\n✅ Updated {updated} row(s) in {fq}")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Rollback — {e}", file=sys.stderr)
        cur.close()
        conn.close()
        return 1

    print("\nAfter:")
    print_counts(cur, fq, preset)

    if args.pretest or updated > 0:
        smoke_q = args.smoke_query.strip() or (
            "Inner Animal Media platform projects and client work"
            if table == "agentsam_projects"
            else "Agent Sam operational memory and platform decisions"
        )
        print(f"\nCosine smoke query: {smoke_q!r}")
        try:
            hits = cosine_search_smoke(cur, fq, preset, smoke_q)
            if not hits:
                print("  ⚠️  No embedded rows returned from cosine search")
            else:
                for h in hits:
                    sim = float(h.get("similarity") or 0)
                    print(f"  • sim={sim:.4f} id={h.get('id')} preview={h.get('preview')!r}")
                top_sim = float(hits[0].get("similarity") or 0)
                if top_sim < 0.25:
                    print("  ⚠️  Top similarity low — check summary/content quality")
                else:
                    print("  ✅ Cosine search returned plausible neighbors")
        except Exception as e:
            print(f"  ⚠️  Cosine smoke failed (embed may still be OK): {e}")

    cur.close()
    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
