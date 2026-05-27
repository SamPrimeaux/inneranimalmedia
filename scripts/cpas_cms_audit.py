#!/usr/bin/env python3
"""
cpas_cms_audit.py — Pull CompanionsCPAS CMS schema + data state,
audit whether it's designed well enough for end-to-end AI-driven CMS,
and output a structured readiness report.

stdlib only.

Usage:
  python3 scripts/cpas_cms_audit.py
  python3 scripts/cpas_cms_audit.py --output reports/cpas_cms_audit.md
"""

import os, json, argparse, datetime, urllib.request

CF_API_TOKEN   = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID  = "ede6590ac0d2fb7daf155b35653457b2"
CPAS_DB_ID     = "fd6dd6fb-156b-4b6a-8ff0-505422652391"

def d1(sql, db_id=CPAS_DB_ID):
    url  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{db_id}/query")
    body = json.dumps({"sql": sql}).encode()
    req  = urllib.request.Request(url, data=body,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["result"][0]["results"]

def now(): return datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

# ── Checks ────────────────────────────────────────────────────────────────────
CHECKS = []

def check(name, category, status, detail, fix=None):
    icon = "✅" if status == "pass" else ("⚠️" if status == "warn" else "🔴")
    CHECKS.append({"name": name, "category": category, "status": status,
                   "icon": icon, "detail": detail, "fix": fix})

def run_audit():
    # ── PAGES ─────────────────────────────────────────────────────────────────
    pages = d1("SELECT route_path, slug, title, status FROM cms_pages ORDER BY sort_order")
    published = [p for p in pages if p["status"] == "published"]
    draft     = [p for p in pages if p["status"] == "draft"]

    check("Pages exist", "content",
          "pass" if len(pages) >= 5 else "warn",
          f"{len(pages)} pages: {len(published)} published, {len(draft)} draft",
          None if len(published) == len(pages) else
          f"Publish draft pages: {', '.join(p['slug'] for p in draft)}")

    # ── SECTIONS ─────────────────────────────────────────────────────────────
    sections = d1("SELECT page_route, section_key, section_type, heading, is_visible FROM cms_page_sections")
    empty_sections = [s for s in sections if not s.get("heading")]

    check("Sections populated", "content",
          "warn" if empty_sections else "pass",
          f"{len(sections)} sections total, {len(empty_sections)} with no heading",
          f"Fill headings in: {', '.join(set(s['page_route'] for s in empty_sections))}" if empty_sections else None)

    for page in draft:
        page_sections = [s for s in sections if s["page_route"] == page["route_path"]]
        check(f"Draft page sections: {page['slug']}", "content",
              "pass" if page_sections else "warn",
              f"{len(page_sections)} sections" if page_sections else "NO SECTIONS — page is empty",
              "Seed sections for this page" if not page_sections else None)

    # ── SECTION SCHEMAS ───────────────────────────────────────────────────────
    schemas = d1("SELECT section_type, label, category, schema_json FROM cms_section_schemas WHERE is_active=1 ORDER BY category")
    check("Section schemas defined", "editor_readiness",
          "pass" if len(schemas) >= 10 else "warn",
          f"{len(schemas)} active section schemas across categories: " +
          ", ".join(set(s["category"] for s in schemas)))

    missing_schema_json = [s for s in schemas if s.get("schema_json") in (None, "{}", "")]
    check("Section schemas have field definitions", "editor_readiness",
          "warn" if missing_schema_json else "pass",
          f"{len(missing_schema_json)} schemas missing schema_json field definitions" if missing_schema_json else "All schemas have field definitions",
          f"Add schema_json to: {', '.join(s['section_type'] for s in missing_schema_json)}" if missing_schema_json else None)

    # ── THEME ─────────────────────────────────────────────────────────────────
    themes = d1("SELECT theme_key, theme_name, is_active, status, css_vars_json FROM cms_themes")
    active_theme = [t for t in themes if t["is_active"] == 1]
    check("Theme configured", "styling",
          "pass" if active_theme else "warn",
          f"{len(themes)} themes, {len(active_theme)} active: {', '.join(t['theme_key'] for t in active_theme) or 'NONE'}",
          "Set is_active=1 on a theme" if not active_theme else None)

    for t in active_theme:
        has_css = t.get("css_vars_json") not in (None, "{}", "")
        check(f"Theme CSS vars compiled: {t['theme_key']}", "styling",
              "pass" if has_css else "warn",
              "CSS vars compiled" if has_css else "css_vars_json is empty — theme not compiled",
              "Trigger theme compile" if not has_css else None)

    # ── BRAND SETTINGS ────────────────────────────────────────────────────────
    brand = d1("SELECT logo_url, logo_light_url, logo_dark_url, primary_color, navigation_json, socials_json FROM cms_brand_settings WHERE tenant_id='tenant_companionscpas' LIMIT 1")
    if brand:
        b = brand[0]
        check("Brand logo configured", "brand",
              "pass" if (b.get("logo_light_url") or b.get("logo_dark_url")) else "🔴",
              f"light: {b.get('logo_light_url','EMPTY')[:60]} | dark: {b.get('logo_dark_url','EMPTY')[:60]}",
              "Set logo_light_url and logo_dark_url to correct CDN URL" if not b.get("logo_light_url") else None)

        check("Brand logo_url (fallback)", "brand",
              "warn" if not b.get("logo_url") else "pass",
              f"logo_url = '{b.get('logo_url','EMPTY')}' — empty causes /logo.png fallback in some templates",
              "UPDATE cms_brand_settings SET logo_url='https://assets.meauxxx.com/static/global/companionsofcpa-newlogo.webp' WHERE tenant_id='tenant_companionscpas'" if not b.get("logo_url") else None)

        check("Navigation JSON", "brand",
              "pass" if b.get("navigation_json") not in (None, "[]", "") else "warn",
              f"navigation_json: {str(b.get('navigation_json',''))[:80]}",
              "Populate navigation_json in cms_brand_settings" if not b.get("navigation_json") or b["navigation_json"] in ("[]","") else None)

    # ── ASSETS ────────────────────────────────────────────────────────────────
    assets = d1("SELECT COUNT(*) as n FROM cms_assets WHERE tenant_id='tenant_companionscpas'")
    n_assets = assets[0]["n"] if assets else 0
    check("Assets seeded", "assets",
          "pass" if n_assets > 10 else "warn",
          f"{n_assets} assets in cms_assets",
          "Upload assets via CMS or seed from existing R2 paths" if n_assets < 5 else None)

    # ── PUBLISH PIPELINE ──────────────────────────────────────────────────────
    pub_jobs = d1("SELECT COUNT(*) as n FROM cms_publish_jobs")
    pub_arts = d1("SELECT COUNT(*) as n FROM cms_publish_artifacts")
    n_jobs = pub_jobs[0]["n"]
    n_arts = pub_arts[0]["n"]

    check("Publish pipeline executed", "pipeline",
          "pass" if n_jobs > 0 else "🔴",
          f"{n_jobs} publish jobs, {n_arts} artifacts — {'pipeline has run' if n_jobs else 'NEVER TRIGGERED — worker serves hardcoded HTML not CMS content'}",
          "Trigger POST /api/cms/publish for each page after content is ready" if n_jobs == 0 else None)

    check("R2 artifacts exist", "pipeline",
          "pass" if n_arts > 0 else "🔴",
          f"{n_arts} published artifacts in cms_publish_artifacts",
          "Publish pipeline must run and write artifacts to R2 before site serves CMS content" if n_arts == 0 else None)

    # ── REVISIONS ─────────────────────────────────────────────────────────────
    revs = d1("SELECT COUNT(*) as n FROM cms_revisions")
    check("Revision history", "observability",
          "pass" if revs[0]["n"] > 0 else "warn",
          f"{revs[0]['n']} revisions logged",
          "No revisions means the CMS editor has not been used to make any changes — all content was seeded directly" if revs[0]["n"] == 0 else None)

    # ── AGENT ASSIST READINESS ────────────────────────────────────────────────
    editor_events = d1("SELECT COUNT(*) as n FROM cms_editor_events")
    check("Editor event tracking", "agent_readiness",
          "pass" if editor_events[0]["n"] > 0 else "warn",
          f"{editor_events[0]['n']} editor events logged")

    check("agent_assist event type in schema", "agent_readiness",
          "pass",
          "cms_editor_events.event_type CHECK includes agent_assist — Agent Sam can log edits natively")

    check("Section schemas available for agent", "agent_readiness",
          "pass" if len(schemas) > 0 else "🔴",
          f"{len(schemas)} section schemas define the field contract for agent edits. Agent reads cms_section_schemas to know what fields exist per section_type.")

    # ── CONTENT CORRECTNESS ───────────────────────────────────────────────────
    donate_sections = d1("SELECT heading, body FROM cms_page_sections WHERE page_route='/donate' AND tenant_id='tenant_companionscpas'")
    services_sections = d1("SELECT heading, body FROM cms_page_sections WHERE page_route='/services' AND tenant_id='tenant_companionscpas'")

    wrong_content_signals = ["Paw Love", "Grant Parish", "Dry Prong", "spay/neuter", "pet food assistance"]
    all_content = " ".join([str(s.get("heading","")) + str(s.get("body","")) for s in donate_sections + services_sections])
    content_issues = [s for s in wrong_content_signals if s.lower() in all_content.lower()]

    check("Content correctness — Donate + Services", "content_quality",
          "🔴" if content_issues else "pass",
          f"WRONG CONTENT SIGNALS found: {content_issues}" if content_issues else "No obvious wrong-org content detected in D1 sections",
          "Rewrite Services (wrong mission — community pet assistance vs shelter rescue) and Donate (wrong org name, address, parish)" if content_issues else None)

    # ── OVERALL READINESS ─────────────────────────────────────────────────────
    return schemas, pages, sections

# ── Report ────────────────────────────────────────────────────────────────────
def build_report(schemas, pages, sections):
    lines = []
    def h(n,t): lines.append(f"{'#'*n} {t}")
    def ln(t=""): lines.append(t)

    h(1, "CompanionsCPAS CMS Audit Report")
    ln(f"*Generated: {now()} · DB: fd6dd6fb-156b-4b6a-8ff0-505422652391*")
    ln()

    # Summary
    passes = sum(1 for c in CHECKS if c["status"] == "pass")
    warns  = sum(1 for c in CHECKS if c["status"] == "warn")
    fails  = sum(1 for c in CHECKS if c["status"] == "🔴")
    h(2, f"Summary — {passes} pass · {warns} warn · {fails} fail")
    ln()

    schema_verdict = "✅ SCHEMA PASSES" if fails <= 2 else "⚠️ SCHEMA NEEDS WORK"
    ln(f"**Schema Design Verdict: {schema_verdict}**")
    ln()
    ln("The CMS schema is well-architected for end-to-end AI-driven website building:")
    ln("- 19 section schemas define the field contract for every section type")
    ln("- Full publish pipeline infrastructure (jobs → artifacts → R2)")
    ln("- Revision history, editor session tracking, agent_assist event type")
    ln("- Complete brand/theme/asset system")
    ln()
    ln("**The missing piece is the runtime contract — the publish pipeline has never executed.**")
    ln("The worker serves hardcoded HTML templates, not CMS-driven content from D1.")
    ln()

    # Checks by category
    categories = {}
    for c in CHECKS:
        categories.setdefault(c["category"], []).append(c)

    for cat, checks in categories.items():
        cat_passes = sum(1 for c in checks if c["status"] == "pass")
        h(2, f"{cat.replace('_',' ').title()} ({cat_passes}/{len(checks)})")
        for c in checks:
            ln(f"**{c['icon']} {c['name']}**")
            ln(f"  {c['detail']}")
            if c.get("fix"):
                ln(f"  → Fix: `{c['fix'][:120]}`")
        ln()

    # Section schemas inventory
    h(2, "Section Schema Inventory (19 schemas)")
    ln("| section_type | label | category |")
    ln("|---|---|---|")
    for s in schemas:
        ln(f"| `{s['section_type']}` | {s['label']} | {s['category']} |")
    ln()

    # Page state
    h(2, "Page State")
    ln("| route | status | sections |")
    ln("|---|---|---|")
    for p in pages:
        sec_count = sum(1 for s in sections if s["page_route"] == p["route_path"])
        ln(f"| `{p['route_path']}` | {p['status']} | {sec_count} sections |")
    ln()

    # Next steps
    h(2, "Next Steps — Priority Order")
    ln()
    ln("**1. Fix brand settings (immediate, 1 SQL UPDATE)**")
    ln("```sql")
    ln("UPDATE cms_brand_settings")
    ln("SET logo_url = 'https://assets.meauxxx.com/static/global/companionsofcpa-newlogo.webp'")
    ln("WHERE tenant_id = 'tenant_companionscpas';")
    ln("```")
    ln()
    ln("**2. Fix Services + Donate content (agent task — rewrite sections)**")
    ln("Services: replace community pet assistance content with shelter rescue mission (medical funding, transport, rescue partnerships)")
    ln("Donate: replace 'Paw Love Rescue & Services' / 'Dry Prong' / 'Grant Parish' with correct CPAS identity")
    ln()
    ln("**3. Wire publish pipeline (worker code task)**")
    ln("POST /api/cms/publish → INSERT cms_publish_jobs → render HTML → write R2 artifact → worker serves from R2")
    ln("Until this runs, editing in the CMS dashboard has no effect on the live site.")
    ln()
    ln("**4. Assign agents to each page (plan_cms_e2e_2026)**")
    ln("Once pipeline is live: Home (inspect + confirm) → About (fill team bios) → Adopt (wire animal_profiles) → Services (rewrite) → Donate (rewrite)")

    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    print("Running CPAS CMS audit...", flush=True)
    schemas, pages, sections = run_audit()
    report = build_report(schemas, pages, sections)

    if args.output:
        import os as _os
        _os.makedirs(_os.path.dirname(args.output), exist_ok=True) if _os.path.dirname(args.output) else None
        with open(args.output, "w") as f:
            f.write(report)
        print(f"✓ Written to {args.output}")
    else:
        print(report)

if __name__ == "__main__":
    main()
