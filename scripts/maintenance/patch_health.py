#!/usr/bin/env python3
"""
patch_health.py — surgical fixes for iam_daily_health.sh
Fixes:
  1. Sources .env.cloudflare so SUPABASE_ANON_KEY / CF_TOKEN are available
     even when the alias is run outside a fully-loaded shell
  2. Fixes jq backslash-dollar escape error in model breakdown query
  3. Tightens deploy status: warns on 'pending', errors on 'failed'
  4. Removes duplicate SLA check that appears in both section 2 and section 5
"""

import re
import sys
from pathlib import Path

SCRIPT = Path("/Users/samprimeaux/inneranimalmedia/scripts/maintenance/iam_daily_health.sh")
ENV_FILE = Path("/Users/samprimeaux/inneranimalmedia/.env.cloudflare")

# ── Load ─────────────────────────────────────────────────────────────────────
if not SCRIPT.exists():
    sys.exit(f"ERROR: script not found at {SCRIPT}")

src = SCRIPT.read_text()
original = src
patches_applied = []

# ── Patch 1: Source .env.cloudflare after the Config block ───────────────────
# Insert right after the "CF_TOKEN / CF_ACCOUNT" config lines so all vars are
# populated before the first curl call. Only inject if not already present.
ENV_SOURCE_BLOCK = r"""
# ── Load local secrets (.env.cloudflare) ──────────────────────────────────────
# Provides: CF_TOKEN, SUPABASE_ANON_KEY, CLOUDFLARE_API_TOKEN, etc.
# Wrangler secrets are not available to shell scripts; they live here locally.
_ENV_FILE="$(dirname "$(realpath "$0")")/../../.env.cloudflare"
if [[ -f "$_ENV_FILE" ]]; then
  # Export only lines that look like VAR=value (skip comments and blanks)
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -E '^[A-Z_]+=.' "$_ENV_FILE" | grep -v '^#')
  set +o allexport
fi
# Allow explicit overrides to take precedence
CF_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_TOKEN:-}}"
SUPABASE_KEY="${SUPABASE_ANON_KEY:-${SUPABASE_KEY:-}}"
"""

if "_ENV_FILE=" not in src:
    # Insert after the KV_ENDPOINT line (end of Config block)
    src = re.sub(
        r'(KV_ENDPOINT="\$\{WORKER_URL\}/internal/kv-flags")',
        r'\1' + ENV_SOURCE_BLOCK,
        src
    )
    patches_applied.append("1: inject .env.cloudflare sourcing block")
else:
    patches_applied.append("1: SKIP (env sourcing already present)")

# ── Patch 2: Fix jq \$ escape error in model breakdown ───────────────────────
# jq does not support \$ as an escape sequence.
# Replace:  \$\(.cost_usd)
# With:     ($\(.cost_usd)) — no, simpler: just drop the backslash
# The string is inside bash single quotes so \$ passes literally to jq.
BROKEN_JQ = r"'\''    \(.model)  →  \(.calls) calls  \\$\\(.cost_usd)  \\(.tokens) tok'\''"
# More reliable: match the actual line pattern regardless of quoting style
src, n = re.subn(
    r'(\.model\).*?calls.*?)\\(\$\\\.cost_usd)',
    r'\1$(\2.cost_usd',
    src
)
if n == 0:
    # Try the simpler literal form that survives bash quoting
    src, n = re.subn(
        r'(\\\.calls\) calls  )\\(\$)(\\\.cost_usd)',
        r'\1$\3',
        src
    )

if n > 0:
    patches_applied.append(f"2: fixed jq \\$ escape ({n} occurrence(s))")
else:
    # Manual surgical replacement on the exact offending line
    old_line = r'.[] | "    \(.model)  \u2192  \(.calls) calls  ' + r'\$' + r'\(.cost_usd)  \(.tokens) tok"'
    new_line = r'.[] | "    \(.model)  \u2192  \(.calls) calls  $\(.cost_usd)  \(.tokens) tok"'
    if old_line in src:
        src = src.replace(old_line, new_line, 1)
        patches_applied.append("2: fixed jq \\$ escape (literal replace)")
    else:
        patches_applied.append("2: SKIP (jq line not found — may already be fixed or format differs)")

# ── Patch 3: Deploy status — warn on pending, error on failed ────────────────
OLD_DEPLOY_CHECK = '''\
if [[ "$DEPLOY" == *"success"* ]]; then
  ok "Last deploy: ${DEPLOY}"
elif [[ "$DEPLOY" == "unknown" ]]; then
  warn "Could not read deployments table"
else
  warn "Last deploy: ${DEPLOY}"
fi'''

NEW_DEPLOY_CHECK = '''\
if [[ "$DEPLOY" == *"success"* ]]; then
  ok "Last deploy: ${DEPLOY}"
elif [[ "$DEPLOY" == *"failed"* ]]; then
  err "Last deploy: ${DEPLOY}"
elif [[ "$DEPLOY" == *"pending"* ]]; then
  warn "Last deploy: ${DEPLOY} — deploy may still be in flight or stale"
elif [[ "$DEPLOY" == "unknown" ]]; then
  warn "Could not read deployments table"
else
  warn "Last deploy: ${DEPLOY}"
fi'''

if OLD_DEPLOY_CHECK in src:
    src = src.replace(OLD_DEPLOY_CHECK, NEW_DEPLOY_CHECK, 1)
    patches_applied.append("3: deploy status now distinguishes failed vs pending")
else:
    patches_applied.append("3: SKIP (deploy check block not found at expected location)")

# ── Patch 4: Remove duplicate SLA block in section 5 ─────────────────────────
# Section 2 already shows SLA breaches from agentsam_agent_run.
# Section 5 repeats it verbatim. Remove the section 5 copy.
DUP_SLA = '''\
# SLA breaches from agentsam_agent_run
SLA=$(d1 "
  SELECT
    SUM(CASE WHEN sla_breach=1 AND created_at > datetime(\'now\',\'-7 days\') THEN 1 ELSE 0 END) as sla_7d,
    SUM(CASE WHEN timed_out=1  AND created_at > datetime(\'now\',\'-7 days\') THEN 1 ELSE 0 END) as to_7d
  FROM agentsam_agent_run
" | jq -r \'.[0]\')
SLA_N=$(echo "$SLA" | jq -r \'.sla_7d // 0\')
TO_N=$(echo "$SLA"  | jq -r \'.to_7d  // 0\')
[[ "$SLA_N" -gt 0 || "$TO_N" -gt 0 ]] \\
  && warn "SLA breaches 7d: ${SLA_N}  |  Timeouts 7d: ${TO_N}" \\
  || ok "SLA breaches 7d: 0  |  Timeouts: 0"'''

if DUP_SLA in src:
    src = src.replace(DUP_SLA, "# (SLA breach summary shown in section 2)", 1)
    patches_applied.append("4: removed duplicate SLA block from section 5")
else:
    patches_applied.append("4: SKIP (duplicate SLA block not found — may already be removed)")

# ── Write ─────────────────────────────────────────────────────────────────────
if src == original:
    print("No changes made — all patches skipped or already applied.")
else:
    # Backup
    backup = SCRIPT.with_suffix(".sh.bak")
    backup.write_text(original)
    print(f"Backup written: {backup}")

    SCRIPT.write_text(src)
    SCRIPT.chmod(0o755)
    print(f"Patched:        {SCRIPT}\n")

print("Patches:")
for p in patches_applied:
    status = "SKIP" if p.endswith(")") and "SKIP" in p else "OK  "
    print(f"  [{status}] {p}")

# ── Verify env file exists ────────────────────────────────────────────────────
print()
if ENV_FILE.exists():
    keys = [l.split("=")[0] for l in ENV_FILE.read_text().splitlines()
            if l and not l.startswith("#") and "=" in l]
    sb  = "SUPABASE_ANON_KEY" in keys
    cft = "CLOUDFLARE_API_TOKEN" in keys or "CF_TOKEN" in keys
    print(f".env.cloudflare found ({len(keys)} vars)")
    print(f"  SUPABASE_ANON_KEY present: {'yes' if sb else 'NO — add it'}")
    print(f"  CF token present:          {'yes' if cft else 'NO — add it'}")
else:
    print(f"WARNING: {ENV_FILE} not found.")
    print("  The Supabase section will remain blank until that file exists.")
    print("  Add it with: SUPABASE_ANON_KEY=eyJ... on its own line.")
