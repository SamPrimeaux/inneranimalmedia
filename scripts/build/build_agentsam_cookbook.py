#!/usr/bin/env python3
"""
Build agentsam_cookbook from agent_recipe_prompts via Cloudflare D1 REST API.
Uses CLOUDFLARE_API_TOKEN only (no wrangler). Safe to run from this repo only.

  python3 scripts/build/build_agentsam_cookbook.py --dry-run
  python3 scripts/build/build_agentsam_cookbook.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ACCOUNT_ID = "ede6590ac0d2fb7daf155b35653457b2"
D1_DATABASE_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS agentsam_cookbook (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  category TEXT,
  role_name TEXT,
  description TEXT,
  prompt_text TEXT NOT NULL,
  parameters_json TEXT DEFAULT '{}',
  tags_json TEXT DEFAULT '[]',
  usage_count INTEGER DEFAULT 0,
  rating REAL,
  source_table TEXT NOT NULL DEFAULT 'agent_recipe_prompts',
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(recipe_id)
);
"""

# D1 REST API rejects UPSERT (ON CONFLICT DO UPDATE) — use full refresh instead.
CLEAR_SQL = "DELETE FROM agentsam_cookbook;"

INSERT_SQL = """
INSERT INTO agentsam_cookbook (
  id, recipe_id, name, slug, category, role_name, description,
  prompt_text, parameters_json, tags_json, usage_count, rating, synced_at
)
SELECT
  'cook_' || id,
  id,
  name,
  slug,
  category,
  role_name,
  description,
  prompt_text,
  COALESCE(parameters_json, '{}'),
  COALESCE(tags_json, '[]'),
  COALESCE(usage_count, 0),
  rating,
  datetime('now')
FROM agent_recipe_prompts;
"""


def d1_query(sql: str, params: list | None = None) -> dict:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not token:
        raise SystemExit("CLOUDFLARE_API_TOKEN required")

    body: dict = {"sql": sql}
    if params:
        body["params"] = params

    req = urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            payload = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise SystemExit(f"D1 API HTTP {err.code}: {detail}") from err

    if not payload.get("success"):
        raise SystemExit(f"D1 API error: {json.dumps(payload, indent=2)[:2000]}")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    steps = [
        ("create_table", CREATE_SQL),
        ("clear_cookbook", CLEAR_SQL),
        ("insert_recipes", INSERT_SQL),
        (
            "count",
            "SELECT COUNT(*) AS n FROM agentsam_cookbook;",
        ),
        (
            "categories",
            "SELECT category, COUNT(*) AS n FROM agentsam_cookbook GROUP BY category ORDER BY n DESC;",
        ),
    ]

    if args.dry_run:
        print("DRY RUN — would execute via CF D1 REST API:")
        for name, sql in steps:
            print(f"\n--- {name} ---\n{sql.strip()[:400]}...")
        return

    for name, sql in steps:
        print(f"Running {name}…")
        out = d1_query(sql)
        result = out.get("result", [{}])[0]
        rows = result.get("results") or []
        meta = result.get("meta") or {}
        print(f"  rows_read={meta.get('rows_read')} rows_written={meta.get('rows_written')}")
        if rows:
            print(json.dumps(rows[:12], indent=2))

    print("PASS: agentsam_cookbook synced from agent_recipe_prompts")


if __name__ == "__main__":
    main()
