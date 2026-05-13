#!/usr/bin/env python3
"""
inspect_design_studio_app.py

Purpose
  Inspect a Claude/Design-Studio-generated CMS editor prototype or app folder, score it
  against the Inner Animal CMS contract, emit local artifacts, and optionally track the
  run in D1 and Supabase.

Default behavior is safe/read-only: no D1/Supabase writes unless --write-d1 or
--write-supabase is passed.

Examples
  # Inspect one HTML file
  python3 scripts/audit/inspect_design_studio_app.py --target ~/Downloads/DesignStudioCMS.html

  # Inspect a folder/app and produce a report
  python3 scripts/audit/inspect_design_studio_app.py --target ./design-studio --cms-audit-dir artifacts/cms_audit_20260513T031136Z

  # Track report in D1 agentsam_plan_tasks notes/output_summary if env/session is ready
  python3 scripts/audit/inspect_design_studio_app.py --target ~/Downloads/DesignStudioCMS.html --write-d1

  # Track semantic edges in Supabase public.knowledge_edges, requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  python3 scripts/audit/inspect_design_studio_app.py --target ~/Downloads/DesignStudioCMS.html --write-supabase

  # After local pass, optionally copy static artifact into an R2 key with wrangler
  python3 scripts/audit/inspect_design_studio_app.py --target ~/Downloads/DesignStudioCMS.html --stage-r2
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html.parser
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import textwrap
import urllib.request
from dataclasses import dataclass, asdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

ROOT = pathlib.Path.cwd()
DEFAULT_DB = os.getenv("IAM_D1_DB", "inneranimalmedia-business")
DEFAULT_WRANGLER_CONFIG = os.getenv("IAM_WRANGLER_CONFIG", "wrangler.production.toml")
DEFAULT_TENANT_ID = os.getenv("IAM_TENANT_ID", "tenant_sam_primeaux")
DEFAULT_WORKSPACE_ID = os.getenv("IAM_WORKSPACE_ID", "ws_inneranimalmedia")
DEFAULT_PLAN_ID = os.getenv("IAM_PLAN_ID", "plan_agentsam_mcp_branding_org_20260513")
DEFAULT_TASK_ID = os.getenv("IAM_PLAN_TASK_ID", "task_design_studio_cms_app_inspection_20260513")
DEFAULT_R2_BUCKET = os.getenv("IAM_R2_BUCKET", "inneranimalmedia")
DEFAULT_R2_PREFIX = os.getenv("IAM_R2_PREFIX", "agentsam/design-studio-inspections")

CMS_CONTRACT_TERMS = {
    "schema_core": [
        "cms_pages", "cms_page_sections", "cms_section_components", "cms_component_templates",
        "cms_liquid_sections", "cms_themes", "cms_page_drafts", "cms_page_overrides",
        "cms_override_versions", "cms_live_edit_sessions", "cms_live_rollbacks",
    ],
    "page_fields": ["route_path", "title", "status", "seo", "r2", "published_at"],
    "section_fields": ["page_id", "section_type", "section_name", "section_data", "sort_order", "is_visible"],
    "component_fields": ["section_id", "component_type", "component_data", "sort_order", "is_visible"],
    "theme_fields": ["tokens_json", "css_vars_json", "brand_json", "layout_json", "typography_json", "components_json", "motion_json", "monaco_theme_data"],
    "interactions": ["drag", "drop", "reorder", "sort_order", "visibility", "toggle", "duplicate", "delete", "rollback", "publish", "draft", "preview", "inspect", "theme"],
    "ui_regions": ["top", "app bar", "left", "rail", "page", "template", "structure", "tree", "canvas", "preview", "inspector", "history", "console", "build"],
    "client_friendly": ["beginner", "template", "easy", "reusable", "theme", "customize", "no code", "preview", "safe"],
    "safety": ["approval", "rollback", "version", "draft", "dirty", "saved", "publish pending", "orphan", "validation"],
}

RECOMMENDED_FILES = [
    "DesignStudioCMS.html", "index.html", "src", "app", "components", "package.json", "vite.config", "wrangler.toml"
]


class MiniHTMLParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tags: Dict[str, int] = {}
        self.ids: List[str] = []
        self.classes: List[str] = []
        self.data_attrs: List[str] = []
        self.scripts = 0
        self.styles = 0
        self.buttons = 0
        self.inputs = 0
        self.forms = 0
        self.links = 0
        self.aria = 0
        self.drag_attrs = 0

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        self.tags[tag] = self.tags.get(tag, 0) + 1
        attr = dict(attrs)
        if tag == "script": self.scripts += 1
        if tag == "style": self.styles += 1
        if tag == "button": self.buttons += 1
        if tag in ("input", "textarea", "select"): self.inputs += 1
        if tag == "form": self.forms += 1
        if tag == "a": self.links += 1
        for k, v in attrs:
            lk = k.lower()
            if lk == "id" and v: self.ids.append(v)
            if lk == "class" and v: self.classes.extend([c for c in re.split(r"\s+", v.strip()) if c])
            if lk.startswith("data-"): self.data_attrs.append(lk)
            if lk.startswith("aria-") or lk == "role": self.aria += 1
            if lk in ("draggable", "ondragstart", "ondragover", "ondrop") or "drag" in lk or "drop" in lk:
                self.drag_attrs += 1


@dataclass
class Check:
    key: str
    status: str
    score: float
    detail: str
    evidence: List[str]


@dataclass
class InspectionResult:
    run_id: str
    created_at: str
    target: str
    target_kind: str
    sha256: str
    bytes_total: int
    files_scanned: int
    score_total: float
    grade: str
    checks: List[Check]
    recommendations: List[str]
    artifacts: Dict[str, str]


def utc_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def run(cmd: List[str], *, input_text: Optional[str] = None, check: bool = False, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, input=input_text, text=True, capture_output=True, check=check, timeout=timeout)


def slurp(path: pathlib.Path, max_bytes: int = 8_000_000) -> str:
    raw = path.read_bytes()
    if len(raw) > max_bytes:
        raw = raw[:max_bytes]
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def collect_files(target: pathlib.Path) -> List[pathlib.Path]:
    if target.is_file():
        return [target]
    exts = {".html", ".htm", ".js", ".jsx", ".ts", ".tsx", ".css", ".json", ".md", ".sql"}
    ignore_parts = {"node_modules", ".git", "dist", "build", ".next", ".turbo", ".wrangler", "coverage"}
    files: List[pathlib.Path] = []
    for p in target.rglob("*"):
        if not p.is_file():
            continue
        if any(part in ignore_parts for part in p.parts):
            continue
        if p.suffix.lower() in exts:
            files.append(p)
    return sorted(files)[:500]


def hash_files(files: List[pathlib.Path]) -> Tuple[str, int]:
    h = hashlib.sha256()
    total = 0
    for f in files:
        data = f.read_bytes()
        total += len(data)
        h.update(str(f).encode())
        h.update(b"\0")
        h.update(data)
    return h.hexdigest(), total


def grep_evidence(text: str, terms: Iterable[str], max_hits: int = 10) -> List[str]:
    hits: List[str] = []
    lower = text.lower()
    for term in terms:
        t = term.lower()
        idx = lower.find(t)
        if idx >= 0:
            start = max(0, idx - 70)
            end = min(len(text), idx + len(term) + 100)
            snippet = re.sub(r"\s+", " ", text[start:end]).strip()
            hits.append(snippet)
            if len(hits) >= max_hits:
                break
    return hits


def pct(found: int, total: int) -> float:
    if total <= 0: return 0.0
    return round(100.0 * found / total, 2)


def check_terms(key: str, label: str, text: str, terms: List[str], weight: float = 1.0, required: bool = False) -> Check:
    found_terms = [t for t in terms if t.lower() in text.lower()]
    score = pct(len(found_terms), len(terms)) * weight
    status = "OK" if (len(found_terms) == len(terms) or (not required and len(found_terms) >= max(1, len(terms)//3))) else ("WARN" if found_terms else "FAIL")
    if required and len(found_terms) < len(terms):
        status = "FAIL"
    return Check(
        key=key,
        status=status,
        score=min(100.0, score),
        detail=f"{label}: found {len(found_terms)}/{len(terms)} terms: {', '.join(found_terms[:12])}",
        evidence=grep_evidence(text, found_terms or terms, 8),
    )


def inspect_html(text: str) -> Dict[str, Any]:
    parser = MiniHTMLParser()
    try:
        parser.feed(text)
    except Exception:
        pass
    return {
        "tags": parser.tags,
        "ids": parser.ids[:200],
        "classes_sample": parser.classes[:300],
        "data_attrs_sample": sorted(set(parser.data_attrs))[:100],
        "scripts": parser.scripts,
        "styles": parser.styles,
        "buttons": parser.buttons,
        "inputs": parser.inputs,
        "forms": parser.forms,
        "links": parser.links,
        "aria_count": parser.aria,
        "drag_attr_count": parser.drag_attrs,
    }


def local_static_checks(files: List[pathlib.Path], joined: str, target: pathlib.Path) -> List[Check]:
    checks: List[Check] = []
    checks.append(check_terms("contract.schema_core", "CMS contract table references", joined, CMS_CONTRACT_TERMS["schema_core"], weight=1.0, required=False))
    checks.append(check_terms("contract.page_fields", "Page registry fields", joined, CMS_CONTRACT_TERMS["page_fields"], weight=1.0, required=False))
    checks.append(check_terms("contract.section_fields", "Section fields", joined, CMS_CONTRACT_TERMS["section_fields"], weight=1.0, required=False))
    checks.append(check_terms("contract.component_fields", "Component fields", joined, CMS_CONTRACT_TERMS["component_fields"], weight=1.0, required=False))
    checks.append(check_terms("contract.theme_fields", "Theme/token fields", joined, CMS_CONTRACT_TERMS["theme_fields"], weight=1.0, required=False))
    checks.append(check_terms("interaction.drag_builder", "Drag/reorder/edit interactions", joined, CMS_CONTRACT_TERMS["interactions"], weight=1.0, required=False))
    checks.append(check_terms("ui.regions", "Full editor regions", joined, CMS_CONTRACT_TERMS["ui_regions"], weight=1.0, required=False))
    checks.append(check_terms("product.beginner_resellable", "Beginner/resellable affordances", joined, CMS_CONTRACT_TERMS["client_friendly"], weight=1.0, required=False))
    checks.append(check_terms("safety.versioning", "Draft/version/publish/rollback safety", joined, CMS_CONTRACT_TERMS["safety"], weight=1.0, required=False))

    html_files = [f for f in files if f.suffix.lower() in (".html", ".htm")]
    if html_files:
        html_meta = inspect_html("\n".join(slurp(f) for f in html_files[:10]))
        drag_ok = html_meta["drag_attr_count"] > 0 or any("drag" in c.lower() or "drop" in c.lower() for c in html_meta["classes_sample"])
        checks.append(Check(
            key="html.drag_attrs",
            status="OK" if drag_ok else "WARN",
            score=100.0 if drag_ok else 40.0,
            detail=f"HTML drag/drop markers: drag_attrs={html_meta['drag_attr_count']}, classes_sample={len(html_meta['classes_sample'])}",
            evidence=[c for c in html_meta["classes_sample"] if "drag" in c.lower() or "drop" in c.lower()][:10],
        ))
        checks.append(Check(
            key="html.accessibility_basics",
            status="OK" if html_meta["aria_count"] >= 8 and html_meta["buttons"] >= 5 else "WARN",
            score=min(100.0, html_meta["aria_count"] * 5 + html_meta["buttons"] * 2),
            detail=f"Accessibility/control basics: aria_or_role={html_meta['aria_count']}, buttons={html_meta['buttons']}, inputs={html_meta['inputs']}",
            evidence=html_meta["data_attrs_sample"][:8],
        ))

    package_json = target / "package.json" if target.is_dir() else None
    if package_json and package_json.exists():
        try:
            pkg = json.loads(package_json.read_text())
            scripts = pkg.get("scripts", {}) if isinstance(pkg, dict) else {}
            has_dev = any(k in scripts for k in ("dev", "start"))
            has_build = "build" in scripts or "build:vite-only" in scripts
            checks.append(Check(
                key="app.package_scripts",
                status="OK" if has_dev and has_build else "WARN",
                score=100.0 if has_dev and has_build else 50.0,
                detail=f"package.json scripts dev/start={has_dev}, build={has_build}, scripts={sorted(scripts.keys())[:12]}",
                evidence=[json.dumps(scripts, sort_keys=True)[:500]],
            ))
        except Exception as e:
            checks.append(Check("app.package_scripts", "WARN", 20.0, f"Could not parse package.json: {e}", []))
    else:
        checks.append(Check("app.package_scripts", "WARN", 45.0, "No package.json found; OK for single-file HTML prototype, not enough for app deploy.", []))

    return checks


def summarize_recommendations(checks: List[Check], target: pathlib.Path) -> List[str]:
    recs: List[str] = []
    by_key = {c.key: c for c in checks}
    if by_key.get("contract.schema_core", Check("", "", 0, "", [])).score < 45:
        recs.append("Make Claude explicitly label the real data contract: cms_pages → cms_page_sections → cms_section_components → templates/liquid/themes/drafts/overrides/versions.")
    if by_key.get("interaction.drag_builder", Check("", "", 0, "", [])).score < 55:
        recs.append("Add visible drag handles, drop zones, reorder state, selected section/component outline, and inspector sync.")
    if by_key.get("contract.theme_fields", Check("", "", 0, "", [])).score < 45:
        recs.append("Add a real Theme tab that previews cms_themes token buckets: css vars, typography, layout, components, motion, and Monaco theme.")
    if by_key.get("safety.versioning", Check("", "", 0, "", [])).score < 50:
        recs.append("Add save draft, publish pending, version history, rollback, validation, and dirty/saved state in the shell.")
    if target.is_file():
        recs.append("Keep this local as a prototype first. Do not put it in a fresh repo yet. Promote to R2 preview after it passes this audit and one screenshot/playwright pass.")
    else:
        recs.append("If this folder has package.json + build/dev scripts, let Agent Sam practice local Python inspection and then stage a static preview to R2; only create a fresh repo after the UI contract is stable.")
    recs.append("Track every inspection as an artifact plus D1 plan/task output; mirror only semantic facts to Supabase knowledge_edges, not a second task source of truth.")
    return recs


def grade(score: float) -> str:
    if score >= 90: return "A"
    if score >= 80: return "B"
    if score >= 70: return "C"
    if score >= 60: return "D"
    return "F"


def load_cms_audit_context(cms_audit_dir: Optional[pathlib.Path]) -> Dict[str, Any]:
    if not cms_audit_dir:
        return {}
    out: Dict[str, Any] = {}
    if not cms_audit_dir.exists():
        return {"warning": f"cms_audit_dir does not exist: {cms_audit_dir}"}
    for name in ["cms_schema.json", "cms_tables.json", "cms_pages_sample.json", "cms_page_sections_sample.json", "cms_section_components_sample.json", "cms_component_templates_sample.json", "cms_themes_sample.json"]:
        p = cms_audit_dir / name
        if p.exists():
            try:
                out[name] = json.loads(p.read_text())
            except Exception as e:
                out[name] = {"parse_error": str(e)}
    return out


def render_markdown(result: InspectionResult, cms_context: Dict[str, Any]) -> str:
    rows = []
    for c in result.checks:
        rows.append(f"| {c.status} | {c.key} | {c.score:.1f} | {c.detail.replace('|','/')} |")
    recs = "\n".join(f"- {r}" for r in result.recommendations)
    evidence_blocks = []
    for c in result.checks:
        if c.evidence:
            evidence_blocks.append(f"### {c.key}\n" + "\n".join(f"- `{e[:500]}`" for e in c.evidence[:6]))
    cms_files = ", ".join(sorted(cms_context.keys())) if cms_context else "none loaded"
    return f"""# Design Studio CMS App Inspection

**Run:** `{result.run_id}`  
**Created:** `{result.created_at}`  
**Target:** `{result.target}`  
**Kind:** `{result.target_kind}`  
**SHA256:** `{result.sha256}`  
**Bytes:** `{result.bytes_total}`  
**Files scanned:** `{result.files_scanned}`  
**Score:** `{result.score_total:.1f}` / 100  
**Grade:** `{result.grade}`

## Recommendation

Do **local first**, then R2 preview, then repo/persistent app only after the design contract stabilizes.

Reason: this is still a Claude-generated CMS editor prototype. Let Agent Sam practice Python inspection, local validation, screenshots, and artifact tracking against the real `cms_*` contract before spending time wiring a new repo. Once the file/app passes inspection, stage it under R2 as a static preview like:

`{DEFAULT_R2_PREFIX}/{result.run_id}/DesignStudioCMS.html`

Then create/attach repo only when the chosen UI shape is stable enough to implement in React/Vite.

## CMS audit context loaded

{cms_files}

## Checks

| Status | Check | Score | Detail |
|---|---:|---:|---|
{chr(10).join(rows)}

## Recommendations / next Cursor instructions

{recs}

## Evidence snippets

{chr(10).join(evidence_blocks) if evidence_blocks else 'No snippets captured.'}
"""


def sql_quote(s: Optional[str]) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"


def d1_execute(sql: str, db: str, config: str, *, json_mode: bool = False) -> subprocess.CompletedProcess[str]:
    cmd = ["npx", "wrangler", "d1", "execute", db, "--remote", "-c", config]
    if json_mode:
        cmd.append("--json")
    cmd.extend(["--command", sql])
    return run(cmd, timeout=180)


def write_d1_tracking(result: InspectionResult, args: argparse.Namespace) -> Tuple[bool, str]:
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    report_path = result.artifacts.get("markdown", "")
    json_path = result.artifacts.get("json", "")
    summary = {
        "run_id": result.run_id,
        "score": result.score_total,
        "grade": result.grade,
        "target": result.target,
        "sha256": result.sha256,
        "report": report_path,
        "json": json_path,
        "recommendation": "local_first_then_r2_preview_then_repo",
    }
    notes = "\n".join(result.recommendations[:6])
    # Ensure plan exists lightly; do not create plan here because the user already has canonical plan.
    sql = f"""
INSERT INTO agentsam_plan_tasks (
  id, tenant_id, workspace_id, plan_id, order_index, title, description, priority, category,
  status, files_involved, tables_involved, routes_involved, estimated_minutes,
  notes, output_summary, risk_level, requires_approval, quality_gate_json, created_at
)
SELECT
  {sql_quote(args.task_id)},
  {sql_quote(args.tenant_id)},
  {sql_quote(args.workspace_id)},
  {sql_quote(args.plan_id)},
  11,
  'Inspect Claude Design Studio CMS prototype',
  'Audit generated Design Studio CMS app/prototype against cms_* schema, drag builder, theme editor, draft/version/R2 workflow, and beginner-resellable UI requirements.',
  'P0',
  'ux',
  'todo',
  {sql_quote(json.dumps([result.target], ensure_ascii=False))},
  {sql_quote(json.dumps(['cms_pages','cms_page_sections','cms_section_components','cms_component_templates','cms_liquid_sections','cms_themes','cms_page_drafts','cms_page_overrides','cms_override_versions'], ensure_ascii=False))},
  {sql_quote(json.dumps(['/dashboard/cms','/dashboard/designstudio','/cms','/api/cms/*'], ensure_ascii=False))},
  45,
  {sql_quote(notes)},
  {sql_quote(json.dumps(summary, ensure_ascii=False))},
  'medium',
  0,
  {sql_quote(json.dumps({'score': result.score_total, 'grade': result.grade, 'min_grade_to_promote': 'B', 'local_first': True, 'r2_preview_after_pass': True}, ensure_ascii=False))},
  {now}
WHERE EXISTS (SELECT 1 FROM agentsam_plans WHERE id = {sql_quote(args.plan_id)})
  AND NOT EXISTS (SELECT 1 FROM agentsam_plan_tasks WHERE id = {sql_quote(args.task_id)});

UPDATE agentsam_plan_tasks
SET
  status = CASE WHEN {result.score_total:.4f} >= 80 THEN 'done' ELSE 'in_progress' END,
  output_summary = {sql_quote(json.dumps(summary, ensure_ascii=False))},
  notes = {sql_quote(notes)},
  completed_at = CASE WHEN {result.score_total:.4f} >= 80 THEN {now} ELSE completed_at END,
  actual_minutes = COALESCE(actual_minutes, 15),
  quality_gate_json = {sql_quote(json.dumps({'score': result.score_total, 'grade': result.grade, 'checks': [asdict(c) for c in result.checks]}, ensure_ascii=False))}
WHERE id = {sql_quote(args.task_id)};

UPDATE agentsam_plans
SET
  session_notes = COALESCE(session_notes || '\n\n', '') || {sql_quote('Design Studio inspection ' + result.run_id + ': grade ' + result.grade + ', score ' + str(round(result.score_total, 1)) + '. Report: ' + report_path)},
  updated_at = unixepoch()
WHERE id = {sql_quote(args.plan_id)};
"""
    p = d1_execute(sql, args.db, args.wrangler_config, json_mode=False)
    ok = p.returncode == 0
    return ok, (p.stdout + p.stderr)[-4000:]


def supabase_request(url: str, key: str, path: str, payload: Any, method: str = "POST") -> Tuple[int, str]:
    full = url.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(full, data=data, method=method)
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=representation")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except Exception as e:
        return 0, repr(e)


def write_supabase_edges(result: InspectionResult, args: argparse.Namespace) -> Tuple[bool, str]:
    url = os.getenv("SUPABASE_URL") or os.getenv("SUPABASE_PROJECT_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return False, "Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY; skipped Supabase write."
    base_meta = {
        "run_id": result.run_id,
        "score": result.score_total,
        "grade": result.grade,
        "target": result.target,
        "sha256": result.sha256,
        "report": result.artifacts.get("markdown"),
        "json": result.artifacts.get("json"),
    }
    rows = [
        {
            "entity_a": "Agent Sam",
            "relation": "inspected_design_studio_app",
            "entity_b": result.run_id,
            "tenant_id": args.tenant_id,
            "source_type": "architecture",
            "source_id": None,
            "confidence": 0.95,
            "metadata": base_meta,
        },
        {
            "entity_a": result.run_id,
            "relation": "targets_cms_contract",
            "entity_b": "cms_pages_to_sections_to_components",
            "tenant_id": args.tenant_id,
            "source_type": "architecture",
            "source_id": None,
            "confidence": 0.9,
            "metadata": {**base_meta, "contract": "cms_pages→cms_page_sections→cms_section_components→templates/liquid/themes/drafts/overrides/versions"},
        },
        {
            "entity_a": result.run_id,
            "relation": "promotion_recommendation",
            "entity_b": "local_first_then_r2_preview_then_repo",
            "tenant_id": args.tenant_id,
            "source_type": "decision",
            "source_id": None,
            "confidence": 0.9,
            "metadata": base_meta,
        },
    ]
    status, body = supabase_request(url, key, "/rest/v1/knowledge_edges?on_conflict=entity_a,relation,entity_b,tenant_id", rows, method="POST")
    return 200 <= status < 300, f"status={status} body={body[:2000]}"


def stage_to_r2(result: InspectionResult, args: argparse.Namespace, target: pathlib.Path) -> Tuple[bool, str]:
    if target.is_dir():
        # For folders, only upload the report artifacts. Full folder deploy should be a later explicit build step.
        files = [pathlib.Path(result.artifacts["markdown"]), pathlib.Path(result.artifacts["json"])]
    else:
        files = [target, pathlib.Path(result.artifacts["markdown"]), pathlib.Path(result.artifacts["json"])]
    messages = []
    ok = True
    for f in files:
        if not f.exists():
            continue
        key = f"{args.r2_prefix.rstrip('/')}/{result.run_id}/{f.name}"
        cmd = ["npx", "wrangler", "r2", "object", "put", f"{args.r2_bucket}/{key}", "--file", str(f), "-c", args.wrangler_config]
        p = run(cmd, timeout=180)
        messages.append("$ " + " ".join(cmd) + "\n" + p.stdout + p.stderr)
        if p.returncode != 0:
            ok = False
    return ok, "\n".join(messages)[-6000:]


def maybe_run_local_build(target: pathlib.Path) -> Tuple[bool, str]:
    if not target.is_dir():
        return True, "single-file target; no package build needed"
    pkg = target / "package.json"
    if not pkg.exists():
        return True, "no package.json; skipped build"
    try:
        data = json.loads(pkg.read_text())
        scripts = data.get("scripts", {})
        if "build" in scripts:
            p = run(["npm", "run", "build"], timeout=240)
            return p.returncode == 0, (p.stdout + p.stderr)[-6000:]
        return True, "package.json found but no build script; skipped build"
    except Exception as e:
        return False, f"build check error: {e}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Inspect Claude Design Studio CMS app/prototype and track results.")
    ap.add_argument("--target", required=True, help="HTML file or app folder to inspect")
    ap.add_argument("--cms-audit-dir", default=None, help="Existing artifacts/cms_audit_* dir to load context from")
    ap.add_argument("--out-dir", default=None, help="Output artifact directory; default artifacts/design_studio_inspection_<stamp>")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--wrangler-config", default=DEFAULT_WRANGLER_CONFIG)
    ap.add_argument("--tenant-id", default=DEFAULT_TENANT_ID)
    ap.add_argument("--workspace-id", default=DEFAULT_WORKSPACE_ID)
    ap.add_argument("--plan-id", default=DEFAULT_PLAN_ID)
    ap.add_argument("--task-id", default=DEFAULT_TASK_ID)
    ap.add_argument("--write-d1", action="store_true", help="Write/update agentsam_plan_tasks + agentsam_plans")
    ap.add_argument("--write-supabase", action="store_true", help="Upsert knowledge_edges via Supabase REST")
    ap.add_argument("--stage-r2", action="store_true", help="Upload inspected file/report artifacts to R2 after local inspection")
    ap.add_argument("--r2-bucket", default=DEFAULT_R2_BUCKET)
    ap.add_argument("--r2-prefix", default=DEFAULT_R2_PREFIX)
    ap.add_argument("--run-build", action="store_true", help="If target is a package folder, run npm run build when available")
    args = ap.parse_args()

    target = pathlib.Path(args.target).expanduser().resolve()
    if not target.exists():
        print(f"[FAIL] target does not exist: {target}", file=sys.stderr)
        return 2

    stamp = utc_stamp()
    run_id = f"design_studio_inspect_{stamp}_{hashlib.sha1(str(target).encode()).hexdigest()[:8]}"
    out_dir = pathlib.Path(args.out_dir).expanduser().resolve() if args.out_dir else (ROOT / "artifacts" / f"design_studio_inspection_{stamp}")
    out_dir.mkdir(parents=True, exist_ok=True)

    files = collect_files(target)
    if not files:
        print(f"[FAIL] no scannable files under target: {target}", file=sys.stderr)
        return 3
    sha, total_bytes = hash_files(files)
    parts = []
    for f in files:
        try:
            rel = str(f.relative_to(target if target.is_dir() else target.parent))
        except Exception:
            rel = f.name
        parts.append(f"\n\n/* FILE: {rel} */\n" + slurp(f))
    joined = "\n".join(parts)

    checks = local_static_checks(files, joined, target)
    if args.run_build:
        build_ok, build_msg = maybe_run_local_build(target)
        checks.append(Check("local.build", "OK" if build_ok else "FAIL", 100.0 if build_ok else 0.0, build_msg[:1000], []))

    score_total = round(sum(c.score for c in checks) / max(1, len(checks)), 2)
    g = grade(score_total)
    temp_result = InspectionResult(
        run_id=run_id,
        created_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        target=str(target),
        target_kind="directory" if target.is_dir() else "file",
        sha256=sha,
        bytes_total=total_bytes,
        files_scanned=len(files),
        score_total=score_total,
        grade=g,
        checks=checks,
        recommendations=[],
        artifacts={},
    )
    temp_result.recommendations = summarize_recommendations(checks, target)

    cms_context = load_cms_audit_context(pathlib.Path(args.cms_audit_dir).expanduser().resolve() if args.cms_audit_dir else None)
    json_path = out_dir / "inspection.json"
    md_path = out_dir / "report.md"
    files_manifest_path = out_dir / "files_scanned.json"
    temp_result.artifacts = {"json": str(json_path), "markdown": str(md_path), "files_manifest": str(files_manifest_path)}

    json_path.write_text(json.dumps(asdict(temp_result), indent=2, ensure_ascii=False), encoding="utf-8")
    md_path.write_text(render_markdown(temp_result, cms_context), encoding="utf-8")
    files_manifest_path.write_text(json.dumps([str(f) for f in files], indent=2), encoding="utf-8")

    print("=" * 92)
    print("Design Studio CMS inspection")
    print("=" * 92)
    print(f"target={target}")
    print(f"files={len(files)} bytes={total_bytes} sha256={sha}")
    print(f"score={score_total}/100 grade={g}")
    for c in checks:
        print(f"[{c.status}] {c.key}: {c.score:.1f} — {c.detail}")
    print(f"[done] report: {md_path}")
    print(f"[done] json:   {json_path}")

    if args.write_d1:
        ok, msg = write_d1_tracking(temp_result, args)
        print(f"[{'OK' if ok else 'FAIL'}] d1.tracking: {msg}")
        if not ok:
            return 4
    else:
        print("[skip] d1.tracking: pass --write-d1 to update agentsam_plan_tasks/agentsam_plans")

    if args.write_supabase:
        ok, msg = write_supabase_edges(temp_result, args)
        print(f"[{'OK' if ok else 'FAIL'}] supabase.knowledge_edges: {msg}")
        if not ok:
            return 5
    else:
        print("[skip] supabase.knowledge_edges: pass --write-supabase with SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY")

    if args.stage_r2:
        if score_total < 70:
            print("[FAIL] r2.stage: score below 70; refusing to stage weak prototype")
            return 6
        ok, msg = stage_to_r2(temp_result, args, target)
        print(f"[{'OK' if ok else 'FAIL'}] r2.stage: {msg}")
        if not ok:
            return 7
    else:
        print("[skip] r2.stage: pass --stage-r2 after local pass")

    print("\nNext recommendation: local first → R2 static preview → only then fresh repo/app wiring.")
    return 0 if score_total >= 60 else 1


if __name__ == "__main__":
    raise SystemExit(main())
