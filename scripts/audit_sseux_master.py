#!/usr/bin/env python3
"""
audit_sseux_master.py

Agent Sam - Realtime SSE UX Audit Master Script
Plan: plan_may19_agentsam_realtime_sse_ux_audit / T027

Run from repo root:
python3 scripts/audit_sseux_master.py

Output:
scripts/audit_sseux_master_report.md
scripts/audit_sseux_master_data.json
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(os.getcwd())
NOW = datetime.now(timezone.utc).isoformat()
REPORT_PATH = REPO_ROOT / "scripts" / "audit_sseux_master_report.md"
DATA_PATH = REPO_ROOT / "scripts" / "audit_sseux_master_data.json"

TARGETS = [
    "dashboard/App.tsx",
    "dashboard/features/agent-chat/ChatAssistant.tsx",
    "dashboard/components/ChatAssistant.tsx",
    "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
    "dashboard/features/agent-chat/streamParsing.ts",
    "dashboard/features/agent-chat/types.ts",
    "dashboard/features/agent-chat/index.ts",
    "dashboard/agentChatConstants.ts",
    "dashboard/components/BrowserView.tsx",
    "dashboard/components/ExcalidrawView.tsx",
    "dashboard/components/MonacoEditorView.tsx",
    "dashboard/components/McpPage.tsx",
    "dashboard/components/MeetPage.tsx",
    "dashboard/components/settings/sections/WorkspaceSection.tsx",
    "dashboard/vite.config.ts",
    "dashboard/README.md",
    "docs/dashboard/README.md",
    "docs/dashboard/R2-inneranimalmedia-dashboard-source-components-filetree.md",
    "src/integrations/openai.js",
    "src/tools/builtin/media.js",
    "docs/agent-api-contract-audit.md",
    "docs/audits/agentsam-chatassistant-workflow-readiness.md",
    "docs/audits/agentsam-workspace-capability-map.md",
    "docs/pre-deploy-audit.md",
    "docs/CMS_REALTIME_EDIT_LOOP.md",
    "docs/codebase-index/ws_inneranimalmedia/file-inventory.md",
    "docs/codebase-index/ws_inneranimalmedia/index-priority-files.md",
    "analytics/codebase-index/ws_inneranimalmedia/route-tokens.txt",
    "analytics/codebase-index/ws_inneranimalmedia/file-inventory.csv",
    "scripts/audit_agent_remaster.py",
    "scripts/audit_agent_remaster_report.md",
    "scripts/audit_agent_microinteractions.py",
    "scripts/agentsam_microinteraction_quality_audit.py",
    "scripts/build_thinking_card_wire.py",
    "scripts/build_agentsam_cursor_gap_pack.py",
    "scripts/refine_agentsam_cursor_gap_pack.py",
    "scripts/agentsam-cursor-capability-connector.py",
    "scripts/agentsam-workflows-frontend-runtime-planner.py",
    "scripts/seed_session_plan.py",
    "scripts/iam_targeted_diagnosis.py",
    "scripts/audit_dashboard_identity.py",
    "scripts/audit/SOURCE_HITS.md",
    "scripts/sql/upsert-agentsam-project-context-universal-runtime.sql",
    "scripts/patch_results/backups/20260516_160912/dashboard/App.tsx",
    "migrations/209_cidi_meauxcad_chat_log_builds_activity.sql",
    "migrations/215_project_memory_agent_dashboard_ui_20260402.sql",
    "migrations/327_agentsam_dashboard_agent_self_debug.sql",
    "sql/agentsam/seed_platform_remaster_plans.sql",
]

SSE_PATTERNS = {
    "EventSource": r"\bEventSource\b",
    "ReadableStream": r"\bReadableStream\b",
    "getReader": r"\.getReader\(",
    "TextDecoder": r"\bTextDecoder\b",
    "SSE_header": r"text/event-stream",
    "response_body": r"response\.body",
    "enqueue": r"controller\.enqueue",
    "openai_stream": r"stream\s*:\s*true|createStream|streamChatCompletion",
    "onmessage": r"\.onmessage\s*=",
    "addEventListener_msg": r"addEventListener\([\"']message",
}

EVENT_PATTERNS = {
    "event_type_field": r"[\"']event[\"']:\s*[\"'](\w[\w.]+)[\"']",
    "type_field": r"[\"']type[\"']:\s*[\"'](\w[\w.]+)[\"']",
    "event_colon_line": r"^event:\s*(\S+)",
    "delta_content": r"delta|content_block_delta|choices.*delta",
    "tool_call_chunk": r"tool_call|tool_use|function_call",
}

WORD_VOMIT_PATTERNS = {
    "raw_text_append": r"setMessages.*prev.*content.*\+|content\s*\+=",
    "direct_innerHTML": r"innerHTML\s*\+=|innerHTML\s*=.*chunk",
    "unguarded_json_parse": r"JSON\.parse\(chunk\)|JSON\.parse\(data\)",
    "buffer_flush_all": r"buffer\s*\+=.*chunk|chunk.*buffer\s*\+=",
}

BROWSER_PATTERNS = {
    "screenshot": r"screenshot|captureScreenshot|Page\.captureScreenshot",
    "cursor_position": r"cursor|mouse.*move|mousemove|Input\.dispatchMouseEvent",
    "dom_highlight": r"highlight|overlay|DOM\.highlightNode|boxModel",
    "click_event": r"click.*dispatch|Input\.dispatchMouseEvent.*click",
    "selector_label": r"querySelector|selector.*label|cssSelector",
    "iframe_embed": r"<iframe|srcDoc|sandbox",
    "manual_takeover": r"takeover|manual.*control|user.*control",
    "action_timeline": r"timeline|action.*log|browserEvents",
    "viewport": r"setViewport|viewport.*width|Emulation\.setDeviceMetrics",
}

EXCALIDRAW_PATTERNS = {
    "scene_load": r"updateScene|loadScene|importFromJSON|restoreElements",
    "element_patch": r"updateElement|patchElement|elements.*map.*id",
    "blob_replace": r"exportToBlob|importFromBlob|\.blob\(\)",
    "selection": r"selectedElementIds|setSelection|appState.*selected",
    "viewport_move": r"scrollX|scrollY|zoom|appState.*scroll",
    "export_svg": r"exportToSvg|exportToCanvas",
    "collab": r"Collab|collaboration|broadcastElements|reconcileElements",
    "undo_redo": r"history.*undo|ActionManager.*undo|UNDO",
    "ref_api": r"useRef.*Excalidraw|excalidrawAPI|\.current",
    "on_change": r"onChange.*elements|elements.*onChange",
}

IMPORT_PATTERNS = {
    "imports_feature_chat": r"from [\"'].*features/agent-chat",
    "imports_components_chat": r"from [\"'].*components/ChatAssistant",
    "imports_browserview": r"from [\"'].*BrowserView",
    "imports_excalidraw": r"from [\"'].*[Ee]xcalidraw",
    "imports_monaco": r"from [\"'].*[Mm]onaco",
    "imports_mcp": r"from [\"'].*[Mm]cp",
    "imports_useAgentStream": r"from [\"'].*useAgentChatStream",
    "imports_stream_parsing": r"from [\"'].*streamParsing",
}


def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""


def file_hash(path: Path) -> str:
    try:
        return hashlib.md5(path.read_bytes()).hexdigest()[:8]
    except Exception:
        return "n/a"


def count_lines(content: str) -> int:
    return content.count("\n") + 1 if content else 0


def grep(content: str, patterns: dict[str, str]) -> dict[str, list[Any]]:
    hits: dict[str, list[Any]] = {}
    for label, pattern in patterns.items():
        matches = re.findall(pattern, content, re.MULTILINE | re.IGNORECASE)
        if matches:
            hits[label] = matches[:5]
    return hits


def grep_lines(content: str, pattern: str, context: int = 1) -> list[dict[str, Any]]:
    results = []
    lines = content.splitlines()
    for idx, line in enumerate(lines):
        if re.search(pattern, line, re.IGNORECASE):
            start = max(0, idx - context)
            end = min(len(lines), idx + context + 1)
            snippet = "\n".join(f"{n + 1:4d} | {lines[n]}" for n in range(start, end))
            results.append({"line": idx + 1, "match": line.strip(), "context": snippet})
    return results[:10]


def extract_imports(content: str) -> list[str]:
    return re.findall(r"import\s+.*?from\s+[\"']([^\"']+)[\"']", content)


def extract_exports(content: str) -> list[str]:
    return re.findall(r"export\s+(?:default\s+)?(?:function|class|const|type|interface|enum)\s+(\w+)", content)


def extract_routes(content: str) -> list[str]:
    return re.findall(r"[\"`]/api/[\w/:*.-]+[\"`]", content)


def extract_event_names(content: str) -> list[str]:
    names = set()
    for pat in [
        r"[\"']event[\"']:\s*[\"'](\w[\w.]+)[\"']",
        r"[\"']type[\"']:\s*[\"'](\w[\w.]+)[\"']",
        r"^event:\s*(\w[\w.]+)",
    ]:
        names.update(re.findall(pat, content, re.MULTILINE))
    return sorted(names)


def audit_file_manifest(targets: list[str]) -> dict[str, Any]:
    files = {}
    for rel in targets:
        path = REPO_ROOT / rel
        exists = path.exists()
        content = read_file(path) if exists else ""
        files[rel] = {
            "exists": exists,
            "size_bytes": path.stat().st_size if exists else 0,
            "lines": count_lines(content) if exists else 0,
            "hash": file_hash(path) if exists else None,
            "last_modified": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat() if exists else None,
        }
    missing = [k for k, v in files.items() if not v["exists"]]
    return {"files": files, "found": len(targets) - len(missing), "missing_count": len(missing), "missing": missing}


def audit_chatassistant_duality() -> dict[str, Any]:
    app_path = REPO_ROOT / "dashboard/App.tsx"
    feature_path = REPO_ROOT / "dashboard/features/agent-chat/ChatAssistant.tsx"
    legacy_path = REPO_ROOT / "dashboard/components/ChatAssistant.tsx"
    app_content = read_file(app_path)
    feature_content = read_file(feature_path)
    legacy_content = read_file(legacy_path)
    imports_feature = bool(re.search(r"features/agent-chat", app_content))
    imports_legacy = bool(re.search(r"components/ChatAssistant", app_content))
    result: dict[str, Any] = {
        "feature_path_exists": feature_path.exists(),
        "legacy_path_exists": legacy_path.exists(),
        "app_imports_feature": imports_feature,
        "app_imports_legacy": imports_legacy,
        "feature_lines": count_lines(feature_content),
        "legacy_lines": count_lines(legacy_content),
        "app_mounted_components": sorted(set(re.findall(r"<(\w*[Cc]hat\w*)", app_content))),
    }
    if imports_feature and not imports_legacy:
        result["verdict"] = "FEATURE_IS_LIVE"
    elif imports_legacy and not imports_feature:
        result["verdict"] = "LEGACY_IS_LIVE"
    elif imports_feature and imports_legacy:
        result["verdict"] = "BOTH_IMPORTED_CONFLICT"
    elif feature_path.exists() and legacy_path.exists():
        result["verdict"] = "BOTH_EXIST_NEITHER_IN_APP"
    else:
        result["verdict"] = "CANNOT_DETERMINE"
    legacy_imported_in = []
    dash = REPO_ROOT / "dashboard"
    if dash.exists():
        for file in list(dash.rglob("*.tsx")) + list(dash.rglob("*.ts")) + list(dash.rglob("*.jsx")) + list(dash.rglob("*.js")):
            if file == legacy_path:
                continue
            if "components/ChatAssistant" in read_file(file):
                legacy_imported_in.append(str(file.relative_to(REPO_ROOT)))
    result["legacy_imported_in"] = legacy_imported_in
    return result


def audit_stream_files() -> dict[str, Any]:
    out = {}
    for rel in [
        "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
        "dashboard/features/agent-chat/streamParsing.ts",
    ]:
        path = REPO_ROOT / rel
        content = read_file(path)
        out[rel] = {
            "exists": path.exists(),
            "lines": count_lines(content),
            "sse_patterns": grep(content, SSE_PATTERNS),
            "event_patterns": grep(content, EVENT_PATTERNS),
            "word_vomit_patterns": grep(content, WORD_VOMIT_PATTERNS),
            "event_names_found": extract_event_names(content),
            "exports": extract_exports(content),
            "imports": extract_imports(content),
            "routes_referenced": extract_routes(content),
            "uses_json_parse": "JSON.parse" in content,
            "uses_text_decoder": "TextDecoder" in content,
            "uses_getreader": "getReader" in content,
            "uses_eventsource": "EventSource" in content,
            "chunk_handling_lines": grep_lines(content, r"chunk|delta|onmessage|getReader|enqueue"),
            "state_dispatch_lines": grep_lines(content, r"dispatch|setState|setMessages|reducer"),
        }
    return out


def audit_types_file() -> dict[str, Any]:
    path = REPO_ROOT / "dashboard/features/agent-chat/types.ts"
    content = read_file(path)
    return {
        "exists": path.exists(),
        "lines": count_lines(content),
        "type_names": re.findall(r"(?:type|interface)\s+(\w+)", content),
        "enum_names": re.findall(r"enum\s+(\w+)", content),
        "exports": extract_exports(content),
        "event_types": extract_event_names(content),
        "has_tool_type": bool(re.search(r"[Tt]ool[A-Z]", content)),
        "has_stream_type": bool(re.search(r"[Ss]tream[A-Z]", content)),
        "has_error_type": bool(re.search(r"[Ee]rror[A-Z]", content)),
    }


def audit_openai_integration() -> dict[str, Any]:
    path = REPO_ROOT / "src/integrations/openai.js"
    content = read_file(path)
    return {
        "exists": path.exists(),
        "lines": count_lines(content),
        "sse_patterns": grep(content, SSE_PATTERNS),
        "event_patterns": grep(content, EVENT_PATTERNS),
        "stream_true": bool(re.search(r"stream\s*:\s*true", content)),
        "uses_responses_api": bool(re.search(r"responses|/v1/responses", content)),
        "uses_chat_api": bool(re.search(r"/v1/chat/completions", content)),
        "emits_sse_events": grep_lines(content, r"event:|data:|controller\.enqueue|write\("),
        "tool_call_handling": grep_lines(content, r"tool_call|function_call|tool_use"),
        "error_handling": grep_lines(content, r"catch|error|reject", context=0),
        "exports": extract_exports(content),
    }


def audit_surface(rel: str, patterns: dict[str, str]) -> dict[str, Any]:
    path = REPO_ROOT / rel
    content = read_file(path)
    hits = grep(content, patterns)
    return {
        "exists": path.exists(),
        "lines": count_lines(content),
        "capability_hits": hits,
        "capabilities_present": list(hits.keys()),
        "capabilities_missing": [k for k in patterns if k not in hits],
        "imports": extract_imports(content),
        "sse_usage": grep_lines(content, r"EventSource|text/event-stream"),
        "websocket_usage": grep_lines(content, r"WebSocket|ws://|wss://"),
    }


def audit_excalidrawview() -> dict[str, Any]:
    data = audit_surface("dashboard/components/ExcalidrawView.tsx", EXCALIDRAW_PATTERNS)
    content = read_file(REPO_ROOT / "dashboard/components/ExcalidrawView.tsx")
    data["write_mode"] = (
        "patch" if re.search(r"patchElement|updateElement", content) else
        "blob_replace" if re.search(r"exportToBlob|importFromBlob", content) else
        "scene_replace" if "updateScene" in content else
        "unknown"
    )
    data["agent_triggered"] = bool(re.search(r"agent|tool|mcp|command", content, re.IGNORECASE))
    return data


def audit_word_vomit_sources() -> dict[str, Any]:
    out = {}
    for rel in [
        "dashboard/features/agent-chat/ChatAssistant.tsx",
        "dashboard/components/ChatAssistant.tsx",
        "dashboard/features/agent-chat/hooks/useAgentChatStream.ts",
        "dashboard/features/agent-chat/streamParsing.ts",
    ]:
        path = REPO_ROOT / rel
        content = read_file(path)
        hits = grep(content, WORD_VOMIT_PATTERNS)
        typed = grep(content, EVENT_PATTERNS)
        out[rel] = {
            "exists": path.exists(),
            "word_vomit_indicators": hits,
            "typed_event_indicators": typed,
            "has_typed_events": bool(typed),
            "likely_word_vomit": bool(hits) and not bool(typed),
            "loading_state_mentions": len(re.findall(r"loading|isLoading|isPending|spinner|skeleton", content, re.IGNORECASE)),
            "streaming_render_lines": grep_lines(content, r"chunk|delta|append|concat|streaming"),
        }
    return out


def audit_import_graph() -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    dash = REPO_ROOT / "dashboard"
    if not dash.exists():
        return {}
    for ext in ["*.tsx", "*.ts", "*.jsx", "*.js"]:
        for file in dash.rglob(ext):
            content = read_file(file)
            hits = grep(content, IMPORT_PATTERNS)
            for key in hits:
                result[key].append(str(file.relative_to(REPO_ROOT)))
    return dict(result)


def audit_existing_scripts() -> dict[str, Any]:
    scripts = [
        "scripts/audit_agent_remaster.py",
        "scripts/audit_agent_remaster_report.md",
        "scripts/build_thinking_card_wire.py",
        "scripts/build_agentsam_cursor_gap_pack.py",
        "scripts/agentsam_microinteraction_quality_audit.py",
        "scripts/audit_agent_microinteractions.py",
        "scripts/agentsam-cursor-capability-connector.py",
        "scripts/agentsam-workflows-frontend-runtime-planner.py",
    ]
    keywords = ["thinking", "checkpoint", "stream", "sse", "event", "loading", "spinner", "progress", "BrowserView", "excalidraw", "diff", "approval", "workbench", "tool_call", "delta", "chunk", "cursor", "gap", "microinteraction"]
    result = {}
    for rel in scripts:
        path = REPO_ROOT / rel
        content = read_file(path)
        found = [kw for kw in keywords if re.search(re.escape(kw), content, re.IGNORECASE)]
        result[rel] = {"exists": path.exists(), "lines": count_lines(content), "relevant_keywords_found": found, "relevance_score": len(found), "preview": content[:500]}
    return result


def audit_migration_files() -> dict[str, Any]:
    result = {}
    for rel in [
        "migrations/209_cidi_meauxcad_chat_log_builds_activity.sql",
        "migrations/215_project_memory_agent_dashboard_ui_20260402.sql",
        "migrations/327_agentsam_dashboard_agent_self_debug.sql",
    ]:
        path = REPO_ROOT / rel
        content = read_file(path)
        result[rel] = {
            "exists": path.exists(),
            "lines": count_lines(content),
            "tables_created": re.findall(r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[\"`]?(\w+)[\"`]?", content, re.IGNORECASE),
            "columns_added": re.findall(r"ADD COLUMN\s+(\w+)", content, re.IGNORECASE),
            "indexes_created": re.findall(r"CREATE INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)", content, re.IGNORECASE),
            "chat_related": bool(re.search(r"chat|message|stream|session", content, re.IGNORECASE)),
            "agent_related": bool(re.search(r"agent|execution|plan|task", content, re.IGNORECASE)),
        }
    return result


def build_implementation_hitlist(data: dict[str, Any]) -> list[dict[str, str]]:
    hits = []
    duality = data["chatassistant_duality"]
    if duality.get("verdict") in {"BOTH_EXIST_NEITHER_IN_APP", "BOTH_IMPORTED_CONFLICT", "CANNOT_DETERMINE"}:
        hits.append({"priority": "P0", "area": "ChatAssistant", "issue": f"Duality unresolved: {duality.get('verdict')}", "action": "Confirm live mount in App.tsx before changes"})
    for rel, info in data["stream_hook"].items():
        if not info.get("exists"):
            hits.append({"priority": "P0", "area": "Stream", "issue": f"Missing: {rel}", "action": "Create stream consumer/parser"})
        elif not info.get("event_patterns"):
            hits.append({"priority": "P0", "area": "Stream", "issue": f"{rel}: no typed event parsing detected", "action": "Implement typed AgentEvent dispatch"})
    if not data["types_file"].get("has_stream_type"):
        hits.append({"priority": "P1", "area": "Types", "issue": "No stream/event types found", "action": "Add AgentEvent/StreamEvent types"})
    if data["browserview"].get("exists") and "manual_takeover" in data["browserview"].get("capabilities_missing", []):
        hits.append({"priority": "P0", "area": "BrowserView", "issue": "No manual takeover control detected", "action": "Add safety/control UX"})
    if data["excalidrawview"].get("write_mode") in {"blob_replace", "unknown"}:
        hits.append({"priority": "P1", "area": "Excalidraw", "issue": f"Write mode is {data['excalidrawview'].get('write_mode')}", "action": "Implement scene patch events"})
    for rel, info in data["word_vomit"].items():
        if info.get("likely_word_vomit"):
            hits.append({"priority": "P0", "area": "WordVomit", "issue": f"{rel}: untyped streaming", "action": "Use typed event reducer"})
    return sorted(hits, key=lambda x: x["priority"])


def write_report(data: dict[str, Any]) -> None:
    lines = []
    a = lines.append
    a("# Agent Sam - SSE UX Audit Master Report")
    a(f"**Generated:** {NOW}")
    a(f"**Plan:** `{data['plan_id']}`")
    a(f"**Task:** `{data['task_id']}`")
    a("")
    manifest = data["manifest"]
    a("## 1. File Manifest")
    a(f"**{manifest['found']}/{len(TARGETS)} target files exist.**")
    if manifest["missing"]:
        a("")
        a("### Missing Files")
        for item in manifest["missing"]:
            a(f"- `{item}`")
    a("")
    a("### Existing Files")
    a("| File | Lines | Size | Hash |")
    a("|---|---:|---:|---|")
    for rel, info in manifest["files"].items():
        if info["exists"]:
            a(f"| `{rel}` | {info['lines']} | {info['size_bytes']} | `{info['hash']}` |")
    a("")
    a("## 2. ChatAssistant Duality")
    d = data["chatassistant_duality"]
    a(f"**Verdict:** `{d.get('verdict')}`")
    a(f"- Feature exists: `{d.get('feature_path_exists')}`")
    a(f"- Legacy exists: `{d.get('legacy_path_exists')}`")
    a(f"- App imports feature: `{d.get('app_imports_feature')}`")
    a(f"- App imports legacy: `{d.get('app_imports_legacy')}`")
    a(f"- Mounted chat components: `{d.get('app_mounted_components')}`")
    a("")
    a("## 3. Stream Hook Audit")
    for rel, info in data["stream_hook"].items():
        a(f"### `{rel}`")
        a(f"- Exists: `{info.get('exists')}`")
        a(f"- Uses EventSource: `{info.get('uses_eventsource')}`")
        a(f"- Uses getReader: `{info.get('uses_getreader')}`")
        a(f"- Uses TextDecoder: `{info.get('uses_text_decoder')}`")
        a(f"- Uses JSON.parse: `{info.get('uses_json_parse')}`")
        a(f"- Event names found: `{info.get('event_names_found')}`")
        a(f"- Word-vomit indicators: `{list(info.get('word_vomit_patterns', {}).keys())}`")
        a("")
    a("## 4. Surface Capability Summary")
    a(f"- BrowserView present: `{data['browserview'].get('capabilities_present')}`")
    a(f"- BrowserView missing: `{data['browserview'].get('capabilities_missing')}`")
    a(f"- Excalidraw write mode: `{data['excalidrawview'].get('write_mode')}`")
    a(f"- Excalidraw present: `{data['excalidrawview'].get('capabilities_present')}`")
    a(f"- Excalidraw missing: `{data['excalidrawview'].get('capabilities_missing')}`")
    a("")
    a("## 5. Priority Implementation Hit List")
    a("| Priority | Area | Issue | Action |")
    a("|---|---|---|---|")
    for hit in data["implementation_hitlist"]:
        a(f"| `{hit['priority']}` | {hit['area']} | {hit['issue']} | {hit['action']} |")
    a("")
    a(f"Generated by `scripts/audit_sseux_master.py` at {NOW}.")
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    print(f"[->] Agent Sam SSE UX Audit Master - {NOW}")
    print(f"[->] Repo root: {REPO_ROOT}")
    manifest = audit_file_manifest(TARGETS)
    data: dict[str, Any] = {
        "generated_at": NOW,
        "plan_id": "plan_may19_agentsam_realtime_sse_ux_audit",
        "task_id": "task_sseux_t027_inspect_confirmed_repo_targets",
        "manifest": manifest,
        "chatassistant_duality": audit_chatassistant_duality(),
        "stream_hook": audit_stream_files(),
        "types_file": audit_types_file(),
        "openai_integration": audit_openai_integration(),
        "browserview": audit_surface("dashboard/components/BrowserView.tsx", BROWSER_PATTERNS),
        "excalidrawview": audit_excalidrawview(),
        "word_vomit": audit_word_vomit_sources(),
        "import_graph": audit_import_graph(),
        "existing_scripts": audit_existing_scripts(),
        "migrations": audit_migration_files(),
    }
    data["implementation_hitlist"] = build_implementation_hitlist(data)
    DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    write_report(data)
    print(f"[ok] Data written: {DATA_PATH}")
    print(f"[ok] Report written: {REPORT_PATH}")
    print(f"[ok] Files found: {manifest['found']}/{len(TARGETS)}")
    print(f"[ok] P0 action items: {sum(1 for h in data['implementation_hitlist'] if h['priority'] == 'P0')}")


if __name__ == "__main__":
    main()
