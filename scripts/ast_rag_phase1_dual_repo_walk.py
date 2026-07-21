#!/usr/bin/env python3
"""
AST-RAG Phase 1 dual-repo walker — local parse → optional D1 upsert.

Loads secrets from .env.cloudflare (never prints values). Walks:
  - inneranimalmedia
  - inneranimalmedia-mcp-server

Chunks (run one at a time to save Cursor):
  0  verify   — D1 tables/indexes + vector lane registry + code index jobs
  1  walk     — filesystem walk + lightweight AST/symbol extract (both repos)
  2  edges    — import/dep edges from walk artifacts
  3  upsert   — write nodes+edges to D1 (requires --commit; default dry-run)
  all         — 0→3 in order

Usage:
  cd /Users/samprimeaux/inneranimalmedia
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 0
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 1
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 2
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 3            # dry-run
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 3 --commit   # full replace write
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk 3 --commit --resume  # after timeout
  python3 scripts/ast_rag_phase1_dual_repo_walk.py --chunk all

Artifacts land in artifacts/ast_rag_phase1/
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

# ── paths / defaults ──────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV = ROOT / ".env.cloudflare"
ARTIFACT_DIR = ROOT / "artifacts" / "ast_rag_phase1"

DEFAULT_MAIN_REPO = ROOT
DEFAULT_MCP_REPO = ROOT.parent / "inneranimalmedia-mcp-server"

D1_DB_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
D1_ACCOUNT_FALLBACK = "ede6590ac0d2fb7daf155b35653457b2"
WORKSPACE_ID = "ws_inneranimalmedia"
INDEX_JOB_ID = "cidx_ws_inneranimalmedia"

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    ".wrangler",
    ".next",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "artifacts",
    ".turbo",
    ".cache",
    "vendor",
}
ALLOWED_EXT = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
LANG_BY_EXT = {
    ".js": "js",
    ".jsx": "jsx",
    ".ts": "ts",
    ".tsx": "tsx",
    ".mjs": "mjs",
    ".cjs": "cjs",
}

REPO_SPECS = (
    {
        "key": "inneranimalmedia",
        "repo": "SamPrimeaux/inneranimalmedia",
        "default_path": DEFAULT_MAIN_REPO,
        "walk_roots": ("src", "dashboard/src", "scripts"),
    },
    {
        "key": "inneranimalmedia-mcp-server",
        "repo": "SamPrimeaux/inneranimalmedia-mcp-server",
        "default_path": DEFAULT_MCP_REPO,
        "walk_roots": ("src",),
    },
)

# ── env / http helpers ────────────────────────────────────────────────────────


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
        if not key:
            continue
        loaded[key] = val
        if key not in os.environ:
            os.environ[key] = val
    return loaded


def require_cf_creds() -> tuple[str, str]:
    account = (os.environ.get("CLOUDFLARE_ACCOUNT_ID") or D1_ACCOUNT_FALLBACK).strip()
    token = (os.environ.get("CLOUDFLARE_API_TOKEN") or "").strip()
    if not token:
        raise SystemExit(
            "CLOUDFLARE_API_TOKEN missing. Load .env.cloudflare first "
            "(script does this automatically if file exists)."
        )
    return account, token


def d1_request(body: dict[str, Any], *, timeout: int = 180, attempts: int = 6) -> dict[str, Any]:
    account, token = require_cf_creds()
    db_id = (os.environ.get("CF_D1_DATABASE_ID") or D1_DB_ID).strip()
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db_id}/query"
    raw = json.dumps(body).encode("utf-8")
    last_err: Exception | None = None
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(
            url,
            data=raw,
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if not payload.get("success"):
                raise RuntimeError(f"D1 error: {payload.get('errors')}")
            return payload
        except (TimeoutError, urllib.error.URLError, RuntimeError) as e:
            last_err = e
            if attempt >= attempts:
                break
            sleep_s = min(30, 1.5**attempt)
            warn(f"D1 retry {attempt}/{attempts} after {type(e).__name__}: {e} — sleep {sleep_s:.1f}s")
            time.sleep(sleep_s)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:800]
            last_err = RuntimeError(f"D1 HTTP {e.code}: {detail}")
            if e.code in (429, 500, 502, 503, 504) and attempt < attempts:
                sleep_s = min(30, 1.5**attempt)
                warn(f"D1 HTTP {e.code} retry {attempt}/{attempts} — sleep {sleep_s:.1f}s")
                time.sleep(sleep_s)
                continue
            raise last_err from e
    raise RuntimeError(f"D1 failed after {attempts} attempts: {last_err}")


def d1_query(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    payload = d1_request({"sql": sql, "params": params or []})
    results = payload.get("result") or []
    if not results:
        return []
    first = results[0] if isinstance(results, list) else results
    return list(first.get("results") or [])


def d1_batch(statements: list[dict[str, Any]]) -> None:
    """Run many statements in one HTTP round-trip (D1 batch body)."""
    if not statements:
        return
    d1_request({"batch": statements}, timeout=240)


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def warn(msg: str) -> None:
    print(f"  ⚠ {msg}")


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")


# ── artifact I/O ──────────────────────────────────────────────────────────────


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


# ── symbol extraction (stdlib regex — good enough to bootstrap Graph RAG) ─────


@dataclass
class AstNode:
    id: str
    workspace_id: str
    repo: str
    file_path: str
    node_type: str
    node_name: str
    signature: str
    line_start: int
    line_end: int
    is_exported: int = 0
    is_default_export: int = 0
    language: str = "js"
    file_hash: str = ""
    index_job_id: str = INDEX_JOB_ID
    docstring: str | None = None


@dataclass
class DepEdge:
    id: str
    workspace_id: str
    repo: str
    source_node_id: str
    target_node_id: str
    edge_type: str
    source_file: str
    target_file: str
    is_external: int = 0
    index_job_id: str = INDEX_JOB_ID


@dataclass
class FileParse:
    repo: str
    file_path: str
    language: str
    file_hash: str
    nodes: list[AstNode] = field(default_factory=list)
    imports: list[dict[str, Any]] = field(default_factory=list)


def stable_id(prefix: str, *parts: Any) -> str:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{h}"


def file_sha(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def strip_comments_for_scan(text: str) -> str:
    # Keep line numbers aligned: replace comment bodies with spaces.
    out = list(text)
    # block comments
    for m in re.finditer(r"/\*.*?\*/", text, flags=re.S):
        for i in range(m.start(), m.end()):
            if out[i] != "\n":
                out[i] = " "
    # line comments
    for m in re.finditer(r"//.*?$", text, flags=re.M):
        for i in range(m.start(), m.end()):
            out[i] = " "
    return "".join(out)


_IMPORT_RE = re.compile(
    r"""(?P<kind>import|export)\s+(?:type\s+)?(?P<body>.+?)\s+from\s+['"](?P<source>[^'"]+)['"]""",
    re.M,
)
_SIDE_IMPORT_RE = re.compile(r"""^import\s+['"](?P<source>[^'"]+)['"]\s*;?\s*$""", re.M)
_REQUIRE_RE = re.compile(r"""require\(\s*['"](?P<source>[^'"]+)['"]\s*\)""")
_FUNC_RE = re.compile(
    r"""^(?P<export>export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(?P<name>[A-Za-z_$][\w$]*)\s*\((?P<args>[^)]*)\)""",
    re.M,
)
_CLASS_RE = re.compile(
    r"""^(?P<export>export\s+(?:default\s+)?)?class\s+(?P<name>[A-Za-z_$][\w$]*)""",
    re.M,
)
_ARROW_RE = re.compile(
    r"""^(?P<export>export\s+(?:default\s+)?)?(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>""",
    re.M,
)
_CONST_RE = re.compile(
    r"""^(?P<export>export\s+(?:default\s+)?)?(?:const|let|var)\s+(?P<name>[A-Za-z_$][\w$]*)\s*=""",
    re.M,
)
_INTERFACE_RE = re.compile(
    r"""^(?P<export>export\s+)?(?:interface|type)\s+(?P<name>[A-Za-z_$][\w$]*)""",
    re.M,
)
_HOOK_NAME = re.compile(r"^use[A-Z]")
_COMPONENT_NAME = re.compile(r"^[A-Z]")


def line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def classify_named(name: str, base: str, language: str) -> str:
    if _HOOK_NAME.match(name):
        return "hook"
    if base in ("arrow_function", "function") and _COMPONENT_NAME.match(name) and language in (
        "jsx",
        "tsx",
    ):
        return "component"
    return base


def parse_file(repo: str, rel_path: str, content: str, language: str) -> FileParse:
    scan = strip_comments_for_scan(content)
    fhash = file_sha(content)
    fp = FileParse(repo=repo, file_path=rel_path, language=language, file_hash=fhash)
    seen: set[tuple[str, str, int]] = set()

    def add_node(
        node_type: str,
        name: str,
        signature: str,
        start: int,
        exported: bool,
        default_export: bool = False,
    ) -> None:
        ln = line_of(content, start)
        key = (node_type, name, ln)
        if key in seen or not name:
            return
        seen.add(key)
        ntype = classify_named(name, node_type, language)
        nid = stable_id("node", WORKSPACE_ID, repo, rel_path, ntype, name, ln)
        fp.nodes.append(
            AstNode(
                id=nid,
                workspace_id=WORKSPACE_ID,
                repo=repo,
                file_path=rel_path,
                node_type=ntype,
                node_name=name,
                signature=signature[:500],
                line_start=ln,
                line_end=ln,
                is_exported=1 if exported else 0,
                is_default_export=1 if default_export else 0,
                language=language,
                file_hash=fhash,
            )
        )

    for m in _FUNC_RE.finditer(scan):
        exp = m.group("export") or ""
        add_node(
            "function",
            m.group("name"),
            m.group(0).strip()[:240],
            m.start(),
            bool(exp),
            "default" in exp,
        )

    for m in _CLASS_RE.finditer(scan):
        exp = m.group("export") or ""
        add_node(
            "class",
            m.group("name"),
            m.group(0).strip()[:240],
            m.start(),
            bool(exp),
            "default" in exp,
        )

    for m in _ARROW_RE.finditer(scan):
        exp = m.group("export") or ""
        add_node(
            "arrow_function",
            m.group("name"),
            m.group(0).strip()[:240],
            m.start(),
            bool(exp),
            "default" in exp,
        )

    for m in _INTERFACE_RE.finditer(scan):
        raw = m.group(0)
        ntype = "interface" if "interface" in raw else "type_alias"
        exp = m.group("export") or ""
        add_node(ntype, m.group("name"), raw.strip()[:240], m.start(), bool(exp))

    # top-level const/let that weren't captured as arrows
    arrow_names = {n.node_name for n in fp.nodes if n.node_type in ("arrow_function", "hook", "component")}
    for m in _CONST_RE.finditer(scan):
        name = m.group("name")
        if name in arrow_names:
            continue
        exp = m.group("export") or ""
        add_node(
            "const",
            name,
            m.group(0).strip()[:240],
            m.start(),
            bool(exp),
            "default" in exp,
        )

    for m in _IMPORT_RE.finditer(scan):
        source = m.group("source")
        kind = m.group("kind")
        body = (m.group("body") or "").strip()
        names: list[str] = []
        if body.startswith("{"):
            names = [p.strip().split(" as ")[0].strip() for p in body.strip("{} ").split(",") if p.strip()]
        elif body.startswith("*"):
            names = ["*"]
        else:
            # default import maybe with named
            parts = [p.strip() for p in body.split(",") if p.strip()]
            for p in parts:
                if p.startswith("{"):
                    continue
                names.append(p.split(" as ")[0].strip())
        if not names:
            names = ["*"]
        for name in names:
            add_node(
                "import" if kind == "import" else "export",
                name or source,
                m.group(0).strip()[:240],
                m.start(),
                kind == "export",
            )
            fp.imports.append(
                {
                    "kind": kind,
                    "name": name,
                    "source": source,
                    "line": line_of(content, m.start()),
                }
            )

    for m in _SIDE_IMPORT_RE.finditer(scan):
        source = m.group("source")
        add_node("import", source, m.group(0).strip()[:240], m.start(), False)
        fp.imports.append(
            {"kind": "import", "name": "*", "source": source, "line": line_of(content, m.start())}
        )

    for m in _REQUIRE_RE.finditer(scan):
        source = m.group("source")
        fp.imports.append(
            {
                "kind": "require",
                "name": "*",
                "source": source,
                "line": line_of(content, m.start()),
            }
        )

    return fp


def iter_repo_files(repo_path: Path, walk_roots: tuple[str, ...]) -> list[Path]:
    files: list[Path] = []
    for root_name in walk_roots:
        base = repo_path / root_name
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
            for fn in filenames:
                p = Path(dirpath) / fn
                if p.suffix.lower() in ALLOWED_EXT:
                    files.append(p)
    return sorted(files)


def resolve_import(source: str, from_file: str, repo_files: set[str]) -> tuple[str | None, int]:
    """Return (resolved_rel_path or None, is_external)."""
    if not source.startswith(".") and not source.startswith("/"):
        return None, 1
    from_dir = str(Path(from_file).parent)
    joined = os.path.normpath(os.path.join(from_dir, source)).replace("\\", "/")
    candidates = [
        joined,
        f"{joined}.js",
        f"{joined}.jsx",
        f"{joined}.ts",
        f"{joined}.tsx",
        f"{joined}.mjs",
        f"{joined}.cjs",
        f"{joined}/index.js",
        f"{joined}/index.ts",
        f"{joined}/index.tsx",
        f"{joined}/index.jsx",
    ]
    for c in candidates:
        if c in repo_files:
            return c, 0
    return joined, 0


# ── chunks ────────────────────────────────────────────────────────────────────


def chunk0_verify() -> int:
    print("\n══ CHUNK 0 — verify D1 / vector stack ══")
    hard_fail = 0
    soft_warn = 0

    # tables
    tables = {
        r["name"]
        for r in d1_query(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('codebase_ast_nodes','codebase_dep_edges',"
            "'agentsam_code_index_job','agentsam_codebase_index_health',"
            "'agentsam_pgvector_lane_registry','vectorize_index_registry')"
        )
    }
    for t in (
        "codebase_ast_nodes",
        "codebase_dep_edges",
        "agentsam_code_index_job",
        "agentsam_pgvector_lane_registry",
        "vectorize_index_registry",
    ):
        if t in tables:
            ok(f"table {t}")
        else:
            fail(f"missing table {t}")
            hard_fail += 1

    if "codebase_ast_nodes" in tables and "codebase_dep_edges" in tables:
        counts = d1_query(
            "SELECT (SELECT COUNT(*) FROM codebase_ast_nodes) AS nodes, "
            "(SELECT COUNT(*) FROM codebase_dep_edges) AS edges"
        )[0]
        ok(f"row counts: nodes={counts['nodes']} edges={counts['edges']}")
        cols_n = [r["name"] for r in d1_query("PRAGMA table_info(codebase_ast_nodes)")]
        cols_e = [r["name"] for r in d1_query("PRAGMA table_info(codebase_dep_edges)")]
        write_json(
            "chunk0_schema.json",
            {"ast_nodes_columns": cols_n, "dep_edges_columns": cols_e, "counts": counts},
        )
        ok(f"schema snapshot → artifacts/ast_rag_phase1/chunk0_schema.json")
    else:
        warn("Phase 1 tables missing — apply migrations/952_codebase_ast_nodes_and_dep_edges.sql")
        soft_warn += 1

    jobs = d1_query(
        "SELECT id, status, workspace_id, source_type, chunk_count, symbol_count "
        "FROM agentsam_code_index_job ORDER BY updated_at DESC LIMIT 10"
    )
    write_json("chunk0_code_index_jobs.json", jobs)
    ok(f"code_index_job rows: {len(jobs)}")

    lanes = d1_query(
        "SELECT id, table_name, purpose, is_active FROM agentsam_pgvector_lane_registry "
        "WHERE table_name LIKE '%codebase%' OR purpose LIKE '%code%'"
    )
    write_json("chunk0_pgvector_lanes.json", lanes)
    active = [r for r in lanes if int(r.get("is_active") or 0) == 1]
    if active:
        ok(f"active codebase pgvector lane(s): {[r['id'] for r in active]}")
    else:
        warn("no active codebase pgvector lane")
        soft_warn += 1

    vix = d1_query(
        "SELECT binding_name, index_name, dimensions FROM vectorize_index_registry "
        "WHERE binding_name = 'AGENTSAM_VECTORIZE_CODE' OR index_name LIKE '%codebase%'"
    )
    write_json("chunk0_vectorize.json", vix)
    if vix:
        ok(f"Vectorize CODE binding: {vix[0].get('binding_name')} → {vix[0].get('index_name')}")
    else:
        warn("AGENTSAM_VECTORIZE_CODE not in vectorize_index_registry")
        soft_warn += 1

    # local paths
    for spec in REPO_SPECS:
        p = Path(os.environ.get(f"IAM_REPO_{spec['key'].upper().replace('-', '_')}", spec["default_path"]))
        if p.is_dir():
            ok(f"local repo {spec['key']}: {p}")
        else:
            fail(f"local repo missing {spec['key']}: {p}")
            hard_fail += 1

    summary = {"hard_fail": hard_fail, "soft_warn": soft_warn, "tables": sorted(tables)}
    write_json("chunk0_summary.json", summary)
    print(f"\nChunk 0 done — fails={hard_fail} warns={soft_warn}")
    return 1 if hard_fail else 0


def chunk1_walk(main_path: Path, mcp_path: Path, max_files: int | None) -> int:
    print("\n══ CHUNK 1 — walk + symbol extract ══")
    paths = {
        "inneranimalmedia": main_path,
        "inneranimalmedia-mcp-server": mcp_path,
    }
    all_parses: list[dict[str, Any]] = []
    stats: dict[str, Any] = {}

    for spec in REPO_SPECS:
        repo_path = paths[spec["key"]]
        if not repo_path.is_dir():
            fail(f"skip missing {spec['key']}")
            continue
        files = iter_repo_files(repo_path, spec["walk_roots"])
        if max_files is not None:
            files = files[:max_files]
        print(f"\n  {spec['key']}: {len(files)} files under {spec['walk_roots']}")
        node_count = 0
        import_count = 0
        by_type: dict[str, int] = defaultdict(int)
        repo_parses: list[dict[str, Any]] = []

        for i, fp in enumerate(files, 1):
            rel = str(fp.relative_to(repo_path)).replace("\\", "/")
            try:
                text = fp.read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                warn(f"read fail {rel}: {e}")
                continue
            if len(text) > 400_000:
                warn(f"skip huge file {rel} ({len(text)} bytes)")
                continue
            lang = LANG_BY_EXT.get(fp.suffix.lower(), "js")
            parsed = parse_file(spec["repo"], rel, text, lang)
            node_count += len(parsed.nodes)
            import_count += len(parsed.imports)
            for n in parsed.nodes:
                by_type[n.node_type] += 1
            repo_parses.append(
                {
                    "repo": parsed.repo,
                    "file_path": parsed.file_path,
                    "language": parsed.language,
                    "file_hash": parsed.file_hash,
                    "nodes": [asdict(n) for n in parsed.nodes],
                    "imports": parsed.imports,
                }
            )
            if i % 100 == 0:
                print(f"    … {i}/{len(files)} files")

        out_name = f"chunk1_walk_{spec['key'].replace('-', '_')}.json"
        write_json(out_name, repo_parses)
        stats[spec["key"]] = {
            "files": len(files),
            "nodes": node_count,
            "imports": import_count,
            "by_type": dict(by_type),
            "artifact": out_name,
        }
        ok(f"{spec['key']}: files={len(files)} nodes={node_count} imports={import_count}")
        print(f"    by_type: {dict(by_type)}")
        all_parses.extend(repo_parses)

    write_json("chunk1_all_parses.json", all_parses)
    write_json("chunk1_stats.json", stats)
    print(f"\nChunk 1 done — artifacts/ast_rag_phase1/chunk1_*.json")
    return 0


def chunk2_edges() -> int:
    print("\n══ CHUNK 2 — build dep edges ══")
    parses = read_json("chunk1_all_parses.json")
    by_repo_files: dict[str, set[str]] = defaultdict(set)
    file_import_nodes: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    # map (repo, file) → import-type nodes for edge sources
    for p in parses:
        by_repo_files[p["repo"]].add(p["file_path"])
        for n in p["nodes"]:
            if n["node_type"] == "import":
                file_import_nodes[(p["repo"], p["file_path"])].append(n)

    # Prefer one "file sentinel" node per file for import edges when no import node
    file_anchor: dict[tuple[str, str], str] = {}
    for p in parses:
        key = (p["repo"], p["file_path"])
        if p["nodes"]:
            file_anchor[key] = p["nodes"][0]["id"]

    # Target anchors: first exported symbol or first node in file
    target_anchor: dict[tuple[str, str], str] = {}
    for p in parses:
        key = (p["repo"], p["file_path"])
        exported = next((n for n in p["nodes"] if n.get("is_exported")), None)
        if exported:
            target_anchor[key] = exported["id"]
        elif p["nodes"]:
            target_anchor[key] = p["nodes"][0]["id"]

    edges: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    external = 0
    unresolved = 0

    for p in parses:
        repo = p["repo"]
        src_file = p["file_path"]
        src_nodes = file_import_nodes.get((repo, src_file)) or []
        src_id = src_nodes[0]["id"] if src_nodes else file_anchor.get((repo, src_file))
        if not src_id:
            continue
        for imp in p.get("imports") or []:
            resolved, is_ext = resolve_import(imp["source"], src_file, by_repo_files[repo])
            if is_ext:
                # synthetic external target node id (not inserted — edge skipped unless we create placeholder)
                external += 1
                continue
            if not resolved or resolved not in by_repo_files[repo]:
                unresolved += 1
                continue
            tgt_id = target_anchor.get((repo, resolved))
            if not tgt_id:
                unresolved += 1
                continue
            etype = "imports"
            sig = (src_id, tgt_id, etype)
            if sig in seen:
                continue
            seen.add(sig)
            eid = stable_id("edge", WORKSPACE_ID, repo, src_id, tgt_id, etype)
            edges.append(
                {
                    "id": eid,
                    "workspace_id": WORKSPACE_ID,
                    "repo": repo,
                    "source_node_id": src_id,
                    "target_node_id": tgt_id,
                    "edge_type": etype,
                    "source_file": src_file,
                    "target_file": resolved,
                    "is_external": 0,
                    "index_job_id": INDEX_JOB_ID,
                }
            )

    write_json("chunk2_edges.json", edges)
    write_json(
        "chunk2_stats.json",
        {
            "edges": len(edges),
            "external_imports_skipped": external,
            "unresolved_relative": unresolved,
        },
    )
    ok(f"internal import edges={len(edges)} (skipped external={external}, unresolved={unresolved})")
    print("Chunk 2 done — artifacts/ast_rag_phase1/chunk2_edges.json")
    return 0


def _batched(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[i : i + size] for i in range(0, len(rows), size)]


NODE_INSERT_SQL = (
    "INSERT OR REPLACE INTO codebase_ast_nodes ("
    "id, workspace_id, repo, file_path, node_type, node_name, signature, docstring, "
    "line_start, line_end, is_exported, is_default_export, language, file_hash, index_job_id"
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)
EDGE_INSERT_SQL = (
    "INSERT OR IGNORE INTO codebase_dep_edges ("
    "id, workspace_id, repo, source_node_id, target_node_id, edge_type, "
    "source_file, target_file, is_external, index_job_id"
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)


def _node_params(n: dict[str, Any]) -> list[Any]:
    return [
        n["id"],
        n["workspace_id"],
        n["repo"],
        n["file_path"],
        n["node_type"],
        n["node_name"],
        n.get("signature"),
        n.get("docstring"),
        n["line_start"],
        n["line_end"],
        n.get("is_exported", 0),
        n.get("is_default_export", 0),
        n["language"],
        n.get("file_hash"),
        n.get("index_job_id") or INDEX_JOB_ID,
    ]


def _edge_params(e: dict[str, Any]) -> list[Any]:
    return [
        e["id"],
        e["workspace_id"],
        e["repo"],
        e["source_node_id"],
        e["target_node_id"],
        e["edge_type"],
        e["source_file"],
        e["target_file"],
        e.get("is_external", 0),
        e.get("index_job_id") or INDEX_JOB_ID,
    ]


def chunk3_upsert(
    commit: bool,
    repos_filter: list[str] | None,
    *,
    resume: bool = False,
    batch_size: int = 80,
) -> int:
    print("\n══ CHUNK 3 — upsert to D1 ══")
    parses = read_json("chunk1_all_parses.json")
    edges = read_json("chunk2_edges.json")
    nodes: list[dict[str, Any]] = []
    for p in parses:
        if repos_filter and p["repo"] not in repos_filter:
            continue
        nodes.extend(p["nodes"])
    if repos_filter:
        edges = [e for e in edges if e["repo"] in repos_filter]

    write_json(
        "chunk3_payload_preview.json",
        {"node_count": len(nodes), "edge_count": len(edges), "sample_nodes": nodes[:5], "sample_edges": edges[:5]},
    )
    ok(f"payload: {len(nodes)} nodes, {len(edges)} edges")
    print(f"  mode: {'resume (no wipe)' if resume else 'full replace'} | batch_size={batch_size}")

    if not commit:
        warn("dry-run only — pass --commit to write D1")
        print("Chunk 3 dry-run done")
        return 0

    repos = sorted({n["repo"] for n in nodes})
    if not resume:
        for repo in repos:
            d1_query(
                "DELETE FROM codebase_dep_edges WHERE workspace_id = ? AND repo = ?",
                [WORKSPACE_ID, repo],
            )
            d1_query(
                "DELETE FROM codebase_ast_nodes WHERE workspace_id = ? AND repo = ?",
                [WORKSPACE_ID, repo],
            )
            ok(f"cleared prior rows for {repo}")
    else:
        warn("resume mode — keeping existing rows; INSERT OR REPLACE / OR IGNORE")

    inserted_n = 0
    for batch in _batched(nodes, batch_size):
        d1_batch([{"sql": NODE_INSERT_SQL, "params": _node_params(n)} for n in batch])
        inserted_n += len(batch)
        print(f"    nodes {inserted_n}/{len(nodes)}")

    inserted_e = 0
    for batch in _batched(edges, batch_size):
        d1_batch([{"sql": EDGE_INSERT_SQL, "params": _edge_params(e)} for e in batch])
        inserted_e += len(batch)
        print(f"    edges {inserted_e}/{len(edges)}")

    counts = d1_query(
        "SELECT (SELECT COUNT(*) FROM codebase_ast_nodes WHERE workspace_id = ?) AS nodes, "
        "(SELECT COUNT(*) FROM codebase_dep_edges WHERE workspace_id = ?) AS edges",
        [WORKSPACE_ID, WORKSPACE_ID],
    )[0]
    write_json(
        "chunk3_result.json",
        {"inserted_nodes": inserted_n, "inserted_edges": inserted_e, "d1": counts, "resume": resume},
    )
    ok(f"D1 now nodes={counts['nodes']} edges={counts['edges']}")
    print("Chunk 3 commit done")
    return 0


# ── main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="AST-RAG Phase 1 dual-repo walker")
    ap.add_argument(
        "--chunk",
        required=True,
        choices=["0", "1", "2", "3", "verify", "walk", "edges", "upsert", "all"],
        help="Which phase to run",
    )
    ap.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    ap.add_argument("--main-repo", type=Path, default=DEFAULT_MAIN_REPO)
    ap.add_argument("--mcp-repo", type=Path, default=DEFAULT_MCP_REPO)
    ap.add_argument("--max-files", type=int, default=None, help="Cap files per repo (smoke)")
    ap.add_argument("--commit", action="store_true", help="Chunk 3: actually write D1")
    ap.add_argument(
        "--resume",
        action="store_true",
        help="Chunk 3: do not wipe tables; INSERT OR REPLACE nodes / OR IGNORE edges",
    )
    ap.add_argument(
        "--batch-size",
        type=int,
        default=80,
        help="Chunk 3: statements per D1 HTTP batch (default 80)",
    )
    ap.add_argument(
        "--repo-filter",
        action="append",
        default=None,
        help="Limit upsert to full repo name (repeatable)",
    )
    args = ap.parse_args()

    loaded = load_env_cloudflare(args.env_file)
    print(f"AST-RAG Phase 1 walker")
    print(f"  env file: {args.env_file} ({'loaded ' + str(len(loaded)) + ' keys' if loaded else 'missing'})")
    print(f"  main: {args.main_repo}")
    print(f"  mcp:  {args.mcp_repo}")
    ensure_artifacts()

    chunk = {
        "verify": "0",
        "walk": "1",
        "edges": "2",
        "upsert": "3",
    }.get(args.chunk, args.chunk)

    rc = 0
    if chunk in ("0", "all"):
        rc = chunk0_verify() or rc
    if chunk in ("1", "all") and rc == 0:
        rc = chunk1_walk(args.main_repo, args.mcp_repo, args.max_files) or rc
    if chunk in ("2", "all") and rc == 0:
        rc = chunk2_edges() or rc
    if chunk in ("3", "all") and rc == 0:
        rc = (
            chunk3_upsert(
                args.commit,
                args.repo_filter,
                resume=args.resume,
                batch_size=max(1, args.batch_size),
            )
            or rc
        )
    return rc


if __name__ == "__main__":
    sys.exit(main())
