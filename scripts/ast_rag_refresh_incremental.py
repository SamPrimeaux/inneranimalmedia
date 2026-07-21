#!/usr/bin/env python3
"""
AST-RAG incremental refresh — keep nodes/edges/symbols fresh without full re-walk.

Freshness law (also agentsam_rules_document rule_ast_rag_freshness):
  - After edits under src/, dashboard/src/, or MCP src/: run this (or npm run ast-rag:refresh).
  - Uses git diff vs --since-ref (default HEAD~1) OR --files list.
  - Skips files whose content hash still matches D1 file_hash for all nodes in that file.
  - Re-parses changed files → replace D1 nodes for those paths → rebuild import edges for
    those files → re-embed only touched node_ids into Supabase symbols.
  - Does NOT re-run full chunk RAG reindex (use existing code-index job for that).
  - Safe to run while unrelated work happens; avoid concurrent full Phase-2 chunk-3 link storms.

Usage:
  python3 scripts/ast_rag_refresh_incremental.py --dry-run
  python3 scripts/ast_rag_refresh_incremental.py --commit
  python3 scripts/ast_rag_refresh_incremental.py --commit --since-ref origin/main
  python3 scripts/ast_rag_refresh_incremental.py --commit --files src/core/foo.js src/api/bar.js

Does not overlap Phase-2 chunk-3 full link: only re-embeds symbols + patches D1 graph for
touched files. Optional --relink-files stamps node_id on chunks for those paths only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

# Reuse Phase-1/2 helpers by importing modules as scripts on sys.path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from ast_rag_phase1_dual_repo_walk import (  # noqa: E402
    ARTIFACT_DIR as P1_ARTIFACT,
    DEFAULT_ENV,
    DEFAULT_MAIN_REPO,
    DEFAULT_MCP_REPO,
    INDEX_JOB_ID,
    LANG_BY_EXT,
    WORKSPACE_ID,
    d1_batch,
    d1_query,
    load_env_cloudflare,
    parse_file,
    resolve_import,
    stable_id,
    EDGE_INSERT_SQL,
    NODE_INSERT_SQL,
    _edge_params,
    _node_params,
)
from ast_rag_phase2_embed_symbols import (  # noqa: E402
    EMBEDDABLE_TYPES,
    SYMBOL_TABLE,
    WORKSPACE_UUID,
    build_embed_text,
    embed_openai,
    pg_connect,
    vec_literal,
    CHUNKS_TABLE,
)

try:
    from psycopg2.extras import execute_values
except ImportError as e:
    raise SystemExit("psycopg2 required") from e


def ok(m: str) -> None:
    print(f"  ✓ {m}")


def warn(m: str) -> None:
    print(f"  ⚠ {m}")


def file_sha(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def git_changed_files(repo: Path, since_ref: str) -> list[str]:
    r = subprocess.run(
        ["git", "-C", str(repo), "diff", "--name-only", "--diff-filter=ACMR", since_ref],
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        warn(f"git diff failed in {repo}: {r.stderr.strip()[:200]}")
        return []
    out = []
    for line in r.stdout.splitlines():
        p = line.strip()
        if not p:
            continue
        ext = Path(p).suffix.lower()
        if ext in {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}:
            if p.startswith("src/") or p.startswith("dashboard/src/") or p.startswith("scripts/"):
                out.append(p)
    return out


def repo_for_path(rel: str, main: Path, mcp: Path) -> tuple[str, Path] | None:
    # Heuristic: MCP paths only if under mcp repo when --files given with mcp prefix
    return ("SamPrimeaux/inneranimalmedia", main)


def main() -> int:
    ap = argparse.ArgumentParser(description="AST-RAG incremental refresh")
    ap.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--since-ref", default="HEAD~1")
    ap.add_argument("--files", nargs="*", default=None)
    ap.add_argument("--main-repo", type=Path, default=DEFAULT_MAIN_REPO)
    ap.add_argument("--mcp-repo", type=Path, default=DEFAULT_MCP_REPO)
    ap.add_argument("--relink-files", action="store_true", help="Also stamp chunk node_id for touched files")
    ap.add_argument("--batch-size", type=int, default=40)
    args = ap.parse_args()
    commit = args.commit and not args.dry_run

    load_env_cloudflare(args.env_file)
    print("AST-RAG incremental refresh")
    print(f"  commit={commit} since={args.since_ref}")

    changed: list[tuple[str, Path, str]] = []  # repo_full, root, rel
    if args.files:
        for f in args.files:
            rel = f.replace("\\", "/").lstrip("./")
            root = args.main_repo
            repo = "SamPrimeaux/inneranimalmedia"
            if "mcp-server" in rel or rel.startswith("mcp/"):
                root = args.mcp_repo
                repo = "SamPrimeaux/inneranimalmedia-mcp-server"
                rel = rel.split("mcp-server/", 1)[-1] if "mcp-server/" in rel else rel
            changed.append((repo, root, rel))
    else:
        for rel in git_changed_files(args.main_repo, args.since_ref):
            changed.append(("SamPrimeaux/inneranimalmedia", args.main_repo, rel))
        if args.mcp_repo.is_dir():
            for rel in git_changed_files(args.mcp_repo, args.since_ref):
                changed.append(("SamPrimeaux/inneranimalmedia-mcp-server", args.mcp_repo, rel))

    if not changed:
        ok("no changed JS/TS files — nothing to refresh")
        return 0

    ok(f"candidates={len(changed)}")
    parsed_nodes = []
    parsed_by_file: dict[tuple[str, str], list] = {}
    imports_by_file: dict[tuple[str, str], list] = {}
    skipped_hash = 0

    for repo, root, rel in changed:
        path = root / rel
        if not path.is_file():
            warn(f"missing {rel}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        fhash = file_sha(text)
        existing = d1_query(
            "SELECT file_hash FROM codebase_ast_nodes WHERE workspace_id=? AND repo=? AND file_path=? LIMIT 1",
            [WORKSPACE_ID, repo, rel],
        )
        if existing and existing[0].get("file_hash") == fhash:
            skipped_hash += 1
            continue
        lang = LANG_BY_EXT.get(path.suffix.lower(), "js")
        fp = parse_file(repo, rel, text, lang)
        parsed_by_file[(repo, rel)] = fp.nodes
        imports_by_file[(repo, rel)] = fp.imports
        parsed_nodes.extend(fp.nodes)

    ok(f"reparse files={len(parsed_by_file)} skipped_unchanged_hash={skipped_hash} nodes={len(parsed_nodes)}")
    if not parsed_by_file:
        ok("all candidates already fresh by file_hash")
        return 0

    if not commit:
        warn("dry-run — pass --commit to write D1 + embed symbols")
        return 0

    # Replace D1 nodes per file
    for (repo, rel), nodes in parsed_by_file.items():
        # delete edges touching nodes in this file, then nodes
        old = d1_query(
            "SELECT id FROM codebase_ast_nodes WHERE workspace_id=? AND repo=? AND file_path=?",
            [WORKSPACE_ID, repo, rel],
        )
        old_ids = [r["id"] for r in old]
        if old_ids:
            # delete edges in chunks
            for i in range(0, len(old_ids), 40):
                chunk = old_ids[i : i + 40]
                ph = ",".join("?" for _ in chunk)
                d1_query(
                    f"DELETE FROM codebase_dep_edges WHERE source_node_id IN ({ph}) OR target_node_id IN ({ph})",
                    chunk + chunk,
                )
            d1_query(
                "DELETE FROM codebase_ast_nodes WHERE workspace_id=? AND repo=? AND file_path=?",
                [WORKSPACE_ID, repo, rel],
            )
        if nodes:
            d1_batch([{"sql": NODE_INSERT_SQL, "params": _node_params(n.__dict__ if hasattr(n, "__dict__") else n)} for n in [
                n if isinstance(n, dict) else {
                    "id": n.id, "workspace_id": n.workspace_id, "repo": n.repo, "file_path": n.file_path,
                    "node_type": n.node_type, "node_name": n.node_name, "signature": n.signature,
                    "docstring": n.docstring, "line_start": n.line_start, "line_end": n.line_end,
                    "is_exported": n.is_exported, "is_default_export": n.is_default_export,
                    "language": n.language, "file_hash": n.file_hash, "index_job_id": n.index_job_id,
                }
                for n in nodes
            ]])
        print(f"    D1 refreshed {repo}:{rel} nodes={len(nodes)}")

    # Rebuild import edges for touched files (internal only)
    # Load file set for resolve
    all_files = {
        r["file_path"]
        for r in d1_query(
            "SELECT DISTINCT file_path FROM codebase_ast_nodes WHERE workspace_id=? AND repo=?",
            [WORKSPACE_ID, "SamPrimeaux/inneranimalmedia"],
        )
    }
    # also need mcp files if any — keep simple: per-repo
    edge_rows = []
    for (repo, rel), imps in imports_by_file.items():
        repo_files = {
            r["file_path"]
            for r in d1_query(
                "SELECT DISTINCT file_path FROM codebase_ast_nodes WHERE workspace_id=? AND repo=?",
                [WORKSPACE_ID, repo],
            )
        }
        nodes = parsed_by_file[(repo, rel)]
        if not nodes:
            continue
        src_id = nodes[0].id if hasattr(nodes[0], "id") else nodes[0]["id"]
        # prefer import node
        for n in nodes:
            nt = n.node_type if hasattr(n, "node_type") else n["node_type"]
            if nt == "import":
                src_id = n.id if hasattr(n, "id") else n["id"]
                break
        for imp in imps:
            resolved, is_ext = resolve_import(imp["source"], rel, repo_files)
            if is_ext or not resolved or resolved not in repo_files:
                continue
            tgt_rows = d1_query(
                "SELECT id FROM codebase_ast_nodes WHERE workspace_id=? AND repo=? AND file_path=? ORDER BY is_exported DESC LIMIT 1",
                [WORKSPACE_ID, repo, resolved],
            )
            if not tgt_rows:
                continue
            tgt_id = tgt_rows[0]["id"]
            eid = stable_id("edge", WORKSPACE_ID, repo, src_id, tgt_id, "imports")
            edge_rows.append(
                {
                    "id": eid,
                    "workspace_id": WORKSPACE_ID,
                    "repo": repo,
                    "source_node_id": src_id,
                    "target_node_id": tgt_id,
                    "edge_type": "imports",
                    "source_file": rel,
                    "target_file": resolved,
                    "is_external": 0,
                    "index_job_id": INDEX_JOB_ID,
                }
            )
    if edge_rows:
        d1_batch([{"sql": EDGE_INSERT_SQL, "params": _edge_params(e)} for e in edge_rows])
        ok(f"edges upserted={len(edge_rows)}")

    # Embed only embeddable nodes from touched files
    to_embed = []
    for nodes in parsed_by_file.values():
        for n in nodes:
            d = n if isinstance(n, dict) else {
                "id": n.id, "repo": n.repo, "file_path": n.file_path, "node_type": n.node_type,
                "node_name": n.node_name, "signature": n.signature, "docstring": n.docstring,
                "line_start": n.line_start, "line_end": n.line_end, "is_exported": n.is_exported,
                "language": n.language,
            }
            if d["node_type"] not in EMBEDDABLE_TYPES:
                continue
            d["embed_text"] = build_embed_text(d)
            to_embed.append(d)

    ok(f"embedding {len(to_embed)} symbols…")
    with pg_connect() as conn:
        with conn.cursor() as cur:
            for i in range(0, len(to_embed), args.batch_size):
                batch = to_embed[i : i + args.batch_size]
                vecs = embed_openai([b["embed_text"] for b in batch])
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
                            json.dumps({"workspace_id": WORKSPACE_ID, "refresh": True}),
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
                      signature=EXCLUDED.signature, content=EXCLUDED.content,
                      embedding=EXCLUDED.embedding, metadata=EXCLUDED.metadata, updated_at=now()
                    """,
                    rows,
                    template="(%s,%s::uuid,%s,%s,%s,%s,%s,%s,%s,%s,%s::vector,%s::jsonb,now())",
                )
                conn.commit()
                print(f"    symbols {i + len(batch)}/{len(to_embed)}")
                time.sleep(0.1)

            # Drop symbol rows for deleted nodes in touched files (orphan cleanup)
            for (repo, rel), nodes in parsed_by_file.items():
                keep = [n.id if hasattr(n, "id") else n["id"] for n in nodes]
                if not keep:
                    cur.execute(
                        f"DELETE FROM {SYMBOL_TABLE} WHERE workspace_id=%s::uuid AND repo=%s AND file_path=%s",
                        (WORKSPACE_UUID, repo, rel),
                    )
                else:
                    cur.execute(
                        f"""
                        DELETE FROM {SYMBOL_TABLE}
                        WHERE workspace_id=%s::uuid AND repo=%s AND file_path=%s
                          AND NOT (node_id = ANY(%s::text[]))
                        """,
                        (WORKSPACE_UUID, repo, rel, keep),
                    )
                conn.commit()

    if args.relink_files:
        warn("--relink-files: stamping chunk node_id for touched paths only")
        with pg_connect() as conn:
            with conn.cursor() as cur:
                for (repo, rel), nodes in parsed_by_file.items():
                    cur.execute(
                        f"SELECT id::text, content FROM {CHUNKS_TABLE} WHERE workspace_id=%s::uuid AND file_path=%s",
                        (WORKSPACE_UUID, rel),
                    )
                    chunks = cur.fetchall()
                    for n in nodes:
                        d = n if isinstance(n, dict) else n.__dict__
                        name = d.get("node_name") or ""
                        if len(name) < 2:
                            continue
                        for cid, content in chunks:
                            if name in (content or ""):
                                cur.execute(
                                    f"UPDATE {CHUNKS_TABLE} SET node_id=%s WHERE id=%s::uuid AND (node_id IS NULL OR node_id=%s)",
                                    (d["id"], cid, d["id"]),
                                )
                                break
                    conn.commit()

    ok("incremental refresh complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
