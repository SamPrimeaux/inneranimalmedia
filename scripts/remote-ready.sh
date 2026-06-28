#!/usr/bin/env bash
# Mac-asleep remote path: verify ExecOS + sync iam-tunnel repo/env/runtime.
# SDK on Mac: npm install @inneranimalmedia/agentsam-sdk (devDependency).
# SDK on VM/phone terminal: use npx @inneranimalmedia/agentsam-sdk (no global install required).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Health checks (Mac can sleep after this succeeds)"
curl -sf https://terminal.inneranimalmedia.com/health | head -c 240 && echo ""
curl -sf https://execos.inneranimalmedia.com/health | head -c 240 && echo ""

echo "→ Local Agent Sam SDK"
npx agentsam --version
node -e "import('@inneranimalmedia/agentsam-sdk').then((m) => console.log('sdk', m.version, m.name))"

echo "→ GCP iam-tunnel sync (repo + env + ExecOS pm2)"
bash "${REPO_ROOT}/scripts/sync-gcp-vm-after-deploy.sh"

# shellcheck source=scripts/lib/gcp-vm-ssh.sh
source "${REPO_ROOT}/scripts/lib/gcp-vm-ssh.sh"

echo "→ VM quick check (remote terminal lane)"
gcp_vm_ssh --command='echo "VM user: $(whoami)"; curl -sf http://127.0.0.1:8787/health 2>/dev/null || echo "execos local health: use terminal.inneranimalmedia.com"; command -v npx >/dev/null && npx --yes @inneranimalmedia/agentsam-sdk@1.1.1 --version || echo "npx agentsam: run when online"'

echo ""
echo "✓ Remote lane ready for iPhone / Mac asleep:"
echo "  • Dashboard → Agent terminal (remote lane) → GCP iam-tunnel"
echo "  • terminal.inneranimalmedia.com + execos.inneranimalmedia.com"
echo "  • Scaffold from VM terminal: npx @inneranimalmedia/agentsam-sdk init --name my-app --lane cms --yes"
