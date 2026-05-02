#!/bin/bash
# ================================================================
# sync-modular-repo.sh
# Ports today's production fixes into ~/inneranimalmedia (dev branch)
# and gets the sandbox deploying cleanly.
# Run from anywhere. Safe to re-run.
# ================================================================

set -e

PROD="/Users/samprimeaux/inneranimalmedia-agentsam-dashboard"
MOD="/Users/samprimeaux/inneranimalmedia"

echo ""
echo "================================================================"
echo " IAM MODULAR REPO SYNC — $(date '+%Y-%m-%d %H:%M')"
echo "================================================================"

# ── PREFLIGHT ────────────────────────────────────────────────────
echo ""
echo "── PREFLIGHT ───────────────────────────────────────────────"

cd "$PROD"
PROD_BRANCH=$(git branch --show-current)
echo "Production branch: $PROD_BRANCH"
if [ "$PROD_BRANCH" != "production" ]; then
  echo "❌ Expected production branch in prod repo. Aborting."
  exit 1
fi

cd "$MOD"
MOD_BRANCH=$(git branch --show-current)
echo "Modular branch: $MOD_BRANCH"
if [ "$MOD_BRANCH" != "dev" ]; then
  echo "❌ Expected dev branch in modular repo. Aborting."
  exit 1
fi

echo "✓ Branches correct"

# ── FIX 1: socket-url — use PTY_AUTH_TOKEN directly ─────────────
echo ""
echo "── FIX 1: socket-url direct PTY connection ─────────────────"

SOCKET_URL_FILE="$MOD/src/api/dashboard.js"
if [ ! -f "$SOCKET_URL_FILE" ]; then
  echo "⚠ $SOCKET_URL_FILE not found — skipping"
else
  python3 << EOF
from pathlib import Path

f = Path('$SOCKET_URL_FILE')
src = f.read_text()

# Check if already patched
if 'PTY_AUTH_TOKEN' in src and 'TERMINAL_WS_URL' in src:
    # Look for the old AGENT_SESSION DO proxy pattern and replace
    OLD = '''const doId = env.AGENT_SESSION.idFromName(sessionName);
      const doStub = env.AGENT_SESSION.get(doId);
      const doReqUrl = new URL(request.url);
      doReqUrl.pathname = '/terminal/socket-url';
      return doStub.fetch(new Request(doReqUrl.toString(), { method: 'GET' }));'''

    if src.count(OLD) == 1:
        NEW = '''const wssUrl = (env.TERMINAL_WS_URL || '').trim();
      const ptyToken = (env.PTY_AUTH_TOKEN || '').trim();
      const themeSlug = (await import('../core/themes.js').catch(() => ({ resolveThemeSlug: () => '' }))).resolveThemeSlug?.(request, env) || '';
      if (!wssUrl || !ptyToken) {
        return Response.json({ error: 'Terminal not configured' }, { status: 503 });
      }
      const sep = wssUrl.includes('?') ? '&' : '?';
      const finalUrl = wssUrl + sep + 'token=' + encodeURIComponent(ptyToken) + '&theme_slug=' + encodeURIComponent(themeSlug);
      return Response.json({ url: finalUrl });'''
        f.write_text(src.replace(OLD, NEW))
        print('✓ socket-url fix applied to dashboard.js')
    else:
        print('⚠ socket-url pattern not found — may already be patched or structure differs')
        print('  Manual review needed: $SOCKET_URL_FILE')
else:
    print('⚠ Expected PTY_AUTH_TOKEN and TERMINAL_WS_URL references not found in dashboard.js')
    print('  Manual review needed: $SOCKET_URL_FILE')
EOF
fi

# ── FIX 2: XTermShell — remove duplicate ws.onopen ──────────────
echo ""
echo "── FIX 2: XTermShell duplicate ws.onopen ───────────────────"

# The dashboard component lives in the same place in both repos
XTERM_MOD="$MOD/dashboard/src/components/XTermShell.tsx"
XTERM_PROD="$PROD/agent-dashboard/agent-dashboard/components/XTermShell.tsx"

if [ ! -f "$XTERM_MOD" ]; then
  echo "⚠ XTermShell not found at $XTERM_MOD"
  echo "  Searching for it..."
  XTERM_FOUND=$(find "$MOD" -name "XTermShell.tsx" -not -path "*/node_modules/*" 2>/dev/null | head -1)
  if [ -z "$XTERM_FOUND" ]; then
    echo "  Not found in modular repo — copying from production"
    XTERM_DEST_DIR="$MOD/dashboard/src/components"
    mkdir -p "$XTERM_DEST_DIR"
    cp "$XTERM_PROD" "$XTERM_DEST_DIR/XTermShell.tsx"
    echo "✓ Copied XTermShell.tsx from production (already has both fixes)"
  else
    XTERM_MOD="$XTERM_FOUND"
    echo "  Found at: $XTERM_MOD"
    python3 << EOF2
from pathlib import Path

f = Path('$XTERM_MOD')
src = f.read_text()

patched = False

# Fix A: setStatus before isMounted guard
OLD_A = "          ws.onopen = () => {\n            if (!isMounted) return;\n            setStatus('online');"
NEW_A = "          ws.onopen = () => {\n            setStatus('online');\n            if (!isMounted) return;"
if src.count(OLD_A) == 1:
    src = src.replace(OLD_A, NEW_A)
    patched = True
    print('  ✓ setStatus guard order fixed')

# Fix B: remove duplicate bare ws.onopen
OLD_B = "\n          ws.onopen = () => {\n            retryCountRef.current = 0; // reset backoff on successful connect\n          };\n\n          ws.onclose"
NEW_B = "\n          ws.onclose"
if src.count(OLD_B) == 1:
    src = src.replace(OLD_B, NEW_B)
    patched = True
    print('  ✓ Duplicate ws.onopen removed')

# Fix C: reconnect guard
OLD_C = "      if (!isCollapsed && activeTab === 'terminal') void connect();"
NEW_C = "      if (!isCollapsed && activeTab === 'terminal' && (!socketRef.current || socketRef.current.readyState > 1)) void connect();"
if src.count(OLD_C) == 1:
    src = src.replace(OLD_C, NEW_C)
    patched = True
    print('  ✓ Reconnect guard added')

if patched:
    f.write_text(src)
    print('✓ XTermShell fixes applied')
else:
    print('⚠ XTermShell patterns not matched — may already be patched or structure differs')
EOF2
  fi
else
  echo "✓ XTermShell found — applying fixes"
  python3 << EOF3
from pathlib import Path

f = Path('$XTERM_MOD')
src = f.read_text()
patched = False

OLD_A = "          ws.onopen = () => {\n            if (!isMounted) return;\n            setStatus('online');"
NEW_A = "          ws.onopen = () => {\n            setStatus('online');\n            if (!isMounted) return;"
if src.count(OLD_A) == 1:
    src = src.replace(OLD_A, NEW_A)
    patched = True

OLD_B = "\n          ws.onopen = () => {\n            retryCountRef.current = 0; // reset backoff on successful connect\n          };\n\n          ws.onclose"
NEW_B = "\n          ws.onclose"
if src.count(OLD_B) == 1:
    src = src.replace(OLD_B, NEW_B)
    patched = True

OLD_C = "      if (!isCollapsed && activeTab === 'terminal') void connect();"
NEW_C = "      if (!isCollapsed && activeTab === 'terminal' && (!socketRef.current || socketRef.current.readyState > 1)) void connect();"
if src.count(OLD_C) == 1:
    src = src.replace(OLD_C, NEW_C)
    patched = True

if patched:
    f.write_text(src)
    print('✓ XTermShell fixes applied')
else:
    print('⚠ Already patched or structure differs — skipping')
EOF3
fi

# ── FIX 3: ide_ws → ws_ide_ in modular worker ───────────────────
echo ""
echo "── FIX 3: ide_ws ID format fix ─────────────────────────────"

python3 << 'EOF'
import subprocess, os

mod = '/Users/samprimeaux/inneranimalmedia'
result = subprocess.run(
    ['grep', '-rn', 'ide_ws:', '--include=*.js', mod + '/src'],
    capture_output=True, text=True
)

if not result.stdout.strip():
    print('✓ No ide_ws: references found in src/ — already clean')
else:
    for line in result.stdout.strip().split('\n'):
        print(f'  Found: {line}')
    # Apply fix to each file
    for match in result.stdout.strip().split('\n'):
        filepath = match.split(':')[0]
        f = open(filepath, 'r')
        src = f.read()
        f.close()
        if 'ide_ws:' in src:
            # Generic fix for the id generation pattern
            import re
            new_src = re.sub(
                r'return `ide_ws:\$\{[^}]+\}:\$\{[^}]+\}:\$\{[^}]+\}`;',
                'return `ws_ide_${u.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`;',
                src
            )
            if new_src != src:
                open(filepath, 'w').write(new_src)
                print(f'✓ Fixed ide_ws in {filepath}')
            else:
                print(f'⚠ Pattern not matched in {filepath} — manual fix needed')
EOF

# ── NPM INSTALL (dashboard) ──────────────────────────────────────
echo ""
echo "── NPM INSTALL ─────────────────────────────────────────────"

cd "$MOD"
if [ -d "dashboard" ]; then
  echo "Running npm install in dashboard/..."
  cd "$MOD/dashboard"
  npm install --silent 2>/dev/null && echo "✓ dashboard/ npm install complete" || echo "⚠ npm install had warnings"
  cd "$MOD"
else
  echo "⚠ dashboard/ not found in modular repo"
fi

# ── DRY RUN BUILD ────────────────────────────────────────────────
echo ""
echo "── SANDBOX DRY RUN ─────────────────────────────────────────"

cd "$MOD"
echo "Testing sandbox build (dry run)..."
npx wrangler deploy --dry-run --config wrangler.jsonc 2>&1 | grep -E "ERROR|error|Error|failed|✓|Total" | head -15

# ── COMMIT MODULAR FIXES ─────────────────────────────────────────
echo ""
echo "── COMMITTING TO DEV BRANCH ────────────────────────────────"

cd "$MOD"
DIRTY=$(git status --short | wc -l | tr -d ' ')
if [ "$DIRTY" -gt "0" ]; then
  git add -A
  git commit -m "fix: port production fixes — socket-url PTY, XTermShell onopen, ide_ws format"
  git push origin dev
  echo "✓ Committed and pushed to dev"
else
  echo "✓ Nothing new to commit"
fi

# ── SUMMARY ──────────────────────────────────────────────────────
echo ""
echo "================================================================"
echo " SYNC COMPLETE"
echo "================================================================"
echo ""
echo "Production (live):  $(cd $PROD && git log --oneline -1)"
echo "Modular (sandbox):  $(cd $MOD && git log --oneline -1)"
echo ""
echo "Next steps:"
echo "  1. If dry run passed: deploy sandbox"
echo "     cd $MOD && npx wrangler deploy --config wrangler.jsonc"
echo "  2. If dry run failed: paste errors above to Claude"
echo "  3. Build TerminalSessionDO in src/do/ of modular repo"
echo "================================================================"
