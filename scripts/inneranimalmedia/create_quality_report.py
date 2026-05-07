from pathlib import Path
import json, os, html, shutil, re

WORKSPACE = os.getenv("IAM_WORKSPACE_SLUG", "inneranimalmedia")
BRAND = os.getenv("IAM_BRAND_NAME", "Inner Animal Media")
PUBLIC_BASE = os.getenv("IAM_PUBLIC_REPORT_BASE", f"https://assets.inneranimalmedia.com/captures/{WORKSPACE}")

HEADER_LOGO = os.getenv("IAM_HEADER_LOGO", "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail")
FOOTER_LOGO = os.getenv("IAM_FOOTER_LOGO", "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar")

ROOT = Path("captures") / WORKSPACE
RESULTS_JSON = ROOT / "results.json"
RAW_REPORT = ROOT / "raw-quality-report" / "index.html"
OUT_DIR = ROOT / "report"
OUT = OUT_DIR / "index.html"

OUT_DIR.mkdir(parents=True, exist_ok=True)

def esc(v):
    return html.escape(str(v or ""))

def load_json(path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}

data = load_json(RESULTS_JSON)
tests = []

def find_artifacts(test_title):
    safe_words = [w for w in re.split(r"[^a-zA-Z0-9]+", test_title.lower()) if len(w) > 2]
    matches = []
    for p in (ROOT / "results").glob("**/*"):
        if p.is_file():
            low = str(p).lower()
            score = sum(1 for w in safe_words if w in low)
            if score:
                matches.append((score, p))
    matches.sort(reverse=True, key=lambda x: x[0])
    files = [p for _, p in matches[:8]]

    out = {"screenshots": [], "videos": [], "traces": [], "errors": [], "other": []}
    for p in files:
        rel = p.relative_to(ROOT)
        href = f"../{rel.as_posix()}"
        suffix = p.suffix.lower()
        name = p.name
        item = {"name": name, "href": href}
        if suffix in [".png", ".jpg", ".jpeg", ".webp"]:
            out["screenshots"].append(item)
        elif suffix in [".webm", ".mp4"]:
            out["videos"].append(item)
        elif suffix == ".zip" and "trace" in name.lower():
            item["trace_viewer"] = f"{PUBLIC_BASE}/raw-quality-report/trace/index.html?trace={PUBLIC_BASE}/{rel.as_posix()}"
            out["traces"].append(item)
        elif name == "error-context.md" or suffix in [".md", ".txt", ".json"]:
            out["errors"].append(item)
        else:
            out["other"].append(item)
    return out

def walk_suite(suite, ancestors=None):
    ancestors = ancestors or []
    title = suite.get("title")
    path = [*ancestors, title] if title else ancestors

    for spec in suite.get("specs", []):
        spec_title = spec.get("title", "Untitled")
        for t in spec.get("tests", []):
            results = t.get("results", [])
            status = t.get("outcome") or t.get("status") or "unknown"
            duration = sum(r.get("duration", 0) for r in results)
            errors = []
            for r in results:
                for e in r.get("errors", []):
                    msg = e.get("message") or e.get("stack") or str(e)
                    if msg:
                        errors.append(msg)
            title_full = " › ".join([x for x in [*path, spec_title] if x])
            tests.append({
                "title": title_full,
                "status": status,
                "duration": duration,
                "errors": errors,
                "artifacts": find_artifacts(title_full),
            })

    for child in suite.get("suites", []):
        walk_suite(child, path)

for suite in data.get("suites", []):
    walk_suite(suite)

total = len(tests)
passed = sum(1 for t in tests if t["status"] in ("expected", "passed"))
failed = sum(1 for t in tests if t["status"] in ("unexpected", "failed"))
flaky = sum(1 for t in tests if t["status"] == "flaky")
skipped = sum(1 for t in tests if t["status"] == "skipped")

def status_label(s):
    return {
        "expected": "passed",
        "unexpected": "failed",
    }.get(s, s)

def artifact_html(t):
    a = t["artifacts"]
    parts = []

    if t["errors"]:
        err = "\n\n".join(t["errors"][:2])
        parts.append(f"<details open><summary>Errors</summary><pre>{esc(err)}</pre></details>")

    if a["screenshots"]:
        imgs = "".join(f"<a href='{esc(x['href'])}' target='_blank'><img src='{esc(x['href'])}'></a>" for x in a["screenshots"])
        parts.append(f"<details open><summary>Screenshots</summary><div class='media-grid'>{imgs}</div></details>")

    if a["videos"]:
        vids = "".join(f"<video controls src='{esc(x['href'])}'></video>" for x in a["videos"])
        parts.append(f"<details><summary>Recordings</summary><div class='media-grid'>{vids}</div></details>")

    if a["traces"]:
        links = "".join(f"<a class='pill' href='{esc(x['href'])}' target='_blank'>trace.zip</a>" for x in a["traces"])
        parts.append(f"<details><summary>Trace Data</summary><div class='links'>{links}</div></details>")

    if a["errors"]:
        links = "".join(f"<a class='pill' href='{esc(x['href'])}' target='_blank'>{esc(x['name'])}</a>" for x in a["errors"])
        parts.append(f"<details><summary>Evidence Files</summary><div class='links'>{links}</div></details>")

    return "".join(parts) or "<p class='muted'>No attached artifacts for this test.</p>"

rows = ""
for i, t in enumerate(tests):
    status = status_label(t["status"])
    rows += f"""
      <details class="test-row {esc(status)}">
        <summary>
          <span class="test-name">{esc(t['title'])}</span>
          <span class="status {esc(status)}">{esc(status)}</span>
          <span>{esc(t['duration'])}ms</span>
        </summary>
        <div class="test-detail">
          {artifact_html(t)}
        </div>
      </details>
    """

if not rows:
    rows = "<div class='empty'>No tests found. Run Playwright first.</div>"

html_out = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{esc(BRAND)} Quality Report</title>
<link rel="icon" href="{esc(HEADER_LOGO)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*{{box-sizing:border-box}}
body{{margin:0;background:#020617;color:#f8fafc;font-family:Inter,system-ui,sans-serif}}
a{{color:#4ade80}}
.hero{{display:flex;justify-content:space-between;align-items:center;padding:34px 48px;background:linear-gradient(135deg,#020617,#052e16);border-bottom:1px solid #22c55e}}
.brand{{display:flex;align-items:center;gap:22px}}
.brand img{{width:88px;height:88px;object-fit:contain;border:1px solid #4ade80;border-radius:18px;background:#020617}}
h1{{margin:0;font-size:42px;letter-spacing:.08em;text-transform:uppercase}}
.sub{{color:#4ade80;font-weight:900;letter-spacing:.3em;text-transform:uppercase;margin-top:8px}}
.meta{{display:flex;gap:34px;color:#94a3b8;text-transform:uppercase;font-size:12px;font-weight:800}}
.meta strong{{display:block;color:white;font-size:16px;text-transform:none;margin-top:7px}}
.shell{{display:grid;grid-template-columns:280px 1fr;min-height:68vh}}
.side{{padding:28px 22px;border-right:1px solid rgba(74,222,128,.25);background:rgba(2,6,23,.68)}}
.nav{{display:flex;justify-content:space-between;padding:13px 16px;margin-bottom:8px;border-radius:12px;color:#d1d5db;background:rgba(15,23,42,.58)}}
.nav.active{{color:white;border-left:4px solid #4ade80}}
.content{{padding:32px 42px;background:radial-gradient(circle at 20% 0%,rgba(34,197,94,.15),transparent 35%)}}
.cards{{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;margin-bottom:28px}}
.card{{background:rgba(15,23,42,.74);border:1px solid rgba(148,163,184,.2);border-radius:16px;padding:22px}}
.card span{{color:#94a3b8;text-transform:uppercase;font-size:12px;font-weight:800}}
.card b{{display:block;font-size:40px;margin-top:10px}}
.toolbar{{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}}
.toolbar a{{text-decoration:none;border:1px solid rgba(74,222,128,.45);padding:10px 14px;border-radius:10px}}
.test-list{{border:1px solid rgba(148,163,184,.18);border-radius:16px;overflow:hidden;background:rgba(15,23,42,.72)}}
.test-row{{border-bottom:1px solid rgba(148,163,184,.15)}}
.test-row summary{{cursor:pointer;display:grid;grid-template-columns:1fr 120px 120px;gap:18px;padding:16px 18px;align-items:center}}
.test-detail{{padding:18px 24px;background:rgba(2,6,23,.58)}}
.status{{font-weight:900;text-transform:uppercase}}
.status.passed{{color:#4ade80}} .status.failed{{color:#ef4444}} .status.flaky{{color:#facc15}} .status.skipped{{color:#94a3b8}}
pre{{white-space:pre-wrap;background:#111827;border:1px solid rgba(148,163,184,.2);padding:16px;border-radius:12px;overflow:auto;color:#e5e7eb}}
.media-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:14px}}
.media-grid img,.media-grid video{{width:100%;border-radius:12px;border:1px solid rgba(148,163,184,.25);background:#020617}}
.pill{{display:inline-block;margin:8px 8px 0 0;padding:9px 12px;border:1px solid rgba(74,222,128,.38);border-radius:999px;text-decoration:none}}
.empty,.muted{{color:#94a3b8}}
.footer{{display:flex;justify-content:space-between;align-items:center;padding:34px 48px;background:linear-gradient(135deg,#052e16,#020617);border-top:1px solid #22c55e}}
.footer img{{width:92px;height:92px;border-radius:999px;border:1px solid #84cc16;object-fit:cover}}
.footbrand{{display:flex;align-items:center;gap:20px}}
.tag{{color:#4ade80;margin-top:6px}}
@media(max-width:900px){{.hero,.footer{{flex-direction:column;align-items:flex-start}}.shell{{grid-template-columns:1fr}}.cards{{grid-template-columns:1fr 1fr}}.meta{{flex-direction:column}}}}
</style>
</head>
<body>
<header class="hero">
  <div class="brand"><img src="{esc(HEADER_LOGO)}"><div><h1>{esc(BRAND)}</h1><div class="sub">Quality Report</div></div></div>
  <div class="meta">
    <div>Workspace<strong>{esc(WORKSPACE)}</strong></div>
    <div>Framework<strong>Custom Quality Engine</strong></div>
    <div>Generated<strong>Automated QA</strong></div>
  </div>
</header>

<div class="shell">
  <aside class="side">
    <div class="nav active"><span>Overview</span><b>{total}</b></div>
    <div class="nav"><span>Passed</span><b>{passed}</b></div>
    <div class="nav"><span>Failed</span><b>{failed}</b></div>
    <div class="nav"><span>Flaky</span><b>{flaky}</b></div>
    <div class="nav"><span>Skipped</span><b>{skipped}</b></div>
    <hr style="border-color:rgba(148,163,184,.18);margin:22px 0">
    <div class="nav"><span>Screenshots</span><b>●</b></div>
    <div class="nav"><span>Videos</span><b>●</b></div>
    <div class="nav"><span>Traces</span><b>●</b></div>
    <div class="nav"><span>Errors</span><b>●</b></div>
  </aside>

  <main class="content">
    <section class="cards">
      <div class="card"><span>Total</span><b>{total}</b></div>
      <div class="card"><span>Passed</span><b>{passed}</b></div>
      <div class="card"><span>Failed</span><b>{failed}</b></div>
      <div class="card"><span>Flaky</span><b>{flaky}</b></div>
      <div class="card"><span>Skipped</span><b>{skipped}</b></div>
    </section>

    <div class="toolbar">
      <h2 style="color:#4ade80;text-transform:uppercase;letter-spacing:.12em">Test Evidence</h2>
      <a href="../raw-quality-report/index.html" target="_blank">Advanced Diagnostics</a>
    </div>

    <section class="test-list">
      {rows}
    </section>
  </main>
</div>

<footer class="footer">
  <div class="footbrand"><img src="{esc(FOOTER_LOGO)}"><div><strong>{esc(BRAND)}</strong><div class="tag">Automate. Validate. Elevate.</div></div></div>
  <div>Generated by Inner Animal Media.<br>Hosted quality evidence for this workspace.</div>
</footer>
</body>
</html>
"""

OUT.write_text(html_out)
print(OUT)
