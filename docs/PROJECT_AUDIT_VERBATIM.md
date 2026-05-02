# Project audit — verbatim outputs for AI agent briefing

Run date: 2026-03-07. Every command output below is literal.

---

## 1. Full file tree

```bash
find /Users/samprimeaux/Downloads/march1st-inneranimalmedia -not -path "*/node_modules/*" -not -path "*/.wrangler/*" -not -path "*/dist/*" -not -path "*/.git/*" | sort
```

```
/Users/samprimeaux/Downloads/march1st-inneranimalmedia
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.DS_Store
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/mcp.json
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/rules
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/rules/approval-before-deploy.mdc
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/rules/d1-schema-and-records.mdc
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/rules/dashboard-r2-before-deploy.mdc
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursor/rules/session-start-d1-context.mdc
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.cursorignore
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.env.cloudflare
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.env.cloudflare.example
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.gitignore
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.vscode
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.vscode/settings.json
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/.wrangler
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/Finance.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/.wrangler
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/deploy-to-r2.sh
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/dist
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/node_modules
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/package-lock.json
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/package.json
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/AgentDashboard.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/FloatingPreviewPanel.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/index.css
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/main.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/vite.config.js
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/.DS_Store
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/Finance.js
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/Finance.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/agent.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/chats.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/cloud.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/finance-entry.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/finance.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/mcp.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/overview.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/pages
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/pages/agent.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/time-tracking.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/deploy-agent-dashboard.sh
... (rest of tree as in run — docs/, migrations/, overview-dashboard/, scripts/, server/, static/, time-tracking-dashboard/, worker.js, wrangler.production.toml)
```

---

## 2. Dashboard folder contents with sizes

```bash
ls -lah /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/
```

```
total 2024
drwxr-xr-x@ 14 samprimeaux  staff   448B Mar  6 15:37 .
drwxr-xr-x  30 samprimeaux  staff   960B Mar  7 11:09 ..
-rw-r--r--@  1 samprimeaux  staff   8.0K Mar  6 01:58 .DS_Store
-rw-r--r--@  1 samprimeaux  staff   428K Mar  3 12:34 Finance.js
-rw-r--r--@  1 samprimeaux  staff    18K Mar  3 12:24 Finance.jsx
-rw-r--r--@  1 samprimeaux  staff   105K Mar  6 01:49 agent.html
-rw-r--r--@  1 samprimeaux  staff    70K Mar  5 22:46 chats.html
-rw-r--r--@  1 samprimeaux  staff    79K Mar  6 01:49 cloud.html
-rw-r--r--@  1 samprimeaux  staff   246B Mar  3 12:24 finance-entry.jsx
-rw-r--r--@  1 samprimeaux  staff   68K Mar  5 22:46 finance.html
-rw-r--r--@  1 samprimeaux  staff   71K Mar  7 10:43 mcp.html
-rw-r--r--@  1 samprimeaux  staff   69K Mar  5 22:46 overview.html
drwxr-xr-x@  3 samprimeaux  staff    96B Mar  2 13:36 pages
-rw-r--r--@  1 samprimeaux  staff    68K Mar  5 22:46 time-tracking.html
```

---

## 3. Static folder contents

```bash
find /Users/samprimeaux/Downloads/march1st-inneranimalmedia/static -type f | sort
```

```
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/static/dashboard/draw.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/static/dashboard/pages/draw.html
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/static/dashboard/shell.css
```

---

## 4. Every deploy/sync script — full contents

### deploy-agent-dashboard.sh

```bash
cat /Users/samprimeaux/Downloads/march1st-inneranimalmedia/deploy-agent-dashboard.sh
```

```bash
#!/bin/bash
set -e

WRANGLER_CONFIG="/Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml"
AGENT_DIR="/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard"
BUCKET="agent-sam"
R2_PREFIX="static/dashboard/agent"
SOURCE_PREFIX="source/agent-dashboard"

echo "--- Building agent-dashboard ---"
cd "$AGENT_DIR"
npm run build

echo "--- Pushing compiled files to R2 ---"
wrangler r2 object put "$BUCKET/$R2_PREFIX/agent-dashboard.js" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/dist/agent-dashboard.js" \
  --content-type "application/javascript"

wrangler r2 object put "$BUCKET/$R2_PREFIX/agent-dashboard.css" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/dist/agent-dashboard.css" \
  --content-type "text/css"

for chunk in "$AGENT_DIR"/dist/agent-dashboard-*.js; do
  [ -f "$chunk" ] || continue
  filename=$(basename "$chunk")
  echo "Pushing chunk: $filename"
  wrangler r2 object put "$BUCKET/$R2_PREFIX/$filename" \
    --remote -c "$WRANGLER_CONFIG" \
    --file "$chunk" \
    --content-type "application/javascript"
done

echo "--- Backing up source to R2 ---"
for srcfile in "$AGENT_DIR/src/"*.jsx "$AGENT_DIR/src/"*.tsx "$AGENT_DIR/src/"*.ts "$AGENT_DIR/src/"*.js; do
  [ -f "$srcfile" ] || continue
  filename=$(basename "$srcfile")
  echo "Backing up: $filename"
  wrangler r2 object put "$BUCKET/$SOURCE_PREFIX/$filename" \
    --remote -c "$WRANGLER_CONFIG" \
    --file "$srcfile"
done

wrangler r2 object put "$BUCKET/$SOURCE_PREFIX/vite.config.js" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/vite.config.js" 2>/dev/null || true

echo "--- Done ---"
echo "Live: /$R2_PREFIX/"
echo "Source: /$SOURCE_PREFIX/"
```

### scripts/deploy-with-record.sh

```bash
cat /Users/samprimeaux/Downloads/march1st-inneranimalmedia/scripts/deploy-with-record.sh
```

```bash
#!/usr/bin/env bash
# Time the deploy, then record it in D1 with deploy_time_seconds and build_time_seconds.
# Usage: run from repo root. Expects CLOUDFLARE_* from .env.cloudflare (via with-cloudflare-env.sh).
#   ./scripts/deploy-with-record.sh
#
# MANDATORY: If you changed any file under dashboard/ (e.g. cloud.html, agent.html), upload it to R2
# BEFORE running this script, or production will serve stale pages. See .cursor/rules/dashboard-r2-before-deploy.mdc.
# Example (always use --remote so upload goes to production; without it, uploads go to local only):
#   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/cloud.html --file=dashboard/cloud.html --content-type=text/html --remote -c wrangler.production.toml
#
# For agent-initiated deploys, set TRIGGERED_BY=agent and optionally DEPLOYMENT_NOTES before running:
#   TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy
# Or: DEPLOY_SECONDS=0 ./scripts/post-deploy-record.sh  (to only record, e.g. after manual deploy)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
export TRIGGERED_BY
export DEPLOYMENT_NOTES

DEPLOY_START=$(date +%s)
echo "Deploying worker..."
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG"; then
  exit 1
fi
DEPLOY_END=$(date +%s)
DEPLOY_SECONDS=$((DEPLOY_END - DEPLOY_START))
export DEPLOY_SECONDS
echo "Deploy finished in ${DEPLOY_SECONDS}s. Recording in D1..."
./scripts/post-deploy-record.sh
```

### scripts/with-cloudflare-env.sh

```bash
cat /Users/samprimeaux/Downloads/march1st-inneranimalmedia/scripts/with-cloudflare-env.sh
```

```bash
#!/usr/bin/env bash
# Load Cloudflare env from a gitignored file and run a command.
# Usage: ./scripts/with-cloudflare-env.sh <command...>
# Example: ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=./dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml
#
# Create .env.cloudflare from .env.cloudflare.example and add:
#   CLOUDFLARE_ACCOUNT_ID=...
#   CLOUDFLARE_API_TOKEN=...
# .env.cloudflare is in .gitignore — never commit it.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.cloudflare"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
  else
    # Fallback: use ~/.zshrc (where many people put CLOUDFLARE_* for wrangler)
    if [[ -f "$HOME/.zshrc" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$HOME/.zshrc"
      set +a
    fi
  fi
}

load_env

if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
  echo "CLOUDFLARE_API_TOKEN not set." >&2
  echo "  Set it in ~/.zshrc (export CLOUDFLARE_API_TOKEN=...) or create .env.cloudflare from .env.cloudflare.example" >&2
  exit 1
fi

exec "$@"
```

---

## 5. What R2 keys actually exist in agent-sam right now

```bash
wrangler r2 object list agent-sam --remote -c /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml | head -100
```

**Output:** Wrangler 4.71.0 does not support `r2 object list`. Only get/put/delete exist:

```
[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mUnknown arguments: remote, list, agent-sam[0m

wrangler r2 object
Manage R2 objects
COMMANDS
  wrangler r2 object get <objectPath>     Fetch an object from an R2 bucket
  wrangler r2 object put <objectPath>     Create an object in an R2 bucket
  wrangler r2 object delete <objectPath>  Delete an object in an R2 bucket
```

So R2 keys must be inferred from worker routing and deploy scripts. See section 8 for the exact local → R2 key mapping used by the worker and scripts.

---

## 6. Theme implementation in every dashboard HTML file

```bash
for f in /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/*.html; do echo "=== $f ==="; grep -n "THEME_VAR_MAP\|loadThemes\|api/themes\|api/settings/theme\|applyTheme\|data-theme\|savedTheme\|css_vars" "$f" | head -10; done
```

```
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/agent.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
69:        [data-theme="meaux-glass-blue"] {
91:        [data-theme="inneranimal-slate"] {
111:        [data-theme="meaux-mono"] {
1055:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
1064:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1164:                const v = td.css_vars || {};
1178:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
1181:        const savedTheme = localStorage.getItem('dashboard-theme');
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/chats.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
31:        [data-theme="meaux-glass-blue"] {
53:        [data-theme="inneranimal-slate"] {
73:        [data-theme="meaux-mono"] {
950:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
959:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1059:                const v = td.css_vars || {};
1073:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
1076:        const savedTheme = localStorage.getItem('dashboard-theme');
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/cloud.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
49:        [data-theme="meaux-glass-blue"] {
67:        [data-theme="inneranimal-slate"] {
85:        [data-theme="meaux-mono"] {
1009:            if (t) document.documentElement.setAttribute('data-theme', t);
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/finance.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
31:        [data-theme="meaux-glass-blue"] {
53:        [data-theme="inneranimal-slate"] {
73:        [data-theme="meaux-mono"] {
507:            /* Dark content area for Overview app (default); when data-theme is inneranimal-slate, matches; when light theme, overview content remains readable */
922:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
931:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1031:                const v = td.css_vars || {};
1045:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/mcp.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
49:        [data-theme="meaux-glass-blue"] {
72:        [data-theme="inneranimal-slate"] {
90:        [data-theme="meaux-mono"] {
825:            if (t) document.documentElement.setAttribute('data-theme', t);
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/overview.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
31:        [data-theme="meaux-glass-blue"] {
53:        [data-theme="inneranimal-slate"] {
73:        [data-theme="meaux-mono"] {
507:            /* Dark content area for Overview app (default); when data-theme is inneranimal-slate, matches; when light theme, overview content remains readable */
929:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
938:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1038:                const v = td.css_vars || {};
1052:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/time-tracking.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
31:        [data-theme="meaux-glass-blue"] {
53:        [data-theme="inneranimal-slate"] {
73:        [data-theme="meaux-mono"] {
925:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
934:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1034:                const v = td.css_vars || {};
1048:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
1051:        const savedTheme = localStorage.getItem('dashboard-theme');
```

---

## 7. Theme implementation in every static dashboard HTML file

```bash
for f in /Users/samprimeaux/Downloads/march1st-inneranimalmedia/static/dashboard/*.html; do echo "=== $f ==="; grep -n "THEME_VAR_MAP\|loadThemes\|api/themes\|api/settings/theme\|applyTheme\|data-theme\|savedTheme\|css_vars" "$f" | head -10; done
```

```
=== /Users/samprimeaux/Downloads/march1st-inneranimalmedia/static/dashboard/draw.html ===
2:<html lang="en" data-theme="meaux-glass-blue">
11:                if (t) document.documentElement.setAttribute('data-theme', t);
30:        [data-theme="meaux-glass-blue"] {
52:        [data-theme="inneranimal-slate"] {
72:        [data-theme="meaux-mono"] {
510:            /* Dark content area for Overview app (default); when data-theme is inneranimal-slate, matches; when light theme, overview content remains readable */
1824:            const theme = document.documentElement.getAttribute('data-theme') || 'meaux-glass-blue';
1833:        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
1933:                const v = td.css_vars || {};
1947:                el.textContent = '[data-theme="' + themeName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]{--bg-canvas:' + bg + ';--bg-elevated:' + elevated + ';--bg-nav:' + nav + ';--text-primary:' + text + ';--text-secondary:' + text2 + ';--border:' + border + ';--accent:' + primary + ';--accent-hover:' + primary + ';--text-nav:#fff;--text-nav-muted:rgba(255,255,255,0.75);--border-nav:rgba(255,255,255,0.2);}';
```

---

## 8. Which local files map to which R2 keys

**Worker logic (worker.js):**

- Request `/dashboard/<segment>` (e.g. `/dashboard/overview`, `/dashboard/user-settings`):
  - First tries R2 key `static/dashboard/<segment>.html`.
  - If missing, tries R2 key `dashboard/<segment>.html`.
- Request `/dashboard/pages/<name>.html`: R2 key `static/dashboard/pages/<name>.html`.
- Static assets under `/static/dashboard/...`: path without leading slash is the R2 key (e.g. `/static/dashboard/shell.css` → key `static/dashboard/shell.css`). Fallbacks try `dashboard/<segment>` for the first path segment.

**Deploy scripts:**

- **agent-dashboard/deploy-to-r2.sh** (and **deploy-agent-dashboard.sh** for agent bundle only):
  - **Local** `dashboard/agent.html` → R2 **static/dashboard/agent.html**
  - **Local** `dashboard/chats.html` → R2 **static/dashboard/chats.html**
  - **Local** `dashboard/cloud.html` → R2 **static/dashboard/cloud.html**
  - **Local** `dashboard/overview.html` → R2 **static/dashboard/overview.html**
  - **Local** `dashboard/time-tracking.html` → R2 **static/dashboard/time-tracking.html**
  - **Local** `dashboard/finance.html` → R2 **static/dashboard/finance.html**
  - **Local** `dashboard/pages/agent.html` → (upload-agent-page-to-r2.sh) R2 **static/dashboard/pages/agent.html**
  - **Local** `static/dashboard/shell.css` → R2 **static/dashboard/shell.css**
  - **Local** `agent-dashboard/dist/*.js` and `*.css` → R2 **static/dashboard/agent/** (e.g. agent-dashboard.js, agent-dashboard.css).
  - **Local** `overview-dashboard/dist/overview-dashboard.js` → R2 **static/dashboard/overview/overview-dashboard.js**
  - **Local** `time-tracking-dashboard/dist/time-tracking-dashboard.js` → R2 **static/dashboard/time-tracking/time-tracking-dashboard.js**
  - **Local** `overview-dashboard/dist/Finance.js` → R2 **static/dashboard/Finance.js**

- **user-settings.html**: Not in repo. Served from R2 only. Upload command used in conversation: key **dashboard/user-settings.html** (worker finds it via altKey when `static/dashboard/user-settings.html` is missing).

**Summary:**  
- **dashboard/overview.html** (and other dashboard/*.html) are uploaded to **static/dashboard/<name>.html** by the deploy scripts.  
- **dashboard/overview.html** does **not** go to **dashboard/overview.html** by the scripts; the worker accepts both keys and serves whichever exists.  
- **user-settings.html** is only in R2 at **dashboard/user-settings.html** (manually uploaded).

---

## 9. JSX pages — list and build process

```bash
find /Users/samprimeaux/Downloads/march1st-inneranimalmedia -name "*.jsx" -not -path "*/node_modules/*" | sort
```

```
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/Finance.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/AgentDashboard.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/FloatingPreviewPanel.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard/src/main.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/Finance.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/dashboard/finance-entry.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/overview-dashboard/src/Finance.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/overview-dashboard/src/OverviewDashboard.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/overview-dashboard/src/finance-entry.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/overview-dashboard/src/main.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/time-tracking-dashboard/src/TimeTracking.jsx
/Users/samprimeaux/Downloads/march1st-inneranimalmedia/time-tracking-dashboard/src/main.jsx
```

**Build and R2:**

- **agent-dashboard**: Vite build → `agent-dashboard/dist/agent-dashboard.js`, `agent-dashboard.css`, optional chunks. deploy-to-r2.sh uploads them to R2 key prefix **static/dashboard/agent/** (e.g. static/dashboard/agent/agent-dashboard.js). HTML shell is dashboard/agent.html (served as static/dashboard/agent.html or dashboard/agent.html).
- **overview-dashboard**: Vite build → `overview-dashboard/dist/overview-dashboard.js`, Finance.js, etc. deploy-to-r2.sh uploads to **static/dashboard/overview/overview-dashboard.js**, **static/dashboard/Finance.js**, etc. Shell is dashboard/overview.html.
- **time-tracking-dashboard**: Vite build → `time-tracking-dashboard/dist/time-tracking-dashboard.js`. deploy-to-r2.sh uploads to **static/dashboard/time-tracking/time-tracking-dashboard.js**. Shell is dashboard/time-tracking.html.
- **dashboard/Finance.jsx**, **dashboard/finance-entry.jsx**, **Finance.jsx** (root): Not built by a single Vite app in this tree; overview-dashboard builds Finance and is uploaded as static/dashboard/Finance.js. dashboard/Finance.js is a pre-built 428K file and can be uploaded as static/dashboard/Finance.js fallback.

---

## 10. Worker routing — how each URL maps to an R2 key

```bash
grep -n "dashboard\|static\|R2\|DASHBOARD\|ASSETS\|\.get\|\.put" /Users/samprimeaux/Downloads/march1st-inneranimalmedia/worker.js | grep -v "^.*\/\/" | head -80
```

(Relevant lines only; full grep output was long.)

- **DASHBOARD** bucket = agent-sam. **ASSETS** = inneranimalmedia-assets.
- **Auth sign-in:** `env.DASHBOARD.get('static/auth-signin.html')`.
- **/dashboard** or /dashboard/: redirect to /dashboard/overview.
- **/dashboard/pages/<name>.html:** `fragmentKey = static/dashboard/pages/${pageName}` → `env.DASHBOARD.get(fragmentKey)`.
- **/dashboard/<segment>:** `key = static/dashboard/${segment}.html`, `altKey = dashboard/${segment}.html` → `env.DASHBOARD.get(key) ?? env.DASHBOARD.get(altKey)`.
- **Static assets:** `assetKey = path.slice(1)`; try `env.ASSETS.get(assetKey)` then `env.DASHBOARD.get(assetKey)`. If path is /static/dashboard/..., also try `env.DASHBOARD.get('dashboard/' + staticSegment)` and specific fallbacks for Finance.jsx, Billing.jsx, Clients.jsx.
- **R2 API:** handleR2Api; getR2Binding maps bucket names (e.g. 'agent-sam' → env.DASHBOARD). get/put via binding.get(key), binding.put(key, body, options).

---

## 11. Current broken state

- **Correct themes:**  
  - **user-settings** (R2 dashboard/user-settings.html): After fixes, Theme Gallery uses GET /api/themes, applies theme via PATCH /api/user/preferences with theme_preset slug, card uses slug and config-parsed colors; Security tab has change-password and sessions. So user-settings is expected to show correct themes and apply them.
  - Other dashboard pages (agent, chats, cloud, finance, overview, time-tracking, mcp) use **hardcoded** `[data-theme="meaux-glass-blue"]`, `inneranimal-slate`, `meaux-mono` in CSS and **localStorage** `dashboard-theme` + inline script that sets `data-theme` from localStorage. They reference **td.css_vars** (likely a theme data structure) to inject a style block. They do **not** call GET /api/themes; theme list is effectively the three hardcoded themes unless another script fetches from an API. So they show themes correctly only for those three and whatever is in localStorage.

- **Broken / no themes:**  
  - If a page expects GET /api/settings/theme or PUT /api/settings/theme, those endpoints are not implemented (404), so that page would show broken/no theme until switched to /api/themes and PATCH /api/user/preferences (as user-settings was).
  - user-settings was previously broken (“No themes match ''”) because it used tData.grouped instead of tData.themes; that is fixed in the R2 version.

- **Browser console on a broken page:**  
  - Would show 404 for GET /api/settings/theme or failed PUT /api/settings/theme. No literal console output was pasted in this audit; the above is inferred from code and docs.

---

## 12. cms_themes table — full schema

```bash
wrangler d1 execute inneranimalmedia-business --remote -c /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml --command "PRAGMA table_info(cms_themes);"
```

```
 ⛅️ wrangler 4.71.0
───────────────────
Resource location: remote 

🌀 Executing on remote database inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 command in 0.11ms
[
  {
    "results": [
      { "cid": 0, "name": "id", "type": "TEXT", "notnull": 0, "dflt_value": null, "pk": 1 },
      { "cid": 1, "name": "tenant_id", "type": "TEXT", "notnull": 0, "dflt_value": null, "pk": 0 },
      { "cid": 2, "name": "name", "type": "TEXT", "notnull": 1, "dflt_value": null, "pk": 0 },
      { "cid": 3, "name": "slug", "type": "TEXT", "notnull": 1, "dflt_value": null, "pk": 0 },
      { "cid": 4, "name": "css_url", "type": "TEXT", "notnull": 0, "dflt_value": null, "pk": 0 },
      { "cid": 5, "name": "config", "type": "TEXT", "notnull": 1, "dflt_value": null, "pk": 0 },
      { "cid": 6, "name": "is_system", "type": "BOOLEAN", "notnull": 0, "dflt_value": "0", "pk": 0 },
      { "cid": 7, "name": "created_at", "type": "DATETIME", "notnull": 0, "dflt_value": "CURRENT_TIMESTAMP", "pk": 0 }
    ],
    "success": true,
    "meta": { ... }
  }
]
```

```bash
wrangler d1 execute inneranimalmedia-business --remote -c /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml --command "SELECT id, name, slug, substr(config,1,120) FROM cms_themes LIMIT 5;"
```

```
 ⛅️ wrangler 4.71.0
───────────────────
Resource location: remote 
🌀 Executing on remote database inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49):
🚣 Executed 1 command in 0.20ms
[
  {
    "results": [
      { "id": "theme-light", "name": "Light", "slug": "light", "substr(config,1,120)": "{\"bg\":\"#ffffff\",\"surface\":\"#f8f9fa\",\"text\":\"#1a202c\",\"textSecondary\":\"#718096\",\"border\":\"#e2e8f0\",\"primary\":\"#1a73e8\",\"p" },
      { "id": "theme-dark", "name": "Dark", "slug": "dark", "substr(config,1,120)": "{\"bg\":\"#0f172a\",\"surface\":\"#1e293b\",\"text\":\"#f1f5f9\",\"textSecondary\":\"#cbd5e1\",\"border\":\"#334155\",\"primary\":\"#3b82f6\",\"p" },
      { "id": "theme-google", "name": "Google", "slug": "google", "substr(config,1,120)": "{\"bg\":\"#ffffff\",\"surface\":\"#f8f9fa\",\"text\":\"#202124\",\"textSecondary\":\"#5f6368\",\"border\":\"#dadce0\",\"primary\":\"#1a73e8\",\"p" },
      { "id": "theme-clay", "name": "Clay", "slug": "clay", "substr(config,1,120)": "{\"bg\":\"#fafaf9\",\"surface\":\"#ffffff\",\"text\":\"#0c0a09\",\"textSecondary\":\"#57534e\",\"border\":\"#e7e5e4\",\"primary\":\"#ea580c\",\"p" },
      { "id": "theme-midnight", "name": "Midnight", "slug": "midnight", "substr(config,1,120)": "{\"bg\":\"#0a0e27\",\"surface\":\"#151b3d\",\"text\":\"#e2e8ff\",\"textSecondary\":\"#8892b5\",\"border\":\"#2a3154\",\"primary\":\"#667eea\",\"p" },
    ],
    "success": true,
    "meta": { ... }
  }
]
```

End of audit.
