#!/usr/bin/env python3
"""
Audit deploy scripts using local Ollama qwen2.5-coder:7b.
Reads each script, asks the model what it does, risks, and one suggestion.
Cross-references package.json and agentsam_scripts D1.
"""

import json, os, re, time, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone

REPO         = Path.home() / "inneranimalmedia"
OLLAMA_URL   = "http://localhost:11434/api/generate"
MODEL        = "qwen2.5-coder:7b"
MAX_CHARS    = 6000   # truncate large files before sending
OUT_FILE     = REPO / "scripts" / "reports" / f"deploy_audit_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.md"
OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

# ── D1 env ────────────────────────────────────────────────────────────────────
env_path = Path.home() / "inneranimalmedia/.env.agentsam.local"
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

CF_ACCOUNT_ID  = os.environ["CLOUDFLARE_ACCOUNT_ID"]
CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
D1_DATABASE_ID = os.environ["CLOUDFLARE_D1_DATABASE_ID"]
D1_ENDPOINT    = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"

def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req  = urllib.request.Request(D1_ENDPOINT, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    return data["result"][0]["results"]

def ollama(prompt, context_file=""):
    full_prompt = f"{prompt}\n\n```\n{context_file[:MAX_CHARS]}\n```" if context_file else prompt
    body = json.dumps({
        "model": MODEL,
        "prompt": full_prompt,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 400}
    }).encode()
    req = urllib.request.Request(OLLAMA_URL, data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())["response"].strip()
    except Exception as e:
        return f"ERROR: {e}"

# ── script groups (priority order) ───────────────────────────────────────────
GROUPS = {
    "Main entrypoints": [
        "scripts/deploy-full.sh",
        "scripts/deploy-frontend.sh",
        "scripts/deploy.sh",
        "scripts/with-cloudflare-env.sh",
        "scripts/deploy-gate.sh",
        "scripts/deploy-with-record.sh",
    ],
    "Post-deploy / verification": [
        "scripts/post-deploy-smoke.sh",
        "scripts/post-deploy-record.sh",
        "scripts/post-deploy-memory-sync.sh",
        "scripts/verify-agentsam-telemetry-after-deploy.sh",
        "scripts/settings_deploy_check.sh",
    ],
    "R2 / manifest": [
        "scripts/build-r2-deploy-manifest.mjs",
        "scripts/reconcile-r2-deploy.mjs",
        "scripts/compute-deploy-input-hash.mjs",
        "scripts/patch-dashboard-flat-deploy-paths.sh",
    ],
    "Deploy ledger": [
        "scripts/record-supabase-deploy-start.mjs",
        "scripts/record-supabase-deploy-complete.mjs",
        "scripts/record-supabase-deploy-failure.mjs",
        "scripts/finalize-stale-deploy-events.mjs",
        "scripts/record-d1-deploy-start.mjs",
        "scripts/record-d1-deploy-complete.mjs",
        "scripts/record-d1-deploy-failure.mjs",
        "scripts/record-d1-deployment-health.mjs",
    ],
    "Codebase index / eval": [
        "scripts/index-codebase-snapshot.mjs",
        "scripts/run-deploy-eval.mjs",
    ],
    "Suspected legacy": [
        "scripts/deploy-sandbox.sh",
        "scripts/deploy-test-promote.sh",
        "scripts/deploy-cf-builds.sh",
        "scripts/deploy-cf-builds-prod.sh",
        "scripts/dev-deploy.sh",
    ],
}

PROMPT = """You are auditing a deployment script for a Cloudflare Workers + R2 + D1 platform.
Be concise. Answer in exactly this format:

DOES: one sentence, what this script actually does
STATUS: one of — ACTIVE | LIKELY_DEAD | NEEDS_REVIEW
RISK: one sentence on the biggest risk or problem you see
SUGGESTION: one concrete actionable improvement (not vague)"""

# ── load reference data ───────────────────────────────────────────────────────
print("Loading reference data...")

# package.json scripts
pkg = json.loads((REPO / "package.json").read_text())
pkg_scripts = pkg.get("scripts", {})
pkg_refs = set()
for v in pkg_scripts.values():
    for word in re.findall(r'scripts/[\w\-\.]+', v):
        pkg_refs.add(word)

# agentsam_scripts registry
try:
    registered = {r["script_path"] or r["name"]: r
                  for r in d1("SELECT name, script_path, status, last_run_at FROM agentsam_scripts")}
except:
    registered = {}

print(f"  {len(pkg_refs)} scripts referenced in package.json")
print(f"  {len(registered)} scripts in agentsam_scripts D1\n")

# ── audit loop ────────────────────────────────────────────────────────────────
results     = []
total       = sum(len(v) for v in GROUPS.values())
processed   = 0

for group, script_paths in GROUPS.items():
    for rel_path in script_paths:
        processed += 1
        fpath = REPO / rel_path
        fname = Path(rel_path).name

        print(f"[{processed}/{total}] {rel_path}", end=" ... ", flush=True)

        # pre-checks (no model needed)
        exists       = fpath.exists()
        in_pkg       = rel_path in pkg_refs or fname in str(pkg_refs)
        in_registry  = any(rel_path in k or fname in k for k in registered)
        size_bytes   = fpath.stat().st_size if exists else 0
        content      = fpath.read_text(errors="ignore") if exists else ""

        if not exists:
            print("MISSING")
            results.append({
                "group": group, "path": rel_path, "exists": False,
                "in_pkg": in_pkg, "in_registry": in_registry,
                "does": "FILE NOT FOUND", "status": "MISSING",
                "risk": "—", "suggestion": "Remove reference or restore file",
                "size_bytes": 0,
            })
            continue

        # send to ollama
        response = ollama(PROMPT, content)
        time.sleep(0.5)

        # parse response
        def extract(key):
            m = re.search(rf'{key}:\s*(.+)', response)
            return m.group(1).strip() if m else "—"

        status = extract("STATUS")
        print(status)

        results.append({
            "group": group, "path": rel_path, "exists": True,
            "in_pkg": in_pkg, "in_registry": in_registry,
            "size_bytes": size_bytes,
            "does": extract("DOES"),
            "status": status,
            "risk": extract("RISK"),
            "suggestion": extract("SUGGESTION"),
        })

# ── write report ──────────────────────────────────────────────────────────────
print(f"\nWriting report → {OUT_FILE.relative_to(REPO)}")

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
status_counts = {}
for r in results:
    status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1

lines = []
lines.append(f"# Deploy Script Audit")
lines.append(f"Generated: {now} | Model: {MODEL} | {len(results)} scripts\n")
lines.append("## Summary\n")
lines.append("| Status | Count |")
lines.append("|--------|-------|")
for s, n in sorted(status_counts.items()):
    lines.append(f"| {s} | {n} |")
lines.append(f"\n- Scripts in package.json: {len(pkg_refs)}")
lines.append(f"- Scripts in agentsam_scripts D1: {len(registered)}\n")
lines.append("---\n")

for group, script_paths in GROUPS.items():
    group_results = [r for r in results if r["group"] == group]
    if not group_results:
        continue
    lines.append(f"## {group}\n")
    for r in group_results:
        status_icon = {"ACTIVE": "✅", "LIKELY_DEAD": "💀",
                       "NEEDS_REVIEW": "⚠️", "MISSING": "❌"}.get(r["status"], "❓")
        lines.append(f"### {status_icon} `{r['path']}`")
        lines.append(f"**Size:** {r['size_bytes']//1024}KB | "
                     f"**In package.json:** {'yes' if r['in_pkg'] else 'no'} | "
                     f"**In D1 registry:** {'yes' if r['in_registry'] else 'no'}\n")
        lines.append(f"**Does:** {r['does']}  ")
        lines.append(f"**Risk:** {r['risk']}  ")
        lines.append(f"**Suggestion:** {r['suggestion']}\n")

lines.append("---")
lines.append(f"*Audited by {MODEL} via Ollama. Review before acting on suggestions.*")

OUT_FILE.write_text("\n".join(lines))
print(f"Done. {len(results)} scripts audited.")
print(f"Report: {OUT_FILE.relative_to(REPO)}")
