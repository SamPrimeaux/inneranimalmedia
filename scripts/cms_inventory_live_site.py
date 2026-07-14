#!/usr/bin/env python3
"""
Inventory live IAM storefront vs CMS inject model.

Fact-checks R2 site chrome (iam-header / iam-footer) and walks public HTML for
editable markers so Theme Studio can map real DOM — not invent mock sections.

Usage (from repo root, with wrangler auth / CF API available):
  python3 scripts/cms_inventory_live_site.py
  python3 scripts/cms_inventory_live_site.py --project inneranimalmedia --out /tmp/cms-inventory.json

Requires: python3, urllib, optional `npx wrangler` for R2 head checks.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

SHELL_KEYS = (
    "src/components/iam-header.html",
    "src/components/iam-footer.html",
)
PAGE_ROUTES = ("/", "/work", "/services", "/about", "/contact")


class MarkerScanner(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.markers: list[dict] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        key = ad.get("data-section-key") or ad.get("data-cms-section") or ""
        if key or "data-cms-editable" in ad or "data-cms-field" in ad:
            self.markers.append(
                {
                    "tag": tag,
                    "section_key": key or None,
                    "editable": "data-cms-editable" in ad or "data-cms-field" in ad,
                    "id": ad.get("id") or None,
                    "class": (ad.get("class") or "")[:120],
                }
            )


def fetch_text(url: str, timeout: float = 25.0) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "iam-cms-inventory/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.status, res.read().decode("utf-8", errors="replace")


def wrangler_r2_object_meta(bucket: str, key: str) -> dict:
    """Best-effort remote R2 metadata via wrangler (may fail offline)."""
    cmd = [
        "npx",
        "--yes",
        "wrangler",
        "r2",
        "object",
        "get",
        f"{bucket}/{key}",
        "--remote",
        "--pipe",
    ]
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        if proc.returncode != 0:
            return {"ok": False, "key": key, "error": (proc.stderr or proc.stdout)[-400:]}
        body = proc.stdout or ""
        return {
            "ok": True,
            "key": key,
            "bytes": len(body.encode("utf-8")),
            "snippet": body[:180].replace("\n", " "),
            "has_nav": bool(re.search(r"<nav|header|iam-", body, re.I)),
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "key": key, "error": str(e)}


def local_shell_paths() -> dict:
    out = {}
    for key in SHELL_KEYS:
        local = REPO / "static" / key
        out[key] = {
            "local_path": str(local.relative_to(REPO)) if local.exists() else None,
            "exists": local.exists(),
            "bytes": local.stat().st_size if local.exists() else 0,
        }
    return out


def scan_url(base: str, path: str) -> dict:
    live = f"{base.rstrip('/')}{path}"
    draft = f"{live}{'&' if '?' in live else '?'}cms=1&preview=draft"
    result: dict = {"path": path, "live_url": live, "draft_url": draft}
    try:
        status, html = fetch_text(live)
        scanner = MarkerScanner()
        scanner.feed(html)
        result["live"] = {
            "status": status,
            "bytes": len(html.encode("utf-8")),
            "title": (re.search(r"<title[^>]*>([^<]*)</title>", html, re.I) or [None, ""])[1],
            "markers": scanner.markers[:80],
            "marker_count": len(scanner.markers),
            "mentions_iam_header": "iam-header" in html.lower() or 'id="iam-header"' in html.lower(),
        }
    except Exception as e:  # noqa: BLE001
        result["live"] = {"error": str(e)}

    try:
        status, html = fetch_text(draft)
        scanner = MarkerScanner()
        scanner.feed(html)
        result["draft_cms"] = {
            "status": status,
            "bytes": len(html.encode("utf-8")),
            "marker_count": len(scanner.markers),
            "markers": scanner.markers[:80],
        }
    except Exception as e:  # noqa: BLE001
        result["draft_cms"] = {"error": str(e)}
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", default="inneranimalmedia")
    ap.add_argument("--base", default="https://inneranimalmedia.com")
    ap.add_argument("--bucket", default="inneranimalmedia")
    ap.add_argument("--skip-r2", action="store_true")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    report = {
        "project": args.project,
        "verdict_notes": [
            "Global chrome SSOT is R2 ASSETS keys src/components/iam-header.html + iam-footer.html",
            "Page body lives in pages/{route}/index.html (storefront assets), hydrated with cms_page_sections injects",
            "Theme Studio must edit those surfaces — never invent parallel mock section trees",
            "html_source=injected means an R2 HTML fragment, not template fields",
        ],
        "local_shell": local_shell_paths(),
        "r2_shell": {},
        "pages": [],
    }

    if not args.skip_r2:
        for key in SHELL_KEYS:
            report["r2_shell"][key] = wrangler_r2_object_meta(args.bucket, key)

    for path in PAGE_ROUTES:
        report["pages"].append(scan_url(args.base, path))

    text = json.dumps(report, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
