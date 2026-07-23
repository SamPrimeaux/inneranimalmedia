#!/usr/bin/env node
/**
 * notify-ops.mjs — loud ops alert for deploy trail / critical gaps.
 * Writes agentsam_error_log (always) and best-effort POST /api/notify/deploy-complete style hooks.
 *
 * Usage:
 *   node scripts/notify-ops.mjs --severity=critical --message='…'
 */
import { d1Query, sqlQuote } from './lib/d1-remote.mjs';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

const severity = String(arg('--severity', 'critical')).trim() || 'critical';
const message = String(arg('--message', 'ops alert')).trim() || 'ops alert';
const id = `err_trail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const now = Math.floor(Date.now() / 1000);

try {
  d1Query(
    `INSERT INTO agentsam_error_log (
       id, workspace_id, tenant_id, error_code, error_type, error_message, source, context_json, resolved, created_at
     ) VALUES (
       ${sqlQuote(id)},
       'ws_inneranimalmedia',
       'tenant_sam_primeaux',
       'deploy_trail_gate',
       ${sqlQuote(severity)},
       ${sqlQuote(message.slice(0, 4000))},
       'deploy-trail-gate',
       ${sqlQuote(JSON.stringify({ severity, at: now }))},
       0,
       ${now}
     )`,
  );
  console.error(`[notify-ops] agentsam_error_log id=${id}`);
} catch (e) {
  console.error(`[notify-ops] D1 error_log write failed: ${e?.message || e}`);
}

const secret = process.env.INTERNAL_API_SECRET || process.env.AGENTSAM_BRIDGE_KEY || '';
if (secret) {
  try {
    const res = await fetch('https://inneranimalmedia.com/api/notify/deploy-complete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-internal-secret': secret,
      },
      body: JSON.stringify({
        status: 'trail_failed',
        severity,
        message,
        source: 'deploy-trail-gate',
      }),
    });
    console.error(`[notify-ops] notify HTTP ${res.status}`);
  } catch (e) {
    console.error(`[notify-ops] notify HTTP failed: ${e?.message || e}`);
  }
}

process.exit(0);
