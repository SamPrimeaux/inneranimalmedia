#!/usr/bin/env python3
"""
audit_dashboard_overview_data_mapping.py
-----------------------------------------
Read-only audit: every KPI card and chart on /dashboard/overview.
Maps UI element -> frontend component -> API route -> SQL -> D1 table.
Flags mock/fallback data, missing filters, CSS layout issues.

Usage:
    python3 scripts/audit_dashboard_overview_data_mapping.py
    python3 scripts/audit_dashboard_overview_data_mapping.py --root /path/to/repo
    python3 scripts/audit_dashboard_overview_data_mapping.py --out artifacts/dashboard_overview_data_mapping/
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from datetime import datetime

DEFAULT_ROOT = Path("/Users/samprimeaux/inneranimalmedia")
DEFAULT_OUT  = Path("artifacts/dashboard_overview_data_mapping")

SCAN_EXTENSIONS = {".js", ".ts", ".tsx", ".jsx", ".sql"}

SKIP_DIRS = {
    "node_modules", ".git", "dist", ".wrangler", "__pycache__",
    ".venv", "venv", ".next", "coverage", ".turbo",
}

KPI_CARDS = [
    {"label": "Monthly Burn",        "expected_table": "agentsam_usage_events or agentsam_usage_rollups_daily", "expected_field": "SUM(cost) MTD",                         "window": "MTD",          "display_hint": "$4.90"},
    {"label": "Agent Calls",         "expected_table": "agentsam_usage_events or agentsam_agent_run",           "expected_field": "COUNT(*) last 7d",                      "window": "Last 7d",      "display_hint": "385"},
    {"label": "Tokens",              "expected_table": "agentsam_usage_events",                                 "expected_field": "SUM(tokens_in)+SUM(tokens_out)",        "window": "7d",           "display_hint": "4.47M"},
    {"label": "MCP Calls Today",     "expected_table": "agentsam_mcp_tool_execution or agentsam_tool_call_log", "expected_field": "COUNT(*) today",                        "window": "today",        "display_hint": "0"},
    {"label": "Workflow Runs Today", "expected_table": "agentsam_workflow_runs",                                 "expected_field": "COUNT(*) today",                        "window": "today",        "display_hint": "0"},
    {"label": "Hours This Week",     "expected_table": "agentsam_usage_events or duration rollup",              "expected_field": "distinct hour buckets",                  "window": "current week", "display_hint": "0"},
    {"label": "Open Tasks",          "expected_table": "agentsam_plan_tasks",                                   "expected_field": "COUNT(*) status NOT IN done/cancelled", "window": "all active",   "display_hint": "321"},
    {"label": "Worker Health",       "expected_table": "agentsam_deployment_health",                            "expected_field": "latest health_pct per worker",           "window": "latest",       "display_hint": "100.0%"},
    {"label": "GitHub Push",         "expected_table": "agentsam_webhook_events",                               "expected_field": "COUNT(*) provider=github event=push",   "window": "7d",           "display_hint": "2"},
]

CHARTS = [
    {"label": "AI Spend Over Time",  "expected_table": "agentsam_usage_events",                               "expected_group": "GROUP BY date(created_at), provider",  "window": "Last 7 Days"},
    {"label": "Batch / Workflow",    "expected_table": "agentsam_workflow_runs",                               "expected_group": "GROUP BY status, workflow_key",         "window": "all/recent"},
    {"label": "Top Services (MCP)",  "expected_table": "agentsam_mcp_tool_execution or agentsam_tool_call_log","expected_group": "GROUP BY tool_name",                   "window": "7d"},
    {"label": "Budget vs Spend",     "expected_table": "agentsam_plans + agentsam_usage_events",              "expected_group": "plan budget vs actual spend",            "window": "Last 7 Days"},
]

P0_WRITER_TABLES = [
    "agentsam_compaction_events",
    "agentsam_guardrail_events",
    "agentsam_skill_revision",
    "agentsam_user_feature_override",
]


@dataclass
class Finding:
    category: str
    severity: str
    file: str
    line: int
    kpi_label: str
    snippet: str
    detail: str
    recommendation: str
    verdict: str


@dataclass
class ComponentMap:
    kpi_label: str
    file: str
    line: int
    api_endpoint: str
    sql_snippet: str
    table_refs: list = field(default_factory=list)
    verdict: str = "unknown"


RE_MOCK_DATA = re.compile(
    r"mock|fake|dummy|placeholder|FALLBACK|sampleData|testData|demoData|Math\.random\(\)",
    re.IGNORECASE,
)
RE_STATIC_METRIC = re.compile(
    r"(value|count|total|calls|tokens|runs|tasks|health|push|burn|spend)\s*[:=]\s*(\d+\.?\d*)\b",
    re.IGNORECASE,
)
RE_API_CALL = re.compile(
    r"(?:fetch|axios\.get|useQuery|useSWR)\s*\(\s*['\"`]([^'\"` ]+)['\"`]",
    re.IGNORECASE,
)
RE_TABLE_REF     = re.compile(r"\b(agentsam_\w+)\b")
RE_WORKSPACE_FLT = re.compile(r"workspace_id|tenant_id|workspaceId|tenantId", re.IGNORECASE)
RE_DATE_FLT      = re.compile(r"created_at|updated_at|date\(|startOf|dateRange", re.IGNORECASE)
RE_GRID_LAYOUT   = re.compile(r"flex-nowrap|whitespace-nowrap|overflow-x", re.IGNORECASE)


def is_overview_file(path: Path) -> bool:
    parts = [p.lower() for p in path.parts]
    name = path.name.lower()
    return any(k in name or k in parts for k in [
        "overview", "analytics", "kpi", "metric", "stats", "dashboard", "feed",
    ])


def is_api_file(path: Path) -> bool:
    parts = [p.lower() for p in path.parts]
    name = path.name.lower()
    return "api" in parts or "route" in parts or "worker" in name or "api" in name


def walk_files(root: Path) -> list[Path]:
    """Walk the full repo, skipping generated/vendor directories."""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix in SCAN_EXTENSIONS:
                results.append(p)
    return results


def scan_file(path: Path, root: Path) -> tuple[list[Finding], list[ComponentMap]]:
    rel = str(path.relative_to(root))
    findings: list[Finding] = []
    components: list[ComponentMap] = []

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return findings, components

    lines = raw.splitlines()
    is_overview = is_overview_file(path)
    is_api = is_api_file(path)

    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if not stripped or stripped.startswith("//") or stripped.startswith("*"):
            continue

        # Mock/fallback
        m = RE_MOCK_DATA.search(line)
        if m and (is_overview or is_api):
            block = " ".join(lines[max(0, i-2):min(len(lines), i+5)])
            has_number = bool(re.search(r"\d+\.?\d*", block))
            findings.append(Finding(
                category="MOCK_DATA", severity="CRITICAL" if has_number else "HIGH",
                file=rel, line=i, kpi_label="(inspect context)",
                snippet=stripped[:120],
                detail=f"Mock/fallback '{m.group(0)}' near metric values.",
                recommendation="Replace with real D1 query or empty state.",
                verdict="fallback_mock",
            ))

        # Static metric in frontend
        if is_overview and not is_api:
            m2 = RE_STATIC_METRIC.search(line)
            if m2:
                low = line.lower()
                if "limit" not in low and "max" not in low and "threshold" not in low:
                    findings.append(Finding(
                        category="MOCK_DATA", severity="HIGH",
                        file=rel, line=i, kpi_label=m2.group(1),
                        snippet=stripped[:120],
                        detail=f"Static metric value in frontend component: {m2.group(0)}",
                        recommendation="Values must come from API, not be hardcoded.",
                        verdict="fallback_mock",
                    ))

        # API call
        if is_overview:
            m3 = RE_API_CALL.search(line)
            if m3:
                endpoint = m3.group(1)
                matched_kpi = "unknown"
                for kpi in KPI_CARDS:
                    if any(k in endpoint.lower() for k in kpi["label"].lower().split()):
                        matched_kpi = kpi["label"]
                        break
                components.append(ComponentMap(
                    kpi_label=matched_kpi, file=rel, line=i,
                    api_endpoint=endpoint, sql_snippet="",
                ))

        # SQL checks
        if is_api:
            table_refs = RE_TABLE_REF.findall(line)
            if table_refs:
                block = " ".join(lines[max(0, i-1):min(len(lines), i+8)])
                has_workspace = bool(RE_WORKSPACE_FLT.search(block))
                has_date = bool(RE_DATE_FLT.search(block))

                for table in set(table_refs):
                    if table in P0_WRITER_TABLES:
                        if is_overview or "overview" in block.lower():
                            findings.append(Finding(
                                category="WRONG_TABLE", severity="HIGH",
                                file=rel, line=i, kpi_label="(P0 writer in overview)",
                                snippet=stripped[:120],
                                detail=f"P0 writer table '{table}' used in overview context.",
                                recommendation="Use agentsam_usage_events, agentsam_agent_run etc. instead.",
                                verdict="wrong_table",
                            ))
                        continue

                    if not has_workspace and re.search(r"\bSELECT\b", block, re.IGNORECASE):
                        findings.append(Finding(
                            category="MISSING_FILTER", severity="HIGH",
                            file=rel, line=i, kpi_label="(missing workspace filter)",
                            snippet=stripped[:120],
                            detail=f"Query on '{table}' missing workspace_id/tenant_id.",
                            recommendation="Add WHERE workspace_id = ?",
                            verdict="unknown",
                        ))

                    if not has_date and re.search(r"\bSELECT\b", block, re.IGNORECASE):
                        findings.append(Finding(
                            category="MISSING_FILTER", severity="MEDIUM",
                            file=rel, line=i, kpi_label="(missing date filter)",
                            snippet=stripped[:120],
                            detail=f"Query on '{table}' missing date filter.",
                            recommendation="Add WHERE created_at >= ? to enforce time window.",
                            verdict="stale",
                        ))

        # CSS layout
        if is_overview and RE_GRID_LAYOUT.search(line):
            findings.append(Finding(
                category="CSS_LAYOUT", severity="HIGH",
                file=rel, line=i, kpi_label="KPI card row",
                snippet=stripped[:120],
                detail="Layout property causes horizontal overflow when Agent Sam panel opens.",
                recommendation=(
                    "Use CSS grid auto-fill/minmax or flex-wrap:wrap. "
                    "Dispatch window resize on panel open/close for recharts re-measure."
                ),
                verdict="layout_bug",
            ))

    return findings, components


def write_index(out: Path, findings: list[Finding], components: list[ComponentMap]) -> None:
    counts: dict[str, int] = {}
    for f in findings:
        counts[f.category] = counts.get(f.category, 0) + 1
    lines = [
        "# Dashboard Overview Data Mapping Audit",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        "", "## Summary", f"Total: {len(findings)}",
    ]
    for cat, n in sorted(counts.items()):
        lines.append(f"- {cat}: {n}")
    lines += [
        "", "## Output Files",
        "- KPI_VALUE_PROOF.md — fill in live DB values, get verdict",
        "- MOCK_OR_FALLBACK_PATHS.md — all fake data paths",
        "- CSS_LAYOUT_ISSUES.md — card/chart layout bugs",
        "- API_ENDPOINTS.md — detected API calls",
        "- D1_QUERY_MAP.md — SQL audit",
        "- NEXT_PATCH.md — ordered patch list",
        "- findings.json — machine-readable",
    ]
    (out / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")


def write_kpi_proof(out: Path) -> None:
    lines = [
        "# KPI Value Proof",
        "",
        "Verdict: real / stale / wrong_table / fallback_mock / unknown",
        "",
        "| KPI | Expected Table | Field | Window | Display | DB Value | Verdict |",
        "|-----|---------------|-------|--------|---------|----------|---------|",
    ]
    for kpi in KPI_CARDS:
        lines.append(
            f"| {kpi['label']} | {kpi['expected_table']} "
            f"| {kpi['expected_field']} | {kpi['window']} "
            f"| {kpi['display_hint']} | _run query_ | unknown |"
        )
    lines += [
        "", "## Verification SQL", "", "```sql",
        "SELECT SUM(cost) FROM agentsam_usage_events WHERE created_at >= date('now','start of month');",
        "SELECT COUNT(*) FROM agentsam_usage_events WHERE created_at >= datetime('now','-7 days');",
        "SELECT SUM(tokens_in)+SUM(tokens_out) FROM agentsam_usage_events WHERE created_at >= datetime('now','-7 days');",
        "SELECT COUNT(*) FROM agentsam_mcp_tool_execution WHERE date(created_at)=date('now');",
        "SELECT COUNT(*) FROM agentsam_workflow_runs WHERE date(created_at)=date('now');",
        "SELECT COUNT(*) FROM agentsam_plan_tasks WHERE status NOT IN ('completed','done','cancelled');",
        "SELECT worker_name,health_pct,checked_at FROM agentsam_deployment_health ORDER BY checked_at DESC LIMIT 10;",
        "SELECT COUNT(*) FROM agentsam_webhook_events WHERE provider='github' AND event_type='push' AND created_at >= datetime('now','-7 days');",
        "SELECT date(created_at) day,provider,SUM(cost) FROM agentsam_usage_events WHERE created_at >= datetime('now','-7 days') GROUP BY day,provider;",
        "SELECT workflow_key,status,COUNT(*) FROM agentsam_workflow_runs GROUP BY workflow_key,status ORDER BY 3 DESC;",
        "SELECT tool_name,COUNT(*) FROM agentsam_mcp_tool_execution WHERE created_at >= datetime('now','-7 days') GROUP BY tool_name ORDER BY 2 DESC LIMIT 10;",
        "```",
    ]
    (out / "KPI_VALUE_PROOF.md").write_text("\n".join(lines), encoding="utf-8")


def write_css_layout(out: Path, findings: list[Finding]) -> None:
    css = [f for f in findings if f.category == "CSS_LAYOUT"]
    lines = [
        "# CSS Layout Issues",
        "",
        "## Problem (screenshots)",
        "When Agent Sam panel opens, KPI cards overflow horizontally. Charts deform.",
        "",
        "## Fix",
        "```css",
        ".kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }",
        "```",
        "```tsx",
        "useEffect(() => { window.dispatchEvent(new Event('resize')); }, [agentPanelOpen]);",
        "<ResponsiveContainer width='100%' height={240}><LineChart data={data} /></ResponsiveContainer>",
        "```",
        "", "## Code Hits", "",
    ]
    if css:
        for f in css:
            lines += [f"- `{f.file}:{f.line}` `{f.snippet}`", f"  {f.detail}", ""]
    else:
        lines.append("No hits from static scan. Search manually for flex-nowrap, overflow-x on card row container.")
    (out / "CSS_LAYOUT_ISSUES.md").write_text("\n".join(lines), encoding="utf-8")


def write_mock_paths(out: Path, findings: list[Finding]) -> None:
    mock = [f for f in findings if f.category == "MOCK_DATA"]
    lines = ["# Mock / Fallback Data Paths", f"", f"Total: {len(mock)}", ""]
    for f in sorted(mock, key=lambda x: (x.file, x.line)):
        lines += [f"### {f.file}:{f.line} [{f.severity}]", f"`{f.snippet}`", f.detail, ""]
    if not mock:
        lines.append("No mock patterns detected. Run KPI_VALUE_PROOF.md queries to confirm data is real.")
    (out / "MOCK_OR_FALLBACK_PATHS.md").write_text("\n".join(lines), encoding="utf-8")


def write_api_endpoints(out: Path, components: list[ComponentMap]) -> None:
    lines = [
        "# API Endpoints",
        "", "| KPI | File | Line | Endpoint | Worker Route | Table | Verdict |",
        "|-----|------|------|----------|-------------|-------|---------|",
    ]
    for c in sorted(components, key=lambda x: (x.kpi_label, x.file)):
        lines.append(f"| {c.kpi_label} | {c.file} | {c.line} | `{c.api_endpoint}` | _trace_ | _trace_ | unknown |")
    if not components:
        lines.append("| No API calls detected in overview files. |")
    (out / "API_ENDPOINTS.md").write_text("\n".join(lines), encoding="utf-8")


def write_d1_query_map(out: Path, findings: list[Finding]) -> None:
    filter_findings = [f for f in findings if f.category in ("MISSING_FILTER", "WRONG_TABLE")]
    lines = ["# D1 Query Map", ""]
    for kpi in KPI_CARDS:
        lines += [f"### {kpi['label']}", f"- Table: `{kpi['expected_table']}`",
                  f"- Field: `{kpi['expected_field']}`", f"- Window: `{kpi['window']}`", ""]
    lines += ["## Issues", ""]
    if filter_findings:
        for f in filter_findings:
            lines += [f"- `{f.file}:{f.line}` [{f.category}] {f.detail}", f"  Fix: {f.recommendation}", ""]
    else:
        lines.append("No SQL issues from static scan. Verify manually in worker.js / src/api/.")
    (out / "D1_QUERY_MAP.md").write_text("\n".join(lines), encoding="utf-8")


def write_next_patch(out: Path) -> None:
    lines = [
        "# NEXT_PATCH.md",
        "",
        "Do not patch until KPI_VALUE_PROOF.md verdicts are confirmed.",
        "",
        "## 1. Default Agent Sam chat closed on /dashboard/overview",
        "```ts",
        "const CHAT_CLOSED_ROUTES = ['/dashboard/overview', '/dashboard/analytics'];",
        "const defaultOpen = (() => {",
        "  const stored = localStorage.getItem('agentPanelOpen');",
        "  if (stored !== null) return stored === 'true';",
        "  return !CHAT_CLOSED_ROUTES.some(r => location.pathname.startsWith(r));",
        "})();",
        "const [agentPanelOpen, setAgentPanelOpen] = useState(defaultOpen);",
        "const togglePanel = () => {",
        "  const next = !agentPanelOpen;",
        "  setAgentPanelOpen(next);",
        "  localStorage.setItem('agentPanelOpen', String(next));",
        "};",
        "```",
        "",
        "## 2. Fix KPI card row layout (CSS_LAYOUT_ISSUES.md)",
        "## 3. Patch wrong analytics sources (after KPI_VALUE_PROOF.md)",
        "## 4. Empty states for missing data (— not 0 with sparkline)",
        "## 5. Smoke P0 writer endpoints after CF deploy",
    ]
    (out / "NEXT_PATCH.md").write_text("\n".join(lines), encoding="utf-8")


def write_frontend_components(out: Path) -> None:
    lines = [
        "# Frontend Components",
        "", "| KPI | Expected File | Confirmed? |",
        "|-----|--------------|------------|",
    ]
    for kpi in KPI_CARDS:
        lines.append(f"| {kpi['label']} | dashboard/components/overview/* | no |")
    lines += ["", "Run: `grep -rl 'overview\\|KPICard\\|MetricCard' dashboard/src --include='*.tsx'`"]
    (out / "FRONTEND_COMPONENTS.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--out",  default=str(DEFAULT_OUT))
    parser.add_argument("--json", metavar="FILE")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    out  = Path(args.out).expanduser()

    if not root.exists():
        print(f"ERROR: {root} does not exist", file=sys.stderr)
        sys.exit(1)

    out.mkdir(parents=True, exist_ok=True)

    files = walk_files(root)
    print(f"Scanning {len(files)} files under {root} ...", file=sys.stderr)

    all_findings: list[Finding] = []
    all_components: list[ComponentMap] = []

    for path in files:
        f, c = scan_file(path, root)
        all_findings.extend(f)
        all_components.extend(c)

    seen: set[tuple] = set()
    deduped: list[Finding] = []
    for f in all_findings:
        key = (f.category, f.file, f.line)
        if key not in seen:
            seen.add(key)
            deduped.append(f)

    write_index(out, deduped, all_components)
    write_kpi_proof(out)
    write_css_layout(out, deduped)
    write_mock_paths(out, deduped)
    write_api_endpoints(out, all_components)
    write_frontend_components(out)
    write_d1_query_map(out, deduped)
    write_next_patch(out)

    json_path = out / "findings.json"
    json_path.write_text(json.dumps([asdict(f) for f in deduped], indent=2), encoding="utf-8")
    if args.json:
        Path(args.json).write_text(json_path.read_text(), encoding="utf-8")

    print(f"\nAudit complete -> {out}/")
    counts: dict[str, int] = {}
    for f in deduped:
        counts[f.category] = counts.get(f.category, 0) + 1
    print(f"Total: {len(deduped)}")
    for cat, n in sorted(counts.items()):
        print(f"  {cat}: {n}")


if __name__ == "__main__":
    main()
