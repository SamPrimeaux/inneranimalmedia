#!/usr/bin/env python3
"""Seed ATC MovieMode pilot project into D1 (remote)."""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WRAPPER = REPO / "scripts" / "with-cloudflare-env.sh"


def d1(sql: str) -> None:
    cmd = [
        str(WRAPPER),
        "npx",
        "wrangler",
        "d1",
        "execute",
        "inneranimalmedia-business",
        "--remote",
        "-c",
        "wrangler.production.toml",
        "--command",
        sql,
    ]
    subprocess.run(cmd, cwd=REPO, check=True)


def main() -> int:
    tenant = sys.argv[1] if len(sys.argv) > 1 else "tenant_sam_primeaux"
    workspace = sys.argv[2] if len(sys.argv) > 2 else "ws_inneranimalmedia"
    slug = "adaptive-fitness-coalition-atc"
    proj_id = "mmproj_atc_pilot_v1"
    brand = {
        "colors": {"navy": "#042944", "light_blue": "#3decff"},
        "phrases": ["Built For Coaches", "Inclusive Fitness", "Structured Systems"],
        "avoid": ["flashy gym ad"],
        "style": ["sleek", "modern", "cinematic", "professional", "authentic"],
    }
    target = {
        "deliverables": ["4-6 minute 1080p seamless loop", "music version", "silent version"],
        "mission": "We help Gym Owners create profitable and impactful adaptive athlete programs.",
    }
    r2_prefix = f"moviemode/{workspace}/{slug}"
    brand_j = json.dumps(brand).replace("'", "''")
    target_j = json.dumps(target).replace("'", "''")

    sql = f"""
INSERT INTO moviemode_projects (
  id, tenant_id, workspace_id, slug, title, client_name, brief_text, brand_json, target_json, status, r2_prefix, plan_id
) VALUES (
  '{proj_id}',
  '{tenant}',
  '{workspace}',
  '{slug}',
  'Adaptive Fitness Coalition - Cinematic Loop Video',
  'Drew / Adaptive Fitness Coalition',
  'ATC pilot — seamless loop, music + silent masters.',
  '{brand_j}',
  '{target_j}',
  'planning',
  '{r2_prefix}',
  'plan_agentsam_studio_moviemode'
)
ON CONFLICT(workspace_id, slug) DO UPDATE SET
  title = excluded.title,
  brand_json = excluded.brand_json,
  target_json = excluded.target_json,
  r2_prefix = excluded.r2_prefix,
  updated_at = datetime('now');
"""
    d1(sql)
    print(f"Seeded moviemode_projects {proj_id} ({slug})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
