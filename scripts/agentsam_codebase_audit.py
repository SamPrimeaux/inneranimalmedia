#!/usr/bin/env python3
"""
agentsam_codebase_audit.py
Walks the IAM repo src/ tree and identifies:
  - Hardcoded model strings
  - Hardcoded workflow/surface fallbacks
  - Broken/undefined dispatch references
  - Legacy fallback paths that bypass agentsam_* D1 tables
  - Tool routing hardcodes
  - Empty handler config silent swallows
  - Duplicate/wrong model resolver calls
  - Hardcoded catalog limits
  - Node[0] instead of resolveEntryNode

Usage:
  python3 agentsam_codebase_audit.py --repo /path/to/inneranimalmedia
  python3 agentsam_codebase_audit.py --repo /path/to/inneranimalmedia --output report.md
  python3 agentsam_codebase_audit.py --repo /path/to/inneranimalmedia --json

Scans: src/**/*.js, src/**/*.ts, src/**/*.tsx, dashboard/**/*.tsx, dashboard/**/*.ts
Skips: node_modules, dist, .git, scripts/, migrations/, *.test.*, *.spec.*, *.min.js
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ─── Finding categories ────────────────────────────────────────────────────────

CATEGORIES = {
    "HARDCODED_MODEL":        "Hardcoded model string",
    "HARDCODED_WORKFLOW":     "Hardcoded workflow/surface key",
    "BROKEN_DISPATCH":        "Broken/undefined dispatch reference",
    "LEGACY_FALLBACK":        "Legacy fallback bypassing D1",
    "HARDCODED_TOOL_ROUTE":   "Hardcoded tool route or filter",
    "EMPTY_CONFIG_SWALLOW":   "Empty handler_config silent swallow",
    "WRONG_RESOLVER":         "Wrong/duplicate model resolver call",
    "HARDCODED_LIMIT":        "Hardcoded catalog/tool count limit",
    "LEGACY_NODE_SWITCH":     "Legacy node_type switch instead of registry",
    "HARDCODED_TIER":         "Hardcoded task tier or model tier",
    "MISSING_TABLE_PREFIX":   "agentsam_* table name missing prefix",
    "HARDCODED_FALLBACK_KEY": "Hardcoded fallback model/provider key",
}

SEVERITY = {
    "HARDCODED_MODEL":        "HIGH",
    "HARDCODED_WORKFLOW":     "HIGH",
    "BROKEN_DISPATCH":        "CRITICAL",
    "LEGACY_FALLBACK":        "HIGH",
    "HARDCODED_TOOL_ROUTE":   "MEDIUM",
    "EMPTY_CONFIG_SWALLOW":   "HIGH",
    "WRONG_RESOLVER":         "HIGH",
    "HARDCODED_LIMIT":        "MEDIUM",
    "LEGACY_NODE_SWITCH":     "HIGH",
    "HARDCODED_TIER":         "MEDIUM",
    "MISSING_TABLE_PREFIX":   "MEDIUM",
    "HARDCODED_FALLBACK_KEY": "HIGH",
}


# ─── Pattern definitions ────────────────────────────────────────────────────────

@dataclass
class AuditPattern:
    category: str
    regex: str
    description: str
    note: str = ""
    exclude_if: Optional[str] = None   # skip line if this pattern also matches
    file_filter: Optional[str] = None  # only scan files matching this glob suffix


PATTERNS: list[AuditPattern] = [

    # ── HARDCODED MODEL STRINGS ──────────────────────────────────────────────
    AuditPattern("HARDCODED_MODEL",
        r"""['"`](gpt-4[o\-\.0-9a-z]*)['"`]""",
        "Hardcoded GPT-4 model string",
        "Should resolve via resolveModelForTask / agentsam_routing_arms",
        exclude_if=r"(//|/\*|agentsam_model_catalog|\.md|test|spec|KNOWN_MODELS|modelCatalog)"),

    AuditPattern("HARDCODED_MODEL",
        r"""['"`](gpt-5\.4[-a-z]*)['"`]""",
        "Hardcoded GPT-5.4 family model string",
        "Use resolveModelForTask — never hardcode in hot path",
        exclude_if=r"(//|/\*|agentsam_model_catalog|KNOWN_MODELS|modelCatalog|\.md)"),

    AuditPattern("HARDCODED_MODEL",
        r"""['"`](gemini-[\d\.\-a-z]+)['"`]""",
        "Hardcoded Gemini model string",
        "Should come from agentsam_routing_arms via resolveModelForTask",
        exclude_if=r"(//|/\*|agentsam_model_catalog|KNOWN_MODELS|modelCatalog)"),

    AuditPattern("HARDCODED_MODEL",
        r"""['"`](claude-(?:haiku|sonnet|opus)[-\d\.a-z]*)['"`]""",
        "Hardcoded Claude model string",
        "Should resolve via agentsam_routing_arms",
        exclude_if=r"(//|/\*|agentsam_model_catalog|KNOWN_MODELS|modelCatalog)"),

    AuditPattern("HARDCODED_MODEL",
        r"""['"`](@cf/[a-z0-9\-/\.]+)['"`]""",
        "Hardcoded Workers AI model string",
        "Should come from agentsam_routing_arms",
        exclude_if=r"(//|/\*|agentsam_model_catalog|KNOWN_MODELS|modelCatalog)"),

    AuditPattern("HARDCODED_MODEL",
        r"""['"`](o3|o4-mini|o1[-a-z]*)['"`]""",
        "Hardcoded reasoning model string (o3/o4-mini/o1)",
        "Resolve via agentsam_routing_arms"),

    # ── HARDCODED FALLBACK KEYS ───────────────────────────────────────────────
    AuditPattern("HARDCODED_FALLBACK_KEY",
        r"""(?:fallback|default|emergency)\s*[:=]\s*['"`](gpt-|gemini-|claude-|@cf/)""",
        "Hardcoded fallback model key assignment",
        "Only EMERGENCY_POLICY in resolveModelForTask is allowed as fallback"),

    AuditPattern("HARDCODED_FALLBACK_KEY",
        r"""EMERGENCY_POLICY|FALLBACK_MODEL\s*=\s*['"`]""",
        "EMERGENCY_POLICY or FALLBACK_MODEL constant definition",
        "Verify this is only in resolveModelForTask — not duplicated elsewhere"),

    # ── HARDCODED WORKFLOW / SURFACE KEYS ────────────────────────────────────
    AuditPattern("HARDCODED_WORKFLOW",
        r"""['"`](i-am-builder-monaco|i-am-architect-excalidraw|i-am-inspector-playwright)['"`]""",
        "Hardcoded workflow key in surface routing",
        "Must resolve via agentsam_workflows.metadata_json.surface_routes — not string literals"),

    AuditPattern("HARDCODED_WORKFLOW",
        r"""SURFACE_WORKFLOW_FALLBACKS|firstActiveWorkflowKeyAmong|resolveWorkflowForMessage""",
        "Hardcoded surface→workflow fallback map or keyword resolver",
        "Delete — metadata miss should be an explicit error, not a silent fallback"),

    AuditPattern("HARDCODED_WORKFLOW",
        r"""(?:workflow_key|workflowKey)\s*[:=]\s*['"`][a-z_\-]+['"`]""",
        "Workflow key assigned as string literal",
        "Should come from agentsam_workflows lookup, not inline string"),

    # ── BROKEN / UNDEFINED DISPATCH ──────────────────────────────────────────
    AuditPattern("BROKEN_DISPATCH",
        r"""dispatchMcpTool\s*\(""",
        "Call to dispatchMcpTool — function is undefined at runtime",
        "Wire to executeWorkflowMcpTool which reads agentsam_mcp_tools"),

    AuditPattern("BROKEN_DISPATCH",
        r"""dispatchComplete\s*\(""",
        "Call to dispatchComplete — function is undefined at runtime",
        "Identify correct dispatcher and wire it"),

    AuditPattern("BROKEN_DISPATCH",
        r"""runBuiltinTool\s*\(""",
        "Call to runBuiltinTool — legacy prefix-switch dispatcher",
        "Replace with dispatchHandler reading agentsam_tools.dispatch_key"),

    AuditPattern("BROKEN_DISPATCH",
        r"""executePrimitive\s*\(""",
        "Call to executePrimitive — check it throws on empty handler_config_json",
        "Must call emptyHandlerConfig() guard before any executor_kind"),

    # ── LEGACY NODE_TYPE SWITCH ───────────────────────────────────────────────
    AuditPattern("LEGACY_NODE_SWITCH",
        r"""case\s+['"`](agent|mcp_tool|db_query|script|terminal)['"`]\s*:""",
        "Legacy node_type switch case in workflow executor",
        "Remove production paths — registry miss must fail, not fall through",
        file_filter=".js"),

    AuditPattern("LEGACY_NODE_SWITCH",
        r"""node(?:Type|\.type)\s*===?\s*['"`](agent|mcp_tool|db_query|script)['"`]""",
        "node_type string comparison outside of registry lookup",
        "Should not appear after handler registry is authoritative"),

    AuditPattern("LEGACY_NODE_SWITCH",
        r"""nodes\[0\]""",
        "Accessing nodes[0] directly — ignores entry_node_key",
        "Use resolveEntryNode(workflow, nodes) reading agentsam_workflows.metadata_json"),

    # ── LEGACY FALLBACKS BYPASSING D1 ────────────────────────────────────────
    AuditPattern("LEGACY_FALLBACK",
        r"""TASK_TIER_MAP|TIER_MAP\s*=\s*\{""",
        "Hardcoded TASK_TIER_MAP / TIER_MAP constant",
        "Delete — model tier must come from agentsam_routing_arms and agentsam_route_requirements"),

    AuditPattern("LEGACY_FALLBACK",
        r"""SCRIPT_HANDLERS|registerAgentStepHandler|HANDLER_MAP\s*=\s*\{""",
        "In-memory handler registry (SCRIPT_HANDLERS / HANDLER_MAP)",
        "Migrate all entries to agentsam_workflow_handlers with non-empty handler_config_json"),

    AuditPattern("LEGACY_FALLBACK",
        r"""startsWith\s*\(\s*['"`]script_['"`]\)|startsWith\s*\(\s*['"`]builtin_['"`]\)""",
        "Prefix-guessing dispatch (startsWith script_ / builtin_)",
        "Replace with agentsam_tools.dispatch_key lookup"),

    AuditPattern("LEGACY_FALLBACK",
        r"""handler_config_json\s*(?:===?|!==?)\s*['"`]\{\}['"`]|handler_config_json\s*===?\s*null""",
        "handler_config_json empty check — verify it THROWS, not falls through",
        "emptyHandlerConfig() must throw for ALL executor_kinds"),

    AuditPattern("LEGACY_FALLBACK",
        r"""agentsam-route-tool-resolver\.js|routeToolResolver""",
        "Reference to agentsam-route-tool-resolver.js JS defaults",
        "These defaults should be replaced by agentsam_route_requirements rows"),

    # ── EMPTY CONFIG SILENT SWALLOW ───────────────────────────────────────────
    AuditPattern("EMPTY_CONFIG_SWALLOW",
        r"""(?:config|handlerConfig|handler_config)\s*\|\|\s*\{\}""",
        "handler_config defaulting to {} — silently swallows empty config",
        "Must throw — empty config is a data error, not a default state"),

    AuditPattern("EMPTY_CONFIG_SWALLOW",
        r"""JSON\.parse\s*\(\s*(?:row|handler|h)\.\s*handler_config_json\s*\)\s*\|\|\s*\{\}""",
        "JSON.parse(handler_config_json) || {} — silently accepts empty",
        "Throw if result is empty object for non-passthrough executor_kinds"),

    # ── WRONG / DUPLICATE MODEL RESOLVER ─────────────────────────────────────
    AuditPattern("WRONG_RESOLVER",
        r"""resolveRoutingArm\s*\(""",
        "Direct call to resolveRoutingArm — should go through resolveModelForTask",
        "resolveModelForTask is the one canonical resolver everywhere"),

    AuditPattern("WRONG_RESOLVER",
        r"""ctx\.waitUntil\s*\(.*resolveModelForTask""",
        "resolveModelForTask called inside ctx.waitUntil — post-stream, too late",
        "Must be called BEFORE dispatchStream so model is known at stream start"),

    AuditPattern("WRONG_RESOLVER",
        r"""resolveAutoModelKey\s*\(""",
        "resolveAutoModelKey — old model resolution path",
        "Consolidate into resolveModelForTask"),

    AuditPattern("WRONG_RESOLVER",
        r"""resolveAgentsamPromptRoute.*preferred_model""",
        "preferred_model hint used without going through resolveModelForTask",
        "Route preferred_model must feed INTO resolveModelForTask, not bypass it"),

    # ── HARDCODED CATALOG / TOOL LIMITS ──────────────────────────────────────
    AuditPattern("HARDCODED_LIMIT",
        r"""catalogLimit\s*[:=]\s*(?:96|192|64|128|256)""",
        "Hardcoded catalog row limit",
        "Must come from agentsam_prompt_routes.max_tools (default 8, never 20+)"),

    AuditPattern("HARDCODED_LIMIT",
        r"""\.slice\s*\(\s*0\s*,\s*(?:96|192|64|128|20)\s*\)""",
        "Hardcoded .slice(0, N) on tool array",
        "Tool cap must be agentsam_prompt_routes.max_tools for this route"),

    AuditPattern("HARDCODED_LIMIT",
        r"""maxTools\s*[:=?]+\s*(?:20|24|32|96|192)""",
        "maxTools hardcoded above 8",
        "agentsam_prompt_routes.max_tools is the ceiling — default 8"),

    AuditPattern("HARDCODED_LIMIT",
        r"""includeSchema\s*[:=]\s*true""",
        "Schemas included eagerly in tool load",
        "Lazy schema — only include after tool is selected for dispatch"),

    # ── HARDCODED TASK / MODEL TIER ───────────────────────────────────────────
    AuditPattern("HARDCODED_TIER",
        r"""['"`](nano|mini|flash|standard|power|reasoning)['"`]\s*:\s*['"`](gpt-|gemini-|claude-)""",
        "Tier→model string map literal",
        "Model selection per tier must come from agentsam_routing_arms Thompson sampling"),

    AuditPattern("HARDCODED_TIER",
        r"""task_type\s*===?\s*['"`](code|sql|agent|chat|plan|debug|deploy)['"`]\s*\?""",
        "Inline task_type ternary for model/tier selection",
        "task_type dispatch must read agentsam_routing_arms.task_type column"),

    # ── MISSING agentsam_* TABLE PREFIX ──────────────────────────────────────
    AuditPattern("MISSING_TABLE_PREFIX",
        r"""(?<!\w)(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(prompt_routes|routing_arms|workflow_handlers|route_requirements|approval_queue|mcp_tools|workflow_nodes|workflow_edges|spawn_session|subagent_profile|command_pattern|rules_document|scripts|skill)\b""",
        "SQL referencing agentsam_* table without prefix",
        "All D1 tables are agentsam_* — bare names are wrong and will 404 at runtime"),

    # ── TOOL ROUTE HARDCODES ──────────────────────────────────────────────────
    AuditPattern("HARDCODED_TOOL_ROUTE",
        r"""filterAgentToolsForRequest|filterToolsForCapabilityDecision|filterToolsByIntent""",
        "JS-side tool filter function — regex/heuristic based",
        "Replace with agentsam_capability_aliases + agentsam_route_requirements narrowToolsForRoute()"),

    AuditPattern("HARDCODED_TOOL_ROUTE",
        r"""queryBrandedMcpCatalog|selectScopedMcpToolNames|enrichToolsFromAgentsamCatalog""",
        "Multi-step tool catalog loading function",
        "Consolidate into single resolveAgentSession tool surface — ≤8 tools, schemas lazy"),

    AuditPattern("HARDCODED_TOOL_ROUTE",
        r"""loadWorkspaceTokenAllowedToolNames|entitlements.*tool""",
        "Entitlement/allowlist tool loading outside resolveAgentSession",
        "Must be part of batched session resolve, not a separate sequential call"),

    AuditPattern("HARDCODED_TOOL_ROUTE",
        r"""tool(?:Name|Key|_key)\s*===?\s*['"`][a-z_]+['"`]\s*(?:&&|\|\||\?)""",
        "Inline tool name equality check in routing logic",
        "Tool routing must read agentsam_capability_aliases, not inline string comparison"),
]


# ─── Scanner ───────────────────────────────────────────────────────────────────

SCAN_EXTENSIONS = {".js", ".ts", ".tsx"}

SKIP_DIRS = {
    "node_modules", "dist", ".git", "migrations",
    "scripts", ".wrangler", "coverage", "__pycache__",
    ".turbo", "build", "out", ".next", ".cache",
}

SKIP_FILE_PATTERNS = [
    re.compile(r"\.(test|spec|min|bundle)\.(js|ts|tsx)$"),
    re.compile(r"\.d\.ts$"),
]

SCAN_ROOTS = ["src", "dashboard", "worker"]


@dataclass
class Finding:
    file: str
    line_no: int
    line: str
    category: str
    description: str
    note: str
    severity: str
    match: str


def should_skip_file(path: Path) -> bool:
    for p in SKIP_FILE_PATTERNS:
        if p.search(path.name):
            return True
    return False


def should_skip_dir(name: str) -> bool:
    return name in SKIP_DIRS


def scan_file(path: Path, patterns: list[AuditPattern]) -> list[Finding]:
    findings = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return findings

    lines = text.splitlines()
    rel = str(path)

    for lineno, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or line.startswith("//") or line.startswith("*"):
            continue

        for pat in patterns:
            if pat.file_filter and not rel.endswith(pat.file_filter):
                continue
            try:
                m = re.search(pat.regex, raw, re.IGNORECASE)
            except re.error:
                continue
            if not m:
                continue
            if pat.exclude_if:
                try:
                    if re.search(pat.exclude_if, raw, re.IGNORECASE):
                        continue
                except re.error:
                    pass
            findings.append(Finding(
                file=rel,
                line_no=lineno,
                line=raw.rstrip(),
                category=pat.category,
                description=pat.description,
                note=pat.note,
                severity=SEVERITY.get(pat.category, "MEDIUM"),
                match=m.group(0),
            ))
    return findings


def walk_repo(repo_root: Path) -> list[Path]:
    files = []
    for root_name in SCAN_ROOTS:
        root = repo_root / root_name
        if not root.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
            for fn in filenames:
                p = Path(dirpath) / fn
                if p.suffix in SCAN_EXTENSIONS and not should_skip_file(p):
                    files.append(p)
    return sorted(files)


# ─── Reporting ─────────────────────────────────────────────────────────────────

SEVERITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


def group_findings(findings: list[Finding]) -> dict:
    grouped = defaultdict(list)
    for f in findings:
        grouped[f.category].append(f)
    return grouped


def print_report(findings: list[Finding], repo_root: Path) -> None:
    if not findings:
        print("✅  No findings. Codebase looks clean.")
        return

    grouped = group_findings(findings)
    total = len(findings)
    critical = sum(1 for f in findings if f.severity == "CRITICAL")
    high = sum(1 for f in findings if f.severity == "HIGH")
    medium = sum(1 for f in findings if f.severity == "MEDIUM")

    print("\n" + "═" * 78)
    print("  AGENT SAM CODEBASE AUDIT")
    print(f"  Repo: {repo_root}")
    print("═" * 78)
    print(f"\n  TOTAL FINDINGS : {total}")
    print(f"  CRITICAL       : {critical}")
    print(f"  HIGH           : {high}")
    print(f"  MEDIUM         : {medium}")
    print()

    # Sort categories by worst severity first, then count
    def cat_sort_key(cat):
        cat_findings = grouped[cat]
        worst = min(SEVERITY_ORDER.get(f.severity, 9) for f in cat_findings)
        return (worst, -len(cat_findings))

    for cat in sorted(grouped.keys(), key=cat_sort_key):
        cat_findings = sorted(grouped[cat],
                              key=lambda f: (SEVERITY_ORDER.get(f.severity, 9), f.file, f.line_no))
        print("─" * 78)
        print(f"  [{SEVERITY.get(cat, 'MEDIUM')}]  {CATEGORIES.get(cat, cat)}")
        print(f"  {len(cat_findings)} occurrence(s)")
        print()
        for f in cat_findings:
            rel = f.file.replace(str(repo_root) + "/", "")
            print(f"  {rel}:{f.line_no}")
            print(f"    match : {f.match.strip()}")
            print(f"    line  : {f.line[:120].strip()}")
            print(f"    why   : {f.description}")
            if f.note:
                print(f"    fix   : {f.note}")
            print()

    print("═" * 78)
    print(f"  {critical} CRITICAL  |  {high} HIGH  |  {medium} MEDIUM")
    print("═" * 78 + "\n")


def write_markdown(findings: list[Finding], repo_root: Path, out_path: Path) -> None:
    grouped = group_findings(findings)
    lines = []
    lines.append("# Agent Sam Codebase Audit\n")
    lines.append(f"**Repo:** `{repo_root}`  \n")
    lines.append(f"**Total findings:** {len(findings)}\n\n")

    sev_counts = defaultdict(int)
    for f in findings:
        sev_counts[f.severity] += 1
    lines.append("| Severity | Count |\n|---|---|\n")
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        if sev_counts[sev]:
            lines.append(f"| {sev} | {sev_counts[sev]} |\n")
    lines.append("\n---\n\n")

    def cat_sort_key(cat):
        cat_findings = grouped[cat]
        worst = min(SEVERITY_ORDER.get(f.severity, 9) for f in cat_findings)
        return (worst, -len(cat_findings))

    for cat in sorted(grouped.keys(), key=cat_sort_key):
        cat_findings = sorted(grouped[cat],
                              key=lambda f: (f.file, f.line_no))
        sev = SEVERITY.get(cat, "MEDIUM")
        lines.append(f"## [{sev}] {CATEGORIES.get(cat, cat)}\n\n")
        lines.append(f"**{len(cat_findings)} occurrence(s)**\n\n")
        lines.append("| File | Line | Match | Fix |\n|---|---|---|---|\n")
        for f in cat_findings:
            rel = f.file.replace(str(repo_root) + "/", "")
            match_safe = f.match.strip().replace("|", "\\|").replace("`", "'")
            note_safe = f.note.replace("|", "\\|")
            lines.append(f"| `{rel}` | {f.line_no} | `{match_safe}` | {note_safe} |\n")
        lines.append("\n")

    out_path.write_text("".join(lines), encoding="utf-8")
    print(f"Markdown report written to: {out_path}")


def write_json_report(findings: list[Finding], out_path: Optional[Path] = None) -> None:
    data = [
        {
            "file": f.file,
            "line": f.line_no,
            "severity": f.severity,
            "category": f.category,
            "description": f.description,
            "match": f.match,
            "note": f.note,
            "line_text": f.line.strip(),
        }
        for f in sorted(findings,
                        key=lambda x: (SEVERITY_ORDER.get(x.severity, 9), x.file, x.line_no))
    ]
    payload = json.dumps(data, indent=2)
    if out_path:
        out_path.write_text(payload, encoding="utf-8")
        print(f"JSON report written to: {out_path}")
    else:
        print(payload)


# ─── Summary table: findings per file ─────────────────────────────────────────

def print_file_summary(findings: list[Finding]) -> None:
    file_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for f in findings:
        file_counts[f.file][f.severity] += 1

    sorted_files = sorted(
        file_counts.items(),
        key=lambda kv: (
            -kv[1].get("CRITICAL", 0) * 1000
            - kv[1].get("HIGH", 0) * 100
            - kv[1].get("MEDIUM", 0)
        )
    )

    print("\n  TOP OFFENDING FILES\n")
    print(f"  {'File':<60} {'CRIT':>5} {'HIGH':>5} {'MED':>5} {'TOTAL':>6}")
    print("  " + "─" * 80)
    for fp, counts in sorted_files[:30]:
        crit = counts.get("CRITICAL", 0)
        high = counts.get("HIGH", 0)
        med = counts.get("MEDIUM", 0)
        tot = sum(counts.values())
        short = fp[-58:] if len(fp) > 58 else fp
        print(f"  {short:<60} {crit:>5} {high:>5} {med:>5} {tot:>6}")
    print()


# ─── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Agent Sam codebase audit — finds hardcoded models, broken dispatch, legacy fallbacks"
    )
    parser.add_argument("--repo", required=True,
                        help="Path to inneranimalmedia repo root")
    parser.add_argument("--output", default=None,
                        help="Write markdown report to this file")
    parser.add_argument("--json", action="store_true",
                        help="Print JSON output to stdout instead of readable report")
    parser.add_argument("--json-out", default=None,
                        help="Write JSON report to this file")
    parser.add_argument("--category", default=None,
                        help="Filter to one category (e.g. HARDCODED_MODEL)")
    parser.add_argument("--severity", default=None,
                        help="Filter to severity: CRITICAL | HIGH | MEDIUM")
    parser.add_argument("--file-summary", action="store_true",
                        help="Print per-file finding counts")
    args = parser.parse_args()

    repo_root = Path(args.repo).expanduser().resolve()
    if not repo_root.exists():
        print(f"ERROR: repo path does not exist: {repo_root}", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning {repo_root} ...")
    files = walk_repo(repo_root)
    print(f"Found {len(files)} source files to scan.")

    active_patterns = PATTERNS
    if args.category:
        active_patterns = [p for p in PATTERNS if p.category == args.category.upper()]
        if not active_patterns:
            print(f"Unknown category: {args.category}", file=sys.stderr)
            sys.exit(1)

    all_findings: list[Finding] = []
    for f in files:
        all_findings.extend(scan_file(f, active_patterns))

    if args.severity:
        all_findings = [f for f in all_findings if f.severity == args.severity.upper()]

    if args.json:
        write_json_report(all_findings)
        return

    if args.json_out:
        write_json_report(all_findings, Path(args.json_out))

    print_report(all_findings, repo_root)

    if args.file_summary or True:   # always show file summary
        print_file_summary(all_findings)

    if args.output:
        write_markdown(all_findings, repo_root, Path(args.output))

    # Exit code: 1 if any CRITICAL findings
    if any(f.severity == "CRITICAL" for f in all_findings):
        sys.exit(1)


if __name__ == "__main__":
    main()
