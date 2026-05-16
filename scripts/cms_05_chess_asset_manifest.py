#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

ROOT = Path.cwd()
OUT = ROOT / "artifacts" / "cms_ollama_gameplan" / "chess_assets"
OUT.mkdir(parents=True, exist_ok=True)

CMS_ASSETS = ROOT / "artifacts/cms_d1_pull/tables/cms_assets/table_pull.json"
CMS_3D = ROOT / "artifacts/cms_d1_pull/tables/cms_3d_assets/table_pull.json"
SERVICES_HTML = ROOT / "static/pages/services.html"

def load_rows(path: Path) -> list[dict]:
    if not path.exists():
        raise SystemExit(f"Missing {path}")
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ["rows", "results", "data"]:
            if isinstance(data.get(key), list):
                return data[key]
    raise SystemExit(f"Could not understand JSON shape: {path}")

def is_chess(row: dict) -> bool:
    text = json.dumps(row, ensure_ascii=False).lower()
    return "chess" in text or "board_main.glb" in text

def public_head(url: str) -> dict:
    if not url:
        return {"ok": False, "status": None, "bytes": None, "error": "empty url"}
    try:
        req = Request(url, method="HEAD", headers={"User-Agent": "IAM-CMS-Audit/1.0"})
        with urlopen(req, timeout=12) as res:
            return {
                "ok": 200 <= int(res.status) < 400,
                "status": int(res.status),
                "bytes": res.headers.get("content-length"),
                "content_type": res.headers.get("content-type"),
                "error": None,
            }
    except HTTPError as e:
        return {"ok": False, "status": e.code, "bytes": None, "content_type": None, "error": str(e)}
    except URLError as e:
        return {"ok": False, "status": None, "bytes": None, "content_type": None, "error": str(e.reason)}
    except Exception as e:
        return {"ok": False, "status": None, "bytes": None, "content_type": None, "error": f"{type(e).__name__}: {e}"}

def kind_for(row: dict) -> str:
    text = json.dumps(row).lower()
    if "board" in text:
        return "board"
    for p in ["king", "queen", "bishop", "knight", "rook", "pawn"]:
        if p in text:
            return p
    return str(row.get("model_type") or row.get("category") or "asset")

def color_for(row: dict) -> str:
    text = json.dumps(row).lower()
    if "/black/" in text or "black" in text:
        return "black"
    if "/white/" in text or "white" in text:
        return "white"
    return "neutral"

assets = [r for r in load_rows(CMS_ASSETS) if is_chess(r)]
assets3d = [r for r in load_rows(CMS_3D) if is_chess(r)]

asset_by_id = {str(r.get("id")): r for r in assets if r.get("id")}

merged = []
for row in assets3d:
    base = asset_by_id.get(str(row.get("asset_id")), {})
    public_url = row.get("glb_url") or base.get("public_url") or row.get("public_url")
    r2_key = row.get("r2_key") or base.get("r2_key") or base.get("path")
    item = {
        "id": row.get("id"),
        "asset_id": row.get("asset_id"),
        "base_asset_id": base.get("id"),
        "filename": base.get("filename") or Path(str(r2_key or "")).name,
        "kind": kind_for({**base, **row}),
        "color": color_for({**base, **row}),
        "model_type": row.get("model_type"),
        "category": base.get("category"),
        "tags": base.get("tags"),
        "r2_key": r2_key,
        "public_url": public_url,
        "builds": base.get("builds"),
        "raw_3d": row,
        "raw_asset": base,
    }
    item["public_check"] = public_head(str(public_url or ""))
    merged.append(item)

# Include base assets not represented in cms_3d_assets.
existing_asset_ids = {str(x.get("asset_id")) for x in merged}
for base in assets:
    if str(base.get("id")) in existing_asset_ids:
        continue
    public_url = base.get("public_url")
    item = {
        "id": None,
        "asset_id": base.get("id"),
        "base_asset_id": base.get("id"),
        "filename": base.get("filename"),
        "kind": kind_for(base),
        "color": color_for(base),
        "model_type": None,
        "category": base.get("category"),
        "tags": base.get("tags"),
        "r2_key": base.get("r2_key") or base.get("path"),
        "public_url": public_url,
        "builds": base.get("builds"),
        "raw_3d": None,
        "raw_asset": base,
    }
    item["public_check"] = public_head(str(public_url or ""))
    merged.append(item)

merged = sorted(merged, key=lambda x: (x["kind"] != "board", x["color"], x["kind"], x.get("filename") or ""))

manifest = {
    "name": "InnerAnimalMedia Chess GLB Manifest",
    "route_target": "/services lower chess section",
    "cta_target": "/games",
    "hero_scene_id": "hero-canvas-container",
    "replace_scene_id": "chess-canvas",
    "notes": [
        "Hero globe is separate and should not be touched.",
        "Current lower chess scene is procedural Three.js cylinders.",
        "Use this manifest to replace only the lower chess preview/card with GLBLoader assets.",
        "Do not auto-scroll. Click/CTA should navigate to /games.",
    ],
    "assets": merged,
}

(OUT / "chess_glb_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

html = SERVICES_HTML.read_text(encoding="utf-8", errors="replace") if SERVICES_HTML.exists() else ""
scene_hits = []
for i, line in enumerate(html.splitlines(), start=1):
    if re.search(r"chess-canvas|3D Multiplayer Chess|hero-canvas-container|THREE\.|GLTFLoader|GLBLoader|/games", line, re.I):
        scene_hits.append((i, line.strip()))

md = []
md.append("# Chess GLB Asset Manifest")
md.append("")
md.append(f"cms_assets chess rows: **{len(assets)}**")
md.append(f"cms_3d_assets chess rows: **{len(assets3d)}**")
md.append(f"merged manifest assets: **{len(merged)}**")
md.append("")
md.append("## Assets")
md.append("")
md.append("| OK | Kind | Color | Asset ID | R2 key | Public URL |")
md.append("|---:|---|---|---|---|---|")
for a in merged:
    ok = a["public_check"].get("ok")
    md.append(
        f"| {ok} | `{a['kind']}` | `{a['color']}` | `{a.get('asset_id')}` | `{a.get('r2_key')}` | {a.get('public_url')} |"
    )
md.append("")
md.append("## Current services scene references")
md.append("")
for i, line in scene_hits[:140]:
    md.append(f"- L{i}: `{line[:500]}`")
md.append("")
md.append("## Recommended replacement")
md.append("")
md.append("Replace only the lower `#chess-canvas` procedural scene. Keep `#hero-canvas-container` untouched.")
md.append("")
md.append("Desired behavior:")
md.append("")
md.append("- show real `board_main.glb` plus real piece GLBs from `cms_3d_assets`")
md.append("- slow idle orbit only when visible")
md.append("- pause offscreen")
md.append("- click card or CTA to `/games`")
md.append("- no auto-scroll")
md.append("- use stable R2/public URLs from the manifest now, later resolve from CMS API")
md.append("")
md.append("Generated files:")
md.append("")
md.append("- `artifacts/cms_ollama_gameplan/chess_assets/chess_glb_manifest.json`")
md.append("- `artifacts/cms_ollama_gameplan/chess_assets/CHESS_GLB_MANIFEST.md`")
md.append("")

(OUT / "CHESS_GLB_MANIFEST.md").write_text("\n".join(md), encoding="utf-8")

print(f"WROTE: {OUT / 'chess_glb_manifest.json'}")
print(f"WROTE: {OUT / 'CHESS_GLB_MANIFEST.md'}")
