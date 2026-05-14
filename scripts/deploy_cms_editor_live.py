#!/usr/bin/env python3
"""
scripts/deploy_cms_editor_live.py
VERSION = "1.0.0"

Deploys the DesignStudioCMS editor as a live Cloudflare Worker.
- Reads DesignStudioCMS.html + companion files from Downloads
- Inlines all local JS (studio.jsx, tweaks-panel.jsx, gemini.js)
- Builds a CF Worker that serves the editor + proxies D1/R2 API calls
- Deploys to agentsam-cms-editor.meauxbility.workers.dev
- Wires D1 binding (inneranimalmedia-business) + R2 (agent-sam)

Usage:
  python3 scripts/deploy_cms_editor_live.py --dry-run
  python3 scripts/deploy_cms_editor_live.py
"""
import subprocess, json, sys, os, shutil, tempfile, re
from pathlib import Path
from datetime import datetime, timezone

DRY        = "--dry-run" in sys.argv
REPO       = Path(__file__).parent.parent.resolve()
ENV_FILE   = REPO / ".env.agentsam.local"
DOWNLOADS  = Path.home() / "Downloads" / "inneranimalmedia-cms-editor"
WORKER     = "agentsam-cms-editor"
CF_ACCOUNT = "ede6590ac0d2fb7daf155b35653457b2"
D1_ID      = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
DB         = "inneranimalmedia-business"

def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

def section(t):
    print(f"\n{'─'*64}\n  {t}\n{'─'*64}")

def run(cmd, cwd=None):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return r

# ── 1. Read source files ─────────────────────────────────────────────────────

section("1. Reading CMS editor source files")

if not DOWNLOADS.exists():
    print(f"  ✗ Not found: {DOWNLOADS}")
    print(f"    Move inneranimalmedia-cms-editor to ~/Downloads/")
    sys.exit(1)

files = {p.name: p for p in DOWNLOADS.iterdir() if p.is_file()}
print(f"  Found {len(files)} files: {', '.join(sorted(files.keys()))}")

html_file = files.get("DesignStudioCMS.html")
if not html_file:
    print("  ✗ DesignStudioCMS.html not found")
    sys.exit(1)

html = html_file.read_text()
print(f"  ✓ DesignStudioCMS.html ({len(html)} chars)")

# Read companion JS files
companion_js = {}
for name in ["studio.jsx", "tweaks-panel.jsx", "gemini.js"]:
    if name in files:
        companion_js[name] = files[name].read_text()
        print(f"  ✓ {name} ({len(companion_js[name])} chars)")

# ── 2. Inline local script references ───────────────────────────────────────

section("2. Inlining local JS references")

# Replace <script src="./studio.jsx"> etc with inline content
for name, content in companion_js.items():
    pattern = f'<script[^>]*src=["\']\.?/?{re.escape(name)}["\'][^>]*>'
    replacement = f'<script type="module">\n{content}\n'
    new_html, count = re.subn(pattern, replacement, html, flags=re.IGNORECASE)
    if count:
        html = new_html
        print(f"  ✓ Inlined {name} ({count} occurrence(s))")
    else:
        print(f"  — {name} not referenced in HTML (will upload separately to R2)")

# ── 3. Build worker.js that serves the editor + API proxy ───────────────────

section("3. Building CF Worker")

# Escape HTML for embedding in JS template literal
html_escaped = html.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

worker_js = f"""
// agentsam-cms-editor Worker
// Built: {datetime.now(timezone.utc).isoformat()}
// Serves DesignStudioCMS live with D1 + R2 access

const CMS_HTML = `{html_escaped}`;

export default {{
  async fetch(request, env, ctx) {{
    const url = new URL(request.url);
    const cors = {{
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }};

    if (request.method === "OPTIONS") {{
      return new Response(null, {{ status: 204, headers: cors }});
    }}

    // ── Health ───────────────────────────────────────────────────────
    if (url.pathname === "/health") {{
      return Response.json({{ ok: true, worker: "{WORKER}", built_by: "Agent Sam" }}, {{ headers: cors }});
    }}

    // ── D1 proxy — GET /api/d1?sql=SELECT... ────────────────────────
    if (url.pathname === "/api/d1" && env.DB) {{
      const sql = url.searchParams.get("sql") || "";
      if (!sql) return Response.json({{ error: "sql required" }}, {{ status: 400, headers: cors }});
      // Safety: only allow SELECT for now
      if (!sql.trim().toUpperCase().startsWith("SELECT")) {{
        return Response.json({{ error: "only SELECT allowed" }}, {{ status: 403, headers: cors }});
      }}
      try {{
        const {{ results }} = await env.DB.prepare(sql).all();
        return Response.json({{ results }}, {{ headers: cors }});
      }} catch(e) {{
        return Response.json({{ error: e.message }}, {{ status: 500, headers: cors }});
      }}
    }}

    // ── R2 proxy — GET /api/r2/:key ─────────────────────────────────
    if (url.pathname.startsWith("/api/r2/") && env.DASHBOARD) {{
      const key = url.pathname.replace("/api/r2/", "");
      try {{
        const obj = await env.DASHBOARD.get(key);
        if (!obj) return new Response("not found", {{ status: 404 }});
        const headers = {{ ...cors, "content-type": obj.httpMetadata?.contentType || "application/octet-stream" }};
        return new Response(obj.body, {{ headers }});
      }} catch(e) {{
        return Response.json({{ error: e.message }}, {{ status: 500, headers: cors }});
      }}
    }}

    // ── CMS Editor HTML (all other routes) ──────────────────────────
    return new Response(CMS_HTML, {{
      headers: {{ ...cors, "content-type": "text/html;charset=utf-8" }},
    }});
  }},
}};
"""

print(f"  ✓ worker.js ({len(worker_js)} chars)")

# ── 4. Scaffold + deploy ─────────────────────────────────────────────────────

section(f"4. Scaffolding wrangler project")

work_dir = Path(tempfile.mkdtemp(prefix=f"cms_editor_"))
print(f"  Working dir: {work_dir}")

wrangler_toml = f"""name = "{WORKER}"
main = "worker.js"
compatibility_date = "2024-01-01"
account_id = "{CF_ACCOUNT}"

[[d1_databases]]
binding = "DB"
database_name = "{DB}"
database_id = "{D1_ID}"

[[r2_buckets]]
binding = "DASHBOARD"
bucket_name = "agent-sam"
"""

(work_dir / "worker.js").write_text(worker_js)
(work_dir / "wrangler.toml").write_text(wrangler_toml)
print(f"  ✓ worker.js written")
print(f"  ✓ wrangler.toml with D1={DB} + R2=agent-sam")

# Also upload companion files to R2
section("5. Uploading companion files to R2")
for name, content in companion_js.items():
    r2_key = f"cms/editor/{name}"
    if DRY:
        print(f"  [DRY] r2 put {r2_key}")
    else:
        tmp = work_dir / name
        tmp.write_text(content)
        r = run(["npx","wrangler","r2","object","put",
                 f"agent-sam/{r2_key}",
                 "--file", str(tmp),
                 "--content-type", "text/javascript"])
        if r.returncode == 0:
            print(f"  ✓ R2: {r2_key}")
        else:
            print(f"  ⚠ R2 upload failed for {name}: {r.stderr[:100]}")

section(f"6. Deploying {WORKER}")

if DRY:
    print(f"  [DRY] wrangler deploy → https://{WORKER}.meauxbility.workers.dev")
else:
    r = run(["npx","wrangler","deploy","--config", str(work_dir/"wrangler.toml")], cwd=str(work_dir))
    if r.returncode != 0:
        print(f"  ✗ Deploy failed:\n{r.stderr[-500:]}")
        shutil.rmtree(work_dir, ignore_errors=True)
        sys.exit(1)

    # Parse actual URL from output
    url_lines = [l.strip() for l in r.stdout.splitlines() if "workers.dev" in l]
    live_url = url_lines[-1] if url_lines else f"https://{WORKER}.meauxbility.workers.dev"
    print(f"  ✓ Live: {live_url}")
    print(r.stdout[-200:])

shutil.rmtree(work_dir, ignore_errors=True)

print(f"\n{'═'*64}")
if DRY:
    print(f"  DRY RUN — nothing deployed")
else:
    print(f"  DEPLOYED: {live_url}")
    print(f"  Editor:   {live_url}/")
    print(f"  Health:   {live_url}/health")
    print(f"  D1 proxy: {live_url}/api/d1?sql=SELECT+slug+FROM+cms_pages+LIMIT+5")
print(f"{'═'*64}\n")
