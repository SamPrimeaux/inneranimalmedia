#!/usr/bin/env python3
from pathlib import Path
import re

SRC = Path("artifacts/imported_pages/services.original.html")
OUT = Path("static/pages/services.html")

if not SRC.exists():
    raise SystemExit(f"Missing source: {SRC}")

html = SRC.read_text(encoding="utf-8", errors="replace")

# Remove imported page fixed header HTML only.
html = re.sub(
    r'\n\s*<header id="main-header"[\s\S]*?</header>\s*\n',
    "\n<!-- imported services header removed; global iam-header.html is injected by Worker -->\n",
    html,
    count=1,
    flags=re.I,
)

# Remove imported mobile menu HTML only.
html = re.sub(
    r'\n\s*<div id="mobile-menu"[\s\S]*?</div>\s*',
    "\n<!-- imported services mobile menu removed; global iam-header.html owns navigation -->\n",
    html,
    count=1,
    flags=re.I,
)

# Remove imported page footer. Target the footer containing "System v3.4".
footer_match = re.search(
    r'\n\s*<footer\b[\s\S]*?System\s*v3\.4[\s\S]*?</footer>\s*\n',
    html,
    flags=re.I,
)
if footer_match:
    html = html[:footer_match.start()] + "\n<!-- imported services footer removed; global iam-footer.html is injected by Worker -->\n" + html[footer_match.end():]
else:
    # Fallback: remove any footer block that appears to be the imported page footer.
    html = re.sub(
        r'\n\s*<footer\b[\s\S]*?</footer>\s*\n',
        "\n<!-- imported services footer removed; global iam-footer.html is injected by Worker -->\n",
        html,
        count=1,
        flags=re.I,
    )

# Remove only CSS rules for removed mobile menu/header shell.
# Do NOT remove script blocks; hero globe/chess scene code shares page scripts.
for selector in [
    r"#mobile-menu",
    r"#mobile-menu\.active",
    r"#main-header",
    r"\.glass-header",
]:
    html = re.sub(
        rf'\n\s*{selector}\s*\{{[\s\S]*?\}}\s*',
        "\n",
        html,
        flags=re.I,
    )

marker = "<!-- IAM_SERVICES_GLOBAL_HEADER_FOOTER_KEEP_SCENES_20260516 -->"
if marker not in html:
    html = html.replace("<body", marker + "\n<body", 1)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")

clean = OUT.read_text(encoding="utf-8", errors="replace")
bad = []
for token in ['id="main-header"', 'id="mobile-menu"', '#mobile-menu', 'System v3.4']:
    if token in clean:
        bad.append(token)

if bad:
    print("WARNING still found:", ", ".join(bad))
else:
    print("ok: removed imported header/mobile/footer; kept hero + chess scene scripts")

# Scene proof.
for token in ["hero-canvas-container", "chess-canvas", "window.heroSphere", "THREE.Scene"]:
    print(("scene ok: " if token in clean else "scene missing: ") + token)
