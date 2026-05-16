#!/usr/bin/env python3
"""
patch_mime.py
Patches src/index.js to fix application/octet-stream MIME fallback for R2 assets.
Run from repo root: python3 scripts/patch_mime.py
"""

from pathlib import Path

TARGET = Path("/Users/samprimeaux/inneranimalmedia/src/index.js")

# ── Patch 1: inject getMimeType after the dashboard-r2-assets import ─────────
OLD_IMPORT = "import { getDashboardR2Object, getDashboardSpaHtmlShell } from './core/dashboard-r2-assets.js';"

NEW_IMPORT = """import { getDashboardR2Object, getDashboardSpaHtmlShell } from './core/dashboard-r2-assets.js';

function getMimeType(key) {
  if (key.endsWith('.js'))    return 'application/javascript';
  if (key.endsWith('.css'))   return 'text/css';
  if (key.endsWith('.html'))  return 'text/html; charset=utf-8';
  if (key.endsWith('.json'))  return 'application/json';
  if (key.endsWith('.woff2')) return 'font/woff2';
  if (key.endsWith('.woff'))  return 'font/woff';
  if (key.endsWith('.svg'))   return 'image/svg+xml';
  if (key.endsWith('.png'))   return 'image/png';
  if (key.endsWith('.map'))   return 'application/json';
  return 'application/octet-stream';
}"""

# ── Patch 2: ASSETS bucket response ──────────────────────────────────────────
OLD_ASSETS = "if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });\n          }\n\n          if (env.DASHBOARD)"

NEW_ASSETS = "if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || getMimeType(assetKey) } });\n          }\n\n          if (env.DASHBOARD)"

# ── Patch 3: DASHBOARD bucket response ───────────────────────────────────────
OLD_DASHBOARD = "const obj = await getDashboardR2Object(env.DASHBOARD, assetKey);\n            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });"

NEW_DASHBOARD = "const obj = await getDashboardR2Object(env.DASHBOARD, assetKey);\n            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || getMimeType(assetKey), 'Cache-Control': 'public, max-age=31536000' } });"

# ── Apply ─────────────────────────────────────────────────────────────────────
def apply(source, old, new, label):
    if old not in source:
        print(f"  [FAIL] '{label}' — target string not found. Check index.js manually.")
        return source, False
    count = source.count(old)
    if count > 1:
        print(f"  [WARN] '{label}' — found {count} matches, replacing first only.")
    result = source.replace(old, new, 1)
    print(f"  [OK]   '{label}'")
    return result, True

def main():
    print("=" * 60)
    print("  patch_mime.py — fixing R2 MIME type fallback")
    print("=" * 60)

    if not TARGET.exists():
        print(f"  ERROR: {TARGET} not found")
        return

    source = TARGET.read_text()
    original = source

    # Guard: already patched?
    if 'getMimeType' in source:
        print("  Already patched — getMimeType already present in index.js")
        return

    source, ok1 = apply(source, OLD_IMPORT,    NEW_IMPORT,    "inject getMimeType function")
    source, ok2 = apply(source, OLD_ASSETS,    NEW_ASSETS,    "ASSETS bucket MIME fallback")
    source, ok3 = apply(source, OLD_DASHBOARD, NEW_DASHBOARD, "DASHBOARD bucket MIME fallback")

    if not all([ok1, ok2, ok3]):
        print("\n  One or more patches failed — file NOT written. Fix manually.")
        return

    TARGET.write_text(source)
    print(f"\n  Written: {TARGET}")
    print("  Next: git add src/index.js && git commit -m 'fix: R2 asset MIME type fallback' && git push")
    print("=" * 60)

if __name__ == "__main__":
    main()
