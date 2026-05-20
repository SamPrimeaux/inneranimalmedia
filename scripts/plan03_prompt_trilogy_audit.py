#!/usr/bin/env python3
"""
scripts/plan03_prompt_trilogy_audit.py
======================================
Plan 3 — Prompts as product surface (routes → versions → cache)

Audit questions:
  1. For each active prompt_route: are all prompt_layer_keys in prompt_versions (is_active=1)?
  2. How many routes still have only ["core_identity"]?
  3. Is agentsam_prompt_cache_keys write-only (no read path)?
  4. Is ai_compiled_context_cache still on the chat hot path?
  5. Does agentsam_agent_run have assembled_prompt_hash / prompt_layer_keys_json columns?

Usage:
    python3 scripts/plan03_prompt_trilogy_audit.py [--no-d1] [--strict]
"""

import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))

from plan_audit_common import (
    add_base_args, config_from_args, finding, grep_repo,
    safe_d1_query, build_report_payload, write_plan_report,
    section, ok, warn, err, dim,
)

PLAN_ID   = 3
PLAN_SLUG = "prompt_trilogy"

SQL = {
    "active_routes": """
        SELECT route_key, prompt_layer_keys, max_tools, token_budget,
               include_rag, include_workspace_ctx, priority
        FROM agentsam_prompt_routes WHERE is_active = 1 ORDER BY priority ASC;
    """,
    "prompt_versions": """
        SELECT prompt_key,
               COUNT(*) AS versions,
               MAX(is_active) AS any_active,
               SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active_count
        FROM agentsam_prompt_versions GROUP BY prompt_key;
    """,
    "cache_stats": """
        SELECT COUNT(*) AS cache_rows,
               COALESCE(SUM(read_count),0) AS total_reads,
               COALESCE(SUM(hit_count),0) AS total_hits
        FROM agentsam_prompt_cache_keys;
    """,
    "cache_schema": "PRAGMA table_info(agentsam_prompt_cache_keys);",
    "agent_run_schema": "PRAGMA table_info(agentsam_agent_run);",
    "compiled_cache_recent": """
        SELECT COUNT(*) AS c FROM ai_compiled_context_cache
        WHERE created_at >= datetime('now', '-7 days');
    """,
    "route_schema": "PRAGMA table_info(agentsam_prompt_routes);",
    "versions_schema": "PRAGMA table_info(agentsam_prompt_versions);",
}

CODE_TERMS = [
    # Prompt assembly sources — want to collapse to version rows
    ("buildSystemPrompt",           r"buildSystemPrompt\(",                             "info"),
    ("resolveAgentsamPromptRoute",  r"resolveAgentsamPromptRoute\(",                    "info"),
    ("prompt_versions_query",       r"agentsam_prompt_versions",                        "info"),
    ("logPromptCacheUsage",         r"logPromptCacheUsage\(",                           "info"),

    # Ad-hoc inline fragments — should move to version rows
    ("python_parallel_block",       r"AGENT_SAM_PYTHON_PARALLEL_BLOCK",                 "warning"),
    ("mode_system_fragment",        r"system_prompt_fragment|systemPromptFragment",      "warning"),
    ("inline_rules_inject",         r"## Rules|agentsam_rules_document",                "info"),

    # Cache read-through (should exist, currently absent = warning)
    ("cache_keys_read",             r"agentsam_prompt_cache_keys.*SELECT|SELECT.*agentsam_prompt_cache_keys", "warning"),
    ("kv_sp_v1",                    r"sp:v1:",                                           "info"),

    # Legacy path to deprecate
    ("ai_compiled_context_cache",   r"ai_compiled_context_cache",                       "blocker"),

    # Hash/version pin on run (should be set after Plan 3)
    ("assembled_prompt_hash",       r"assembled_prompt_hash",                           "info"),
    ("prompt_layer_keys_json",      r"prompt_layer_keys_json",                          "info"),
    ("getActivePromptByWeight",     r"getActivePromptByWeight\(",                       "warning"),
}


def parse_layer_keys(raw) -> list[str]:
    """Parse prompt_layer_keys whether stored as JSON string or Python list."""
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return [s.strip().strip('"\'') for s in raw.strip("[]").split(",") if s.strip()]


def run_audit(cfg, skip_d1: bool) -> list[dict]:
    findings = []

    if not skip_d1:
        # ── Route layer coverage ─────────────────────────────────────────────
        section("D1 — active prompt routes vs version rows")
        routes  = safe_d1_query(cfg, SQL["active_routes"])
        vers_rows = safe_d1_query(cfg, SQL["prompt_versions"])
        active_keys = {r["prompt_key"] for r in vers_rows if r.get("any_active")}

        minimal_routes = 0
        missing_version_keys: list[str] = []

        for route in routes:
            rk    = route.get("route_key", "?")
            raw   = route.get("prompt_layer_keys", "[]")
            layers = parse_layer_keys(raw)
            missing = [k for k in layers if k not in active_keys]
            is_minimal = layers == ["core_identity"] or len(layers) <= 1

            if is_minimal:
                minimal_routes += 1
            if missing:
                missing_version_keys.extend(missing)

            icon = "✅" if not missing and not is_minimal else ("⚠️ " if is_minimal else "🔴")
            print(f"  {icon} {rk:<35} layers={layers}  missing={missing}")

        if minimal_routes:
            findings.append(finding(
                severity="blocker",
                category="d1",
                title=f"{minimal_routes} route(s) use only [core_identity] — incomplete layer stacks",
                evidence=f"{minimal_routes}/{len(routes)} active routes have minimal layer keys",
                suggestion=(
                    "Expand prompt_layer_keys per route to full stack: "
                    "core_identity, db_safety, security, tool_loop, + route-specific keys."
                ),
                targets=["agentsam_prompt_routes", "scripts/verify_prompt_route_layers.py"],
            ))

        if missing_version_keys:
            deduped = sorted(set(missing_version_keys))
            findings.append(finding(
                severity="blocker",
                category="d1",
                title=f"{len(deduped)} prompt_key(s) referenced by routes but missing from versions",
                evidence=f"Missing keys: {deduped[:10]}",
                suggestion="Seed agentsam_prompt_versions rows for each missing key (is_active=1).",
                targets=["agentsam_prompt_versions"] + [f"key:{k}" for k in deduped[:5]],
            ))
        else:
            ok("All route layer keys have matching version rows")

        # ── Cache stats ──────────────────────────────────────────────────────
        section("D1 — prompt cache stats")
        cache = safe_d1_query(cfg, SQL["cache_stats"])
        cache_schema = safe_d1_query(cfg, SQL["cache_schema"])
        cache_col_names = [r.get("name") for r in cache_schema]

        if cache:
            row = cache[0]
            rows_ct = row.get("cache_rows", 0) or 0
            reads   = row.get("total_reads", 0) or 0
            hits    = row.get("total_hits", 0) or 0
            print(f"  cache rows={rows_ct}  total_reads={reads}  total_hits={hits}")
            if rows_ct > 0 and reads == 0:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title="agentsam_prompt_cache_keys is write-only — no read_count increments",
                    evidence=f"{rows_ct} rows, 0 reads",
                    suggestion=(
                        "Implement read-through in buildSystemPrompt: check hash hit before assembling layers."
                    ),
                    targets=["agentsam_prompt_cache_keys", "src/api/agent.js (logPromptCacheUsage)"],
                ))

        if "assembled_body" not in cache_col_names:
            findings.append(finding(
                severity="warning",
                category="d1",
                title="agentsam_prompt_cache_keys missing assembled_body column",
                evidence=f"Schema: {cache_col_names}",
                suggestion="ALTER TABLE agentsam_prompt_cache_keys ADD COLUMN assembled_body TEXT;",
                targets=["agentsam_prompt_cache_keys"],
            ))

        # ── agent_run pin columns ────────────────────────────────────────────
        section("D1 — agentsam_agent_run Plan 3 pin columns")
        ar_cols = [r.get("name") for r in safe_d1_query(cfg, SQL["agent_run_schema"])]
        for col in ["assembled_prompt_hash", "prompt_layer_keys_json", "prompt_version_ids_json"]:
            if col not in ar_cols:
                findings.append(finding(
                    severity="warning",
                    category="d1",
                    title=f"agentsam_agent_run missing Plan 3 column: {col}",
                    evidence=f"PRAGMA columns: {ar_cols}",
                    suggestion=f"ALTER TABLE agentsam_agent_run ADD COLUMN {col} TEXT;",
                    targets=["agentsam_agent_run", "migrations/"],
                ))
            else:
                ok(f"agentsam_agent_run.{col} present")

        # ── Legacy compiled cache usage ──────────────────────────────────────
        section("D1 — ai_compiled_context_cache (legacy)")
        try:
            legacy = safe_d1_query(cfg, SQL["compiled_cache_recent"])
            if legacy and (legacy[0].get("c", 0) or 0) > 0:
                findings.append(finding(
                    severity="blocker",
                    category="d1",
                    title=f"ai_compiled_context_cache has {legacy[0]['c']} writes in last 7d",
                    evidence="Still active on chat hot path",
                    suggestion="Route through agentsam_prompt_cache_keys read-through; stop writing ai_compiled_context_cache.",
                    targets=["ai_compiled_context_cache", "src/api/agent.js ~9511"],
                ))
            else:
                ok("ai_compiled_context_cache quiet in last 7d")
        except Exception as e:
            dim(f"  ai_compiled_context_cache query skipped: {e}")

    # ── Code grep ────────────────────────────────────────────────────────────
    section("Code grep — prompt assembly fragmentation")
    for label, pattern, sev in CODE_TERMS:
        hits  = grep_repo(cfg, pattern)
        count = len(hits)
        icon  = "🔴" if (sev == "blocker" and count > 0) else ("⚠️ " if (sev == "warning" and count > 0) else "ℹ️ ")

        # For cache_keys_read — absence is the problem
        if label == "cache_keys_read":
            if count == 0:
                print(f"  🔴 {label:<40} 0 hits — NO READ PATH")
                findings.append(finding(
                    severity="warning",
                    category="code",
                    title="No read path for agentsam_prompt_cache_keys in codebase",
                    evidence="Zero grep hits for SELECT on prompt_cache_keys",
                    suggestion="Add hash read-through in buildSystemPrompt before assembling layer bodies.",
                    targets=["src/api/agent.js (buildSystemPrompt)"],
                ))
            else:
                ok(f"{label}: {count} hits")
            continue

        print(f"  {icon} {label:<40} {count:>3} hits")
        if count > 0 and sev in ("blocker", "warning"):
            targets = [f"{h['file']}:{h['line']}" for h in hits[:5]]
            findings.append(finding(
                severity=sev,
                category="code",
                title=f"{label} — {count} site(s)",
                evidence="; ".join(targets[:3]),
                suggestion=_suggestion(label),
                targets=targets,
            ))

    return findings


def _suggestion(label: str) -> str:
    m = {
        "ai_compiled_context_cache":
            "Deprecate: replace with agentsam_prompt_cache_keys read-through (L2 D1 + L1 KV sp:v1:).",
        "python_parallel_block":
            "Move AGENT_SAM_PYTHON_PARALLEL_BLOCK content into an agentsam_prompt_versions row (key=tool_loop_parallel).",
        "mode_system_fragment":
            "Move system_prompt_fragment into version rows; reference via route layer keys.",
        "getActivePromptByWeight":
            "Check if this is used on chat hot path — if so, replace with route → version lookup.",
        "cache_keys_read":
            "No read path found — implement hash hit check in buildSystemPrompt.",
    }
    return m.get(label, "Review and align with route → version → cache pattern.")


def main():
    p    = add_base_args(f"Plan {PLAN_ID} — prompt trilogy audit")
    args = p.parse_args()
    cfg  = config_from_args(args)
    skip = getattr(args, "no_d1", False)

    print(f"\n{'═'*65}")
    print(f"  PLAN {PLAN_ID} AUDIT — {PLAN_SLUG.upper().replace('_',' ')}")
    print(f"{'═'*65}\n")

    findings = run_audit(cfg, skip)
    payload  = build_report_payload(PLAN_ID, PLAN_SLUG, cfg, findings)
    write_plan_report(PLAN_ID, PLAN_SLUG, cfg, payload)

    blockers = payload["summary"]["blocker_count"]
    warnings = payload["summary"]["warning_count"]
    print(f"\n  blockers={blockers}  warnings={warnings}  pass={payload['summary']['pass']}")
    if getattr(args, "strict", False) and blockers:
        sys.exit(1)


if __name__ == "__main__":
    main()
