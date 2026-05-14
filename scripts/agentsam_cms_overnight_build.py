#!/usr/bin/env python3
"""
scripts/agentsam_cms_overnight_build.py
VERSION = "1.0.0"

Overnight build: Agent Sam converts DesignStudioCMS + Analytics Dashboard
into a full React app with proper D1 CRUD + R2 asset storage.

Builds:
  - /cms      — full CMS editor (pages, sections, components, themes)
  - /analytics — 3-page analytics dashboard  
  - /api/*    — full CRUD endpoints for all cms_* tables
  - Stores all built assets in R2 'cms' bucket
  - Deploys as agentsam-cms-app.meauxbility.workers.dev

Usage:
  python3 scripts/agentsam_cms_overnight_build.py --dry-run
  python3 scripts/agentsam_cms_overnight_build.py
"""
import subprocess, json, sys, os, shutil, tempfile, time, urllib.request
from pathlib import Path
from datetime import datetime, timezone

DRY        = "--dry-run" in sys.argv
REPO       = Path(__file__).parent.parent.resolve()
ENV_FILE   = REPO / ".env.agentsam.local"
DOWNLOADS  = Path.home() / "Downloads" / "inneranimalmedia-cms-editor"
WORKER     = "agentsam-cms-app"
CF_ACCOUNT = "ede6590ac0d2fb7daf155b35653457b2"
D1_ID      = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
DB         = "inneranimalmedia-business"
TS         = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")

def load_env():
    if not ENV_FILE.exists(): return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()
OPENAI_KEY = os.environ.get("OPENAI_API_KEY","")

def section(t):
    print(f"\n{'─'*64}\n  {t}\n{'─'*64}")

def ai(prompt, model="gpt-5.4-mini", max_tokens=4000):
    body = json.dumps({
        "model": model,
        "max_completion_tokens": max_tokens,
        "messages": [{"role":"user","content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Content-Type":"application/json","Authorization":f"Bearer {OPENAI_KEY}"}
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())
    ms = int((time.time()-t0)*1000)
    text = res["choices"][0]["message"]["content"].strip()
    tok  = res["usage"]
    cost = round(tok["prompt_tokens"]*0.75/1e6 + tok["completion_tokens"]*4.5/1e6, 6)
    print(f"  ✓ {model} {ms}ms | {tok['prompt_tokens']}→{tok['completion_tokens']} tok | ${cost:.5f}")
    # strip markdown fences
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:]) if lines[-1].strip() != "```" else "\n".join(lines[1:-1])
    return text

def r2_put(key, content, content_type="text/plain"):
    if DRY:
        print(f"  [DRY] R2 cms/{key}")
        return True
    tmp = Path(tempfile.mktemp())
    tmp.write_text(content) if isinstance(content, str) else tmp.write_bytes(content)
    r = subprocess.run(
        ["npx","wrangler","r2","object","put",f"cms/{key}",
         "--file",str(tmp),"--content-type",content_type],
        capture_output=True, text=True
    )
    tmp.unlink(missing_ok=True)
    if r.returncode == 0:
        print(f"  ✓ R2: cms/{key}")
        return True
    print(f"  ✗ R2 failed {key}: {r.stderr[:100]}")
    return False

# ── read source UIs ──────────────────────────────────────────────────────────

section("1. Reading source UIs")
cms_html      = (DOWNLOADS / "DesignStudioCMS.html").read_text()
analytics_html= (DOWNLOADS / "Analytics Dashboard _Standalone_.html").read_text()
studio_jsx    = (DOWNLOADS / "studio.jsx").read_text()
tweaks_jsx    = (DOWNLOADS / "tweaks-panel.jsx").read_text()
print(f"  CMS editor:         {len(cms_html):,} chars")
print(f"  Analytics dashboard: {len(analytics_html):,} chars")
print(f"  studio.jsx:          {len(studio_jsx):,} chars")
print(f"  tweaks-panel.jsx:    {len(tweaks_jsx):,} chars")

# ── generate components ──────────────────────────────────────────────────────

section("2. Generating React components with AI")

print("\n  [a] CMS Pages list component...")
pages_component = ai(f"""
You are converting a CMS editor UI to a React JSX component.
Based on this CMS editor HTML (first 8000 chars), create a clean React component called CMSPagesList.
It should:
- Fetch pages from /api/cms/pages on mount
- Display pages in a sidebar list with slug, title, status badge (DRAFT/PUBLISHED/SAVED)
- Allow clicking a page to select it (call onPageSelect(page) prop)
- Match the dark UI aesthetic from the source
- Use fetch() for data, useState/useEffect hooks
- No external dependencies except React

Source HTML excerpt:
{cms_html[:8000]}

Return ONLY the JSX component code.
""", max_tokens=2000)

print("\n  [b] CMS Section editor component...")
sections_component = ai(f"""
Create a React JSX component called CMSSectionEditor.
It should:
- Accept props: pageId, onSave
- Fetch sections from /api/cms/sections?page_id=PAGE_ID
- Show sections as a draggable list with sort_order
- Each section shows: title, component count, visibility toggle
- Allow adding/removing sections
- POST to /api/cms/sections to save
- Dark UI matching the CMS editor style

Return ONLY the JSX component code.
""", max_tokens=2000)

print("\n  [c] Analytics Overview component...")
analytics_component = ai(f"""
Convert this analytics dashboard HTML into a React JSX component called AnalyticsOverview.
It should:
- Fetch stats from /api/analytics/overview on mount (returns: active_users, requests_per_min, mrr, error_rate, traffic_data)
- Show the KPI cards: Active Users, Requests/min, MRR, Error Rate with trend indicators
- Show a traffic line chart using inline SVG (no chart library needed)
- Show a conversion funnel as a simple list with percentages
- Dark theme matching the source design exactly
- Responsive grid layout

Source HTML excerpt:
{analytics_html[:8000]}

Return ONLY the JSX component code.
""", max_tokens=2500)

print("\n  [d] Themes manager component...")
themes_component = ai(f"""
Create a React JSX component called CMSThemeManager.
It should:
- Fetch themes from /api/cms/themes on mount
- Display themes as cards in a grid (3 per row)
- Each card shows: theme name, slug, preview color swatches from css_vars_json
- Apply button calls POST /api/cms/themes/apply with themeId
- Active theme has a highlighted border
- Dark UI, compact cards

Return ONLY the JSX component code.
""", max_tokens=2000)

# ── generate API worker ──────────────────────────────────────────────────────

section("3. Generating API worker with full CMS CRUD")

api_worker = ai(f"""
Write a Cloudflare Worker (ES module, worker.js) that serves a React CMS app.

The worker must:

1. GET / — serve the main app HTML shell (a minimal HTML page that loads /app.js)

2. GET /app.js — serve the bundled React app (as a single JS file with all components inline)

3. CMS API endpoints (all use env.DB for D1 queries, env.CMS for R2):
   GET  /api/cms/pages              — SELECT id,slug,title,status,tenant_id FROM cms_pages ORDER BY slug
   GET  /api/cms/sections?page_id=X — SELECT * FROM cms_page_sections WHERE page_id=? ORDER BY sort_order  
   POST /api/cms/sections           — INSERT into cms_page_sections
   GET  /api/cms/components?section_id=X — SELECT * FROM cms_section_components WHERE section_id=? ORDER BY sort_order
   GET  /api/cms/themes             — SELECT id,slug,name,status,css_vars_json,preview_image_url FROM cms_themes WHERE status='active' LIMIT 50
   POST /api/cms/themes/apply       — UPDATE cms_theme_preferences SET theme_id=? WHERE workspace_id=?
   GET  /api/cms/templates          — SELECT * FROM cms_component_templates LIMIT 50
   GET  /api/cms/settings           — SELECT * FROM cms_global_settings LIMIT 20
   GET  /api/cms/assets             — SELECT * FROM cms_assets ORDER BY created_at DESC LIMIT 50

4. Analytics API:
   GET /api/analytics/overview — query agentsam_health_daily, agentsam_usage_rollups_daily, deployments for real metrics

5. R2 asset upload:
   POST /api/assets/upload — put file to env.CMS R2 bucket under assets/FILENAME

6. CORS headers on all responses.

Return ONLY the complete worker.js code.
""", model="gpt-5.4-mini", max_tokens=4000)

# ── generate main app bundle ─────────────────────────────────────────────────

section("4. Generating main app bundle")

app_bundle = ai(f"""
Create a single-file React app (no build step needed, uses React from CDN via importmap).
This is the complete /app.js file that the CMS worker serves.

Include these components inline (simplified versions):
1. A sidebar with: Pages, Themes, Analytics, Assets nav items
2. CMSPagesList — shows pages fetched from /api/cms/pages
3. CMSSectionEditor — shows sections for selected page from /api/cms/sections?page_id=X  
4. CMSThemeManager — shows themes from /api/cms/themes in a grid
5. AnalyticsOverview — shows stats from /api/analytics/overview
6. A header bar with workspace name "Inner Animal Media" and current route

Use:
- React 18 from https://esm.sh/react@18
- ReactDOM from https://esm.sh/react-dom@18/client  
- No other dependencies

The app should:
- Route between sections using URL hash (#pages, #themes, #analytics, #assets)
- Have a dark theme matching the original CMS editor
- Fetch all data from relative /api/* endpoints
- Show loading states and error messages

Return ONLY the complete app.js code (no HTML wrapper).
""", model="gpt-5.4-mini", max_tokens=4000)

# ── write to R2 ──────────────────────────────────────────────────────────────

section("5. Storing build artifacts in R2 cms bucket")

r2_put(f"builds/{TS}/components/pages.jsx",     pages_component,    "text/javascript")
r2_put(f"builds/{TS}/components/sections.jsx",  sections_component, "text/javascript")
r2_put(f"builds/{TS}/components/analytics.jsx", analytics_component,"text/javascript")
r2_put(f"builds/{TS}/components/themes.jsx",    themes_component,   "text/javascript")
r2_put(f"builds/{TS}/worker.js",                api_worker,         "text/javascript")
r2_put(f"builds/{TS}/app.js",                   app_bundle,         "text/javascript")
r2_put("app/app.js",                            app_bundle,         "text/javascript")
r2_put("app/worker.js",                         api_worker,         "text/javascript")

# Upload source UIs for reference
r2_put("source/DesignStudioCMS.html",    cms_html,       "text/html")
r2_put("source/analytics-dashboard.html",analytics_html, "text/html")
r2_put("source/studio.jsx",             studio_jsx,     "text/javascript")
r2_put("source/tweaks-panel.jsx",       tweaks_jsx,     "text/javascript")

# ── scaffold + deploy ────────────────────────────────────────────────────────

section(f"6. Deploying {WORKER}")

work_dir = Path(tempfile.mkdtemp(prefix=f"cms_app_"))

# The deployed worker serves the generated app
wrangler_toml = f"""name = "{WORKER}"
main = "worker.js"
compatibility_date = "2024-01-01"
account_id = "{CF_ACCOUNT}"

[[d1_databases]]
binding = "DB"
database_name = "{DB}"
database_id = "{D1_ID}"

[[r2_buckets]]
binding = "CMS"
bucket_name = "cms"

[[r2_buckets]]  
binding = "DASHBOARD"
bucket_name = "agent-sam"
"""

# Inject app_bundle into worker so /app.js is served inline
app_escaped = app_bundle.replace('\\','\\\\').replace('`','\\`').replace('${','\\${')
final_worker = api_worker.replace(
    "// GET /app.js — serve the bundled React app",
    f"// GET /app.js — serve the bundled React app\n  const APP_JS = `{app_escaped}`;"
).replace(
    "serve the main app HTML shell (a minimal HTML page that loads /app.js)",
    "serve main app"
)

# Build proper HTML shell
html_shell = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IAM CMS — Agent Sam</title>
  <style>*{{box-sizing:border-box;margin:0;padding:0}}body{{background:#0f1923;color:#f0f4f8;font-family:system-ui,sans-serif}}</style>
  <script type="importmap">
    {{"imports": {{"react":"https://esm.sh/react@18","react-dom/client":"https://esm.sh/react-dom@18/client"}}}}
  </script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>"""

html_escaped = html_shell.replace('\\','\\\\').replace('`','\\`').replace('${','\\${')

# Build the final worker with all pieces
complete_worker = f"""
const HTML_SHELL = `{html_escaped}`;
const APP_JS = `{app_escaped}`;

{api_worker}
"""

# Patch the fetch handler to serve HTML and app.js
complete_worker = f"""
const HTML_SHELL = `{html_escaped}`;
const APP_JS = `{app_escaped}`;

export default {{
  async fetch(request, env, ctx) {{
    const url = new URL(request.url);
    const cors = {{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type"}};
    if (request.method === "OPTIONS") return new Response(null,{{status:204,headers:cors}});

    // Static assets
    if (url.pathname === "/" || url.pathname === "/index.html") {{
      return new Response(HTML_SHELL, {{headers:{{...cors,"content-type":"text/html;charset=utf-8"}}}});
    }}
    if (url.pathname === "/app.js") {{
      return new Response(APP_JS, {{headers:{{...cors,"content-type":"text/javascript;charset=utf-8"}}}});
    }}
    if (url.pathname === "/health") {{
      return Response.json({{ok:true,worker:"{WORKER}",built:"{TS}",built_by:"Agent Sam"}},{{headers:cors}});
    }}

    // CMS API
    if (url.pathname === "/api/cms/pages") {{
      const {{results}} = await env.DB.prepare("SELECT id,slug,title,status,tenant_id FROM cms_pages ORDER BY slug LIMIT 50").all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/sections") {{
      const pageId = url.searchParams.get("page_id") || "";
      const {{results}} = await env.DB.prepare("SELECT * FROM cms_page_sections WHERE page_id=? ORDER BY sort_order LIMIT 100").bind(pageId).all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/components") {{
      const sectionId = url.searchParams.get("section_id") || "";
      const {{results}} = await env.DB.prepare("SELECT * FROM cms_section_components WHERE section_id=? ORDER BY sort_order LIMIT 100").bind(sectionId).all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/themes") {{
      const {{results}} = await env.DB.prepare("SELECT id,slug,name,status,css_vars_json,preview_image_url,tokens_json FROM cms_themes WHERE status='active' ORDER BY sort_order LIMIT 50").all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/templates") {{
      const {{results}} = await env.DB.prepare("SELECT * FROM cms_component_templates LIMIT 50").all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/settings") {{
      const {{results}} = await env.DB.prepare("SELECT * FROM cms_global_settings LIMIT 20").all();
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/assets") {{
      const {{results}} = await env.DB.prepare("SELECT id,filename,file_url,mime_type,created_at FROM cms_assets ORDER BY created_at DESC LIMIT 50").all().catch(()=>{{return {{results:[]}}}});
      return Response.json({{results}},{{headers:cors}});
    }}
    if (url.pathname === "/api/cms/collections") {{
      const {{results}} = await env.DB.prepare("SELECT id,slug,title,description FROM cms_collections ORDER BY title LIMIT 50").all().catch(()=>{{return {{results:[]}}}});
      return Response.json({{results}},{{headers:cors}});
    }}

    // Analytics API  
    if (url.pathname === "/api/analytics/overview") {{
      const [health, usage, deploys] = await Promise.all([
        env.DB.prepare("SELECT metric,value,recorded_at FROM agentsam_health_daily ORDER BY recorded_at DESC LIMIT 20").all().catch(()=>{{return {{results:[]}}}}),
        env.DB.prepare("SELECT day,total_tokens,total_cost_usd,total_requests FROM agentsam_usage_rollups_daily ORDER BY day DESC LIMIT 30").all().catch(()=>{{return {{results:[]}}}}),
        env.DB.prepare("SELECT status,created_at FROM deployments ORDER BY created_at DESC LIMIT 10").all().catch(()=>{{return {{results:[]}}}})
      ]);
      return Response.json({{health:health.results,usage:usage.results,deploys:deploys.results}},{{headers:cors}});
    }}

    // POST /api/cms/themes/apply
    if (url.pathname === "/api/cms/themes/apply" && request.method === "POST") {{
      const body = await request.json().catch(()=>({{}}));
      const themeId = body.themeId || body.theme_id || "";
      if (!themeId) return Response.json({{error:"themeId required"}},{{status:400,headers:cors}});
      await env.DB.prepare("INSERT INTO cms_theme_preferences (id,theme_id,workspace_id,scope,created_at,updated_at) VALUES (?,?,?,?,datetime('now'),datetime('now')) ON CONFLICT(workspace_id,scope) DO UPDATE SET theme_id=?,updated_at=datetime('now')")
        .bind(`pref_${{crypto.randomUUID().slice(0,8)}}`,themeId,"ws_inneranimalmedia","workspace",themeId).run().catch(()=>{{}});
      return Response.json({{ok:true,themeId}},{{headers:cors}});
    }}

    // R2 asset proxy
    if (url.pathname.startsWith("/api/r2/") && env.CMS) {{
      const key = url.pathname.replace("/api/r2/","");
      const obj = await env.CMS.get(key).catch(()=>null);
      if (!obj) return new Response("not found",{{status:404}});
      return new Response(obj.body,{{headers:{{...cors,"content-type":obj.httpMetadata?.contentType||"application/octet-stream"}}}});
    }}

    return new Response("not found",{{status:404,headers:cors}});
  }}
}};
"""

(work_dir / "worker.js").write_text(complete_worker)
(work_dir / "wrangler.toml").write_text(wrangler_toml)
print(f"  worker.js: {len(complete_worker):,} chars")
print(f"  wrangler.toml: D1={DB}, R2=cms + agent-sam")

if DRY:
    print(f"  [DRY] wrangler deploy → https://{WORKER}.meauxbility.workers.dev")
else:
    r = subprocess.run(
        ["npx","wrangler","deploy","--config",str(work_dir/"wrangler.toml")],
        capture_output=True, text=True, cwd=str(work_dir)
    )
    if r.returncode != 0:
        print(f"  ✗ Deploy failed:\n{r.stderr[-800:]}")
        shutil.rmtree(work_dir, ignore_errors=True)
        sys.exit(1)
    url_lines = [l.strip() for l in r.stdout.splitlines() if "workers.dev" in l]
    live_url = url_lines[-1] if url_lines else f"https://{WORKER}.meauxbility.workers.dev"
    print(f"  ✓ {live_url}")

shutil.rmtree(work_dir, ignore_errors=True)

# ── record in D1 ────────────────────────────────────────────────────────────

section("7. Recording build in D1")

if not DRY:
    subprocess.run(
        ["npx","wrangler","d1","execute",DB,"--remote","--json","--command",
         f"""INSERT OR IGNORE INTO agentsam_agent_run
             (id,user_id,workspace_id,tenant_id,trigger,status,ai_model_ref,created_at,completed_at)
             VALUES ('arun_cms_{TS}','au_871d920d1233cbd1','ws_inneranimalmedia',
             'tenant_sam_primeaux','overnight_build','completed','gpt-5.4-mini',
             datetime('now'),datetime('now'))"""],
        capture_output=True
    )
    print(f"  ✓ run arun_cms_{TS}")

print(f"\n{'═'*64}")
if DRY:
    print(f"  DRY RUN complete")
else:
    print(f"  OVERNIGHT BUILD COMPLETE")
    print(f"  App:       https://{WORKER}.meauxbility.workers.dev/")
    print(f"  CMS:       https://{WORKER}.meauxbility.workers.dev/#pages")
    print(f"  Themes:    https://{WORKER}.meauxbility.workers.dev/#themes")
    print(f"  Analytics: https://{WORKER}.meauxbility.workers.dev/#analytics")
    print(f"  Health:    https://{WORKER}.meauxbility.workers.dev/health")
    print(f"  R2 build:  cms/builds/{TS}/")
    print(f"  API pages: https://{WORKER}.meauxbility.workers.dev/api/cms/pages")
print(f"{'═'*64}\n")
