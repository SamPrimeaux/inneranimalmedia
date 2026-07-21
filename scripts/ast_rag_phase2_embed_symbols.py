#!/usr/bin/env python3
"""
AST-RAG Phase 2 — embed D1 AST node signatures → Supabase symbol table (pgvector/HNSW).

Also optionally stamps agentsam_codebase_chunks_oai3large_1536.node_id for Hyperdrive hydrate.

Chunks:
  0  verify   — D1 counts, PG symbol/chunks schema, OPENAI + SUPABASE_DB_URL
  1  pull     — pull embeddable nodes from D1 → artifacts
  2  embed    — OpenAI 1536 embed + upsert agentsam_codebase_ast_symbols_* (default dry-run)
  3  link     — best-effort node_id → chunks by file_path + name-in-content (dry-run default)
  4  smoke    — ANN query against symbol table
  all         — 0→4 (embed/link only write with --commit)

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 0
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 1
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2              # dry-run
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 2 --commit    # write PG
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 3 --commit    # link chunks
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk 4 --query 'resolve GitHub token'
  python3 scripts/ast_rag_phase2_embed_symbols.py --chunk all --commit --max-nodes 200  # smoke

Phase 3/4 next (see src/core/codebase-ast-retrieve.js + migrations/954_*):
  symbol ANN → D1 graph expand → Hyperdrive hydrate by node_id → agentsam_codebase_retrieve tool
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError as e:
    raise SystemExit("psycopg2 required: pip install psycopg2-binary") from e

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV = ROOT / ".env.cloudflare"
ARTIFACT_DIR = ROOT / "artifacts" / "ast_rag_phase2"

D1_DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
D1_ACCOUNT_FALLBACK = "ede6590ac0d2fb7daf155b35653457b2"
WORKSPACE_ID = "ws_inneranimalmedia"
WORKSPACE_UUID = "fa1f12a8-c841-4b79-a26c-d53a78b17dac"

EMBED_MODEL = "text-embedding-3-large"
EMBED_DIMS = 1536
SYMBOL_TABLE = "agentsam.agentsam_codebase_ast_symbols_oai3large_1536"
CHUNKS_TABLE = "agentsam.agentsam_codebase_chunks_oai3large_1536"

# Skip noisy structural nodes — Phase 2 ANN is for callable / type symbols.
EMBEDDABLE_TYPES = frozenset(
    {
        "function",
        "class",
        "method",
        "arrow_function",
        "component",
        "hook",
        "const",
        "type_alias",
        "interface",
        "variable",
    }
)


def load_env_cloudflare(path: Path) -> dict[str, str]:
    loaded: dict[str, str] = {}
    if not path.is_file():
        return loaded
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = val
        if key:
            loaded[key] = val
    return loaded


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def warn(msg: str) -> None:
    print(f"  ⚠ {msg}")


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")


def ensure_artifacts() -> Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    return ARTIFACT_DIR


def write_json(name: str, data: Any) -> Path:
    path = ensure_artifacts() / name
    path.write_text(json.dumps(data, indent=2, default=str) + "\n", encoding="utf-8")
    return path


def read_json(name: str) -> Any:
    path = ARTIFACT_DIR / name
    if not path.is_file():
        raise SystemExit(f"Missing artifact {path} — run earlier chunk first.")
    return json.loads(path.read_text(encoding="utf-8"))


# ── D1 ────────────────────────────────────────────────────────────────────────


def require_cf() -> tuple[str, str]:
    account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or D1_ACCOUNT_FALLBACK).strip()
    token = (os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if not token:
        raise SystemExit("CLOUDFLARE_API_TOKEN missing")
    return account, token


def d1_query(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    account, token = require_cf()
    db_id = (os.environ.get("CF_D1_DATABASE_ID") or D1_DB_ID).strip()
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db_id}/query"
    body = json.dumps({"sql": sql, "params": params or []}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload.get("success"):
        raise RuntimeError(f"D1 error: {payload.get('errors')}")
    results = payload.get("result") or []
    if not results:
        return []
    first = results[0] if isinstance(results, list) else results
    return list(first.get("results") or [])


# ── Postgres ──────────────────────────────────────────────────────────────────


def require_db_url() -> str:
    url = (os.environ.get("SUPABASE_DB_URL") or "").strip()
    if not url:
        raise SystemExit("SUPABASE_DB_URL missing")
    if "db.dpmuvynqixblxsilnlut.supabase.co" in url:
        raise SystemExit("Use session pooler host (aws-1-us-east-2.pooler.supabase.com:5432), not db.*")
    return url


def pg_connect():
    return psycopg2.connect(require_db_url())


def require_openai() -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise SystemExit("OPENAI_API_KEY missing")
    return key


def sanitize_text(text: str) -> str:
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", str(text))
    return re.sub(r"\s{4,}", "   ", t).strip()


def build_embed_text(node: dict[str, Any]) -> str:
    parts = [
        f"repo:{node.get('repo')}",
        f"file:{node.get('file_path')}",
        f"type:{node.get('node_type')}",
        f"name:{node.get('node_name')}",
        str(node.get("signature") or node.get("node_name") or ""),
    ]
    if node.get("docstring"):
        parts.append(str(node["docstring"])[:400])
    return sanitize_text(" | ".join(parts))[:4000]


def embed_openai(texts: list[str], *, retries: int = 4) -> list[list[float]]:
    key = require_openai()
    clean = [sanitize_text(t) or " " for t in texts]
    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            payload = {
                "model": EMBED_MODEL,
                "input": clean,
                "dimensions": EMBED_DIMS,
            }
            req = urllib.request.Request(
                "https://api.openai.com/v1/embeddings",
                data=json.dumps(payload).encode("utf-8"),
                method="POST",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                out = json.loads(resp.read().decode("utf-8"))
            rows = sorted(out["data"], key=lambda x: x["index"])
            vecs = [r["embedding"] for r in rows]
            if len(vecs) != len(clean):
                raise RuntimeError(f"got {len(vecs)} vectors for {len(clean)} inputs")
            for i, v in enumerate(vecs):
                if len(v) != EMBED_DIMS:
                    raise RuntimeError(f"row {i}: dims {len(v)} != {EMBED_DIMS}")
            return vecs
        except Exception as e:
            last_err = e
            time.sleep(min(20, 1.5**attempt))
    raise RuntimeError(f"OpenAI embed failed: {last_err}")


def vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


# ── chunks ────────────────────────────────────────────────────────────────────


def chunk0_verify() -> int:
    print("\n══ CHUNK 0 — verify ══")
    hard = 0
    try:
        counts = d1_query(
            "SELECT (SELECT COUNT(*) FROM codebase_ast_nodes) AS nodes, "
            "(SELECT COUNT(*) FROM codebase_dep_edges) AS edges"
        )[0]
        ok(f"D1 nodes={counts['nodes']} edges={counts['edges']}")
        if int(counts["nodes"] or 0) < 1:
            fail("D1 has no AST nodes — run Phase 1 first")
            hard += 1
    except Exception as e:
        fail(f"D1: {e}")
        hard += 1

    try:
        require_openai()
        ok("OPENAI_API_KEY set")
    except SystemExit as e:
        fail(str(e))
        hard += 1

    try:
        with pg_connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema='agentsam'
                      AND table_name='agentsam_codebase_ast_symbols_oai3large_1536'
                    ORDER BY ordinal_position
                    """
                )
                cols = [r[0] for r in cur.fetchall()]
                cur.execute(f"SELECT COUNT(*) FROM {SYMBOL_TABLE}")
                sym_n = cur.fetchone()[0]
                cur.execute(
                    f"SELECT COUNT(*) FROM {CHUNKS_TABLE} WHERE node_id IS NOT NULL"
                )
                linked = cur.fetchone()[0]
                cur.execute(
                    """
                    SELECT indexname FROM pg_indexes
                    WHERE schemaname='agentsam'
                      AND indexname='idx_ast_symbols_embedding_hnsw'
                    """
                )
                hnsw = cur.fetchone()
        if "node_id" in cols and "embedding" in cols:
            ok(f"symbol table OK cols={len(cols)} rows={sym_n}")
        else:
            fail(f"symbol table missing columns: {cols}")
            hard += 1
        if hnsw:
            ok("HNSW index idx_ast_symbols_embedding_hnsw present")
        else:
            warn("HNSW index missing — apply MANUAL_APPLY_20260721_ast_symbols_hnsw.sql")
        ok(f"chunks with node_id set: {linked}")
        write_json(
            "chunk0_verify.json",
            {"d1": counts, "symbol_rows": sym_n, "chunks_linked": linked, "hnsw": bool(hnsw)},
        )
    except Exception as e:
        fail(f"Postgres: {e}")
        hard += 1

    print(f"\nChunk 0 done — fails={hard}")
    return 1 if hard else 0


def chunk1_pull(*, max_nodes: int | None, repos: list[str] | None) -> int:
    print("\n══ CHUNK 1 — pull embeddable nodes from D1 ══")
    # Paginate D1 (limit/offset)
    page = 500
    offset = 0
    nodes: list[dict[str, Any]] = []
    type_filter = ",".join(f"'{t}'" for t in sorted(EMBEDDABLE_TYPES))
    while True:
        sql = (
            "SELECT id, workspace_id, repo, file_path, node_type, node_name, signature, "
            "docstring, line_start, line_end, is_exported, language "
            f"FROM codebase_ast_nodes WHERE workspace_id = ? AND node_type IN ({type_filter}) "
        )
        params: list[Any] = [WORKSPACE_ID]
        if repos:
            placeholders = ",".join("?" for _ in repos)
            sql += f" AND repo IN ({placeholders}) "
            params.extend(repos)
        sql += " ORDER BY repo, file_path, line_start LIMIT ? OFFSET ?"
        params.extend([page, offset])
        batch = d1_query(sql, params)
        if not batch:
            break
        nodes.extend(batch)
        offset += len(batch)
        print(f"    pulled {len(nodes)}…")
        if max_nodes is not None and len(nodes) >= max_nodes:
            nodes = nodes[:max_nodes]
            break
        if len(batch) < page:
            break

    for n in nodes:
        n["embed_text"] = build_embed_text(n)

    by_type: dict[str, int] = {}
    for n in nodes:
        by_type[n["node_type"]] = by_type.get(n["node_type"], 0) + 1

    write_json("chunk1_nodes.json", nodes)
    write_json("chunk1_stats.json", {"count": len(nodes), "by_type": by_type})
    ok(f"embeddable nodes={len(nodes)}")
    print(f"    by_type: {by_type}")
    print("Chunk 1 done")
    return 0


def chunk2_embed(*, commit: bool, batch_size: int) -> int:
    print("\n══ CHUNK 2 — embed + upsert symbols ══")
    nodes = read_json("chunk1_nodes.json")
    ok(f"payload {len(nodes)} nodes | commit={commit} batch={batch_size}")
    if not nodes:
        warn("nothing to embed")
        return 0

    if not commit:
        sample = [{"id": n["id"], "embed_text": n["embed_text"][:160]} for n in nodes[:5]]
        write_json("chunk2_dry_run_sample.json", sample)
        warn("dry-run — pass --commit to write Postgres")
        print("Chunk 2 dry-run done")
        return 0

    upserted = 0
    with pg_connect() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(nodes), batch_size):
                batch = nodes[i : i + batch_size]
                texts = [n["embed_text"] for n in batch]
                print(f"    embed {i + 1}-{i + len(batch)}/{len(nodes)}…", flush=True)
                vecs = embed_openai(texts)
                rows = []
                for n, vec in zip(batch, vecs):
                    rows.append(
                        (
                            n["id"],
                            WORKSPACE_UUID,
                            n["repo"],
                            n["file_path"],
                            n["node_type"],
                            n["node_name"],
                            n.get("signature"),
                            n.get("line_start"),
                            n.get("line_end"),
                            n["embed_text"],
                            vec_literal(vec),
                            json.dumps(
                                {
                                    "workspace_id": WORKSPACE_ID,
                                    "language": n.get("language"),
                                    "is_exported": n.get("is_exported"),
                                    "embedding_model": EMBED_MODEL,
                                }
                            ),
                        )
                    )
                execute_values(
                    cur,
                    f"""
                    INSERT INTO {SYMBOL_TABLE} (
                      node_id, workspace_id, repo, file_path, node_type, node_name,
                      signature, line_start, line_end, content, embedding, metadata, updated_at
                    ) VALUES %s
                    ON CONFLICT (node_id) DO UPDATE SET
                      signature = EXCLUDED.signature,
                      line_start = EXCLUDED.line_start,
                      line_end = EXCLUDED.line_end,
                      content = EXCLUDED.content,
                      embedding = EXCLUDED.embedding,
                      metadata = EXCLUDED.metadata,
                      updated_at = now()
                    """,
                    rows,
                    template="(%s,%s::uuid,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s::jsonb,now())",
                    page_size=batch_size,
                )
                conn.commit()
                upserted += len(rows)
                print(f"    upserted {upserted}/{len(nodes)}")
                time.sleep(0.15)

        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {SYMBOL_TABLE}")
            total = cur.fetchone()[0]

    write_json("chunk2_result.json", {"upserted": upserted, "symbol_table_rows": total})
    ok(f"symbol table rows={total}")
    print("Chunk 2 commit done")
    return 0


def chunk3_link(*, commit: bool, max_files: int | None) -> int:
    print("\n══ CHUNK 3 — link node_id onto chunks ══")
    nodes = read_json("chunk1_nodes.json")
    # Prefer exported / functions first for a given file+name match
    by_file: dict[str, list[dict[str, Any]]] = {}
    for n in nodes:
        by_file.setdefault(n["file_path"], []).append(n)

    files = sorted(by_file.keys())
    if max_files is not None:
        files = files[:max_files]

    updates: list[tuple[str, str]] = []  # (node_id, chunk_id)
    with pg_connect() as conn:
        with conn.cursor() as cur:
            for fi, fpath in enumerate(files, 1):
                cur.execute(
                    f"""
                    SELECT id::text, content
                    FROM {CHUNKS_TABLE}
                    WHERE workspace_id = %s::uuid AND file_path = %s
                    """,
                    (WORKSPACE_UUID, fpath),
                )
                chunks = cur.fetchall()
                if not chunks:
                    continue
                for n in by_file[fpath]:
                    name = str(n.get("node_name") or "")
                    if len(name) < 2:
                        continue
                    # Prefer longest matching chunk content that contains the symbol name
                    best = None
                    for cid, content in chunks:
                        if name in (content or ""):
                            best = cid
                            break
                    if best:
                        updates.append((n["id"], best))
                if fi % 50 == 0:
                    print(f"    scanned files {fi}/{len(files)} links={len(updates)}")

    write_json(
        "chunk3_link_preview.json",
        {"candidate_links": len(updates), "files": len(files), "sample": updates[:20], "updates": updates},
    )
    ok(f"candidate chunk links={len(updates)} across {len(files)} files")

    if not commit:
        warn("dry-run — pass --commit to UPDATE chunks.node_id")
        print("Chunk 3 dry-run done")
        return 0

    # Batch UPDATEs + commit every batch so WiFi blips don't lose the whole run.
    linked = 0
    batch_size = 200
    update_sql = f"""
        UPDATE {CHUNKS_TABLE}
        SET node_id = %s
        WHERE id = %s::uuid
          AND (node_id IS NULL OR node_id = %s)
    """
    for i in range(0, len(updates), batch_size):
        batch = updates[i : i + batch_size]
        params = [(node_id, chunk_id, node_id) for node_id, chunk_id in batch]
        for attempt in range(1, 5):
            try:
                with pg_connect() as conn:
                    with conn.cursor() as cur:
                        cur.executemany(update_sql, params)
                        linked += cur.rowcount
                        conn.commit()
                print(f"    linked batch {i + 1}-{i + len(batch)}/{len(updates)}")
                break
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                warn(f"link batch retry {attempt}/4 after {type(e).__name__}: {e}")
                time.sleep(min(20, 1.5**attempt))
                if attempt >= 4:
                    raise

    with pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {CHUNKS_TABLE} WHERE node_id IS NOT NULL")
            total_linked = cur.fetchone()[0]

    write_json("chunk3_result.json", {"updated": linked, "chunks_with_node_id": total_linked})
    ok(f"batches done; total chunks with node_id={total_linked}")
    print("Chunk 3 commit done")
    return 0


def chunk4_smoke(query: str, top_k: int) -> int:
    print("\n══ CHUNK 4 — smoke ANN ══")
    print(f"  query: {query!r}")
    vec = embed_openai([query])[0]
    lit = vec_literal(vec)
    with pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT node_id, node_type, node_name, file_path, repo,
                       1 - (embedding <=> %s::vector) AS score
                FROM {SYMBOL_TABLE}
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> %s::vector
                LIMIT %s
                """,
                (lit, lit, top_k),
            )
            rows = cur.fetchall()
    hits = [
        {
            "node_id": r[0],
            "node_type": r[1],
            "node_name": r[2],
            "file_path": r[3],
            "repo": r[4],
            "score": float(r[5]) if r[5] is not None else None,
        }
        for r in rows
    ]
    write_json("chunk4_smoke.json", {"query": query, "hits": hits})
    if not hits:
        warn("no hits — run chunk 2 --commit first")
        return 1
    ok(f"top {len(hits)} hits:")
    for h in hits:
        print(f"    {h['score']:.3f}  {h['node_type']:16} {h['node_name']:40} {h['file_path']}")
    print("Chunk 4 done — Phase 3 expands these node_ids via D1 edges, then hydrates chunks")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="AST-RAG Phase 2 symbol embed")
    ap.add_argument(
        "--chunk",
        required=True,
        choices=["0", "1", "2", "3", "4", "verify", "pull", "embed", "link", "smoke", "all"],
    )
    ap.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--max-nodes", type=int, default=None)
    ap.add_argument("--max-files", type=int, default=None)
    ap.add_argument("--repo", action="append", default=None)
    ap.add_argument(
        "--query",
        default="resolve GitHub token from auth user",
        help="Chunk 4 smoke query",
    )
    ap.add_argument("--top-k", type=int, default=8)
    args = ap.parse_args()

    loaded = load_env_cloudflare(args.env_file)
    print("AST-RAG Phase 2 embed")
    print(f"  env: {args.env_file} ({len(loaded)} keys)")
    ensure_artifacts()

    chunk = {
        "verify": "0",
        "pull": "1",
        "embed": "2",
        "link": "3",
        "smoke": "4",
    }.get(args.chunk, args.chunk)

    rc = 0
    if chunk in ("0", "all"):
        rc = chunk0_verify() or rc
    if chunk in ("1", "all") and rc == 0:
        rc = chunk1_pull(max_nodes=args.max_nodes, repos=args.repo) or rc
    if chunk in ("2", "all") and rc == 0:
        rc = chunk2_embed(commit=args.commit, batch_size=max(1, args.batch_size)) or rc
    if chunk in ("3", "all") and rc == 0:
        rc = chunk3_link(commit=args.commit, max_files=args.max_files) or rc
    if chunk in ("4", "all") and rc == 0:
        # smoke always embeds query; needs data if all+commit ran
        rc = chunk4_smoke(args.query, args.top_k) or rc
    return rc


if __name__ == "__main__":
    sys.exit(main())
