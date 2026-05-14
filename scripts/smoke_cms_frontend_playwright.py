from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path("/Users/samprimeaux/inneranimalmedia")
ARTIFACT_ROOT = ROOT / "artifacts" / "playwright"

TARGETS = [
    {
        "key": "cms_editor",
        "name": "agentsam-cms-editor",
        "url": "https://agentsam-cms-editor.meauxbility.workers.dev/",
        "health": "https://agentsam-cms-editor.meauxbility.workers.dev/health",
        "required_markers": [
            "Pages",
            "Structure",
            "Preview",
            "Rollback",
        ],
    },
    {
        "key": "cms_app",
        "name": "agentsam-cms-app",
        "url": "https://agentsam-cms-app.meauxbility.workers.dev/",
        "health": "https://agentsam-cms-app.meauxbility.workers.dev/health",
        "required_markers": [
            "CMS",
            "Pages",
            "Themes",
            "Analytics",
        ],
    },
]


BAD_CONSOLE_PATTERNS = [
    "ReferenceError",
    "SyntaxError",
    "React is not defined",
    "Cannot use import statement outside a module",
    "Failed to resolve module",
    "Uncaught",
    "TypeError",
]


def fetch_health(url: str) -> dict:
    started = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AgentSam-Playwright-Smoke/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": 200 <= resp.status < 300,
                "status": resp.status,
                "ms": int((time.time() - started) * 1000),
                "body": body[:1000],
                "error": "",
            }
    except Exception as exc:
        return {
            "ok": False,
            "status": 0,
            "ms": int((time.time() - started) * 1000),
            "body": "",
            "error": str(exc),
        }


def ensure_playwright_available() -> None:
    try:
        import playwright.sync_api  # noqa: F401
    except Exception:
        print("Playwright is not installed for Python.")
        print("")
        print("Run:")
        print("  python3 -m pip install playwright")
        print("  python3 -m playwright install chromium")
        raise SystemExit(2)


def run_target(target: dict, run_dir: Path, headless: bool) -> dict:
    from playwright.sync_api import sync_playwright

    target_dir = run_dir / target["key"]
    target_dir.mkdir(parents=True, exist_ok=True)

    screenshot_path = target_dir / "screenshot.png"
    html_path = target_dir / "page.html"
    console_path = target_dir / "console.json"
    result_path = target_dir / "result.json"

    console_events = []
    page_errors = []
    failed_responses = []

    health = fetch_health(target["health"])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})

        page.on("console", lambda msg: console_events.append({
            "type": msg.type,
            "text": msg.text,
            "location": msg.location,
        }))

        page.on("pageerror", lambda err: page_errors.append(str(err)))

        def on_response(resp):
            try:
                if resp.status >= 400:
                    failed_responses.append({
                        "url": resp.url,
                        "status": resp.status,
                    })
            except Exception:
                pass

        page.on("response", on_response)

        started = time.time()
        goto_error = ""

        try:
            page.goto(target["url"], wait_until="networkidle", timeout=30000)
        except Exception as exc:
            goto_error = str(exc)

        try:
            page.wait_for_timeout(1500)
        except Exception:
            pass

        load_ms = int((time.time() - started) * 1000)

        title = ""
        body_text = ""
        html = ""
        body_box = None

        try:
            title = page.title()
        except Exception:
            pass

        try:
            body_text = page.locator("body").inner_text(timeout=5000)
        except Exception:
            body_text = ""

        try:
            html = page.content()
            html_path.write_text(html, encoding="utf-8")
        except Exception:
            html = ""

        try:
            body_box = page.locator("body").bounding_box(timeout=5000)
        except Exception:
            body_box = None

        try:
            page.screenshot(path=str(screenshot_path), full_page=True)
        except Exception as exc:
            console_events.append({
                "type": "screenshot_error",
                "text": str(exc),
                "location": {},
            })

        browser.close()

    body_text_clean = " ".join(body_text.split())
    html_lower = html.lower()
    text_lower = body_text_clean.lower()

    marker_hits = []
    marker_misses = []

    for marker in target["required_markers"]:
        if marker.lower() in text_lower or marker.lower() in html_lower:
            marker_hits.append(marker)
        else:
            marker_misses.append(marker)

    bad_console = []
    for event in console_events:
        text = event.get("text", "")
        if event.get("type") == "error" or any(pattern.lower() in text.lower() for pattern in BAD_CONSOLE_PATTERNS):
            bad_console.append(event)

    for err in page_errors:
        bad_console.append({"type": "pageerror", "text": err, "location": {}})

    screenshot_exists = screenshot_path.exists() and screenshot_path.stat().st_size > 1000
    text_len = len(body_text_clean)
    html_len = len(html)

    blank_screen = False
    blank_reasons = []

    if not screenshot_exists:
        blank_screen = True
        blank_reasons.append("missing_or_tiny_screenshot")

    if text_len < 40 and html_len < 2000:
        blank_screen = True
        blank_reasons.append("tiny_text_and_tiny_html")

    if text_len < 20:
        blank_screen = True
        blank_reasons.append("body_text_under_20_chars")

    if body_box is None:
        blank_screen = True
        blank_reasons.append("missing_body_box")

    passed = True
    fail_reasons = []

    if not health["ok"]:
        passed = False
        fail_reasons.append("health_failed")

    if goto_error:
        passed = False
        fail_reasons.append("page_goto_failed")

    if blank_screen:
        passed = False
        fail_reasons.append("blank_screen_detected")

    if bad_console:
        passed = False
        fail_reasons.append("console_or_page_errors")

    if marker_misses:
        passed = False
        fail_reasons.append("missing_required_markers")

    if failed_responses:
        passed = False
        fail_reasons.append("failed_network_responses")

    result = {
        "target_key": target["key"],
        "name": target["name"],
        "url": target["url"],
        "health_url": target["health"],
        "passed": passed,
        "fail_reasons": fail_reasons,
        "health": health,
        "load_ms": load_ms,
        "title": title,
        "text_len": text_len,
        "html_len": html_len,
        "body_box": body_box,
        "screenshot_path": str(screenshot_path),
        "html_path": str(html_path),
        "console_path": str(console_path),
        "marker_hits": marker_hits,
        "marker_misses": marker_misses,
        "blank_screen": blank_screen,
        "blank_reasons": blank_reasons,
        "console_error_count": len(bad_console),
        "console_event_count": len(console_events),
        "page_error_count": len(page_errors),
        "failed_response_count": len(failed_responses),
        "bad_console": bad_console[:25],
        "failed_responses": failed_responses[:25],
        "sample_text": body_text_clean[:500],
    }

    console_path.write_text(json.dumps({
        "console_events": console_events,
        "page_errors": page_errors,
        "bad_console": bad_console,
        "failed_responses": failed_responses,
    }, indent=2), encoding="utf-8")

    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    return result


def maybe_update_d1(run_id: str, results: list[dict], dry_run: bool) -> None:
    plan_id = "plan_agentsam_parallel_cms_workers_20260515"

    editor = next((r for r in results if r["target_key"] == "cms_editor"), None)
    app = next((r for r in results if r["target_key"] == "cms_app"), None)

    def status_for(result: dict | None) -> str:
        return "done" if result and result["passed"] else "blocked"

    def reason_for(result: dict | None) -> str:
        if not result:
            return "missing result"
        if result["passed"]:
            return ""
        return ", ".join(result["fail_reasons"])[:500]

    def quote(v: object) -> str:
        if v is None:
            return "NULL"
        return "'" + str(v).replace("'", "''") + "'"

    sql = f"""
UPDATE agentsam_plan_tasks
SET status = {quote(status_for(editor))},
    completed_at = unixepoch(),
    blocked_reason = {quote(reason_for(editor))},
    output_summary = {quote("Playwright validation for full URL https://agentsam-cms-editor.meauxbility.workers.dev/. Result stored in artifacts/playwright/" + run_id + "/cms_editor/result.json")}
WHERE id = 'task_parallel_cms_A_primary_editor';

UPDATE agentsam_plan_tasks
SET status = {quote(status_for(app))},
    completed_at = unixepoch(),
    blocked_reason = {quote(reason_for(app))},
    output_summary = {quote("Playwright validation for full URL https://agentsam-cms-app.meauxbility.workers.dev/. Result stored in artifacts/playwright/" + run_id + "/cms_app/result.json")}
WHERE id = 'task_parallel_cms_B_debug_app';

UPDATE agentsam_plan_tasks
SET status = 'done',
    completed_at = unixepoch(),
    output_summary = {quote("Playwright frontend validation executed for both full public URLs. Run artifacts/playwright/" + run_id)}
WHERE id = 'task_parallel_cms_040_playwright_required_validation';

UPDATE agentsam_plans
SET updated_at = unixepoch(),
    eod_summary = COALESCE(eod_summary, '') || {quote(" Playwright validation run " + run_id + " completed. Editor passed=" + str(editor["passed"] if editor else False) + ". App passed=" + str(app["passed"] if app else False) + ".")}
WHERE id = {quote(plan_id)};
""".strip()

    if dry_run:
        print("\n--- D1 UPDATE DRY RUN ---")
        print(sql)
        print("--- END D1 UPDATE DRY RUN ---")
        return

    proc = subprocess.run(
        [
            "npx", "wrangler", "d1", "execute",
            "inneranimalmedia-business",
            "--remote",
            "-c", "wrangler.production.toml",
            "--command", sql,
        ],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=120,
    )

    if proc.returncode != 0:
        print(proc.stdout)
        print(proc.stderr, file=sys.stderr)
        raise SystemExit(proc.returncode)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--headed", action="store_true", help="Show Chromium window.")
    parser.add_argument("--no-d1-update", action="store_true", help="Do not write task results to D1.")
    parser.add_argument("--dry-run-d1", action="store_true", help="Print D1 update SQL but do not execute.")
    args = parser.parse_args()

    ensure_playwright_available()

    run_id = "cms_frontend_" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    run_dir = ARTIFACT_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    results = []

    print(f"Run ID: {run_id}")
    print(f"Artifacts: {run_dir}")

    for target in TARGETS:
        print("\n" + "=" * 72)
        print(f"Checking {target['name']}")
        print(target["url"])
        print("=" * 72)

        result = run_target(target, run_dir, headless=not args.headed)
        results.append(result)

        icon = "PASS" if result["passed"] else "FAIL"
        print(f"{icon} {target['name']}")
        print(f"  health: {result['health']['status']} ok={result['health']['ok']}")
        print(f"  load_ms: {result['load_ms']}")
        print(f"  text_len: {result['text_len']}")
        print(f"  marker_hits: {result['marker_hits']}")
        print(f"  marker_misses: {result['marker_misses']}")
        print(f"  console_errors: {result['console_error_count']}")
        print(f"  blank_screen: {result['blank_screen']} {result['blank_reasons']}")
        print(f"  screenshot: {result['screenshot_path']}")
        if result["fail_reasons"]:
            print(f"  fail_reasons: {result['fail_reasons']}")

    summary = {
        "run_id": run_id,
        "passed": all(r["passed"] for r in results),
        "results": results,
    }

    summary_path = run_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)
    print(json.dumps({
        "run_id": run_id,
        "passed": summary["passed"],
        "summary_path": str(summary_path),
        "targets": [
            {
                "name": r["name"],
                "passed": r["passed"],
                "fail_reasons": r["fail_reasons"],
                "screenshot": r["screenshot_path"],
            }
            for r in results
        ],
    }, indent=2))

    if not args.no_d1_update:
        maybe_update_d1(run_id, results, dry_run=args.dry_run_d1)

    if not summary["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
