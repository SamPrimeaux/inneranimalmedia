#!/usr/bin/env python3

import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path

REPO = Path(".").resolve()

SOURCE = Path("/Users/samprimeaux/Downloads/agentsam_platform_services.html")

OUT = REPO / "artifacts" / "cms_homepage_section_audit" / "selected_work_replacement" / "stage"
REPO_SECTION_DIR = REPO / "cms" / "sections" / "homepage"

SECTION_KEY = "agent_sam_platform_services"
SOURCE_NAME = "agentsam_platform_services.html"

R2_BUCKET = "inneranimalmedia-assets"
R2_KEY_PREFIX = "cms/sections/homepage/agent_sam_platform_services"

WRANGLER_CONFIG = "wrangler.production.toml"


def sha256_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print("WROTE:", path)


def run(cmd):
    print("RUN:", " ".join(cmd))
    p = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return {
        "cmd": cmd,
        "returncode": p.returncode,
        "stdout": p.stdout,
        "stderr": p.stderr,
    }


def main():
    if not SOURCE.exists():
        raise SystemExit("Missing source file: " + str(SOURCE))

    OUT.mkdir(parents=True, exist_ok=True)
    REPO_SECTION_DIR.mkdir(parents=True, exist_ok=True)

    repo_copy = REPO_SECTION_DIR / SOURCE_NAME
    artifact_copy = OUT / SOURCE_NAME

    shutil.copy2(SOURCE, repo_copy)
    shutil.copy2(SOURCE, artifact_copy)

    size = repo_copy.stat().st_size
    digest = sha256_file(repo_copy)
    short_hash = digest[:12]

    r2_key = R2_KEY_PREFIX + "/" + short_hash + "/" + SOURCE_NAME
    r2_uri = "r2://" + R2_BUCKET + "/" + r2_key
    public_guess = "https://assets.inneranimalmedia.com/" + r2_key

    manifest = {
        "section_key": SECTION_KEY,
        "source_file": str(SOURCE),
        "repo_copy": str(repo_copy.relative_to(REPO)),
        "artifact_copy": str(artifact_copy.relative_to(REPO)),
        "bytes": size,
        "sha256": digest,
        "r2_bucket": R2_BUCKET,
        "r2_key": r2_key,
        "r2_uri": r2_uri,
        "public_url_guess": public_guess,
        "created_at": int(time.time()),
        "purpose": "Replacement source/template artifact for homepage selected_work slot.",
    }

    write_json(OUT / "stage_manifest.json", manifest)

    r2_cmd = (
        "cd " + str(REPO) + "\n"
        "npx wrangler r2 object put "
        + R2_BUCKET + "/" + r2_key
        + " --file "
        + str(repo_copy)
        + " -c "
        + WRANGLER_CONFIG
        + "\n"
    )

    write_text(OUT / "upload_to_r2.sh", r2_cmd)

    section_data = {
        "eyebrow": {
            "text": "Agent Sam Platform",
            "status_dot": True
        },
        "headline": "The all-in-one command center for intelligent agents",
        "subheadline": "Build, deploy, and optimize production-ready AI workflows with connected tools, live data, model routing, CMS components, and real execution proof.",
        "cta_primary": {
            "label": "Explore Agent Sam",
            "href": "/dashboard/agent"
        },
        "cta_secondary": {
            "label": "View capabilities",
            "href": "/dashboard/analytics/overview"
        },
        "feature_cards": [
            {
                "key": "build",
                "title": "Build",
                "description": "Design agents, workflows, prompts, tools, commands, and CMS sections from a visual-first or code-first system."
            },
            {
                "key": "deploy",
                "title": "Deploy",
                "description": "Connect Agent Sam to real infrastructure: Cloudflare Workers, D1, R2, GitHub, Supabase, Gmail, Calendar, and public pages."
            },
            {
                "key": "optimize",
                "title": "Optimize",
                "description": "Track evals, traces, model costs, routing quality, workflow success, and tool reliability from one analytics layer."
            }
        ],
        "template_artifact": {
            "repo_path": str(repo_copy.relative_to(REPO)),
            "r2_key": r2_key,
            "sha256": digest,
            "bytes": size
        }
    }

    write_json(OUT / "section_data_seed.json", section_data)

    sql = []
    sql.append("-- Review before running.")
    sql.append("-- Goal: replace homepage selected_work section with agent_sam_platform_services.")
    sql.append("-- This is intentionally conservative because your exact cms_page_sections columns may vary.")
    sql.append("")
    sql.append("-- 1) Find homepage page id")
    sql.append("SELECT id, path, slug, title FROM cms_pages WHERE path = '/' OR route_path = '/' OR slug = 'home' LIMIT 10;")
    sql.append("")
    sql.append("-- 2) Find old selected_work section")
    sql.append("SELECT * FROM cms_page_sections WHERE section_type LIKE '%selected%' OR section_name LIKE '%Selected%' OR section_key = 'selected_work';")
    sql.append("")
    sql.append("-- 3) Suggested section_data payload is in:")
    sql.append("-- artifacts/cms_homepage_section_audit/selected_work_replacement/stage/section_data_seed.json")
    sql.append("")
    sql.append("-- 4) Safer update pattern after confirming page_id + columns:")
    sql.append("-- UPDATE cms_page_sections")
    sql.append("-- SET section_type = 'agent_sam_platform_services',")
    sql.append("--     section_name = 'Agent Sam Platform Services',")
    sql.append("--     section_data = '<PASTE JSON FROM section_data_seed.json>',")
    sql.append("--     is_visible = 1")
    sql.append("-- WHERE page_id = '<HOME_PAGE_ID>' AND sort_order = 3;")
    sql.append("")
    sql.append("-- 5) Safer alternative:")
    sql.append("-- Mark selected_work inactive and insert a fresh row at sort_order 3 after checking required columns.")
    sql.append("")

    write_text(OUT / "cms_seed_review.sql", "\n".join(sql))

    readme = []
    readme.append("# Agent Sam Platform Services Stage")
    readme.append("")
    readme.append("This stages `agentsam_platform_services.html` for the homepage replacement.")
    readme.append("")
    readme.append("## Files")
    readme.append("")
    readme.append("- Repo copy: `" + str(repo_copy.relative_to(REPO)) + "`")
    readme.append("- Manifest: `stage_manifest.json`")
    readme.append("- R2 upload command: `upload_to_r2.sh`")
    readme.append("- Section seed JSON: `section_data_seed.json`")
    readme.append("- SQL review notes: `cms_seed_review.sql`")
    readme.append("")
    readme.append("## R2 Key")
    readme.append("")
    readme.append("`" + r2_key + "`")
    readme.append("")
    readme.append("## Next")
    readme.append("")
    readme.append("1. Run `bash artifacts/cms_homepage_section_audit/selected_work_replacement/stage/upload_to_r2.sh`.")
    readme.append("2. Verify the object exists in R2.")
    readme.append("3. Review `cms_seed_review.sql` before touching D1.")
    readme.append("4. Seed/update `cms_page_sections` only after confirming actual columns/page id.")

    write_text(OUT / "README.md", "\n".join(readme) + "\n")

    print("")
    print("DONE")
    print("REPO COPY:", repo_copy)
    print("R2 KEY:", r2_key)
    print("OPEN:", OUT)


if __name__ == "__main__":
    main()