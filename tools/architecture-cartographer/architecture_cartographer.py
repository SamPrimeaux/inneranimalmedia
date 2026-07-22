#!/usr/bin/env python3
"""
architecture_cartographer.py

Read-only platform asset inventory & drift audit for Inner Animal Media.

Lanes:
  1) Repository structure (languages, manifests, Cloudflare signals, size)
  2) Cloudflare D1 (table walk, schema clusters, convention gaps)
  3) Supabase Postgres (catalog / RLS / constraints — batched)
  4) Optional OpenAI teaching review (sanitized evidence only)
  5) Snapshot diff (--diff-against)

Stdlib only. Secrets stay in env / .env.cloudflare — never committed.

Examples:
  python3 tools/architecture-cartographer/architecture_cartographer.py .

  ./scripts/with-cloudflare-env.sh python3 \\
    tools/architecture-cartographer/architecture_cartographer.py . \\
    --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \\
    --label platform

  ./scripts/with-cloudflare-env.sh python3 \\
    tools/architecture-cartographer/architecture_cartographer.py . \\
    --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \\
    --supabase-project-ref dpmuvynqixblxsilnlut \\
    --supabase-schemas public,agentsam \\
    --label platform \\
    --ai --model gpt-5.6-sol --reasoning-effort high
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCRIPT_VERSION = "0.2.0"
DEFAULT_OUT = "tools/architecture-cartographer/architecture-map"
CONVENTION_COLUMNS = ["created_at", "updated_at"]
EXPECTED_PK = ("id",)
IGNORE_TABLE_PREFIXES = ("sqlite_", "_cf_")
REQUEST_TIMEOUT = 45
RETRY_COUNT = 3
RETRY_BACKOFF = 1.5
MAX_TEXT_BYTES = 2_000_000
MAX_IMPORT_BYTES = 750_000
MAX_AI_BYTES = 280_000
MAX_OVERSIZED = 80

SKIP_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode-test", ".wrangler", ".turbo",
    ".next", ".nuxt", ".svelte-kit", ".cache", ".parcel-cache", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "__pycache__", "node_modules", "vendor_modules",
    "site-packages", "dist", "build", "coverage", "target", "out", ".venv",
    "venv", "env", "architecture-map",
}
SKIP_FILES = {
    ".env", ".dev.vars", ".env.cloudflare", "id_rsa", "id_ed25519",
    "credentials.json", "service-account.json",
}
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
    ".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi", ".webm",
    ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar",
    ".pdf", ".woff", ".woff2", ".ttf", ".otf",
    ".sqlite", ".sqlite3", ".db", ".d1",
    ".glb", ".gltf", ".fbx", ".stl", ".blend",
    ".pyc", ".class", ".o", ".so", ".dylib", ".dll", ".exe", ".lockb",
}
LANGUAGE_BY_SUFFIX = {
    ".py": "Python", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript",
    ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript",
    ".cts": "TypeScript", ".go": "Go", ".rs": "Rust", ".sql": "SQL",
    ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell",
    ".html": "HTML", ".css": "CSS", ".scss": "SCSS",
    ".md": "Markdown", ".mdx": "MDX", ".json": "JSON", ".toml": "TOML",
    ".yaml": "YAML", ".yml": "YAML",
}
MANIFEST_NAMES = {
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
    "bun.lock", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml",
    "wrangler.toml", "wrangler.json", "wrangler.jsonc", "wrangler.production.toml",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml",
    "tsconfig.json", "vite.config.ts", "vite.config.js", "vite.config.mjs",
}
FRAMEWORK_RULES = {
    "react": ("React", "frontend_framework"),
    "vite": ("Vite", "build_tool"),
    "hono": ("Hono", "edge_framework"),
    "wrangler": ("Wrangler", "cloud_cli"),
    "@cloudflare/agents": ("Cloudflare Agents SDK", "agent_framework"),
    "@cloudflare/sandbox": ("Cloudflare Sandbox SDK", "execution_runtime"),
    "@supabase/supabase-js": ("Supabase JS", "database_client"),
    "openai": ("OpenAI SDK", "ai_sdk"),
    "@anthropic-ai/sdk": ("Anthropic SDK", "ai_sdk"),
    "@google/generative-ai": ("Google Generative AI SDK", "ai_sdk"),
    "zod": ("Zod", "schema_validation"),
    "playwright": ("Playwright", "browser_automation"),
    "monaco-editor": ("Monaco Editor", "code_editor"),
}
PYTHON_FRAMEWORK_RULES = {
    "fastapi": ("FastAPI", "backend_framework"),
    "openai": ("OpenAI Python SDK", "ai_sdk"),
    "anthropic": ("Anthropic Python SDK", "ai_sdk"),
    "cloudflare": ("Cloudflare Python SDK", "cloud_sdk"),
}
CF_BINDING_KEYS = {
    "d1_databases": "D1 database",
    "r2_buckets": "R2 bucket",
    "kv_namespaces": "KV namespace",
    "durable_objects": "Durable Object",
    "queues": "Queue",
    "vectorize": "Vectorize index",
    "hyperdrive": "Hyperdrive",
    "ai": "Workers AI",
    "browser": "Browser Rendering",
    "services": "Service binding",
    "containers": "Container",
    "workflows": "Workflow",
}
SENSITIVE_NAME_RE = re.compile(
    r"(password|passwd|secret|token|api[_-]?key|private[_-]?key|authorization|"
    r"cookie|session|email|phone|ssn|credential|access[_-]?key)",
    re.I,
)
SECRET_VALUE_RE = [
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
]
JS_IMPORT_RE = re.compile(
    r"""(?mx)
    ^\s*import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]
    |^\s*export\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]
    |require\(\s*['"]([^'"]+)['"]\s*\)
    |import\(\s*['"]([^'"]+)['"]\s*\)
    """
)
LEGACY_NAME_RE = re.compile(r"(legacy|_old|_bak|_backup|_deprecated|_v\d+$)", re.I)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def info(msg: str) -> None:
    print(msg)


def warn(msg: str) -> None:
    print(f"[WARN] {msg}", file=sys.stderr)


def json_write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, default=str) + "\n", encoding="utf-8")


def text_write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def env_first(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def load_dotenv_cloudflare(repo: Path) -> None:
    """Soft-load gitignored .env.cloudflare when present (does not override set vars)."""
    path = repo / ".env.cloudflare"
    if not path.is_file():
        return
    try:
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = val
    except OSError as exc:
        warn(f"Could not read .env.cloudflare: {exc}")


def read_text_limited(path: Path, max_bytes: int = MAX_TEXT_BYTES) -> str:
    try:
        with path.open("rb") as handle:
            raw = handle.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raw = raw[:max_bytes]
        if b"\x00" in raw[:4096]:
            return ""
        return raw.decode("utf-8", errors="replace")
    except OSError:
        return ""


def redact_scalar(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    out = value
    for pattern in SECRET_VALUE_RE:
        out = pattern.sub("[REDACTED_SECRET]", out)
    if len(out) > 2000:
        out = out[:2000] + "…[TRUNCATED]"
    return out


def sanitize_for_ai(value: Any, parent_key: str = "") -> Any:
    if SENSITIVE_NAME_RE.search(parent_key):
        return "[REDACTED_FIELD]"
    if isinstance(value, dict):
        result = {}
        for key, child in value.items():
            key_s = str(key)
            if key_s in {"sample", "samples", "sample_rows", "source_text", "content"}:
                continue
            result[key_s] = sanitize_for_ai(child, key_s)
        return result
    if isinstance(value, list):
        return [sanitize_for_ai(item, parent_key) for item in value[:1500]]
    return redact_scalar(value)


def cap_json_bytes(value: Any, max_bytes: int) -> Any:
    encoded = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
    if len(encoded) <= max_bytes:
        return value
    if not isinstance(value, dict):
        return value
    reduced = dict(value)
    for key in [
        "oversized_files", "all_manifests", "directory_stats",
        "exact_schema_clusters", "row_count_changes", "tables",
        "relations", "policies", "functions",
    ]:
        reduced.pop(key, None)
        encoded = json.dumps(reduced, ensure_ascii=False, default=str).encode("utf-8")
        if len(encoded) <= max_bytes:
            return reduced
    for key, child in list(reduced.items()):
        if isinstance(child, list) and len(child) > 80:
            reduced[key] = child[:80]
        elif isinstance(child, dict) and len(child) > 100:
            reduced[key] = dict(list(child.items())[:100])
    return reduced


def human_bytes(value: int | None) -> str:
    if value is None:
        return "unknown"
    number = float(value)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if number < 1024 or unit == "TB":
            return f"{number:.1f} {unit}"
        number /= 1024
    return f"{number:.1f} TB"


def markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        cells = [str(v).replace("|", "\\|").replace("\n", " ") for v in row]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def http_json(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = REQUEST_TIMEOUT,
) -> Any:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Repo scan
# ---------------------------------------------------------------------------

def is_skipped_file(path: Path) -> bool:
    name = path.name
    if name in SKIP_FILES:
        return True
    if name.startswith(".env.") and name not in {".env.example", ".env.sample", ".env.template"}:
        return True
    return path.suffix.lower() in SKIP_SUFFIXES


def iter_repo_files(root: Path) -> Iterable[Path]:
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".git")]
        for filename in files:
            path = Path(current) / filename
            if is_skipped_file(path):
                continue
            yield path


def count_lines_quick(path: Path) -> int:
    try:
        count = 0
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                count += chunk.count(b"\n")
        return count + (1 if path.stat().st_size else 0)
    except OSError:
        return 0


def classify_component(rel: str) -> str:
    parts = [p.lower() for p in Path(rel).parts]
    if not parts:
        return "repository_root"
    first = parts[0]
    mapping = {
        "dashboard": "frontend_workspace",
        "src": "worker_backend",
        "containers": "container_service",
        "services": "service",
        "migrations": "database_control_plane",
        "scripts": "operator_automation",
        "tools": "operator_tooling",
        "docs": "documentation",
        "tests": "tests",
        "customers": "client_system",
        "clients": "client_system",
        "cms": "cms_product",
    }
    if first == "src":
        if "api" in parts:
            return "api_backend"
        if "core" in parts:
            return "platform_runtime"
        if "tools" in parts:
            return "agent_tools"
    return mapping.get(first, "other")


def parse_package_json(path: Path, root: Path) -> dict[str, Any]:
    try:
        payload = json.loads(read_text_limited(path, 500_000) or "{}")
    except json.JSONDecodeError:
        return {"path": path.relative_to(root).as_posix(), "error": "invalid_json"}
    deps: dict[str, str] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        section = payload.get(key)
        if isinstance(section, dict):
            deps.update({str(k): str(v) for k, v in section.items()})
    scripts = payload.get("scripts") if isinstance(payload.get("scripts"), dict) else {}
    return {
        "path": path.relative_to(root).as_posix(),
        "name": payload.get("name"),
        "dependencies": deps,
        "scripts": {str(k): str(v) for k, v in scripts.items()},
    }


def scan_python_imports(text: str) -> list[str]:
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return []
    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.append(node.module.split(".")[0])
    return modules


def scan_js_imports(text: str) -> list[str]:
    out: list[str] = []
    for match in JS_IMPORT_RE.finditer(text):
        value = next((g for g in match.groups() if g), None)
        if not value:
            continue
        if value.startswith((".", "/", "node:", "cloudflare:")):
            out.append(value)
            continue
        parts = value.split("/")
        out.append("/".join(parts[:2]) if value.startswith("@") and len(parts) >= 2 else parts[0])
    return out


def scan_wrangler(path: Path, text: str, root: Path) -> dict[str, Any]:
    signals = []
    for key, display in CF_BINDING_KEYS.items():
        if re.search(rf"(?m)^\s*(?:\[\[?{re.escape(key)}\]?\]|{re.escape(key)}\s*[=:])", text):
            signals.append(display)
    return {
        "path": path.relative_to(root).as_posix(),
        "platform_signals": sorted(set(signals)),
    }


def scan_repository(root: Path) -> dict[str, Any]:
    start = time.time()
    files: list[dict[str, Any]] = []
    language_counts: Counter[str] = Counter()
    language_bytes: Counter[str] = Counter()
    language_lines: Counter[str] = Counter()
    directory_counts: Counter[str] = Counter()
    package_manifests: list[dict[str, Any]] = []
    wrangler_configs: list[dict[str, Any]] = []
    dockerfiles: list[str] = []
    py_imports: Counter[str] = Counter()
    js_imports: Counter[str] = Counter()
    oversized: list[dict[str, Any]] = []
    clutter_named: list[str] = []
    entrypoints: list[str] = []
    all_manifests: list[str] = []
    sql_tables: Counter[str] = Counter()
    py_count = 0

    for index, path in enumerate(iter_repo_files(root), 1):
        rel = path.relative_to(root).as_posix()
        try:
            st = path.stat()
        except OSError:
            continue
        suffix = path.suffix.lower()
        language = LANGUAGE_BY_SUFFIX.get(suffix)
        if path.name.startswith("Dockerfile"):
            language = "Dockerfile"
        lines = count_lines_quick(path) if language else 0
        component = classify_component(rel)
        row = {
            "path": rel,
            "bytes": st.st_size,
            "lines": lines,
            "language": language,
            "component": component,
        }
        files.append(row)
        if language:
            language_counts[language] += 1
            language_bytes[language] += st.st_size
            language_lines[language] += lines
        directory_counts[Path(rel).parts[0] if Path(rel).parts else "."] += 1
        if LEGACY_NAME_RE.search(path.name):
            clutter_named.append(rel)
        if st.st_size >= 150_000 and language:
            oversized.append({**row})
        if path.name in MANIFEST_NAMES or path.name.startswith("Dockerfile"):
            all_manifests.append(rel)
        if path.name == "package.json":
            package_manifests.append(parse_package_json(path, root))
        if path.name.startswith("wrangler") and suffix in {".toml", ".json", ".jsonc"}:
            wrangler_configs.append(scan_wrangler(path, read_text_limited(path, 500_000), root))
        if path.name.startswith("Dockerfile"):
            dockerfiles.append(rel)
        if st.st_size <= MAX_IMPORT_BYTES and language in {"Python", "JavaScript", "TypeScript", "SQL"}:
            text = read_text_limited(path, MAX_IMPORT_BYTES)
            if language == "Python":
                py_imports.update(scan_python_imports(text))
                py_count += 1
            elif language in {"JavaScript", "TypeScript"}:
                js_imports.update(scan_js_imports(text))
            elif language == "SQL":
                for match in re.finditer(
                    r'(?i)\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?([A-Za-z0-9_.-]+)',
                    text,
                ):
                    sql_tables[match.group(1).strip('"`[]')] += 1
        if path.name in {"index.js", "index.ts", "main.py", "server.js", "server.mjs", "app.py"}:
            entrypoints.append(rel)
        if index % 2000 == 0:
            info(f"  repo scan: {index} files…")

    dep_names: set[str] = set()
    for manifest in package_manifests:
        dep_names.update(manifest.get("dependencies", {}).keys())
    frameworks = []
    for name in sorted(dep_names):
        rule = FRAMEWORK_RULES.get(name.lower())
        if rule:
            frameworks.append({"name": rule[0], "category": rule[1], "evidence": name})
    py_frameworks = []
    for name in list(py_imports.keys()):
        rule = PYTHON_FRAMEWORK_RULES.get(name.lower())
        if rule:
            py_frameworks.append({"name": rule[0], "category": rule[1], "evidence": name})

    total_lines = sum(language_lines.values())
    language_rows = [
        {
            "language": lang,
            "files": language_counts[lang],
            "bytes": language_bytes[lang],
            "lines": language_lines[lang],
            "line_share_percent": round(language_lines[lang] / total_lines * 100, 2) if total_lines else 0,
        }
        for lang, _ in language_counts.most_common()
    ]
    components: dict[str, dict[str, Any]] = {}
    for row in files:
        bucket = components.setdefault(row["component"], {
            "id": row["component"], "file_count": 0, "bytes": 0, "lines": 0, "languages": Counter(),
        })
        bucket["file_count"] += 1
        bucket["bytes"] += row["bytes"]
        bucket["lines"] += row["lines"]
        if row["language"]:
            bucket["languages"][row["language"]] += 1
    component_rows = [
        {
            "id": b["id"],
            "file_count": b["file_count"],
            "bytes": b["bytes"],
            "lines": b["lines"],
            "languages": dict(b["languages"].most_common()),
        }
        for b in sorted(components.values(), key=lambda x: -x["bytes"])
    ]
    cf_signals = sorted({
        s for cfg in wrangler_configs for s in cfg.get("platform_signals", [])
    })

    return {
        "scan_version": SCRIPT_VERSION,
        "generated_at": iso_now(),
        "repo_root": str(root.resolve()),
        "repo_name": root.name,
        "duration_seconds": round(time.time() - start, 2),
        "file_count": len(files),
        "total_bytes": sum(f["bytes"] for f in files),
        "total_lines": total_lines,
        "languages": language_rows,
        "components": component_rows,
        "directory_stats": dict(directory_counts.most_common()),
        "frameworks": frameworks,
        "python_frameworks": py_frameworks,
        "package_manifests": [
            {"path": m["path"], "name": m.get("name"), "dependency_count": len(m.get("dependencies", {}))}
            for m in package_manifests
        ],
        "all_manifests": sorted(all_manifests),
        "wrangler_configs": wrangler_configs,
        "cloudflare_signals": cf_signals,
        "dockerfiles": sorted(dockerfiles),
        "entrypoint_candidates": sorted(set(entrypoints)),
        "top_javascript_imports": [{"name": k, "files": v} for k, v in js_imports.most_common(80)],
        "top_python_imports": [{"name": k, "files": v} for k, v in py_imports.most_common(80)],
        "sql_declared_tables": [{"name": k, "declarations": v} for k, v in sql_tables.most_common(200)],
        "oversized_files": sorted(oversized, key=lambda r: -r["bytes"])[:MAX_OVERSIZED],
        "clutter_named_files": sorted(clutter_named)[:200],
        "python_file_count": py_count,
        "architecture_signals": {
            "cloudflare_platform": bool(wrangler_configs),
            "containerized_services": bool(dockerfiles),
            "frontend_spa": any(f["name"] == "React" for f in frameworks) and any(f["name"] == "Vite" for f in frameworks),
            "python_specialist_lane": language_counts.get("Python", 0) > 0,
            "sql_control_plane": language_counts.get("SQL", 0) > 0 and len(sql_tables) > 20,
            "multi_provider_ai": sum(
                1 for n in dep_names if n in {"openai", "@anthropic-ai/sdk", "@google/generative-ai"}
            ) >= 2,
        },
    }


# ---------------------------------------------------------------------------
# D1
# ---------------------------------------------------------------------------

def d1_query(account_id: str, database_id: str, token: str, sql: str, params: list[Any] | None = None):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"
    last_error: Exception | None = None
    for attempt in range(1, RETRY_COUNT + 1):
        try:
            payload = http_json(
                url,
                method="POST",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                body={"sql": sql, "params": params or []},
            )
            if not payload.get("success"):
                raise RuntimeError(f"D1 API error: {payload.get('errors')}")
            results = payload.get("result") or []
            if not results:
                return [], {}
            first = results[0]
            return first.get("results", []) or [], first.get("meta", {}) or {}
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < RETRY_COUNT:
                time.sleep(RETRY_BACKOFF ** attempt)
    warn(f"D1 query failed: {last_error}")
    return [], {"error": str(last_error)}


def qid(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def schema_fingerprint(columns: list[dict[str, Any]]) -> str:
    signature = sorted(
        f"{c.get('name')}:{c.get('type')}:{c.get('notnull')}:{c.get('pk')}"
        for c in columns
    )
    return hashlib.sha1("|".join(signature).encode("utf-8")).hexdigest()[:12]


def table_family(name: str) -> str:
    lowered = name.lower()
    for prefix in (
        "agentsam_", "cms_", "auth_", "billing_", "stripe_", "terminal_",
        "designstudio_", "analytics_", "workflow_", "project_", "memory_",
        "vector_", "r2_", "mcp_",
    ):
        if lowered.startswith(prefix):
            return prefix.rstrip("_")
    return lowered.split("_", 1)[0] if "_" in lowered else "uncategorized"


def audit_d1_table(
    account_id: str,
    database_id: str,
    token: str,
    name: str,
    *,
    convention_columns: list[str],
    expected_pk: tuple[str, ...],
    check_orphans: bool,
) -> dict[str, Any]:
    columns, _ = d1_query(account_id, database_id, token, f"PRAGMA table_info({qid(name)});")
    fks, _ = d1_query(account_id, database_id, token, f"PRAGMA foreign_key_list({qid(name)});")
    indexes, _ = d1_query(account_id, database_id, token, f"PRAGMA index_list({qid(name)});")
    count_rows, _ = d1_query(account_id, database_id, token, f"SELECT COUNT(*) AS c FROM {qid(name)};")
    count = int(count_rows[0]["c"]) if count_rows else None
    pk_columns = [
        str(c.get("name"))
        for c in sorted(columns, key=lambda r: int(r.get("pk", 0) or 0))
        if int(c.get("pk", 0) or 0) > 0
    ]
    column_names = {str(c.get("name")) for c in columns}
    findings: list[dict[str, Any]] = []

    def add(code: str, severity: str, message: str, evidence: Any = None) -> None:
        item = {"code": code, "severity": severity, "message": message}
        if evidence is not None:
            item["evidence"] = evidence
        findings.append(item)

    if count == 0:
        add("EMPTY_TABLE", "info", "Zero rows — investigate, do not auto-delete.")
    if not pk_columns:
        add("NO_PRIMARY_KEY", "high", "No declared primary key.")
    elif expected_pk and tuple(pk_columns) != expected_pk:
        add("NONSTANDARD_PRIMARY_KEY", "info", f"PK {pk_columns} ≠ expected {list(expected_pk)}.")
    missing = [c for c in convention_columns if c not in column_names]
    if missing:
        add("MISSING_CONVENTION_COLUMNS", "low", f"Missing convention columns: {missing}.", missing)
    if LEGACY_NAME_RE.search(name):
        add("LEGACY_NAMED_TABLE", "medium", "Name suggests legacy/backup surface.")
    orphans: list[dict[str, Any]] = []
    if check_orphans and fks:
        orphans, _ = d1_query(account_id, database_id, token, f"PRAGMA foreign_key_check({qid(name)});")
        orphans = orphans[:50]
        if orphans:
            add("ORPHANED_FOREIGN_KEYS", "high", f"{len(orphans)} FK check violations (capped).", orphans[:10])

    return {
        "table": name,
        "family": table_family(name),
        "row_count": count,
        "columns": columns,
        "foreign_keys": fks,
        "indexes": indexes,
        "primary_key": pk_columns,
        "fingerprint": schema_fingerprint(columns),
        "findings": findings,
        "orphan_check": orphans,
    }


def scan_d1(
    *,
    account_id: str,
    database_id: str,
    token: str,
    label: str,
    convention_columns: list[str],
    expected_pk: tuple[str, ...],
    check_orphans: bool,
) -> dict[str, Any]:
    start = time.time()
    info(f"Listing D1 tables ({database_id})…")
    tables, _ = d1_query(
        account_id, database_id, token,
        "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;",
    )
    tables = [
        t for t in tables
        if t.get("name") and not str(t["name"]).startswith(IGNORE_TABLE_PREFIXES)
    ]
    info(f"Found {len(tables)} tables.")
    reports: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for index, table in enumerate(tables, 1):
        name = str(table["name"])
        info(f"  [{index}/{len(tables)}] {name}")
        try:
            reports.append(
                audit_d1_table(
                    account_id, database_id, token, name,
                    convention_columns=convention_columns,
                    expected_pk=expected_pk,
                    check_orphans=check_orphans,
                )
            )
        except Exception as exc:  # noqa: BLE001 — isolate per table
            warn(f"D1 audit failed for {name}: {exc}")
            failures.append({"table": name, "error": str(exc)})

    clusters: dict[str, list[str]] = defaultdict(list)
    finding_counts: Counter[str] = Counter()
    severity_counts: Counter[str] = Counter()
    family_counts: Counter[str] = Counter()
    family_rows: Counter[str] = Counter()
    for report in reports:
        clusters[report["fingerprint"]].append(report["table"])
        family_counts[report["family"]] += 1
        if isinstance(report["row_count"], int):
            family_rows[report["family"]] += report["row_count"]
        for finding in report["findings"]:
            finding_counts[finding["code"]] += 1
            severity_counts[finding["severity"]] += 1

    exact = {
        fp: sorted(names)
        for fp, names in sorted(clusters.items(), key=lambda i: (-len(i[1]), i[0]))
        if len(names) > 1
    }
    return {
        "scan_version": SCRIPT_VERSION,
        "generated_at": iso_now(),
        "database_id": database_id,
        "label": label,
        "duration_seconds": round(time.time() - start, 2),
        "table_count": len(reports),
        "failed_table_count": len(failures),
        "distinct_schema_patterns": len(clusters),
        "exact_schema_clusters": exact,
        "finding_counts": dict(finding_counts.most_common()),
        "severity_counts": dict(severity_counts.most_common()),
        "table_families": {
            fam: {"tables": n, "known_rows": family_rows.get(fam, 0)}
            for fam, n in family_counts.most_common()
        },
        "conventions": {
            "expected_columns": convention_columns,
            "expected_primary_key": list(expected_pk),
            "orphan_check_enabled": check_orphans,
        },
        "tables": reports,
        "failures": failures,
    }


# ---------------------------------------------------------------------------
# Supabase / Postgres (Management API, batched)
# ---------------------------------------------------------------------------

def supabase_sql(project_ref: str, token: str, sql: str) -> list[dict[str, Any]]:
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    last_error: Exception | None = None
    for attempt in range(1, RETRY_COUNT + 1):
        try:
            payload = http_json(
                url,
                method="POST",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                body={"query": sql},
                timeout=90,
            )
            if isinstance(payload, list):
                return payload
            if isinstance(payload, dict):
                if "result" in payload and isinstance(payload["result"], list):
                    return payload["result"]
                if "data" in payload and isinstance(payload["data"], list):
                    return payload["data"]
                # some versions return {rows: [...]}
                if "rows" in payload and isinstance(payload["rows"], list):
                    return payload["rows"]
            warn(f"Unexpected Supabase SQL response shape: {type(payload)}")
            return []
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:800]
            last_error = RuntimeError(f"HTTP {exc.code}: {detail}")
            if attempt < RETRY_COUNT:
                time.sleep(RETRY_BACKOFF ** attempt)
        except (urllib.error.URLError, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < RETRY_COUNT:
                time.sleep(RETRY_BACKOFF ** attempt)
    warn(f"Supabase SQL failed: {last_error}")
    return []


def scan_supabase(
    *,
    project_ref: str,
    token: str,
    schemas: list[str],
    label: str,
) -> dict[str, Any]:
    start = time.time()
    schema_list = ", ".join("'" + s.replace("'", "''") + "'" for s in schemas)
    info(f"Supabase catalog for {project_ref} schemas={schemas}…")

    tables = supabase_sql(project_ref, token, f"""
        SELECT n.nspname AS schema_name,
               c.relname AS table_name,
               c.relkind AS relkind,
               COALESCE(c.reltuples, 0)::bigint AS est_rows,
               pg_total_relation_size(c.oid) AS total_bytes,
               c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ({schema_list})
          AND c.relkind IN ('r', 'p', 'v', 'm')
        ORDER BY 1, 2;
    """)

    columns = supabase_sql(project_ref, token, f"""
        SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema IN ({schema_list})
        ORDER BY table_schema, table_name, ordinal_position;
    """)

    constraints = supabase_sql(project_ref, token, f"""
        SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
        FROM information_schema.table_constraints tc
        WHERE tc.table_schema IN ({schema_list})
        ORDER BY 1, 2, 3;
    """)

    fks = supabase_sql(project_ref, token, f"""
        SELECT
          tc.table_schema, tc.table_name, kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema IN ({schema_list});
    """)

    indexes = supabase_sql(project_ref, token, f"""
        SELECT schemaname AS schema_name, tablename AS table_name,
               indexname, indexdef
        FROM pg_indexes
        WHERE schemaname IN ({schema_list})
        ORDER BY 1, 2, 3;
    """)

    policies = supabase_sql(project_ref, token, f"""
        SELECT schemaname AS schema_name, tablename AS table_name,
               policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname IN ({schema_list})
        ORDER BY 1, 2, 3;
    """)

    extensions = supabase_sql(project_ref, token, """
        SELECT extname, extversion FROM pg_extension ORDER BY 1;
    """)

    cols_by_table: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for col in columns:
        cols_by_table[(col.get("table_schema"), col.get("table_name"))].append(col)

    table_reports: list[dict[str, Any]] = []
    finding_counts: Counter[str] = Counter()
    severity_counts: Counter[str] = Counter()

    for table in tables:
        schema = table.get("schema_name")
        name = table.get("table_name")
        key = (schema, name)
        cols = cols_by_table.get(key, [])
        findings: list[dict[str, Any]] = []

        def add(code: str, severity: str, message: str) -> None:
            findings.append({"code": code, "severity": severity, "message": message})
            finding_counts[code] += 1
            severity_counts[severity] += 1

        est = table.get("est_rows")
        try:
            est_i = int(float(est)) if est is not None else None
        except (TypeError, ValueError):
            est_i = None
        if est_i == 0 and table.get("relkind") in ("r", "p"):
            add("EMPTY_OR_NEAR_EMPTY_EST", "info", "Planner estimate is 0 rows.")
        if LEGACY_NAME_RE.search(str(name or "")):
            add("LEGACY_NAMED_TABLE", "medium", "Name suggests legacy/backup surface.")
        if table.get("relkind") in ("r", "p") and not table.get("rls_enabled"):
            # public/agentsam tables without RLS are worth noting for multi-tenant future
            if schema in {"public", "agentsam"}:
                add("RLS_DISABLED", "medium", "Row Level Security is off on this relation.")

        fingerprint = hashlib.sha1(
            "|".join(
                f"{c.get('column_name')}:{c.get('data_type')}:{c.get('is_nullable')}"
                for c in cols
            ).encode("utf-8")
        ).hexdigest()[:12]

        table_reports.append({
            "schema": schema,
            "table": name,
            "relkind": table.get("relkind"),
            "est_rows": est_i,
            "total_bytes": table.get("total_bytes"),
            "rls_enabled": bool(table.get("rls_enabled")),
            "rls_forced": bool(table.get("rls_forced")),
            "column_count": len(cols),
            "fingerprint": fingerprint,
            "findings": findings,
        })

    clusters: dict[str, list[str]] = defaultdict(list)
    for report in table_reports:
        clusters[report["fingerprint"]].append(f"{report['schema']}.{report['table']}")
    exact = {
        fp: sorted(names)
        for fp, names in sorted(clusters.items(), key=lambda i: (-len(i[1]), i[0]))
        if len(names) > 1
    }

    return {
        "scan_version": SCRIPT_VERSION,
        "generated_at": iso_now(),
        "project_ref": project_ref,
        "label": label,
        "schemas": schemas,
        "duration_seconds": round(time.time() - start, 2),
        "table_count": len(table_reports),
        "constraint_count": len(constraints),
        "foreign_key_count": len(fks),
        "index_count": len(indexes),
        "policy_count": len(policies),
        "extensions": extensions,
        "finding_counts": dict(finding_counts.most_common()),
        "severity_counts": dict(severity_counts.most_common()),
        "exact_schema_clusters": exact,
        "tables": table_reports,
        "foreign_keys": fks[:500],
        "policies": [
            {
                "schema": p.get("schema_name"),
                "table": p.get("table_name"),
                "policy": p.get("policyname"),
                "cmd": p.get("cmd"),
            }
            for p in policies[:500]
        ],
    }


# ---------------------------------------------------------------------------
# Diff + AI
# ---------------------------------------------------------------------------

def diff_snapshot(previous_path: str | None, current: dict[str, Any]) -> dict[str, Any] | None:
    if not previous_path:
        return None
    path = Path(previous_path).expanduser()
    if not path.exists():
        warn(f"Previous snapshot missing: {path}")
        return None
    try:
        previous = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        warn(f"Could not read previous snapshot: {exc}")
        return None

    result: dict[str, Any] = {"previous_snapshot": str(path)}
    prev_repo, cur_repo = previous.get("repo") or {}, current.get("repo") or {}
    if prev_repo and cur_repo:
        result["repo"] = {
            "file_count": {
                "before": prev_repo.get("file_count"),
                "after": cur_repo.get("file_count"),
                "delta": (cur_repo.get("file_count") or 0) - (prev_repo.get("file_count") or 0),
            },
            "frameworks_added": sorted(
                {i["name"] for i in cur_repo.get("frameworks", [])}
                - {i["name"] for i in prev_repo.get("frameworks", [])}
            ),
            "frameworks_removed": sorted(
                {i["name"] for i in prev_repo.get("frameworks", [])}
                - {i["name"] for i in cur_repo.get("frameworks", [])}
            ),
        }
    prev_d1, cur_d1 = previous.get("d1") or {}, current.get("d1") or {}
    if prev_d1 and cur_d1:
        prev_t = {t["table"]: t for t in prev_d1.get("tables", []) if t.get("table")}
        cur_t = {t["table"]: t for t in cur_d1.get("tables", []) if t.get("table")}
        result["d1"] = {
            "tables_added": sorted(set(cur_t) - set(prev_t)),
            "tables_removed": sorted(set(prev_t) - set(cur_t)),
            "schema_drift": sorted(
                n for n in set(cur_t) & set(prev_t)
                if cur_t[n].get("fingerprint") != prev_t[n].get("fingerprint")
            ),
        }
    prev_pg, cur_pg = previous.get("supabase") or {}, current.get("supabase") or {}
    if prev_pg and cur_pg:
        prev_t = {f"{t.get('schema')}.{t.get('table')}": t for t in prev_pg.get("tables", [])}
        cur_t = {f"{t.get('schema')}.{t.get('table')}": t for t in cur_pg.get("tables", [])}
        result["supabase"] = {
            "tables_added": sorted(set(cur_t) - set(prev_t)),
            "tables_removed": sorted(set(prev_t) - set(cur_t)),
            "schema_drift": sorted(
                n for n in set(cur_t) & set(prev_t)
                if cur_t[n].get("fingerprint") != prev_t[n].get("fingerprint")
            ),
        }
    return result


def extract_response_text(payload: dict[str, Any]) -> str:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    chunks: list[str] = []
    for item in payload.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) or []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


def call_openai_review(
    *,
    api_key: str,
    model: str,
    evidence: dict[str, Any],
    reasoning_effort: str,
) -> tuple[str | None, dict[str, Any]]:
    safe = cap_json_bytes(sanitize_for_ai(evidence), MAX_AI_BYTES)
    instructions = """
You are an evidence-bound staff-engineer panel teaching a solo founder (Sam).

Context:
- Inner Animal Media aspires to multi-tenant SaaS, but today Sam is the primary operator.
- Preserve real isolation and future product value.
- Remove fake enterprise complexity, unfinished abstractions, and duplicate control planes
  that are not yet proven by real usage.
- Distinguish OBSERVED facts, INFERENCES, and RECOMMENDATIONS.
- Identify "attempted concepts" (what Sam was reaching for) and name the industry standard.
- Never invent frameworks, tables, or live status. No secrets or row values.

Produce Markdown titled: Solo-Builder Architecture Revision Plan

Required sections:
1. The whole ecosystem in plain English
2. What is genuinely working or structurally sound
3. Attempted concepts and what they were trying to become
4. Where enterprise aspiration exceeds present-day need
5. Repository, D1 and Supabase mental map
6. Industry-standard target architecture
7. Specialized revision projects (each with: Why, Evidence, Beginner explanation,
   Engineering correction, Likely files, Deliverables, Acceptance tests, Risk/rollback, What Sam learns)
8. Teaching curriculum embedded in the work
9. Pre-launch engineering gates
10. What not to build yet
11. Evidence limits and confidence

Group revision projects into phases:
Phase 0 — Establish truth and measurements
Phase 1 — Simplify ownership and runtime spines
Phase 2 — Harden security, data and deployment
Phase 3 — Improve developer experience and product readiness
Phase 4 — Scale only after real usage proves the need

Do not recommend a ground-up rewrite.
""".strip()

    body = {
        "model": model,
        "instructions": instructions,
        "input": "Analyze this sanitized architecture evidence packet.\n\n"
                 + json.dumps(safe, ensure_ascii=False, indent=2),
        "reasoning": {"effort": reasoning_effort},
        "text": {"verbosity": "high"},
        "metadata": {"purpose": "architecture_cartographer", "script_version": SCRIPT_VERSION},
    }
    try:
        payload = http_json(
            "https://api.openai.com/v1/responses",
            method="POST",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            body=body,
            timeout=180,
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        return None, {"error": f"OpenAI HTTP {exc.code}: {detail}"}
    except (urllib.error.URLError, json.JSONDecodeError) as exc:
        return None, {"error": f"OpenAI request failed: {exc}"}

    text = extract_response_text(payload if isinstance(payload, dict) else {})
    meta = {
        "response_id": payload.get("id") if isinstance(payload, dict) else None,
        "model": (payload.get("model") if isinstance(payload, dict) else None) or model,
        "status": payload.get("status") if isinstance(payload, dict) else None,
        "usage": payload.get("usage") if isinstance(payload, dict) else None,
        "packet_bytes": len(json.dumps(safe, ensure_ascii=False).encode("utf-8")),
    }
    if not text:
        meta["error"] = "Responses API returned no output text."
        return None, meta
    return text, meta


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def render_repo_report(repo: dict[str, Any]) -> str:
    language_rows = [
        [r["language"], r["files"], f"{r['lines']:,}", human_bytes(r["bytes"]), f"{r['line_share_percent']}%"]
        for r in repo.get("languages", [])[:30]
    ]
    component_rows = [
        [c["id"], c["file_count"], f"{c['lines']:,}", human_bytes(c["bytes"])]
        for c in repo.get("components", [])
    ]
    oversized = [
        [i["path"], i.get("language"), f"{i.get('lines', 0):,}", human_bytes(i["bytes"])]
        for i in repo.get("oversized_files", [])[:40]
    ]
    clutter = repo.get("clutter_named_files", [])[:40]
    return f"""# Repository Architecture Report

Generated: `{repo.get('generated_at')}`  
Scanner: `{repo.get('scan_version')}`  
Repo: `{repo.get('repo_name')}`

## Scale

- Files: **{repo.get('file_count', 0):,}**
- Lines (approx): **{repo.get('total_lines', 0):,}**
- Size: **{human_bytes(repo.get('total_bytes'))}**
- Duration: **{repo.get('duration_seconds')}s**
- Python files scanned for imports: **{repo.get('python_file_count', 0):,}**

## Languages

{markdown_table(["Language", "Files", "Lines", "Size", "Share"], language_rows)}

## Components

{markdown_table(["Component", "Files", "Lines", "Size"], component_rows)}

## Cloudflare signals

{', '.join(repo.get('cloudflare_signals', [])) or 'none'}

## Clutter-named files (sample)

{chr(10).join(f"- `{p}`" for p in clutter) or "- none"}

## Oversized files

{markdown_table(["Path", "Language", "Lines", "Size"], oversized) if oversized else "None flagged."}

## Architecture signals

```json
{json.dumps(repo.get("architecture_signals", {}), indent=2)}
```

## Limits

This report detects evidence in the tree. It does not prove production use,
live wiring, or that a large/empty surface should be deleted.
"""


def render_d1_report(d1: dict[str, Any]) -> str:
    sev = d1.get("severity_counts", {})
    family_rows = [
        [name, vals["tables"], f"{vals['known_rows']:,}"]
        for name, vals in d1.get("table_families", {}).items()
    ]
    finding_rows = [[code, count] for code, count in d1.get("finding_counts", {}).items()]
    cluster_lines = []
    for fp, names in list(d1.get("exact_schema_clusters", {}).items())[:40]:
        preview = ", ".join(names[:10]) + (" …" if len(names) > 10 else "")
        cluster_lines.append(f"- `{fp}` — {len(names)} tables: {preview}")
    finding_sections = []
    for report in d1.get("tables", []):
        if not report.get("findings"):
            continue
        finding_sections.append(
            f"### `{report['table']}` — rows: {report.get('row_count')}\n"
            + "\n".join(
                f"- **{f['severity'].upper()} · {f['code']}** — {f['message']}"
                for f in report["findings"]
            )
        )
    return f"""# Cloudflare D1 Data-Quality Report

Generated: `{d1.get('generated_at')}`  
Label: `{d1.get('label')}`

## Summary

- Tables scanned: **{d1.get('table_count', 0):,}**
- Failed: **{d1.get('failed_table_count', 0):,}**
- Exact schema patterns: **{d1.get('distinct_schema_patterns', 0):,}**
- High / medium / low / info: **{sev.get('high', 0)} / {sev.get('medium', 0)} / {sev.get('low', 0)} / {sev.get('info', 0)}**

## Families

{markdown_table(["Family", "Tables", "Known rows"], family_rows)}

## Finding counts

{markdown_table(["Finding", "Count"], finding_rows) if finding_rows else "No findings."}

## Exact schema clusters (duplication / convention)

{chr(10).join(cluster_lines) or "- none"}

## Tables with findings

{chr(10).join(finding_sections) or "No table-level findings."}

## Interpretation

- `EMPTY_TABLE` = investigate, not delete
- `NO_PRIMARY_KEY` = strong structural concern
- `ORPHANED_FOREIGN_KEYS` = strong correctness evidence
- `LEGACY_NAMED_TABLE` = naming debt / cleanup candidate
"""


def render_supabase_report(pg: dict[str, Any]) -> str:
    sev = pg.get("severity_counts", {})
    finding_rows = [[code, count] for code, count in pg.get("finding_counts", {}).items()]
    rows = [
        [
            f"{t.get('schema')}.{t.get('table')}",
            t.get("relkind"),
            t.get("est_rows"),
            human_bytes(int(t["total_bytes"])) if t.get("total_bytes") is not None else "?",
            "on" if t.get("rls_enabled") else "off",
            len(t.get("findings") or []),
        ]
        for t in sorted(pg.get("tables", []), key=lambda r: (-(r.get("est_rows") or 0), str(r.get("table"))))[:80]
    ]
    return f"""# Supabase Postgres Catalog Report

Generated: `{pg.get('generated_at')}`  
Project: `{pg.get('project_ref')}`  
Schemas: `{', '.join(pg.get('schemas', []))}`

## Summary

- Relations: **{pg.get('table_count', 0):,}**
- Constraints: **{pg.get('constraint_count', 0):,}**
- Foreign keys: **{pg.get('foreign_key_count', 0):,}**
- Indexes: **{pg.get('index_count', 0):,}**
- RLS policies: **{pg.get('policy_count', 0):,}**
- Findings high/medium/low/info: **{sev.get('high', 0)} / {sev.get('medium', 0)} / {sev.get('low', 0)} / {sev.get('info', 0)}**

## Finding counts

{markdown_table(["Finding", "Count"], finding_rows) if finding_rows else "No findings."}

## Largest / busiest relations (estimate)

{markdown_table(["Relation", "Kind", "Est rows", "Size", "RLS", "Findings"], rows)}

## Notes

Row counts use `pg_class.reltuples` estimates (fast). RLS_DISABLED on `public`/`agentsam`
is a multi-tenant readiness signal, not always a bug for solo-operator tables.
"""


def render_executive(repo, d1, pg, diff, ai_on: bool) -> str:
    parts = ["# Architecture Cartographer — Executive Summary", ""]
    if repo:
        langs = ", ".join(r["language"] for r in repo.get("languages", [])[:6])
        parts.append(
            f"Repo scan: **{repo.get('file_count', 0):,} files**, languages led by **{langs}**."
        )
        parts.append("")
    if d1:
        parts.append(
            f"D1: **{d1.get('table_count', 0):,} tables**, "
            f"**{d1.get('distinct_schema_patterns', 0):,}** schema patterns."
        )
        parts.append("")
    if pg:
        parts.append(
            f"Supabase: **{pg.get('table_count', 0):,}** relations in "
            f"`{', '.join(pg.get('schemas', []))}`."
        )
        parts.append("")
    if diff:
        parts.append("Diff against a previous snapshot is included.")
        parts.append("")
    parts.extend([
        "## Discipline",
        "",
        "This is **platform asset inventory & drift audit** — not model evals.",
        "Empty tables and large files are investigation signals, not auto-delete lists.",
        "",
        f"Optional AI revision plan: **{'enabled' if ai_on else 'not enabled'}**.",
    ])
    return "\n".join(parts)


def render_system_map(repo, d1, pg) -> str:
    return f"""# System Map

## Mental model

- Dashboard = rooms / control panels
- Worker = city hall (routing + policy)
- D1 = operational control plane
- Supabase/Postgres = memory, vectors, longer-lived relational data
- R2 / KV / DO / Queues = storage and session primitives
- Python = specialist workshops (audits, CAD, transforms)
- MCP = standard tool plug shape for AI clients

## Evidence present this run

- Repo: {"yes" if repo else "no"}
- D1: {"yes" if d1 else "no"}
- Supabase: {"yes" if pg else "no"}

Structural presence ≠ production traffic. Join later with tool_call logs,
workflow runs, deploy receipts, and request telemetry.
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo", nargs="?", default=".", help="repository root")
    p.add_argument("--skip-repo", action="store_true")
    p.add_argument("--database-id", help="Cloudflare D1 database UUID")
    p.add_argument("--supabase-project-ref", help="Supabase project ref")
    p.add_argument("--supabase-schemas", default="public,agentsam")
    p.add_argument("--label", default="platform")
    p.add_argument("--diff-against", help="previous combined snapshot JSON")
    p.add_argument("--out-dir", default=DEFAULT_OUT)
    p.add_argument("--convention-columns", default=",".join(CONVENTION_COLUMNS))
    p.add_argument("--expected-pk", default=",".join(EXPECTED_PK))
    p.add_argument("--check-orphans", action="store_true", help="D1 PRAGMA foreign_key_check")
    p.add_argument("--ai", action="store_true")
    p.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5.6-sol"))
    p.add_argument("--reasoning-effort", choices=["low", "medium", "high", "xhigh", "max"], default="high")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    started = time.time()
    stamp = utc_stamp()
    repo_root = Path(args.repo).expanduser().resolve()
    load_dotenv_cloudflare(repo_root)

    out_root = Path(args.out_dir).expanduser()
    if not out_root.is_absolute():
        out_root = (repo_root / out_root).resolve()
    latest = out_root / "latest"
    snapshots = out_root / "snapshots"
    evidence = out_root / "evidence"
    for d in (latest, snapshots, evidence):
        d.mkdir(parents=True, exist_ok=True)

    repo_report = None
    d1_report = None
    pg_report = None

    if not args.skip_repo:
        if not repo_root.is_dir():
            warn(f"Not a directory: {repo_root}")
            return 2
        info(f"Scanning repository: {repo_root}")
        repo_report = scan_repository(repo_root)
        json_write(evidence / f"{args.label}_{stamp}_repo.json", repo_report)

    if args.database_id:
        account_id = env_first("CF_ACCOUNT_ID", "CLOUDFLARE_ACCOUNT_ID")
        token = env_first("CF_API_TOKEN", "CLOUDFLARE_API_TOKEN")
        if not account_id or not token:
            warn("D1 requested but CF_ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID and API token missing.")
            return 2
        convention = [c.strip() for c in args.convention_columns.split(",") if c.strip()]
        expected_pk = tuple(c.strip() for c in args.expected_pk.split(",") if c.strip())
        d1_report = scan_d1(
            account_id=account_id,
            database_id=args.database_id,
            token=token,
            label=args.label,
            convention_columns=convention,
            expected_pk=expected_pk,
            check_orphans=args.check_orphans,
        )
        json_write(evidence / f"{args.label}_{stamp}_d1.json", d1_report)

    if args.supabase_project_ref:
        sb_token = env_first("SUPABASE_ACCESS_TOKEN", "SUPABASE_PAT")
        if not sb_token:
            warn(
                "Supabase requested but SUPABASE_ACCESS_TOKEN (Management API PAT) is not set. "
                "Service-role keys cannot query information_schema via this path."
            )
            return 2
        schemas = [s.strip() for s in args.supabase_schemas.split(",") if s.strip()]
        pg_report = scan_supabase(
            project_ref=args.supabase_project_ref,
            token=sb_token,
            schemas=schemas,
            label=args.label,
        )
        json_write(evidence / f"{args.label}_{stamp}_supabase.json", pg_report)

    if not repo_report and not d1_report and not pg_report:
        warn("Nothing to scan. Enable repo scan and/or --database-id / --supabase-project-ref.")
        return 2

    combined: dict[str, Any] = {
        "scan_version": SCRIPT_VERSION,
        "generated_at": iso_now(),
        "label": args.label,
        "repo": repo_report,
        "d1": d1_report,
        "supabase": pg_report,
    }
    diff = diff_snapshot(args.diff_against, combined)
    if diff:
        combined["diff_from_previous"] = diff

    ai_text = None
    ai_meta = None
    if args.ai:
        api_key = env_first("OPENAI_API_KEY")
        if not api_key:
            warn("--ai set but OPENAI_API_KEY missing; continuing without AI.")
        else:
            effort = "xhigh" if args.reasoning_effort == "max" else args.reasoning_effort
            info(f"Requesting sanitized solo-builder review ({args.model}, effort={effort})…")
            packet = {
                "repo": repo_report,
                "d1": (
                    {**d1_report, "tables": (d1_report.get("tables") or [])[:400]}
                    if d1_report else None
                ),
                "supabase": pg_report,
                "diff_from_previous": diff,
                "operator_context": {
                    "solo_founder": True,
                    "primary_operator": "Sam",
                    "aspiration": "multi_tenant_saas",
                    "present_day": "solo_learning_ecosystem",
                },
            }
            sanitized = cap_json_bytes(sanitize_for_ai(packet), MAX_AI_BYTES)
            json_write(evidence / f"{args.label}_{stamp}_ai-packet.json", sanitized)
            ai_text, ai_meta = call_openai_review(
                api_key=api_key,
                model=args.model,
                evidence=sanitized,
                reasoning_effort=effort,
            )
            combined["ai_review_meta"] = ai_meta
            if ai_text:
                text_write(latest / "solo-builder-revision-plan.md", ai_text)
            else:
                warn(f"AI review failed: {ai_meta}")

    combined["duration_seconds"] = round(time.time() - started, 2)
    snapshot_path = snapshots / f"{args.label}_{stamp}.json"
    json_write(snapshot_path, combined)
    json_write(latest / "architecture.json", combined)
    text_write(latest / "executive-summary.md", render_executive(repo_report, d1_report, pg_report, diff, ai_text is not None))
    text_write(latest / "system-map.md", render_system_map(repo_report, d1_report, pg_report))
    if repo_report:
        text_write(latest / "repo-report.md", render_repo_report(repo_report))
    if d1_report:
        text_write(latest / "d1-report.md", render_d1_report(d1_report))
    if pg_report:
        text_write(latest / "supabase-report.md", render_supabase_report(pg_report))

    info("")
    info("Architecture cartography complete.")
    info(f"Snapshot: {snapshot_path}")
    info(f"Latest:   {latest}")
    if repo_report:
        info(f"Repo: {repo_report['file_count']:,} files")
    if d1_report:
        info(f"D1:  {d1_report['table_count']:,} tables, {sum(d1_report['finding_counts'].values()):,} findings")
    if pg_report:
        info(f"PG:  {pg_report['table_count']:,} relations, {sum(pg_report['finding_counts'].values()):,} findings")
    if ai_meta:
        info(f"AI:  {ai_meta.get('status') or ai_meta.get('error')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
