#!/usr/bin/env bash
# log-repo-edit-to-cicd-events.sh — append a cicd_events row for local refine/repair/edit (no deploy required).
#
# Captures current git HEAD (full SHA + subject), branch, origin repo, optional free-text note,
# and JSON metadata in r2_key (wip/dirty summary). Uses same D1 + wrangler pattern as deploy-gate.sh.
#
# Usage:
#   ./scripts/log-repo-edit-to-cicd-events.sh [--note "monaco theme fix"] [--wip]
#
# Env:
#   CICD_DEV_LOG_D1=0  — skip D1 write (dry local check only)
#   GIT_ACTOR          — override git user for git_actor column (default: git config or sam_primeaux)
#
# Optional git hook (log after every commit, failures ignored):
#   git config core.hooksPath .githooks
#   chmod +x .githooks/post-commit
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CF_ENV_WRAPPER="$REPO_ROOT/scripts/with-cloudflare-env.sh"
IAM_PROD_CONFIG="$REPO_ROOT/wrangler.production.toml"
DB_NAME="inneranimalmedia-business"

NOTE_EXTRA=""
WIP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --note) NOTE_EXTRA="${2:-}"; shift 2 ;;
    --wip)  WIP=1; shift ;;
    *)      shift ;;
  esac
done

sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

if [[ "${CICD_DEV_LOG_D1:-1}" == "0" ]]; then
  echo "[cicd-events] CICD_DEV_LOG_D1=0 — skipping D1 insert."
  exit 0
fi

if [[ ! -f "$CF_ENV_WRAPPER" ]] || [[ ! -f "$IAM_PROD_CONFIG" ]]; then
  echo "[cicd-events] Missing wrapper or $IAM_PROD_CONFIG — skipping." >&2
  exit 0
fi

GIT_SHA=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
GIT_SHORT=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
GIT_SUBJECT=$(git -C "$REPO_ROOT" log -1 --pretty=%s 2>/dev/null || echo "")
REMOTE=$(git -C "$REPO_ROOT" config --get remote.origin.url 2>/dev/null || true)
REPO_NAME="SamPrimeaux/inneranimalmedia-agentsam-dashboard"
if [[ "$REMOTE" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
  REPO_NAME="${BASH_REMATCH[1]}"
fi

ACTOR_NAME="${GIT_ACTOR:-}"
if [[ -z "$ACTOR_NAME" ]]; then
  ACTOR_NAME=$(git -C "$REPO_ROOT" config user.name 2>/dev/null || true)
fi
[[ -z "$ACTOR_NAME" ]] && ACTOR_NAME="sam_primeaux"

DIRTY_COUNT=$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
TS=$(date -u +"%Y%m%d%H%M%S")
RAND_HEX=$(openssl rand -hex 4 2>/dev/null || printf '%04x' "$RANDOM")
EVID="evt_devedit_${TS}_${RAND_HEX}"

# r2_key: structured metadata (TEXT column; not an R2 object pointer for these rows).
META_JSON=$(python3 - "$GIT_SHORT" "$WIP" "$DIRTY_COUNT" "$NOTE_EXTRA" "$REPO_ROOT" <<'PY'
import json, subprocess, sys
short, wip_s, dirty_s, note, root = sys.argv[1:6]
wip = bool(int(wip_s)) if wip_s.isdigit() else False
dirty = int(dirty_s) if dirty_s.isdigit() else 0
obj = {
    "kind": "repo_edit",
    "short_hash": short,
    "wip_flag": wip,
    "dirty_files": dirty,
}
if note:
    obj["note"] = note
if dirty > 0:
    try:
        out = subprocess.check_output(
            ["git", "-C", root, "diff", "--name-only", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=30,
        )
        paths = [x for x in out.strip().splitlines() if x][:20]
        if paths:
            obj["changed_paths_sample"] = paths
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
print(json.dumps(obj, separators=(",", ":")))
PY
)

SUBJECT_FOR_ROW="$GIT_SUBJECT"
[[ -z "$SUBJECT_FOR_ROW" ]] && SUBJECT_FOR_ROW="repo edit (no commit subject on HEAD)"

SUBJECT_ESC=$(sql_escape "$SUBJECT_FOR_ROW")
SHA_ESC=$(sql_escape "$GIT_SHA")
BRANCH_ESC=$(sql_escape "$GIT_BRANCH")
REPO_ESC=$(sql_escape "$REPO_NAME")
ACTOR_ESC=$(sql_escape "$ACTOR_NAME")
META_ESC=$(sql_escape "$META_JSON")

SQL="INSERT OR IGNORE INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES (
  '${EVID}',
  'local_dev',
  'repo_edit',
  '${REPO_ESC}',
  '${BRANCH_ESC}',
  '${SHA_ESC}',
  '${SUBJECT_ESC}',
  '${ACTOR_ESC}',
  NULL,
  NULL,
  '${META_ESC}'
);"

if ! OUT=$("$CF_ENV_WRAPPER" wrangler d1 execute "$DB_NAME" \
      --remote -c "$IAM_PROD_CONFIG" \
      --command="$SQL" 2>&1); then
  echo "[cicd-events] D1 insert failed (non-fatal for hooks):" >&2
  echo "$OUT" >&2
  exit 0
fi

echo "[cicd-events] Logged ${EVID} @ ${GIT_SHORT} (${GIT_BRANCH})"
