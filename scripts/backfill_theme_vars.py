#!/usr/bin/env python3
"""
Backfill css_vars_json in cms_themes from public R2 theme.json (assets CDN).

Themes generated outside cms_theme_pipeline often have css_vars_json = '{}' while
vars live in theme.json under cms/themes/{slug}/.

Run from repo root (needs Cloudflare auth for D1 --remote):

  python3 scripts/backfill_theme_vars.py

Uses ./scripts/with-cloudflare-env.sh when present so wrangler gets CLOUDFLARE_API_TOKEN.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DB = "inneranimalmedia-business"
BASE_URL = "https://assets.inneranimalmedia.com"
WRANGLER_CFG = "wrangler.production.toml"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def wrangler_base_cmd(root: Path) -> list[str]:
    wrapper = root / "scripts" / "with-cloudflare-env.sh"
    tail = [
        "npx",
        "wrangler",
        "d1",
        "execute",
        DB,
        "--remote",
        "-c",
        str(root / WRANGLER_CFG),
        "--json",
    ]
    if wrapper.is_file():
        return ["zsh", str(wrapper), *tail]
    return tail


def d1_query(root: Path, sql: str) -> list[dict]:
    cmd = [*wrangler_base_cmd(root), "--command", sql]
    r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr or r.stdout or "(no output)", file=sys.stderr)
        return []
    try:
        out = json.loads(r.stdout)
    except json.JSONDecodeError:
        print("Could not parse wrangler JSON stdout:", r.stdout[:2000], file=sys.stderr)
        return []
    if not isinstance(out, list) or not out:
        return []
    first = out[0]
    if not isinstance(first, dict):
        return []
    res = first.get("results")
    return res if isinstance(res, list) else []


def d1_exec(root: Path, sql: str) -> bool:
    cmd = [*wrangler_base_cmd(root), "--command", sql]
    r = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr or r.stdout, file=sys.stderr)
        return False
    try:
        out = json.loads(r.stdout)
    except json.JSONDecodeError:
        return r.returncode == 0
    if isinstance(out, list) and out and isinstance(out[0], dict):
        if out[0].get("success") is False:
            return False
    return True


def sql_string_literal(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def extract_css_vars(theme_json: dict) -> dict[str, str]:
    """Match Worker hydrate: cssVars | css_vars | vars, then config string JSON."""
    out: dict[str, str] = {}

    def absorb(obj: object) -> bool:
        nonlocal out
        if not isinstance(obj, dict) or not obj:
            return False
        for k, v in obj.items():
            if v is None:
                continue
            if isinstance(v, (dict, list)):
                continue
            out[str(k)] = v if isinstance(v, str) else str(v)
        return bool(out)

    raw = (
        theme_json.get("cssVars")
        or theme_json.get("css_vars")
        or theme_json.get("vars")
    )
    if isinstance(raw, dict):
        absorb(raw)

    if not out:
        cfg_raw = theme_json.get("config")
        if isinstance(cfg_raw, str) and cfg_raw.strip():
            try:
                cfg = json.loads(cfg_raw)
            except json.JSONDecodeError:
                cfg = None
            if isinstance(cfg, dict):
                inner = cfg.get("cssVars") or cfg.get("css_vars")
                if isinstance(inner, dict):
                    absorb(inner)

    return out


def fetch_theme_json(slug: str) -> dict | None:
    url = f"{BASE_URL}/cms/themes/{urllib.parse.quote(slug, safe='')}/theme.json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "inneranimalmedia-backfill-theme-vars/1"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def main() -> int:
    root = repo_root()
    os.chdir(root)

    themes = d1_query(
        root,
        "SELECT slug, css_r2_key FROM cms_themes "
        "WHERE length(css_vars_json) <= 2 AND css_r2_key IS NOT NULL AND status = 'active'",
    )
    print(f"Found {len(themes)} themes with empty css_vars_json\n")

    fixed = 0
    for t in themes:
        if not isinstance(t, dict):
            continue
        slug = str(t.get("slug") or "").strip()
        if not slug:
            continue
        data = fetch_theme_json(slug)
        if not data:
            print(f"  [SKIP] {slug} — no theme.json")
            continue

        vars_map = extract_css_vars(data)
        if not vars_map:
            print(f"  [SKIP] {slug} — theme.json has no cssVars/css_vars/vars")
            continue

        payload = json.dumps(vars_map, separators=(",", ":"), ensure_ascii=False)
        sql = (
            "UPDATE cms_themes SET css_vars_json = "
            + sql_string_literal(payload)
            + " WHERE slug = "
            + sql_string_literal(slug)
        )
        if not d1_exec(root, sql):
            print(f"  [FAIL] {slug} — D1 update error")
            continue

        print(f"  [FIXED] {slug} — {len(vars_map)} vars")
        fixed += 1

    print(f"\n{fixed}/{len(themes)} themes backfilled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
