#!/usr/bin/env zsh
# Connor (or any non-Sam operator): install gh + git on YOUR machine only.
# Never writes Sam's .env.cloudflare, never configures SamPrimeaux SSH remotes,
# never installs on the shared GCP iam-tunnel VM (Sam platform host).
#
# Usage (from repo clone on your Mac or Linux PTY host):
#   ./scripts/install-terminal-github-cli-connor.sh
#
# Same as:
#   ./scripts/install-terminal-github-cli.sh --profile connor --prompt-token --local-only

emulate -R zsh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${ROOT}/scripts/install-terminal-github-cli.sh" --profile=connor --prompt-token --local-only "$@"
