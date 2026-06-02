#!/usr/bin/env node
/**
 * Remote D1 check: agentsam_tools terminal schemas match mcp-terminal-contract.js.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/verify-terminal-contract-drift.mjs
 *   npm run verify:terminal-contract-drift
 */
import { verifyTerminalContractDrift } from './lib/terminal-contract-drift.mjs';

const errors = verifyTerminalContractDrift(process.cwd());

if (errors.length) {
  console.error('[verify-terminal-contract-drift] FAIL');
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('[verify-terminal-contract-drift] OK — D1 terminal tool schemas match mcp-terminal-contract.js');
