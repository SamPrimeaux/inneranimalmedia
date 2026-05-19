# #!/usr/bin/env python3
“””
audit_sseux_master.py

Agent Sam — Realtime SSE UX Audit Master Script
Plan: plan_may19_agentsam_realtime_sse_ux_audit / T027

Run from repo root:
python scripts/audit_sseux_master.py

Output:
scripts/audit_sseux_master_report.md   ← human-readable report
scripts/audit_sseux_master_data.json   ← structured data for agent/Claude ingestion

What this script does:
1. Confirms which files exist / are missing from the 48-target list
2. Detects duplicate ChatAssistant implementations (live vs stale)
3. Audits SSE/stream patterns in backend and frontend
4. Maps event types, message shapes, and chunk parsers
5. Detects BrowserView and Excalidraw capabilities
6. Scans existing audit scripts/docs for prior relevant work
7. Inspects migration files for chat/agent schema
8. Builds a dependency graph of ChatAssistant imports
9. Identifies “word vomit” root causes (missing typed events, raw text chunks)
10. Produces a priority-sorted implementation hit list
“””

import os
import re
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

# ─────────────────────────────────────────────

# CONFIG

# ─────────────────────────────────────────────

REPO_ROOT = Path(os.getcwd())
NOW = datetime.now(timezone.utc).isoformat()
REPORT_PATH = REPO_ROOT / “scripts” / “audit_sseux_master_report.md”
DATA_PATH   = REPO_ROOT / “scripts” / “audit_sseux_master_data.json”

# Priority-ordered inspection targets (T027 files_involved)

TARGETS = [
# ── Core ChatAssistant ──────────────────────────────────────────────
“dashboard/App.tsx”,
“dashboard/features/agent-chat/ChatAssistant.tsx”,
“dashboard/components/ChatAssistant.tsx”,
“dashboard/features/agent-chat/hooks/useAgentChatStream.ts”,
“dashboard/features/agent-chat/streamParsing.ts”,
“dashboard/features/agent-chat/types.ts”,
“dashboard/features/agent-chat/index.ts”,
“dashboard/agentChatConstants.ts”,
# ── Adjacent UI surfaces ────────────────────────────────────────────
“dashboard/components/BrowserView.tsx”,
“dashboard/components/ExcalidrawView.tsx”,
“dashboard/components/MonacoEditorView.tsx”,
“dashboard/components/McpPage.tsx”,
“dashboard/components/MeetPage.tsx”,
“dashboard/components/settings/sections/WorkspaceSection.tsx”,
“dashboard/vite.config.ts”,
“dashboard/README.md”,
“docs/dashboard/README.md”,
“docs/dashboard/R2-inneranimalmedia-dashboard-source-components-filetree.md”,
# ── Backend / provider ──────────────────────────────────────────────
“src/integrations/openai.js”,
“src/tools/builtin/media.js”,
# ── API/contract docs ───────────────────────────────────────────────
“docs/agent-api-contract-audit.md”,
“docs/audits/agentsam-chatassistant-workflow-readiness.md”,
“docs/audits/agentsam-workspace-capability-map.md”,
“docs/pre-deploy-audit.md”,
“docs/CMS_REALTIME_EDIT_LOOP.md”,
“docs/codebase-index/ws_inneranimalmedia/file-inventory.md”,
“docs/codebase-index/ws_inneranimalmedia/index-priority-files.md”,
# ── Codebase index ──────────────────────────────────────────────────
“analytics/codebase-index/ws_inneranimalmedia/route-tokens.txt”,
“analytics/codebase-index/ws_inneranimalmedia/file-inventory.csv”,
# ── Audit/remaster scripts ──────────────────────────────────────────
“scripts/audit_agent_remaster.py”,
“scripts/audit_agent_remaster_report.md”,
“scripts/audit_agent_microinteractions.py”,
“scripts/agentsam_microinteraction_quality_audit.py”,
“scripts/build_thinking_card_wire.py”,
“scripts/build_agentsam_cursor_gap_pack.py”,
“scripts/refine_agentsam_cursor_gap_pack.py”,
“scripts/agentsam-cursor-capability-connector.py”,
“scripts/agentsam-workflows-frontend-runtime-planner.py”,
“scripts/seed_session_plan.py”,
“scripts/iam_targeted_diagnosis.py”,
“scripts/audit_dashboard_identity.py”,
“scripts/audit/SOURCE_HITS.md”,
“scripts/sql/upsert-agentsam-project-context-universal-runtime.sql”,
“scripts/patch_results/backups/20260516_160912/dashboard/App.tsx”,
# ── Migrations ──────────────────────────────────────────────────────
“migrations/209_cidi_meauxcad_chat_log_builds_activity.sql”,
“migrations/215_project_memory_agent_dashboard_ui_20260402.sql”,
“migrations/327_agentsam_dashboard_agent_self_debug.sql”,
“sql/agentsam/seed_platform_remaster_plans.sql”,
]

# ─────────────────────────────────────────────

# GREP PATTERNS

# ─────────────────────────────────────────────

# SSE / streaming patterns

SSE_PATTERNS = {
“EventSource”:          r”\bEventSource\b”,
“ReadableStream”:       r”\bReadableStream\b”,
“getReader”:            r”.getReader()”,
“TextDecoder”:          r”\bTextDecoder\b”,
“data:_chunk”:          r”data:\s*{”,
“data:_string”:         r’data:\s*[”']’,
“SSE_header”:           r”text/event-stream”,
“fetch_stream”:         r”fetch(.*stream|stream.*fetch”,
“response_body”:        r”response.body”,
“enqueue”:              r”controller.enqueue”,
“write_stream”:         r”writer.write|writable.write”,
“openai_stream”:        r”stream\s*:\s*true|createStream|streamChatCompletion”,
“anthropic_stream”:     r”anthropic.*stream|stream.*anthropic”,
“workers_ai_stream”:    r”ai.run.*stream|.run(.*stream”,
“onmessage”:            r”.onmessage\s*=”,
“addEventListener_msg”: r”addEventListener([’"]message”,
}

# Event type / protocol patterns

EVENT_PATTERNS = {
“event_type_field”:  r’[”']event[”']:\s*[”'](\w[\w.]+)[”']’,
“type_field”:        r’[”']type[”']:\s*[”'](\w[\w.]+)[”']’,
“event_colon_line”:  r’^event:\s*(\S+)’,
“data_colon_line”:   r’^data:\s*({.{0,120})’,
“switch_on_type”:    r’switch\s*(\s*\w*[Tt]ype\w*\s*)’,
“if_type_equals”:    r’if\s*(.*\btype\b.*===’,
“delta_content”:     r’delta|content_block_delta|choices.*delta’,
“tool_call_chunk”:   r’tool_call|tool_use|function_call’,
}

# Word-vomit / untyped streaming indicators

WORD_VOMIT_PATTERNS = {
“raw_text_append”:      r’setMessages.*prev.*content.*+|content\s*+=’,
“no_event_check”:       r’.text\b(?!.*type)’,
“direct_innerHTML”:     r’innerHTML\s*+=|innerHTML\s*=.*chunk’,
“unguarded_json_parse”: r’JSON.parse(chunk)|JSON.parse(data)’,
“buffer_flush_all”:     r’buffer\s*+=.*chunk|chunk.*buffer\s*+=’,
“markdown_on_stream”:   r’marked(|remark|rehype|ReactMarkdown.*streaming’,
}

# BrowserView capability patterns

BROWSER_PATTERNS = {
“screenshot”:        r’screenshot|captureScreenshot|Page.captureScreenshot’,
“cursor_position”:   r’cursor|mouse.*move|mousemove|Input.dispatchMouseEvent’,
“dom_highlight”:     r’highlight|overlay|DOM.highlightNode|boxModel’,
“click_event”:       r’click.*dispatch|Input.dispatchMouseEvent.*click’,
“selector_label”:    r’querySelector|selector.*label|cssSelector’,
“cdp_session”:       r’CDPSession|createCDPSession|puppeteer|playwright’,
“iframe_embed”:      r’<iframe|srcDoc|sandbox’,
“websocket_cdt”:     r’WebSocket.*cdt|cdt.*WebSocket|ws://.*cdt’,
“manual_takeover”:   r’takeover|manual.*control|user.*control’,
“action_timeline”:   r’timeline|action.*log|browserEvents’,
“viewport”:          r’setViewport|viewport.*width|Emulation.setDeviceMetrics’,
}

# Excalidraw capability patterns

EXCALIDRAW_PATTERNS = {
“scene_load”:        r’updateScene|loadScene|importFromJSON|restoreElements’,
“element_patch”:     r’updateElement|patchElement|elements.*map.*id’,
“blob_replace”:      r’exportToBlob|importFromBlob|.blob()’,
“selection”:         r’selectedElementIds|setSelection|appState.*selected’,
“viewport_move”:     r’scrollX|scrollY|zoom|appState.*scroll’,
“export_svg”:        r’exportToSvg|exportToCanvas’,
“collab”:            r’Collab|collaboration|broadcastElements|reconcileElements’,
“undo_redo”:         r’history.*undo|ActionManager.*undo|UNDO’,
“ref_api”:           r’useRef.*Excalidraw|excalidrawAPI|.current.’,
“on_change”:         r’onChange.*elements|elements.*onChange’,
}

# Approval gate patterns

APPROVAL_PATTERNS = {
“approval_required”: r’approval|requiresApproval|requires_approval’,
“confirm_dialog”:    r’confirm(|window.confirm|ConfirmDialog|ApprovalGate’,
“pending_state”:     r’pending.*approval|approval.*pending|awaiting.*approval’,
“gate_check”:        r’gate|qualityGate|quality_gate’,
}

# Import/dependency patterns

IMPORT_PATTERNS = {
“imports_feature_chat”:    r”from [’"].*features/agent-chat”,
“imports_components_chat”: r”from [’"].*components/ChatAssistant”,
“imports_browserview”:     r”from [’"].*BrowserView”,
“imports_excalidraw”:      r”from [’"].*[Ee]xcalidraw”,
“imports_monaco”:          r”from [’"].*[Mm]onaco”,
“imports_mcp”:             r”from [’"].*[Mm]cp”,
“imports_useAgentStream”:  r”from [’"].*useAgentChatStream”,
“imports_stream_parsing”:  r”from [’"].*streamParsing”,
}

# ─────────────────────────────────────────────

# HELPERS

# ─────────────────────────────────────────────

def file_hash(path: Path) -> str:
try:
return hashlib.md5(path.read_bytes()).hexdigest()[:8]
except Exception:
return “n/a”

def read_file(path: Path):
try:
return path.read_text(encoding=“utf-8”, errors=“replace”)
except Exception as e:
return None

def grep(content: str, patterns: dict) -> dict:
hits = {}
for label, pattern in patterns.items():
matches = re.findall(pattern, content, re.MULTILINE | re.IGNORECASE)
if matches:
hits[label] = matches[:5]  # cap at 5 examples
return hits

def grep_lines(content: str, pattern: str, context: int = 1) -> list:
“”“Return matching lines with optional surrounding context lines.”””
results = []
lines = content.splitlines()
for i, line in enumerate(lines):
if re.search(pattern, line, re.IGNORECASE):
start = max(0, i - context)
end   = min(len(lines), i + context + 1)
snippet = “\n”.join(f”  {i+1+j-context:4d} | {lines[start+j]}” for j in range(end - start))
results.append({“line”: i + 1, “match”: line.strip(), “context”: snippet})
return results[:10]

def count_lines(content: str) -> int:
return content.count(”\n”) + 1 if content else 0

def extract_exports(content: str) -> list:
return re.findall(r’export\s+(?:default\s+)?(?:function|class|const|type|interface|enum)\s+(\w+)’, content)

def extract_imports(content: str) -> list:
return re.findall(r”import\s+.*?from\s+[’"]([^'"]+)[’"]”, content)

def extract_routes(content: str) -> list:
return re.findall(r’[”`]/api/[\w/:*-]+[”`]’, content)

def extract_event_names(content: str) -> list:
names = set()
for pat in [
r’[”']event[”']:\s*[”'](\w[\w.]+)[”']’,
r’type:\s*[”'](\w[\w.]+)[”']’,
r”event:\s*(\w[\w.]+)\n”,
]:
names.update(re.findall(pat, content, re.MULTILINE))
return sorted(names)

def find_sse_routes(content: str) -> list:
return re.findall(
r’(?:app|router|worker|hono).[a-z]+\s*(\s*[”`]([^"'`]+)[”`]’,
content, re.IGNORECASE
)

# ─────────────────────────────────────────────

# SECTION AUDITORS

# ─────────────────────────────────────────────

def audit_file_manifest(targets: list) -> dict:
“”“Check which targets exist, their size and hash.”””
manifest = {}
for rel in targets:
p = REPO_ROOT / rel
exists = p.exists()
manifest[rel] = {
“exists”: exists,
“size_bytes”: p.stat().st_size if exists else 0,
“lines”: count_lines(read_file(p)) if exists else 0,
“hash”: file_hash(p) if exists else None,
“last_modified”: datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat() if exists else None,
}
found    = sum(1 for v in manifest.values() if v[“exists”])
missing  = [k for k, v in manifest.items() if not v[“exists”]]
return {“files”: manifest, “found”: found, “missing_count”: len(missing), “missing”: missing}

def audit_chatassistant_duality(manifest: dict) -> dict:
“”“Determine which ChatAssistant is live vs stale.”””
result = {“verdict”: “unknown”, “details”: {}}

```
app_path     = REPO_ROOT / "dashboard/App.tsx"
feature_path = REPO_ROOT / "dashboard/features/agent-chat/ChatAssistant.tsx"
legacy_path  = REPO_ROOT / "dashboard/components/ChatAssistant.tsx"

app_content     = read_file(app_path)     if app_path.exists()     else ""
feature_content = read_file(feature_path) if feature_path.exists() else ""
legacy_content  = read_file(legacy_path)  if legacy_path.exists()  else ""

imports_feature = bool(re.search(r"features/agent-chat", app_content or ""))
imports_legacy  = bool(re.search(r"components/ChatAssistant", app_content or ""))
both_exist      = feature_path.exists() and legacy_path.exists()

result["feature_path_exists"] = feature_path.exists()
result["legacy_path_exists"]  = legacy_path.exists()
result["app_imports_feature"] = imports_feature
result["app_imports_legacy"]  = imports_legacy
result["both_exist"]          = both_exist
result["feature_lines"]       = count_lines(feature_content)
result["legacy_lines"]        = count_lines(legacy_content)

# Extract what App.tsx mounts
if app_content:
    jsx_mounts = re.findall(r'<(\w*[Cc]hat\w*)', app_content)
    result["app_mounted_components"] = list(set(jsx_mounts))

if imports_feature and not imports_legacy:
    result["verdict"] = "FEATURE_IS_LIVE"
    result["live"]    = str(feature_path.relative_to(REPO_ROOT))
    result["stale"]   = str(legacy_path.relative_to(REPO_ROOT)) if legacy_path.exists() else None
elif imports_legacy and not imports_feature:
    result["verdict"] = "LEGACY_IS_LIVE"
    result["live"]    = str(legacy_path.relative_to(REPO_ROOT))
    result["stale"]   = str(feature_path.relative_to(REPO_ROOT)) if feature_path.exists() else None
elif imports_feature and imports_legacy:
    result["verdict"] = "BOTH_IMPORTED_CONFLICT"
elif both_exist:
    result["verdict"] = "BOTH_EXIST_NEITHER_IN_APP"
else:
    result["verdict"] = "CANNOT_DETERMINE"

# Check if legacy is imported anywhere else
if legacy_path.exists():
    found_in = []
    for ext in ["*.tsx", "*.ts", "*.jsx", "*.js"]:
        for f in (REPO_ROOT / "dashboard").rglob(ext):
            try:
                c = f.read_text(encoding="utf-8", errors="replace")
                if "components/ChatAssistant" in c and f != legacy_path:
                    found_in.append(str(f.relative_to(REPO_ROOT)))
            except Exception:
                pass
    result["legacy_imported_in"] = found_in

return result
```

def audit_stream_hook(manifest: dict) -> dict:
“”“Deep audit of useAgentChatStream.ts and streamParsing.ts.”””
result = {}
for rel in [
“dashboard/features/agent-chat/hooks/useAgentChatStream.ts”,
“dashboard/features/agent-chat/streamParsing.ts”,
]:
p = REPO_ROOT / rel
if not p.exists():
result[rel] = {“exists”: False}
continue
content = read_file(p)
result[rel] = {
“exists”: True,
“lines”: count_lines(content),
“sse_patterns”:         grep(content, SSE_PATTERNS),
“event_patterns”:       grep(content, EVENT_PATTERNS),
“word_vomit_patterns”:  grep(content, WORD_VOMIT_PATTERNS),
“event_names_found”:    extract_event_names(content),
“exports”:              extract_exports(content),
“imports”:              extract_imports(content),
“routes_referenced”:    extract_routes(content),
“uses_json_parse”:      bool(re.search(r’JSON.parse’, content)),
“uses_text_decoder”:    bool(re.search(r’TextDecoder’, content)),
“uses_getreader”:       bool(re.search(r’getReader’, content)),
“uses_eventsource”:     bool(re.search(r’EventSource’, content)),
“chunk_handling_lines”: grep_lines(content, r’chunk|delta|onmessage|getReader|enqueue’),
“state_dispatch_lines”: grep_lines(content, r’dispatch|setState|setMessages|reducer’),
}
return result

def audit_types_file() -> dict:
“”“Inventory existing types before designing new event protocol.”””
p = REPO_ROOT / “dashboard/features/agent-chat/types.ts”
if not p.exists():
return {“exists”: False}
content = read_file(p)
return {
“exists”: True,
“lines”: count_lines(content),
“type_names”:      re.findall(r’(?:type|interface)\s+(\w+)’, content),
“enum_names”:      re.findall(r’enum\s+(\w+)’, content),
“exports”:         extract_exports(content),
“event_types”:     re.findall(r’(?:EventType|MessageType|StreamEvent|AgentEvent)[^=]*=\s*[”'](\w[\w.]+)[”']’, content),
“has_tool_type”:   bool(re.search(r’[Tt]ool[A-Z]’, content)),
“has_stream_type”: bool(re.search(r’[Ss]tream[A-Z]’, content)),
“has_error_type”:  bool(re.search(r’[Ee]rror[A-Z]’, content)),
“raw_preview”:     content[:2000],
}

def audit_openai_integration() -> dict:
“”“Audit backend OpenAI streaming path.”””
p = REPO_ROOT / “src/integrations/openai.js”
if not p.exists():
return {“exists”: False}
content = read_file(p)
return {
“exists”: True,
“lines”: count_lines(content),
“sse_patterns”:       grep(content, SSE_PATTERNS),
“event_patterns”:     grep(content, EVENT_PATTERNS),
“stream_true”:        bool(re.search(r’stream\s*:\s*true’, content)),
“uses_responses_api”: bool(re.search(r’responses|/v1/responses’, content)),
“uses_chat_api”:      bool(re.search(r’/v1/chat/completions’, content)),
“emits_sse_events”:   grep_lines(content, r’event:|data:|controller.enqueue|write(’),
“tool_call_handling”: grep_lines(content, r’tool_call|function_call|tool_use’),
“error_handling”:     grep_lines(content, r’catch|error|reject’, context=0),
“routes_in_file”:     find_sse_routes(content),
“exports”:            extract_exports(content),
}

def audit_browserview() -> dict:
“”“Audit BrowserView capabilities.”””
p = REPO_ROOT / “dashboard/components/BrowserView.tsx”
if not p.exists():
return {“exists”: False}
content = read_file(p)
hits = grep(content, BROWSER_PATTERNS)
return {
“exists”: True,
“lines”: count_lines(content),
“capability_hits”: hits,
“capabilities_present”: list(hits.keys()),
“capabilities_missing”: [k for k in BROWSER_PATTERNS if k not in hits],
“imports”: extract_imports(content),
“props_interface”: re.findall(r’(?:interface|type)\s+\w*Props[^{]*{([^}]+)}’, content),
“event_listeners”: grep_lines(content, r’addEventListener|onmessage|useEffect.*stream’),
“websocket_usage”: grep_lines(content, r’WebSocket|ws://|wss://’),
“sse_usage”:        grep_lines(content, r’EventSource|text/event-stream’),
}

def audit_excalidrawview() -> dict:
“”“Audit ExcalidrawView capabilities.”””
p = REPO_ROOT / “dashboard/components/ExcalidrawView.tsx”
if not p.exists():
return {“exists”: False}
content = read_file(p)
hits = grep(content, EXCALIDRAW_PATTERNS)
return {
“exists”: True,
“lines”: count_lines(content),
“capability_hits”: hits,
“capabilities_present”: list(hits.keys()),
“capabilities_missing”: [k for k in EXCALIDRAW_PATTERNS if k not in hits],
“write_mode”: “patch” if “patchElement” in content or “updateElement” in content else
“blob_replace” if “exportToBlob” in content or “importFromBlob” in content else
“scene_replace” if “updateScene” in content else “unknown”,
“agent_triggered”: bool(re.search(r’agent|tool|mcp|command’, content, re.IGNORECASE)),
“imports”: extract_imports(content),
“ref_usage”: grep_lines(content, r’excalidrawAPI|useRef.*Excalidraw|.current.’),
}

def audit_app_routing() -> dict:
“”“Audit App.tsx for routing and component mounts.”””
p = REPO_ROOT / “dashboard/App.tsx”
if not p.exists():
return {“exists”: False}
content = read_file(p)
return {
“exists”: True,
“lines”: count_lines(content),
“imports”: extract_imports(content),
“chat_imports”:    [i for i in extract_imports(content) if “chat” in i.lower() or “Chat” in i],
“browser_imports”: [i for i in extract_imports(content) if “browser” in i.lower() or “Browser” in i],
“routes_defined”:  re.findall(r’path=[”']([^"']+)[”']’, content),
“mounted_components”: list(set(re.findall(r’<([A-Z]\w+)’, content))),
“lazy_imports”:    re.findall(r’lazy(\s*()\s*=>\s*import([”']([^"']+)[”']’, content),
“spa_routes”:      re.findall(r’SPA_ROUTES|ROUTES.*=\s*[’, content),
}

def audit_migration_files() -> dict:
“”“Inspect chat/agent migration files for schema context.”””
targets = [
“migrations/209_cidi_meauxcad_chat_log_builds_activity.sql”,
“migrations/215_project_memory_agent_dashboard_ui_20260402.sql”,
“migrations/327_agentsam_dashboard_agent_self_debug.sql”,
]
result = {}
for rel in targets:
p = REPO_ROOT / rel
if not p.exists():
result[rel] = {“exists”: False}
continue
content = read_file(p)
result[rel] = {
“exists”: True,
“lines”: count_lines(content),
“tables_created”: re.findall(r’CREATE TABLE\s+(?:IF NOT EXISTS\s+)?[”`]?(\w+)[”`]?’, content, re.IGNORECASE),
“columns_added”:  re.findall(r’ADD COLUMN\s+(\w+)’, content, re.IGNORECASE),
“indexes_created”:re.findall(r’CREATE INDEX\s+(?:IF NOT EXISTS\s+)?(\w+)’, content, re.IGNORECASE),
“chat_related”:   bool(re.search(r’chat|message|stream|session’, content, re.IGNORECASE)),
“agent_related”:  bool(re.search(r’agent|execution|plan|task’, content, re.IGNORECASE)),
}
return result

def audit_existing_scripts() -> dict:
“”“Scan existing audit/remaster scripts for relevant prior work.”””
scripts = [
“scripts/audit_agent_remaster.py”,
“scripts/audit_agent_remaster_report.md”,
“scripts/build_thinking_card_wire.py”,
“scripts/build_agentsam_cursor_gap_pack.py”,
“scripts/agentsam_microinteraction_quality_audit.py”,
“scripts/audit_agent_microinteractions.py”,
“scripts/agentsam-cursor-capability-connector.py”,
“scripts/agentsam-workflows-frontend-runtime-planner.py”,
]
result = {}
relevance_keywords = [
“thinking”, “checkpoint”, “stream”, “sse”, “event”, “word.vomit”,
“loading”, “spinner”, “progress”, “BrowserView”, “excalidraw”,
“diff”, “approval”, “workbench”, “tool_call”, “delta”, “chunk”,
“cursor”, “gap”, “microinteraction”, “animation”, “transition”,
]
for rel in scripts:
p = REPO_ROOT / rel
if not p.exists():
result[rel] = {“exists”: False}
continue
content = read_file(p)
hits = {kw: bool(re.search(kw, content, re.IGNORECASE)) for kw in relevance_keywords}
result[rel] = {
“exists”: True,
“lines”: count_lines(content),
“relevant_keywords_found”: [k for k, v in hits.items() if v],
“relevance_score”: sum(hits.values()),
“preview”: content[:500],
}
return result

def audit_word_vomit_sources() -> dict:
“”“Scan ChatAssistant and stream hook for word-vomit root causes.”””
targets = [
“dashboard/features/agent-chat/ChatAssistant.tsx”,
“dashboard/components/ChatAssistant.tsx”,
“dashboard/features/agent-chat/hooks/useAgentChatStream.ts”,
“dashboard/features/agent-chat/streamParsing.ts”,
]
result = {}
for rel in targets:
p = REPO_ROOT / rel
if not p.exists():
result[rel] = {“exists”: False}
continue
content = read_file(p)
hits = grep(content, WORD_VOMIT_PATTERNS)
typed = grep(content, EVENT_PATTERNS)
result[rel] = {
“exists”: True,
“word_vomit_indicators”: hits,
“typed_event_indicators”: typed,
“has_typed_events”: bool(typed),
“likely_word_vomit”: bool(hits) and not bool(typed),
“loading_state_mentions”: len(re.findall(r’loading|isLoading|isPending|spinner|skeleton’, content, re.IGNORECASE)),
“streaming_render_lines”: grep_lines(content, r’chunk|delta|append|concat|streaming’),
}
return result

def audit_import_graph() -> dict:
“”“Build import graph: who imports ChatAssistant and stream hooks.”””
result = defaultdict(list)
search_dirs = [“dashboard”]
for d in search_dirs:
dp = REPO_ROOT / d
if not dp.exists():
continue
for ext in [”*.tsx”, “*.ts”, “*.jsx”, “*.js”]:
for f in dp.rglob(ext):
try:
content = f.read_text(encoding=“utf-8”, errors=“replace”)
except Exception:
continue
hits = grep(content, IMPORT_PATTERNS)
for pattern_name, _ in hits.items():
result[pattern_name].append(str(f.relative_to(REPO_ROOT)))
return dict(result)

def build_implementation_hitlist(
duality, stream_hook, types_file, openai_int, browserview, excalidraw, word_vomit
) -> list:
“”“Produce a priority-sorted implementation recommendation list.”””
hits = []

```
# ChatAssistant duality
if duality.get("verdict") in ("BOTH_EXIST_NEITHER_IN_APP", "BOTH_IMPORTED_CONFLICT", "CANNOT_DETERMINE"):
    hits.append({"priority": "P0", "area": "ChatAssistant", "issue": f"Duality unresolved: {duality.get('verdict')}", "action": "Confirm live mount in App.tsx before any changes"})
if duality.get("legacy_imported_in"):
    hits.append({"priority": "P0", "area": "ChatAssistant", "issue": f"Legacy ChatAssistant still imported in {len(duality['legacy_imported_in'])} other files", "action": "Remove stale imports or migrate to feature path"})

# Stream hook
for rel, data in stream_hook.items():
    if not data.get("exists"):
        hits.append({"priority": "P0", "area": "Stream", "issue": f"Missing: {rel}", "action": "File must be created for Event Protocol implementation"})
    elif not data.get("event_patterns"):
        hits.append({"priority": "P0", "area": "Stream", "issue": f"{rel}: No typed event parsing detected", "action": "Implement typed event dispatch (run.status, tool.started, etc.)"})
    if data.get("uses_eventsource"):
        hits.append({"priority": "P1", "area": "Stream", "issue": f"{rel}: Uses EventSource (browser-managed reconnect)", "action": "Audit reconnect/resume behavior and confirm event ID support"})

# Types
if not types_file.get("exists"):
    hits.append({"priority": "P0", "area": "Types", "issue": "types.ts missing", "action": "Create before Event Protocol design"})
elif not types_file.get("has_stream_type"):
    hits.append({"priority": "P1", "area": "Types", "issue": "No stream/event types found", "action": "Add AgentEvent, StreamEvent, ToolEvent types"})

# OpenAI backend
if openai_int.get("exists"):
    if not openai_int.get("stream_true"):
        hits.append({"priority": "P0", "area": "Backend", "issue": "openai.js: stream:true not found", "action": "Confirm streaming is enabled on provider requests"})
    if not openai_int.get("emits_sse_events"):
        hits.append({"priority": "P1", "area": "Backend", "issue": "openai.js: no SSE event emission detected", "action": "Add typed SSE event emission to provider stream handler"})

# BrowserView gaps
if browserview.get("exists"):
    missing = browserview.get("capabilities_missing", [])
    if "screenshot" in missing:
        hits.append({"priority": "P1", "area": "BrowserView", "issue": "No screenshot checkpoint capability", "action": "Add screenshot event support for Workbench timeline"})
    if "cursor_position" in missing:
        hits.append({"priority": "P1", "area": "BrowserView", "issue": "No live cursor/mouse event", "action": "Wire cursor SSE events for Workbench overlay"})
    if "manual_takeover" in missing:
        hits.append({"priority": "P0", "area": "BrowserView", "issue": "No manual takeover control", "action": "Required for T026 safety/control UX"})

# Excalidraw write mode
if excalidraw.get("exists"):
    if excalidraw.get("write_mode") in ("blob_replace", "unknown"):
        hits.append({"priority": "P1", "area": "Excalidraw", "issue": f"Write mode is '{excalidraw['write_mode']}' — no incremental patches", "action": "Implement scene patch events (T010)"})

# Word vomit
for rel, data in word_vomit.items():
    if data.get("likely_word_vomit"):
        hits.append({"priority": "P0", "area": "WordVomit", "issue": f"{rel}: untyped streaming with no event dispatch", "action": "Implement typed event reducer (T008) for this consumer"})

hits.sort(key=lambda x: x["priority"])
return hits
```

# ─────────────────────────────────────────────

# REPORT WRITER

# ─────────────────────────────────────────────

def write_report(data: dict):
lines = []
a = lines.append

```
a(f"# Agent Sam — SSE UX Audit Master Report")
a(f"**Generated:** {NOW}  ")
a(f"**Plan:** `plan_may19_agentsam_realtime_sse_ux_audit`  ")
a(f"**Task:** T027 — Inspect confirmed repo targets  ")
a("")

# ── File Manifest ──────────────────────────────────────────────────
m = data["manifest"]
a("## 1. File Manifest")
a(f"**{m['found']}/{m['found'] + m['missing_count']} target files exist.**")
a("")
if m["missing"]:
    a("### Missing Files")
    for f in m["missing"]:
        a(f"- `{f}`")
    a("")
a("### Existing Files")
a("| File | Lines | Size | Hash |")
a("|------|-------|------|------|")
for rel, info in m["files"].items():
    if info["exists"]:
        a(f"| `{rel}` | {info['lines']} | {info['size_bytes']:,}B | `{info['hash']}` |")
a("")

# ── ChatAssistant Duality ──────────────────────────────────────────
d = data["chatassistant_duality"]
a("## 2. ChatAssistant Duality")
a(f"**Verdict:** `{d.get('verdict', 'UNKNOWN')}`  ")
a(f"- Feature path exists: `{d.get('feature_path_exists')}`  ")
a(f"- Legacy path exists: `{d.get('legacy_path_exists')}`  ")
a(f"- App.tsx imports feature: `{d.get('app_imports_feature')}`  ")
a(f"- App.tsx imports legacy: `{d.get('app_imports_legacy')}`  ")
if d.get("app_mounted_components"):
    a(f"- Mounted chat components: {d['app_mounted_components']}")
if d.get("legacy_imported_in"):
    a(f"- **Legacy still imported in:** {d['legacy_imported_in']}")
a("")

# ── Stream Hook ────────────────────────────────────────────────────
a("## 3. Stream Hook Audit")
for rel, info in data["stream_hook"].items():
    a(f"### `{rel}`")
    if not info.get("exists"):
        a("**NOT FOUND**"); a(""); continue
    a(f"- Lines: {info['lines']}")
    a(f"- Uses EventSource: `{info.get('uses_eventsource')}`")
    a(f"- Uses getReader: `{info.get('uses_getreader')}`")
    a(f"- Uses TextDecoder: `{info.get('uses_text_decoder')}`")
    a(f"- Uses JSON.parse: `{info.get('uses_json_parse')}`")
    a(f"- Event names found: {info.get('event_names_found', [])}")
    if info.get("sse_patterns"):
        a(f"- SSE patterns: {list(info['sse_patterns'].keys())}")
    if info.get("word_vomit_patterns"):
        a(f"- **Word-vomit indicators:** {list(info['word_vomit_patterns'].keys())}")
    if info.get("chunk_handling_lines"):
        a("- Chunk handling lines:")
        for item in info["chunk_handling_lines"][:3]:
            a(f"  ```\n{item['context']}\n  ```")
    a("")

# ── Types ──────────────────────────────────────────────────────────
t = data["types_file"]
a("## 4. Types File")
if not t.get("exists"):
    a("**NOT FOUND** — types.ts must be created before Event Protocol design.")
else:
    a(f"- Lines: {t['lines']}")
    a(f"- Type names: {t.get('type_names', [])}")
    a(f"- Enum names: {t.get('enum_names', [])}")
    a(f"- Has tool type: `{t.get('has_tool_type')}`")
    a(f"- Has stream type: `{t.get('has_stream_type')}`")
    a(f"- Has error type: `{t.get('has_error_type')}`")
    a(f"- Event types found: {t.get('event_types', [])}")
a("")

# ── OpenAI Integration ─────────────────────────────────────────────
o = data["openai_integration"]
a("## 5. OpenAI Integration (Backend Stream)")
if not o.get("exists"):
    a("**NOT FOUND**")
else:
    a(f"- Lines: {o['lines']}")
    a(f"- stream: true present: `{o.get('stream_true')}`")
    a(f"- Uses /v1/responses: `{o.get('uses_responses_api')}`")
    a(f"- Uses /v1/chat/completions: `{o.get('uses_chat_api')}`")
    a(f"- SSE patterns: {list(o.get('sse_patterns', {}).keys())}")
    if o.get("emits_sse_events"):
        a("- SSE emit lines found:")
        for item in o["emits_sse_events"][:3]:
            a(f"  ```\n{item['context']}\n  ```")
a("")

# ── BrowserView ────────────────────────────────────────────────────
b = data["browserview"]
a("## 6. BrowserView Capabilities")
if not b.get("exists"):
    a("**NOT FOUND**")
else:
    a(f"- Lines: {b['lines']}")
    a(f"- **Present:** {b.get('capabilities_present', [])}")
    a(f"- **Missing:** {b.get('capabilities_missing', [])}")
a("")

# ── ExcalidrawView ─────────────────────────────────────────────────
e = data["excalidrawview"]
a("## 7. ExcalidrawView Capabilities")
if not e.get("exists"):
    a("**NOT FOUND**")
else:
    a(f"- Lines: {e['lines']}")
    a(f"- **Write mode:** `{e.get('write_mode')}`")
    a(f"- Agent-triggered: `{e.get('agent_triggered')}`")
    a(f"- **Present:** {e.get('capabilities_present', [])}")
    a(f"- **Missing:** {e.get('capabilities_missing', [])}")
a("")

# ── Word Vomit ─────────────────────────────────────────────────────
a("## 8. Word-Vomit Root Cause Analysis")
for rel, info in data["word_vomit"].items():
    if not info.get("exists"):
        continue
    a(f"### `{rel}`")
    a(f"- Likely word-vomit: `{info.get('likely_word_vomit')}`")
    a(f"- Has typed events: `{info.get('has_typed_events')}`")
    a(f"- Word-vomit indicators: {list(info.get('word_vomit_indicators', {}).keys())}")
    a(f"- Loading state mentions: {info.get('loading_state_mentions')}")
    a("")

# ── Import Graph ───────────────────────────────────────────────────
a("## 9. Import Dependency Graph")
for pattern, files in data["import_graph"].items():
    a(f"**{pattern}** ({len(files)} importers):")
    for f in files[:5]:
        a(f"  - `{f}`")
a("")

# ── Existing Scripts ───────────────────────────────────────────────
a("## 10. Existing Audit Scripts — Relevance Scores")
a("| Script | Lines | Score | Top Keywords |")
a("|--------|-------|-------|--------------|")
for rel, info in sorted(data["existing_scripts"].items(), key=lambda x: -x[1].get("relevance_score", 0)):
    if info.get("exists"):
        kw = ", ".join(info.get("relevant_keywords_found", [])[:5])
        a(f"| `{rel}` | {info['lines']} | {info['relevance_score']} | {kw} |")
a("")

# ── Migrations ─────────────────────────────────────────────────────
a("## 11. Migration File Summary")
for rel, info in data["migrations"].items():
    if info.get("exists"):
        a(f"- `{rel}`: tables={info.get('tables_created', [])}, chat={info.get('chat_related')}, agent={info.get('agent_related')}")
a("")

# ── Hit List ───────────────────────────────────────────────────────
a("## 12. Priority Implementation Hit List")
a("| Priority | Area | Issue | Action |")
a("|----------|------|-------|--------|")
for h in data["implementation_hitlist"]:
    a(f"| `{h['priority']}` | {h['area']} | {h['issue']} | {h['action']} |")
a("")

a("---")
a(f"*Generated by `scripts/audit_sseux_master.py` at {NOW}*")

REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
print(f"[✓] Report written → {REPORT_PATH}")
```

# ─────────────────────────────────────────────

# MAIN

# ─────────────────────────────────────────────

def main():
print(f”[→] Agent Sam SSE UX Audit Master — {NOW}”)
print(f”[→] Repo root: {REPO_ROOT}”)
print()

```
print("[1/10] Scanning file manifest...")
manifest = audit_file_manifest(TARGETS)
print(f"       {manifest['found']}/{len(TARGETS)} files found, {manifest['missing_count']} missing")

print("[2/10] Auditing ChatAssistant duality...")
duality = audit_chatassistant_duality(manifest)
print(f"       Verdict: {duality.get('verdict')}")

print("[3/10] Auditing stream hook + stream parser...")
stream_hook = audit_stream_hook(manifest)

print("[4/10] Auditing types.ts...")
types_file = audit_types_file()

print("[5/10] Auditing OpenAI integration...")
openai_int = audit_openai_integration()

print("[6/10] Auditing BrowserView...")
browserview = audit_browserview()

print("[7/10] Auditing ExcalidrawView...")
excalidraw = audit_excalidrawview()

print("[8/10] Scanning for word-vomit root causes...")
word_vomit = audit_word_vomit_sources()

print("[9/10] Building import graph...")
import_graph = audit_import_graph()

print("[10/10] Scanning existing audit scripts + migrations...")
existing_scripts = audit_existing_scripts()
migrations = audit_migration_files()

app_routing = audit_app_routing()

hit_list = build_implementation_hitlist(
    duality, stream_hook, types_file, openai_int, browserview, excalidraw, word_vomit
)

data = {
    "generated_at":           NOW,
    "plan_id":                "plan_may19_agentsam_realtime_sse_ux_audit",
    "task_id":                "task_sseux_t027_inspect_confirmed_repo_targets",
    "manifest":               manifest,
    "chatassistant_duality":  duality,
    "stream_hook":            stream_hook,
    "types_file":             types_file,
    "openai_integration":     openai_int,
    "browserview":            browserview,
    "excalidrawview":         excalidraw,
    "word_vomit":             word_vomit,
    "import_graph":           import_graph,
    "existing_scripts":       existing_scripts,
    "migrations":             migrations,
    "app_routing":            app_routing,
    "implementation_hitlist": hit_list,
}

DATA_PATH.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
print(f"[✓] Data written → {DATA_PATH}")

write_report(data)

print()
print("═" * 60)
print(f"  Files found:      {manifest['found']}/{len(TARGETS)}")
print(f"  Files missing:    {manifest['missing_count']}")
print(f"  CA verdict:       {duality.get('verdict')}")
print(f"  P0 action items:  {sum(1 for h in hit_list if h['priority'] == 'P0')}")
print(f"  P1 action items:  {sum(1 for h in hit_list if h['priority'] == 'P1')}")
print("═" * 60)
print()
if hit_list:
    print("  Top P0 actions:")
    for h in [h for h in hit_list if h["priority"] == "P0"][:5]:
        print(f"  [{h['area']}] {h['issue']}")
print()
```

if **name** == “**main**”:
main()