#!/usr/bin/env python3
"""
audit_analytics_consolidation.py
----------------------------------
1. Crawls dashboard/ source for all analytics/overview components
2. Extracts API endpoints each component calls
3. Traces those endpoints in src/api/ to find SQL + D1 table refs
4. Calls OpenAI to generate a 3-page consolidation plan
5. Outputs:
     artifacts/analytics_consolidation/TABLE_MAP.md
     artifacts/analytics_consolidation/COMPONENT_MAP.md
     artifacts/analytics_consolidation/CONSOLIDATION_PLAN.md  ← hand this to Cursor
     artifacts/analytics_consolidation/mapping.json

Usage:
    python3 scripts/audit_analytics_consolidation.py
    python3 scripts/audit_analytics_consolidation.py --no-ai   # skip OpenAI, just map
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from datetime import datetime

DEFAULT_ROOT   = Path("/Users/samprimeaux/inneranimalmedia")
DEFAULT_OUT    = Path("artifacts/analytics_consolidation")
OPENAI_MODEL   = "gpt-5.4-mini"

SKIP_DIRS = {
    "node_modules", ".git", "dist", ".wrangler", "__pycache__",
    ".venv", "venv", ".next", "coverage", ".turbo",
    "artifacts", "analytics", "scripts/patch_results",
}

SCAN_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".sql"}

# Analytics-related source directories
FRONTEND_DIRS = ["dashboard/src", "dashboard/components", "dashboard/features", "dashboard/pages"]
BACKEND_DIRS  = ["src/api", "src/integrations", "worker.js"]

# The pages we care about
ANALYTICS_ROUTES = [
    "/dashboard/overview",
    "/dashboard/analytics/overview",
    "/dashboard/analytics/agent",
    "/dashboard/analytics/workers",
    "/dashboard/analytics/mcp",
    "/dashboard/analytics/models",
    "/dashboard/analytics/d1",
    "/dashboard/analytics/advisors",
    "/dashboard/analytics/deploys",
    "/dashboard/analytics/costs",
    "/dashboard/analytics/rag",
    "/dashboard/analytics/codebase",
]

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class ComponentInfo:
    file: str
    component_name: str
    api_endpoints: list[str] = field(default_factory=list)
    chart_types: list[str] = field(default_factory=list)
    kpi_labels: list[str] = field(default_factory=list)
    has_mock_data: bool = False
    has_loading_state: bool = False
    page_hint: str = ""

@dataclass
class EndpointInfo:
    endpoint: str
    handler_file: str
    handler_line: int
    sql_queries: list[str] = field(default_factory=list)
    tables: list[str] = field(default_factory=list)
    has_hyperdrive: bool = False
    has_d1: bool = False
    verdict: str = "unknown"  # real / stub / mixed / broken

@dataclass
class TableUsage:
    table: str
    used_in_endpoints: list[str] = field(default_factory=list)
    used_in_components: list[str] = field(default_factory=list)
    verdict: str = "unknown"  # real_data / empty / not_connected

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

RE_FETCH        = re.compile(r"""(?:fetch|apiGet|apiPost|useSWR|useQuery)\s*\(\s*[`'"]([^`'"]+)[`'"]""", re.IGNORECASE)
RE_AXIOS        = re.compile(r"""axios\.\w+\s*\(\s*[`'"]([^`'"]+)[`'"]""", re.IGNORECASE)
RE_TABLE        = re.compile(r"""\b(agentsam_\w+|inneranimalmedia_\w+)\b""")
RE_SQL          = re.compile(r"""(SELECT\s+.+?\s+FROM\s+\w+[^;`'"]{0,200})""", re.IGNORECASE | re.DOTALL)
RE_CHART        = re.compile(r"""(LineChart|BarChart|AreaChart|PieChart|DonutChart|ScatterChart|ResponsiveContainer|recharts|Sparkline|SpendChart|WorkflowChart|ModelLeaderboard|ToolWaterfall|ErrorInbox|KPICard|MetricCard|StatCard)""", re.IGNORECASE)
RE_KPI_LABEL    = re.compile(r"""(?:label|title|heading|name)\s*[:=]\s*[`'"]([\w\s\$\-\/]+)[`'"]""", re.IGNORECASE)
RE_MOCK         = re.compile(r"""(?:mock|fake|dummy|placeholder|FALLBACK|Math\.random|sampleData|testData)""", re.IGNORECASE)
RE_LOADING      = re.compile(r"""(?:isLoading|loading|skeleton|Skeleton|spinner)""", re.IGNORECASE)
RE_HYPERDRIVE   = re.compile(r"""(?:hyperdrive|HYPERDRIVE|supabase|Supabase|postgres|pg\.query)""", re.IGNORECASE)
RE_D1           = re.compile(r"""(?:env\.DB|env\.D1|\.prepare\(|\.batch\(|d1\.query)""", re.IGNORECASE)
RE_NOT_CONNECTED= re.compile(r"""(?:not_connected_yet|empty_capability|stub|TODO.*connect|not.*wired)""", re.IGNORECASE)
RE_COMPONENT    = re.compile(r"""(?:export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w+))""")

# ---------------------------------------------------------------------------
# File walker
# ---------------------------------------------------------------------------

def walk_files(root: Path, subdirs: list[str]) -> list[Path]:
    results = []
    for subdir in subdirs:
        d = root / subdir
        if d.is_file() and d.suffix in SCAN_EXTENSIONS:
            results.append(d)
            continue
        if not d.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(d):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for fn in filenames:
                p = Path(dirpath) / fn
                if p.suffix in SCAN_EXTENSIONS:
                    results.append(p)
    return results

# ---------------------------------------------------------------------------
# Frontend scanner
# ---------------------------------------------------------------------------

def is_analytics_file(path: Path) -> bool:
    parts = " ".join(path.parts).lower()
    name  = path.name.lower()
    keywords = ["overview", "analytics", "analytic", "pulse", "kpi", "metric",
                "stat", "chart", "dashboard", "spend", "workflow", "execution",
                "advisor", "deploy", "cost", "rag", "codebase", "model", "mcp"]
    return any(k in name or k in parts for k in keywords)

def scan_frontend_file(path: Path, root: Path) -> ComponentInfo | None:
    rel = str(path.relative_to(root))
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None

    # Only process files that look like analytics/dashboard components
    if not is_analytics_file(path) and "fetch(" not in raw and "useSWR" not in raw:
        return None

    # Find component name
    comp_match = RE_COMPONENT.search(raw)
    comp_name  = comp_match.group(1) if comp_match else path.stem

    endpoints = []
    for pattern in [RE_FETCH, RE_AXIOS]:
        for m in pattern.finditer(raw):
            url = m.group(1)
            if url.startswith("/api/") or "analytics" in url or "overview" in url:
                endpoints.append(url)

    # Deduplicate
    endpoints = list(dict.fromkeys(endpoints))

    charts    = list(set(RE_CHART.findall(raw)))
    kpi_raw   = RE_KPI_LABEL.findall(raw)
    kpi_labels= [k for k in kpi_raw if len(k) < 50][:10]
    has_mock  = bool(RE_MOCK.search(raw))
    has_load  = bool(RE_LOADING.search(raw))

    # Page hint from path
    page_hint = ""
    for route in ANALYTICS_ROUTES:
        slug = route.split("/")[-1]
        if slug in rel.lower():
            page_hint = route
            break

    if not endpoints and not charts:
        return None

    return ComponentInfo(
        file=rel,
        component_name=comp_name,
        api_endpoints=endpoints,
        chart_types=charts[:8],
        kpi_labels=kpi_labels[:8],
        has_mock_data=has_mock,
        has_loading_state=has_load,
        page_hint=page_hint,
    )

# ---------------------------------------------------------------------------
# Backend scanner
# ---------------------------------------------------------------------------

def scan_backend_file(path: Path, root: Path) -> list[EndpointInfo]:
    rel = str(path.relative_to(root))
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    lines   = raw.splitlines()
    results = []

    # Find route definitions
    route_pattern = re.compile(
        r"""(?:pathLower\s*===?\s*[`'"]([^`'"]+)[`'"]|"""
        r"""router\.\w+\s*\([`'"]([^`'"]+)[`'"]|"""
        r"""path\s*===?\s*[`'"]([^`'"]+)[`'"])""",
        re.IGNORECASE,
    )

    for i, line in enumerate(lines):
        m = route_pattern.search(line)
        if not m:
            continue
        endpoint = next((g for g in m.groups() if g), None)
        if not endpoint:
            continue
        if not any(k in endpoint for k in ["/api/", "analytics", "overview", "agent", "mcp", "model", "deploy", "cost", "rag"]):
            continue

        # Collect context block (next 60 lines)
        block = "\n".join(lines[i:min(len(lines), i+60)])

        tables  = list(set(RE_TABLE.findall(block)))
        sqls    = [s[:200] for s in RE_SQL.findall(block)][:5]
        has_hd  = bool(RE_HYPERDRIVE.search(block))
        has_d1  = bool(RE_D1.search(block))
        not_con = bool(RE_NOT_CONNECTED.search(block))

        if not_con:
            verdict = "stub"
        elif has_d1 and tables:
            verdict = "real"
        elif has_hd and not has_d1:
            verdict = "broken"  # hyperdrive auth is failing
        elif not tables:
            verdict = "unknown"
        else:
            verdict = "mixed"

        results.append(EndpointInfo(
            endpoint=endpoint,
            handler_file=rel,
            handler_line=i+1,
            sql_queries=sqls,
            tables=tables,
            has_hyperdrive=has_hd,
            has_d1=has_d1,
            verdict=verdict,
        ))

    return results

# ---------------------------------------------------------------------------
# Build table usage map
# ---------------------------------------------------------------------------

def build_table_map(
    components: list[ComponentInfo],
    endpoints:  list[EndpointInfo],
) -> list[TableUsage]:
    table_map: dict[str, TableUsage] = {}

    # From endpoints
    for ep in endpoints:
        for t in ep.tables:
            if t not in table_map:
                table_map[t] = TableUsage(table=t)
            if ep.endpoint not in table_map[t].used_in_endpoints:
                table_map[t].used_in_endpoints.append(ep.endpoint)
            if ep.verdict == "stub":
                table_map[t].verdict = "not_connected"
            elif ep.verdict == "real" and table_map[t].verdict != "not_connected":
                table_map[t].verdict = "real_data"

    # From component → endpoint → table (cross-ref)
    ep_lookup = {ep.endpoint: ep for ep in endpoints}
    for comp in components:
        for url in comp.api_endpoints:
            ep = ep_lookup.get(url)
            if ep:
                for t in ep.tables:
                    if t in table_map:
                        if comp.file not in table_map[t].used_in_components:
                            table_map[t].used_in_components.append(comp.file)

    return list(table_map.values())

# ---------------------------------------------------------------------------
# OpenAI consolidation planner
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert frontend architect helping consolidate a React dashboard.
You will receive a JSON mapping of:
- Components: what charts/KPIs each renders and what API endpoints it calls
- Endpoints: what D1 tables each API touches and whether data is real/stub/broken
- Tables: which tables have real data vs are empty

Your job: produce a CONSOLIDATION_PLAN.md with these sections:

## 1. Overview Page Redesign (/dashboard/overview)
Specify exactly what to KEEP and what to REMOVE. This page should be a minimal 
command center: one status bar, 3 grouped KPI cards max, one activity feed, 
quick actions. NO deep charts. List specific component names to keep/remove.

## 2. Analytics Consolidation (11 pages → 3 pages)
Define exactly 3 pages. For each:
- Route
- Tab structure (if tabbed)
- Which existing components move where (exact file names)
- Which endpoints back each section
- Which tables are real vs stub (show honest empty states for stubs)

## 3. Sidebar Nav Changes
Old nav items → new nav items. List the exact changes.

## 4. Redirects Needed
Old route → new route mapping.

## 5. Cursor Prompt (ready to paste)
A single, surgical Cursor prompt that implements all the above.
It must reference exact file names, exact component names, exact routes.
It must be executable without asking Cursor to figure things out.
Assume Cursor has a limited budget — be precise, no exploration.

## 6. What NOT to touch
List files/components that should not be modified.

Be decisive. Don't hedge. Give exact file names and component names from the mapping."""

def call_openai(mapping: dict, api_key: str) -> str:
    import urllib.request

    payload = {
        "model": OPENAI_MODEL,
        "max_tokens": 4000,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": json.dumps(mapping, indent=2)[:40000]},
        ],
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"OpenAI call failed: {e}\n\nRun with --no-ai and review mapping.json manually."

# ---------------------------------------------------------------------------
# Markdown writers
# ---------------------------------------------------------------------------

def write_component_map(out: Path, components: list[ComponentInfo]) -> None:
    lines = [
        "# Component Map",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "",
        "| Component | File | Endpoints | Charts | Has Mock | Page |",
        "|-----------|------|-----------|--------|----------|------|",
    ]
    for c in sorted(components, key=lambda x: x.file):
        endpoints = ", ".join(f"`{e}`" for e in c.api_endpoints[:3])
        charts    = ", ".join(c.chart_types[:3])
        mock      = "YES" if c.has_mock_data else "no"
        lines.append(
            f"| {c.component_name} | `{c.file}` | {endpoints} | {charts} | {mock} | {c.page_hint} |"
        )
    (out / "COMPONENT_MAP.md").write_text("\n".join(lines), encoding="utf-8")

def write_table_map(out: Path, tables: list[TableUsage], endpoints: list[EndpointInfo]) -> None:
    lines = [
        "# Table → Endpoint → Component Map",
        "",
        "| Table | Verdict | Endpoints | Components |",
        "|-------|---------|-----------|------------|",
    ]
    for t in sorted(tables, key=lambda x: x.table):
        eps   = ", ".join(f"`{e}`" for e in t.used_in_endpoints[:3])
        comps = ", ".join(f"`{Path(c).name}`" for c in t.used_in_components[:3])
        lines.append(f"| `{t.table}` | **{t.verdict}** | {eps} | {comps} |")

    lines += [
        "",
        "## Endpoint Verdicts",
        "",
        "| Endpoint | Handler | Tables | D1 | Hyperdrive | Verdict |",
        "|----------|---------|--------|----|----|---------|",
    ]
    for ep in sorted(endpoints, key=lambda x: x.endpoint):
        tables_str = ", ".join(f"`{t}`" for t in ep.tables[:3])
        lines.append(
            f"| `{ep.endpoint}` | `{Path(ep.handler_file).name}:{ep.handler_line}` "
            f"| {tables_str} | {'Y' if ep.has_d1 else 'n'} | {'Y' if ep.has_hyperdrive else 'n'} "
            f"| **{ep.verdict}** |"
        )

    (out / "TABLE_MAP.md").write_text("\n".join(lines), encoding="utf-8")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root",   default=str(DEFAULT_ROOT))
    parser.add_argument("--out",    default=str(DEFAULT_OUT))
    parser.add_argument("--no-ai",  action="store_true", help="Skip OpenAI call")
    parser.add_argument("--api-key",default="", help="OpenAI API key (or set OPENAI_API_KEY)")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    out  = Path(args.out).expanduser()

    if not root.exists():
        print(f"ERROR: {root} does not exist", file=sys.stderr)
        sys.exit(1)

    out.mkdir(parents=True, exist_ok=True)

    # ── Scan frontend ──────────────────────────────────────────────────────
    print("Scanning frontend...", file=sys.stderr)
    fe_files   = walk_files(root, FRONTEND_DIRS)
    components = []
    for p in fe_files:
        c = scan_frontend_file(p, root)
        if c:
            components.append(c)
    print(f"  {len(components)} analytics components found", file=sys.stderr)

    # ── Scan backend ───────────────────────────────────────────────────────
    print("Scanning backend...", file=sys.stderr)
    be_files  = walk_files(root, BACKEND_DIRS)
    endpoints = []
    for p in be_files:
        endpoints.extend(scan_backend_file(p, root))
    # Deduplicate by endpoint
    seen_ep: set[str] = set()
    deduped_ep = []
    for ep in endpoints:
        if ep.endpoint not in seen_ep:
            seen_ep.add(ep.endpoint)
            deduped_ep.append(ep)
    endpoints = deduped_ep
    print(f"  {len(endpoints)} API endpoints found", file=sys.stderr)

    # ── Build table map ────────────────────────────────────────────────────
    tables = build_table_map(components, endpoints)
    print(f"  {len(tables)} D1 tables referenced", file=sys.stderr)

    # ── Write markdown outputs ─────────────────────────────────────────────
    write_component_map(out, components)
    write_table_map(out, tables, endpoints)

    # ── Build JSON mapping for OpenAI ─────────────────────────────────────
    mapping = {
        "components": [asdict(c) for c in components],
        "endpoints":  [asdict(e) for e in endpoints],
        "tables":     [asdict(t) for t in tables],
        "analytics_routes": ANALYTICS_ROUTES,
        "context": {
            "platform": "Cloudflare Workers + D1 + React (Vite)",
            "goal": "Consolidate 11 analytics pages to 3 max. Redesign /dashboard/overview as minimal command center.",
            "constraints": [
                "Minimal Cursor usage — plan must be executable in one pass",
                "Do not delete components, only reorganize",
                "Broken Hyperdrive/Supabase paths should fast-fail, not block render",
                "Real data tables: agentsam_usage_events, agentsam_workflow_runs, agentsam_mcp_tool_execution, agentsam_plan_tasks, agentsam_deployment_health, agentsam_error_log",
                "Stub/empty tables: RAG docs, codebase index, costs endpoint, deploys endpoint",
            ],
        },
    }

    json_path = out / "mapping.json"
    json_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")
    print(f"mapping.json written ({json_path.stat().st_size // 1024}KB)", file=sys.stderr)

    # ── OpenAI consolidation plan ──────────────────────────────────────────
    if args.no_ai:
        print("\n--no-ai set. Review mapping.json and TABLE_MAP.md manually.", file=sys.stderr)
        plan = "# CONSOLIDATION_PLAN.md\n\nRun without --no-ai to generate AI plan.\nReview TABLE_MAP.md and COMPONENT_MAP.md first.\n"
    else:
        api_key = args.api_key or os.environ.get("OPENAI_API_KEY", "")
        if not api_key:
            # Try reading from .env.cloudflare
            env_file = root / ".env.cloudflare"
            if env_file.exists():
                for line in env_file.read_text().splitlines():
                    if line.startswith("OPENAI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        if not api_key:
            print("No OPENAI_API_KEY found. Run with --no-ai or set OPENAI_API_KEY.", file=sys.stderr)
            plan = "# CONSOLIDATION_PLAN.md\n\nNo API key found. Set OPENAI_API_KEY and re-run.\n"
        else:
            print(f"Calling OpenAI ({OPENAI_MODEL})...", file=sys.stderr)
            plan = call_openai(mapping, api_key)
            print("Plan generated.", file=sys.stderr)

    plan_path = out / "CONSOLIDATION_PLAN.md"
    plan_path.write_text(plan, encoding="utf-8")

    # ── Summary ────────────────────────────────────────────────────────────
    real_tables  = [t for t in tables if t.verdict == "real_data"]
    stub_tables  = [t for t in tables if t.verdict == "not_connected"]
    real_eps     = [e for e in endpoints if e.verdict == "real"]
    broken_eps   = [e for e in endpoints if e.verdict == "broken"]

    print(f"""
Audit complete → {out}/

  Components:      {len(components)}
  API endpoints:   {len(endpoints)}  ({len(real_eps)} real, {len(broken_eps)} broken/hyperdrive)
  D1 tables:       {len(tables)}  ({len(real_tables)} real, {len(stub_tables)} stubs)

Files:
  COMPONENT_MAP.md      — component → endpoint mapping
  TABLE_MAP.md          — table → endpoint → component + verdicts
  mapping.json          — full machine-readable mapping
  CONSOLIDATION_PLAN.md — AI-generated consolidation plan (hand to Cursor)

Next:
  1. Review TABLE_MAP.md — confirm real vs stub verdicts
  2. Review CONSOLIDATION_PLAN.md — edit if needed
  3. Hand CONSOLIDATION_PLAN.md "Cursor Prompt" section to Cursor
  4. Deploy with: npm run deploy:full
""")

if __name__ == "__main__":
    main()
