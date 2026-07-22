#!/usr/bin/env bash
# Fail if dashboard AgentMode / AGENT_MODES drift from src/core/agent-mode.js.
# Usage: ./scripts/guard-agent-mode-enum.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CORE="$ROOT/src/core/agent-mode.js"
DASH="$ROOT/dashboard/components/ChatAssistant/types.ts"

if [[ ! -f "$CORE" || ! -f "$DASH" ]]; then
  echo "guard-agent-mode-enum: missing core or dashboard mode files" >&2
  exit 2
fi

node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs';

const core = readFileSync('src/core/agent-mode.js', 'utf8');
const dash = readFileSync('dashboard/components/ChatAssistant/types.ts', 'utf8');

function extractIds(src, label) {
  const block = src.match(/AGENT_MODES\s*=\s*(?:Object\.freeze\()?\[([\s\S]*?)\]\)?/);
  if (!block) throw new Error(`${label}: AGENT_MODES array not found`);
  const ids = [...block[1].matchAll(/id:\s*['"]([a-z]+)['"]/g)].map((m) => m[1]);
  if (!ids.length) throw new Error(`${label}: no mode ids parsed`);
  return ids;
}

function extractTypeUnion(src) {
  const m = src.match(/export type AgentMode\s*=\s*([^;]+);/);
  if (!m) throw new Error('dashboard: AgentMode type not found');
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
}

const coreIds = extractIds(core, 'core');
const dashIds = extractIds(dash, 'dashboard');
const typeIds = extractTypeUnion(dash);

const coreKey = coreIds.join(',');
const dashKey = dashIds.join(',');
if (coreKey !== dashKey) {
  console.error('guard-agent-mode-enum: AGENT_MODES id order/list mismatch');
  console.error('  core:     ', coreIds.join(', '));
  console.error('  dashboard:', dashIds.join(', '));
  process.exit(1);
}

const typeKey = typeIds.join(',');
const sortedCore = [...coreIds].sort().join(',');
if (typeKey !== sortedCore) {
  console.error('guard-agent-mode-enum: AgentMode type union ≠ AGENT_MODES ids');
  console.error('  type:     ', typeIds.join(', '));
  console.error('  AGENT_MODES:', [...coreIds].sort().join(', '));
  process.exit(1);
}

if (!/normalizeAgentRuntimeMode/.test(core)) {
  console.error('guard-agent-mode-enum: normalizeAgentRuntimeMode missing from agent-mode.js');
  process.exit(1);
}

console.log('guard-agent-mode-enum: ok —', coreIds.join(', '));
EOF
