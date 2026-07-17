#!/usr/bin/env bash
# Shared git lock helpers for GCP iam-tunnel (bootstrap sync + self-heal cron).
# Prevents stale .git/index.lock races between samprimeaux post-deploy sync and agentsam cron.
#
# Source:
#   source "$(dirname "$0")/lib/gcp-vm-git-lock.sh"

# Remove stale git lock files older than STALE_MIN minutes (default 2).
# Age-based: do not use pgrep (false positives on the calling shell command line).
iam_clear_stale_git_locks() {
  local repo="${1:-}"
  local stale_min="${2:-2}"
  [[ -n "$repo" && -d "${repo}/.git" ]] || return 0

  local git_dir="${repo}/.git"
  local before after
  before="$(find "${git_dir}" -name '*.lock' -type f 2>/dev/null | wc -l | tr -d ' ')"
  find "${git_dir}" -name '*.lock' -type f -mmin "+${stale_min}" -delete 2>/dev/null || true
  after="$(find "${git_dir}" -name '*.lock' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${before:-0}" != "${after:-0}" ]]; then
    echo "[iam-git-lock] cleared stale locks under ${repo}/.git (before=${before} after=${after} mmin>${stale_min})"
  fi
  return 0
}

# Run a command under an exclusive flock for this repo (60s wait).
# Usage: iam_with_repo_git_lock /path/to/repo -- git -C /path/to/repo pull --ff-only
iam_with_repo_git_lock() {
  local repo="${1:-}"
  shift || true
  [[ -n "$repo" && -d "${repo}/.git" ]] || {
    echo "[iam-git-lock] missing repo: ${repo:-"(empty)"}" >&2
    return 1
  }
  mkdir -p "${repo}/.git"
  local lock_file="${repo}/.git/iam-sync.flock"
  if command -v flock >/dev/null 2>&1; then
    flock -w 60 "$lock_file" "$@"
  else
    "$@"
  fi
}
