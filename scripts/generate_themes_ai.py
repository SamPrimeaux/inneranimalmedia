#!/usr/bin/env python3
"""
AI Theme Generator — pulls D1 config, generates full theme.json via Ollama/OpenAI/Anthropic,
uploads to R2, backfills D1 css_vars_json.

Usage:
  source .env.agentsam.local && python3 scripts/generate_themes_ai.py

Models:
  - Batch A: Ollama (qwen2.5-coder:7b) — local, free
  - Batch B: OpenAI gpt-4o-mini
  - Batch C: Anthropic claude-haiku-4-5

Run from repo root: /Users/samprimeaux/inneranimalmedia
"""
import subprocess, json, os, time, urllib.request, urllib.parse, textwrap, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Config ──────────────────────────────────────────────────────────────────
REPO     = "/Users/samprimeaux/inneranimalmedia"
DB       = "inneranimalmedia-business"
BUCKET   = "inneranimalmedia"
R2_BASE  = "cms/themes"

OLLAMA_URL  = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OPENAI_KEY  = os.environ.get("OPENAI_API_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

BATCH_SIZE  = 3   # themes per model per batch
PARALLEL    = 4   # concurrent theme generations

# ── Prompt template ──────────────────────────────────────────────────────────
SYSTEM = """You are a CSS theme engineer. Given a theme name, slug, and config data,
generate a complete theme.json with CSS custom properties.
Respond ONLY with valid JSON — no markdown, no explanation."""

def user_prompt(slug, name, config, tokens):
    cfg = {}
    try: cfg = json.loads(config or "{}")
    except: pass
    tok = {}
    try: tok = json.loads(tokens or "{}")
    except: pass
    return f"""Generate a complete theme.json for:
  slug: {slug}
  name: {name}
  config: {json.dumps(cfg, indent=2)[:800]}
  tokens: {json.dumps(tok, indent=2)[:400]}

Return JSON with this exact structure:
{{
  "cssVars": {{
    "--color-background-primary": "#hex",
    "--color-background-secondary": "#hex",
    "--color-background-tertiary": "#hex",
    "--color-surface": "#hex",
    "--color-surface-elevated": "#hex",
    "--color-text-primary": "#hex",
    "--color-text-secondary": "#hex",
    "--color-text-tertiary": "#hex",
    "--color-border": "#hex",
    "--color-border-subtle": "#hex",
    "--color-accent": "#hex",
    "--color-accent-hover": "#hex",
    "--color-accent-text": "#hex",
    "--color-error": "#hex",
    "--color-success": "#hex",
    "--color-warning": "#hex",
    "--border-radius-sm": "4px",
    "--border-radius-md": "8px",
    "--border-radius-lg": "12px",
    "--border-radius-xl": "16px",
    "--font-size-xs": "11px",
    "--font-size-sm": "13px",
    "--font-size-md": "15px",
    "--font-size-lg": "18px",
    "--font-mono": "JetBrains Mono, Fira Code, monospace",
    "--shadow-sm": "0 1px 3px rgba(0,0,0,0.15)",
    "--shadow-md": "0 4px 12px rgba(0,0,0,0.2)",
    "--shadow-lg": "0 8px 32px rgba(0,0,0,0.3)"
  }},
  "monacoTheme": "vs-dark",
  "monacoBackground": "#hex",
  "family": "custom",
  "dark": true
}}

Use colors that match the theme name/slug. Return ONLY the JSON object."""

# ── D1 helpers ───────────────────────────────────────────────────────────────
def d1_query(sql):
    env_script = f"{REPO}/scripts/with-cloudflare-env.sh"
    cmd = [env_script, "npx", "wrangler", "d1", "execute", DB,
           "--remote", "-c", "wrangler.production.toml", "--json", "--command", sql]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    try:
        return json.loads(r.stdout)[0].get("results", [])
    except:
        return []

def d1_update(slug, css_vars_json):
    escaped = css_vars_json.replace("'", "''")
    sql = f"UPDATE cms_themes SET css_vars_json = '{escaped}' WHERE slug = '{slug}'"
    d1_query(sql)

# ── R2 upload ─────────────────────────────────────────────────────────────────
def r2_put(key, content_str, content_type="application/json"):
    import tempfile, os
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        f.write(content_str)
        tmp = f.name
    try:
        env_script = f"{REPO}/scripts/with-cloudflare-env.sh"
        cmd = [env_script, "npx", "wrangler", "r2", "object", "put",
               f"{BUCKET}/{key}", "--file", tmp,
               "--content-type", content_type,
               "--remote", "-c", "wrangler.production.toml"]
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
        return r.returncode == 0
    finally:
        os.unlink(tmp)

# ── Model calls ───────────────────────────────────────────────────────────────
def call_ollama(slug, name, config, tokens):
    payload = json.dumps({
        "model": "qwen2.5-coder:7b",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user",   "content": user_prompt(slug, name, config, tokens)}
        ],
        "stream": False,
        "options": {"temperature": 0.3}
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    return data["message"]["content"]

def call_openai(slug, name, config, tokens):
    if not OPENAI_KEY:
        raise RuntimeError("no OPENAI_API_KEY")
    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user",   "content": user_prompt(slug, name, config, tokens)}
        ],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_KEY}"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["choices"][0]["message"]["content"]

def call_anthropic(slug, name, config, tokens):
    if not ANTHROPIC_KEY:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    payload = json.dumps({
        "model": "claude-haiku-4-5",
        "max_tokens": 1024,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": user_prompt(slug, name, config, tokens)}]
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    return data["content"][0]["text"]

MODELS = [call_ollama, call_openai, call_anthropic]
MODEL_NAMES = ["ollama/qwen2.5-coder", "openai/gpt-4o-mini", "anthropic/haiku"]

def parse_theme_json(raw):
    """Extract JSON from model response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())

# ── Process one theme ─────────────────────────────────────────────────────────
def process_theme(theme, model_fn, model_name):
    slug   = theme["slug"]
    name   = theme["name"]
    config = theme.get("config", "{}")
    tokens = theme.get("tokens_json", "{}")

    try:
        raw = model_fn(slug, name, config, tokens)
        data = parse_theme_json(raw)
        css_vars = data.get("cssVars") or data.get("css_vars") or {}
        if not css_vars:
            return slug, False, "model returned no cssVars"

        # Build theme.json
        theme_json = {
            "slug": slug,
            "name": name,
            "cssVars": css_vars,
            "monacoTheme": data.get("monacoTheme", "vs-dark"),
            "monacoBackground": data.get("monacoBackground", css_vars.get("--color-background-primary", "#1e1e1e")),
            "family": data.get("family", "custom"),
            "dark": data.get("dark", True),
            "generatedBy": model_name,
            "generatedAt": int(time.time())
        }

        # Upload to R2
        r2_key = f"{R2_BASE}/{slug}/theme.json"
        ok = r2_put(r2_key, json.dumps(theme_json, indent=2))
        if not ok:
            return slug, False, "R2 upload failed"

        # Backfill D1
        d1_update(slug, json.dumps(css_vars))

        return slug, True, f"{len(css_vars)} vars via {model_name}"

    except Exception as e:
        return slug, False, str(e)[:120]

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'═'*65}")
    print(f"  AI Theme Generator — Ollama / OpenAI / Anthropic")
    print(f"{'═'*65}\n")

    # Fetch themes needing work
    themes = d1_query("""
        SELECT slug, name, config, tokens_json, css_r2_key
        FROM cms_themes
        WHERE length(css_vars_json) <= 2 AND status = 'active'
        ORDER BY slug
    """)
    print(f"  {len(themes)} themes need generation\n")

    if not themes:
        print("  Nothing to do.")
        return

    # Assign models round-robin
    tasks = []
    for i, t in enumerate(themes):
        model_fn   = MODELS[i % len(MODELS)]
        model_name = MODEL_NAMES[i % len(MODEL_NAMES)]
        tasks.append((t, model_fn, model_name))

    fixed = failed = 0
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        futures = {pool.submit(process_theme, t, fn, mn): t["slug"]
                   for t, fn, mn in tasks}
        for future in as_completed(futures):
            slug, ok, msg = future.result()
            if ok:
                fixed += 1
                print(f"  ✓ {slug:<40} {msg}")
            else:
                failed += 1
                print(f"  ✗ {slug:<40} {msg}")

    print(f"\n{'─'*65}")
    print(f"  {fixed} fixed  |  {failed} failed  |  {len(themes)} total\n")

if __name__ == "__main__":
    main()
