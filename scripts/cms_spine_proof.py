#!/usr/bin/env python3
"""
Prove CMS spine for client apps — stop inventing editor/agent context.

Walks:
  1) Live IAM D1 `client_apps` (inventory SSOT)
  2) Local worker wrangler (bindings)
  3) Live R2 object existence for claimed key conventions
  4) Optional live D1 cms_pages sample on the client DB

Outputs an agent_site_context block per app_key + drift vs pretend-CMS assumptions.

Usage (repo root, CF env available):
  python3 scripts/cms_spine_proof.py
  python3 scripts/cms_spine_proof.py --apps companionscpas,inneranimalmedia
  python3 scripts/cms_spine_proof.py --out /tmp/cms-spine-proof.json --skip-r2
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

IAM_REPO = Path(__file__).resolve().parents[1]
CPAS_REPO = Path("/Users/samprimeaux/companionscpas")

IAM_D1_NAME = "inneranimalmedia-business"
IAM_D1_ID = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

# Code-proven conventions (not trust client_apps metadata blindly).
CODE_SPINES: dict[str, dict[str, Any]] = {
    "companionscpas": {
        "repo": str(CPAS_REPO),
        "wrangler": str(CPAS_REPO / "wrangler.toml"),
        "worker": "companionscpas",
        "cms_mode": "client_worker",
        "api_profile": "cpas_fragment",
        "r2_binding": "WEBSITE_ASSETS",
        "r2_bucket": "companionscpas",
        "d1_binding": "DB",
        "d1_database_name": "companionscpas",
        "d1_database_id": "fd6dd6fb-156b-4b6a-8ff0-505422652391",
        "kv_binding": "CMS_CACHE",
        "kv_namespace_id": "0b410337a8494fc982ea04c5bde1eab4",
        "public_domain": "companionsofcaddo.org",
        "r2_custom_domain": "assets.companionsofcaddo.org",
        "page_artifact_convention": "static/pages{route}/index.html  # route=/about → static/pages/about/index.html; / → static/pages/index.html",
        "section_fragment_convention": "static/pages/{page_name}/{section_key}.html",
        "global_header_key": "static/global/cpas-header.html",
        "global_footer_key": "static/global/cpas-footer.html",
        "global_css_key": "static/global/cpas-shell.css",
        "header_runtime_note": "Prefer dynamic getSiteShellPartial (render_site_nav.js); R2 cpas-header/cpas-footer are fallbacks",
        "content_ssot": "client D1 cms_pages + cms_page_sections (+ blocks); publish writes R2 artifacts + KV page:{route} bust",
        "prove_r2_keys": [
            "static/pages/home/hero.html",
            "static/pages/about/index.html",
            "static/pages/index.html",
            "static/global/cpas-shell.css",
            "static/global/cpas-header.html",
            "static/global/cpas-footer.html",
            "static/global/shared.js",
        ],
        "anti_keys": [
            "pages/home/index.html",  # IAM storefront layout — wrong on CPAS
            "src/components/iam-header.html",
        ],
        "live_paths": ["/", "/about", "/donate"],
    },
    "inneranimalmedia": {
        "repo": str(IAM_REPO),
        "wrangler": str(IAM_REPO / "wrangler.production.toml"),
        "worker": "inneranimalmedia",
        "cms_mode": "platform",
        "api_profile": "primetch",  # cms-site-config forces platform to primetch
        "r2_binding": "ASSETS",
        "r2_bucket": "inneranimalmedia",
        "d1_binding": "DB",
        "d1_database_name": "inneranimalmedia-business",
        "d1_database_id": IAM_D1_ID,
        "kv_binding": "SESSION_CACHE",
        "kv_namespace_id": "dc87920b0a9247979a213c09df9a0234",
        "public_domain": "inneranimalmedia.com",
        "r2_custom_domain": "assets.inneranimalmedia.com",
        "page_artifact_convention": "pages/{slug}/index.html  # e.g. pages/home/index.html",
        "section_fragment_convention": "injected section HTML via D1 cms_page_sections + R2 page hydrate (NOT static/pages/...)",
        "global_header_key": "src/components/iam-header.html",
        "global_footer_key": "src/components/iam-footer.html",
        "global_css_key": None,
        "header_runtime_note": "HTMLRewriter injects iam-header/footer into storefront bodies",
        "content_ssot": "IAM D1 cms_pages + sections; storefront R2 under pages/; shell under src/components/",
        "prove_r2_keys": [
            "pages/home/index.html",
            "pages/about/index.html",
            "pages/agentsam/index.html",
            "src/components/iam-header.html",
            "src/components/iam-footer.html",
        ],
        "anti_keys": [
            "static/pages/home/hero.html",  # CPAS fragment layout — must NOT be the IAM spine
            "static/global/cpas-header.html",
        ],
        "live_paths": ["/", "/about", "/agentsam"],
    },
}


def run(cmd: list[str], cwd: Path, timeout: int = 120) -> tuple[int, str, str]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def wrangler_env(cmd: list[str], cwd: Path, timeout: int = 120) -> tuple[int, str, str]:
    wrapper = cwd / "scripts" / "with-cloudflare-env.sh"
    if wrapper.exists():
        return run([str(wrapper), *cmd], cwd, timeout=timeout)
    return run(cmd, cwd, timeout=timeout)


def parse_json_loose(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return {"_parse_error": True, "_raw_preview": s[:200]}


def extract_wrangler_results(stdout: str) -> list[dict]:
    # wrangler prints JSON array of {results, success, meta}
    start = stdout.find("[")
    if start < 0:
        return []
    try:
        payload = json.loads(stdout[start:])
    except json.JSONDecodeError:
        return []
    if not payload:
        return []
    return payload[0].get("results") or []


def d1_query(database_name: str, sql: str, cwd: Path) -> list[dict]:
    code, out, err = wrangler_env(
        [
            "npx",
            "wrangler",
            "d1",
            "execute",
            database_name,
            "--remote",
            "--command",
            sql,
        ],
        cwd,
        timeout=90,
    )
    if code != 0:
        return [{"_error": err[-500:] or out[-500:]}]
    return extract_wrangler_results(out)


def r2_probe(bucket: str, key: str, cwd: Path) -> dict:
    dest = Path(f"/tmp/cms_spine_{bucket.replace('/', '_')}_{abs(hash(key)) % 10_000_000}.bin")
    code, out, err = wrangler_env(
        [
            "npx",
            "wrangler",
            "r2",
            "object",
            "get",
            f"{bucket}/{key}",
            "--remote",
            f"--file={dest}",
        ],
        cwd,
        timeout=90,
    )
    if dest.exists():
        data = dest.read_bytes()
        dest.unlink(missing_ok=True)
        snippet = data[:100].decode("utf-8", errors="replace").replace("\n", " ")
        return {
            "ok": True,
            "bytes": len(data),
            "exists_nonempty": len(data) > 0,
            "snippet": snippet,
        }
    return {
        "ok": False,
        "bytes": 0,
        "exists_nonempty": False,
        "error": (err or out)[-300:],
        "returncode": code,
    }


def parse_toml_bindings(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"error": f"missing {path}"}
    text = path.read_text(encoding="utf-8", errors="replace")
    out: dict[str, Any] = {"path": str(path)}
    m = re.search(r'^name\s*=\s*"([^"]+)"', text, re.M)
    if m:
        out["worker_name"] = m.group(1)
    d1 = re.search(
        r'\[\[d1_databases\]\]\s*\nbinding\s*=\s*"([^"]+)"\s*\ndatabase_name\s*=\s*"([^"]+)"\s*\ndatabase_id\s*=\s*"([^"]+)"',
        text,
    )
    if d1:
        out["d1"] = {
            "binding": d1.group(1),
            "database_name": d1.group(2),
            "database_id": d1.group(3),
        }
    r2s = re.findall(
        r'\[\[r2_buckets\]\]\s*\nbinding\s*=\s*"([^"]+)"\s*\nbucket_name\s*=\s*"([^"]+)"',
        text,
    )
    out["r2"] = [{"binding": b, "bucket_name": n} for b, n in r2s]
    kv = re.search(
        r'\[\[kv_namespaces\]\]\s*\nbinding\s*=\s*"([^"]+)"\s*\nid\s*=\s*"([^"]+)"',
        text,
    )
    if kv:
        out["kv"] = {"binding": kv.group(1), "id": kv.group(2)}
    return out


def build_agent_site_context(app_key: str, client_row: dict | None, code: dict) -> dict:
    meta = parse_json_loose((client_row or {}).get("metadata_json")) or {}
    if not isinstance(meta, dict):
        meta = {}
    r2_catalog = parse_json_loose((client_row or {}).get("r2_buckets")) or []
    d1_list = parse_json_loose((client_row or {}).get("d1_databases")) or []
    bindings = parse_json_loose((client_row or {}).get("bindings_json")) or {}

    path_convention = None
    global_keys: dict[str, str] = {}
    if isinstance(r2_catalog, list) and r2_catalog:
        first = r2_catalog[0] if isinstance(r2_catalog[0], dict) else {}
        catalog = first.get("catalog") if isinstance(first, dict) else None
        static = (catalog or {}).get("static") if isinstance(catalog, dict) else None
        pages = (static or {}).get("pages") if isinstance(static, dict) else None
        if isinstance(pages, dict):
            path_convention = pages.get("convention")
        glob = (static or {}).get("global") if isinstance(static, dict) else None
        files = (glob or {}).get("files") if isinstance(glob, dict) else None
        if isinstance(files, dict):
            for k, v in files.items():
                if isinstance(v, str):
                    global_keys[k] = v

    # Prefer code-proven spine for agent handoff; keep inventory for audit.
    return {
        "app_key": app_key,
        "r2_bucket": code["r2_bucket"],
        "r2_binding": code["r2_binding"],
        "r2_custom_domain": code.get("r2_custom_domain"),
        "d1_database_id": code["d1_database_id"],
        "d1_database_name": code["d1_database_name"],
        "d1_binding": code["d1_binding"],
        "kv_namespace_id": code.get("kv_namespace_id"),
        "kv_binding": code.get("kv_binding"),
        "public_domain": code["public_domain"],
        "cms_mode": code["cms_mode"],
        "api_profile": code["api_profile"],
        "path_convention": code["section_fragment_convention"],
        "page_artifact_convention": code["page_artifact_convention"],
        "global_header_key": code["global_header_key"],
        "global_footer_key": code["global_footer_key"],
        "global_css_key": code.get("global_css_key"),
        "header_runtime_note": code.get("header_runtime_note"),
        "content_ssot": code.get("content_ssot"),
        "inventory": {
            "client_apps_present": bool(client_row),
            "metadata_api_profile": meta.get("api_profile") or meta.get("cms_api_profile"),
            "metadata_cms_mode": meta.get("cms_mode") or meta.get("cms_hosting"),
            "metadata_section_convention": meta.get("section_convention"),
            "r2_pages_convention_from_catalog": path_convention,
            "r2_global_keys_from_catalog": global_keys,
            "d1_databases_col": d1_list,
            "bindings_json_kv": (bindings.get("kv") if isinstance(bindings, dict) else None),
        },
    }


def find_drifts(app_key: str, ctx: dict, code: dict) -> list[str]:
    drifts: list[str] = []
    inv = ctx.get("inventory") or {}
    meta_profile = inv.get("metadata_api_profile")
    if meta_profile and meta_profile != code["api_profile"]:
        drifts.append(
            f"client_apps.metadata api_profile={meta_profile!r} != code spine {code['api_profile']!r}"
        )
    meta_conv = inv.get("metadata_section_convention")
    if meta_conv and app_key == "inneranimalmedia" and "static/pages" in str(meta_conv):
        drifts.append(
            f"IAM metadata section_convention is CPAS-shaped ({meta_conv!r}) — code uses pages/{{slug}}/index.html + iam-header"
        )
    if app_key == "inneranimalmedia" and inv.get("r2_pages_convention_from_catalog"):
        drifts.append(
            "IAM r2 catalog should not carry CPAS static/pages convention; none expected on ASSETS storefront"
        )
    return drifts


def crawl_live(base: str, paths: list[str]) -> dict:
    import urllib.request

    out: dict[str, Any] = {}
    for path in paths:
        url = base.rstrip("/") + path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "iam-cms-spine-proof/1.0"})
            with urllib.request.urlopen(req, timeout=25) as res:
                html = res.read().decode("utf-8", errors="replace")
                status = res.status
        except Exception as e:  # noqa: BLE001
            out[path] = {"ok": False, "error": str(e)}
            continue
        title_m = re.search(r"<title[^>]*>([^<]*)", html, re.I)
        out[path] = {
            "ok": True,
            "status": status,
            "bytes": len(html),
            "title": (title_m.group(1) if title_m else "")[:90],
            "data_route": (re.search(r'data-route=["\']([^"\']+)', html) or [None, None])[1],
            "iam_header": "iam-header.html" in html or 'id="iam-header"' in html,
            "site_header": "site-header" in html,
            "cms_preview_synthetic": "CMS Preview" in html and "Operator agent" not in html,
            "section_markers": len(re.findall(r"data-section-key=|data-cms-section=|data-cpas-section=", html)),
        }
    return out


def prove_app(app_key: str, client_row: dict | None, skip_r2: bool, skip_client_d1: bool) -> dict:
    code = CODE_SPINES[app_key]
    wrangler = parse_toml_bindings(Path(code["wrangler"]))
    agent_ctx = build_agent_site_context(app_key, client_row, code)
    drifts = find_drifts(app_key, agent_ctx, code)

    # Wrangler vs code
    if wrangler.get("d1") and wrangler["d1"].get("database_id") != code["d1_database_id"]:
        drifts.append("wrangler.toml d1 database_id mismatch vs CODE_SPINES")
    r2_names = {x["bucket_name"] for x in wrangler.get("r2") or []}
    if code["r2_bucket"] not in r2_names and "error" not in wrangler:
        drifts.append(f"wrangler missing r2 bucket {code['r2_bucket']} (found {sorted(r2_names)})")

    r2_proof: dict[str, Any] = {"skipped": skip_r2}
    if not skip_r2:
        cwd = Path(code["repo"]) if Path(code["repo"]).exists() else IAM_REPO
        r2_proof = {"expected": {}, "anti": {}}
        for key in code["prove_r2_keys"]:
            r2_proof["expected"][key] = r2_probe(code["r2_bucket"], key, IAM_REPO if app_key == "inneranimalmedia" else cwd)
        for key in code.get("anti_keys") or []:
            hit = r2_probe(code["r2_bucket"], key, IAM_REPO if app_key == "inneranimalmedia" else cwd)
            r2_proof["anti"][key] = hit
            # Anti-key present+nonempty on wrong spine = red flag for IAM; on CPAS pages/home is expected miss
            if app_key == "inneranimalmedia" and hit.get("exists_nonempty"):
                drifts.append(f"IAM bucket has CPAS-shaped key {key} ({hit['bytes']}B) — investigate")
            if app_key == "companionscpas" and key.startswith("pages/") and hit.get("exists_nonempty"):
                drifts.append(f"CPAS bucket has IAM-shaped key {key}")

        for key, res in (r2_proof.get("expected") or {}).items():
            if not res.get("exists_nonempty"):
                drifts.append(f"expected R2 key missing/empty: {key}")

    client_d1: dict[str, Any] = {"skipped": skip_client_d1}
    if not skip_client_d1 and app_key == "companionscpas":
        pages = d1_query(
            code["d1_database_name"],
            "SELECT route_path, slug, title, status FROM cms_pages ORDER BY route_path LIMIT 20;",
            CPAS_REPO if CPAS_REPO.exists() else IAM_REPO,
        )
        sections = d1_query(
            code["d1_database_name"],
            "SELECT page_route, section_key, section_type, is_visible FROM cms_page_sections ORDER BY page_route, sort_order LIMIT 30;",
            CPAS_REPO if CPAS_REPO.exists() else IAM_REPO,
        )
        client_d1 = {"cms_pages": pages, "cms_page_sections_sample": sections}
    elif not skip_client_d1 and app_key == "inneranimalmedia":
        pages = d1_query(
            IAM_D1_NAME,
            "SELECT id, slug, route_path, title, status, r2_bucket, r2_key FROM cms_pages WHERE project_slug = 'inneranimalmedia' OR slug LIKE '%home%' OR route_path IN ('/','/about','/work') ORDER BY route_path LIMIT 25;",
            IAM_REPO,
        )
        client_d1 = {"cms_pages_sample": pages}

    live = crawl_live(f"https://{code['public_domain']}", list(code.get("live_paths") or []))
    for path, hit in live.items():
        if not hit.get("ok"):
            drifts.append(f"live crawl fail {path}: {hit.get('error')}")
        elif app_key == "inneranimalmedia" and path == "/agentsam" and hit.get("cms_preview_synthetic"):
            drifts.append("live /agentsam still serves synthetic CMS Preview")
        elif app_key == "inneranimalmedia" and path == "/" and not hit.get("iam_header"):
            drifts.append("live / missing iam-header inject")

    return {
        "app_key": app_key,
        "repo_exists": Path(code["repo"]).is_dir(),
        "wrangler": wrangler,
        "agent_site_context": agent_ctx,
        "r2_proof": r2_proof,
        "d1_proof": client_d1,
        "live_crawl": live,
        "drifts": drifts,
        "verdict": "PASS" if not drifts else "DRIFT",
    }


def load_client_apps(app_keys: list[str]) -> dict[str, dict]:
    keys = ",".join("'" + k.replace("'", "") + "'" for k in app_keys)
    sql = (
        "SELECT app_key, display_name, worker_id, d1_databases, r2_buckets, "
        "github_repository, bindings_json, metadata_json, instructions "
        f"FROM client_apps WHERE app_key IN ({keys});"
    )
    rows = d1_query(IAM_D1_NAME, sql, IAM_REPO)
    out = {}
    for row in rows:
        if isinstance(row, dict) and row.get("app_key"):
            out[row["app_key"]] = row
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Prove CMS spines for client apps")
    ap.add_argument(
        "--apps",
        default="companionscpas,inneranimalmedia",
        help="Comma-separated app_key list",
    )
    ap.add_argument("--out", default="", help="Write full JSON report")
    ap.add_argument("--skip-r2", action="store_true")
    ap.add_argument("--skip-client-d1", action="store_true")
    args = ap.parse_args()
    apps = [a.strip() for a in args.apps.split(",") if a.strip()]
    unknown = [a for a in apps if a not in CODE_SPINES]
    if unknown:
        print(f"Unknown app keys (add CODE_SPINES): {unknown}", file=sys.stderr)
        return 2

    client_apps = load_client_apps(apps)
    report = {
        "generated_by": "scripts/cms_spine_proof.py",
        "thesis": "Agent CMS tools are fine; handoff must inject per-app spine from client_apps + code-proven conventions",
        "apps": {},
    }
    for app in apps:
        report["apps"][app] = prove_app(
            app,
            client_apps.get(app),
            skip_r2=args.skip_r2,
            skip_client_d1=args.skip_client_d1,
        )

    # Compact human summary
    print("=" * 72)
    print("CMS SPINE PROOF")
    print("=" * 72)
    for app, block in report["apps"].items():
        ctx = block["agent_site_context"]
        print(f"\n### {app}  [{block['verdict']}]")
        print(json.dumps({k: ctx[k] for k in (
            "app_key", "r2_bucket", "r2_custom_domain", "d1_database_id",
            "path_convention", "page_artifact_convention",
            "global_header_key", "global_footer_key", "global_css_key",
            "kv_namespace_id", "public_domain", "cms_mode", "api_profile",
        ) if k in ctx}, indent=2))
        if block["drifts"]:
            print("DRIFTS:")
            for d in block["drifts"]:
                print(f"  - {d}")
        else:
            print("DRIFTS: none (matches code spine + expected R2)")
        expected = (block.get("r2_proof") or {}).get("expected") or {}
        if expected:
            print("R2 expected:")
            for k, v in expected.items():
                flag = "OK" if v.get("exists_nonempty") else "MISS"
                print(f"  [{flag}] {v.get('bytes', 0):>7}B  {k}")

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nWrote {args.out}")
    else:
        # still emit machine block for piping
        print("\n--- full JSON ---")
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
