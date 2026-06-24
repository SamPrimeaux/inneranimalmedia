#!/usr/bin/env node
/**
 * build-deploy-email-html.mjs
 * Generates a rich, human-readable deploy notification email.
 * Called from deploy-frontend.sh — writes to stdout.
 *
 * Env vars consumed (all optional with fallbacks):
 *   WORKER_VERSION_ID, GIT_FULL_SHA, GIT_SHORT_HASH, GIT_MSG_LINE,
 *   BRANCH_NAME, ENVIRONMENT (legacy: DEPLOY_ENV), DEPLOYED_BY, DEPLOY_STARTED_AT,
 *   DEPLOY_DURATION_MS, R2_SYNC_STATUS, NOTIFY_TO, FILE_COUNT, TOTAL_KB
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deployEnvironmentLabel } from './lib/deploy-environment.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function sh(cmd, fallback = '') {
  try { return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
  catch { return fallback; }
}

// ── Git data ──────────────────────────────────────────────────────────────────
const commits = sh('git log --oneline -8 --no-merges', '')
  .split('\n').filter(Boolean)
  .map(line => {
    const [hash, ...rest] = line.split(' ');
    return { hash, message: rest.join(' ') };
  });

// Files changed in last deploy (vs origin/main~1 or last tag)
const changedRaw = sh('git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null', '');
const changedFiles = changedRaw.split('\n').filter(Boolean);

// Categorize by area
const areas = {
  'Dashboard / UI':    changedFiles.filter(f => f.startsWith('dashboard/')),
  'Worker / API':      changedFiles.filter(f => f.startsWith('src/')),
  'Scripts / Deploy':  changedFiles.filter(f => f.startsWith('scripts/')),
  'Migrations / DB':   changedFiles.filter(f => f.startsWith('migrations/') || f.includes('migration')),
  'Docs / Config':     changedFiles.filter(f => f.startsWith('docs/') || f.endsWith('.toml') || f.endsWith('.json') && !f.startsWith('dashboard/')),
};

// ── Next steps (from NEXT_STEPS.md if present, else inferred) ────────────────
let nextSteps = [];
const nsPath = resolve(REPO_ROOT, 'NEXT_STEPS.md');
if (existsSync(nsPath)) {
  const raw = readFileSync(nsPath, 'utf8');
  nextSteps = raw.split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
    .map(l => l.replace(/^[\s\-\*]+/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}
if (!nextSteps.length) {
  // Infer from what changed
  if (areas['Dashboard / UI'].length) nextSteps.push('Verify dashboard changes at inneranimalmedia.com/dashboard/agent');
  if (areas['Worker / API'].length)   nextSteps.push('Run post-deploy smoke: check /api/agent/health');
  if (areas['Migrations / DB'].length) nextSteps.push('Confirm D1 migration applied — check agentsam_* tables in studio');
  nextSteps.push('Run full identity audit: python3 scripts/audit_dashboard_identity.py');
  nextSteps.push('Check ThinkingCard fires on next agent task execution');
}

// ── Env vars ──────────────────────────────────────────────────────────────────
const e = k => process.env[k] || '';
const workerVersion  = e('WORKER_VERSION_ID') || '—';
const fullSha        = e('GIT_FULL_SHA')       || sh('git rev-parse HEAD', '—');
const shortSha       = e('GIT_SHORT_HASH')      || sh('git rev-parse --short HEAD', '—');
const gitMsg         = e('GIT_MSG_LINE')        || commits[0]?.message || '—';
const branch         = e('BRANCH_NAME')         || sh('git rev-parse --abbrev-ref HEAD', 'main');
const deployEnv      = deployEnvironmentLabel();
const deployedBy     = e('DEPLOYED_BY')         || 'sam_primeaux';
const startedAt      = e('DEPLOY_STARTED_AT')   || new Date().toISOString();
const durationMs     = parseInt(e('DEPLOY_DURATION_MS') || '0', 10);
const durationStr    = durationMs > 0 ? `${(durationMs / 1000).toFixed(1)}s` : '—';
const r2Status       = e('R2_SYNC_STATUS')      || 'passed';
const fileCount      = e('FILE_COUNT')          || '—';
const totalKb        = e('TOTAL_KB')            || '—';
const notifyTo       = e('NOTIFY_TO')           || 'info@inneranimals.com';

// ── HTML helpers ──────────────────────────────────────────────────────────────
const row = (label, value) =>
  `<tr style="border-bottom:1px solid #1e293b;">
    <td style="padding:9px 8px;color:#94a3b8;width:38%;font-size:13px;">${label}</td>
    <td style="padding:9px 8px;color:#f1f5f9;font-size:13px;word-break:break-all;">${value}</td>
  </tr>`;

const commitRow = ({ hash, message }) =>
  `<tr>
    <td style="padding:5px 8px;font-family:monospace;font-size:12px;color:#5eead4;white-space:nowrap;">${hash}</td>
    <td style="padding:5px 8px;font-size:13px;color:#e2e8f0;">${esc(message)}</td>
  </tr>`;

const areaSection = (label, files) => {
  if (!files.length) return '';
  const icon = {
    'Dashboard / UI':   '▸',
    'Worker / API':     '⚙',
    'Scripts / Deploy': '⬡',
    'Migrations / DB':  '◈',
    'Docs / Config':    '◻',
  }[label] || '·';
  return `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.05em;margin-bottom:4px;">${icon} ${label} (${files.length})</div>
      ${files.slice(0, 8).map(f =>
        `<div style="font-size:12px;font-family:monospace;color:#94a3b8;padding:2px 0 2px 12px;">${esc(f)}</div>`
      ).join('')}
      ${files.length > 8 ? `<div style="font-size:11px;color:#475569;padding-left:12px;">+ ${files.length - 8} more</div>` : ''}
    </div>`;
};

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Build HTML ────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;">
<div style="max-width:600px;margin:0 auto;padding:28px 20px 48px;">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:16px;margin-bottom:24px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
           alt="Inner Animal Media" width="36" height="36"
           style="display:block;border-radius:6px;" />
      <div>
        <div style="font-size:18px;font-weight:700;color:#f8fafc;letter-spacing:-0.02em;">Inner Animal Media</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;letter-spacing:0.05em;">DEPLOY NOTIFICATION · ${deployEnv.toUpperCase()}</div>
      </div>
    </div>
    <span style="display:inline-block;padding:5px 14px;border-radius:6px;background:#166534;color:#ecfdf5;font-weight:600;font-size:12px;letter-spacing:0.04em;">DEPLOYED</span>
  </div>

  <!-- Top commit message -->
  <div style="background:#0d1f0d;border:1px solid #166534;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
    <div style="font-size:11px;color:#4ade80;letter-spacing:0.05em;margin-bottom:4px;">LATEST CHANGE</div>
    <div style="font-size:14px;color:#ecfdf5;font-weight:500;">${esc(gitMsg)}</div>
    <div style="font-size:12px;color:#4ade80;margin-top:6px;font-family:monospace;">${shortSha} · ${branch}</div>
  </div>

  <!-- Deploy stats -->
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:600;color:#475569;letter-spacing:0.06em;margin-bottom:8px;">DEPLOY DETAILS</div>
    <table style="width:100%;border-collapse:collapse;">
      ${row('Worker Version', workerVersion)}
      ${row('Git SHA', `<span style="font-family:monospace">${fullSha.slice(0,12)}…${fullSha.slice(-6)}</span>`)}
      ${row('Branch', branch)}
      ${row('Environment', deployEnv)}
      ${row('Deployed by', deployedBy)}
      ${row('Duration', durationStr)}
      ${row('Started', startedAt)}
      ${row('Bundle', `${fileCount} files · ${totalKb} KB`)}
      ${row('R2 Sync', r2Status === 'passed' ? '<span style="color:#4ade80">passed</span>' : `<span style="color:#f87171">${r2Status}</span>`)}
    </table>
  </div>

  <!-- Recent commits -->
  ${commits.length ? `
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:600;color:#475569;letter-spacing:0.06em;margin-bottom:8px;">RECENT COMMITS</div>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        ${commits.map(commitRow).join('')}
      </table>
    </div>
  </div>` : ''}

  <!-- Files changed by area -->
  ${changedFiles.length ? `
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:600;color:#475569;letter-spacing:0.06em;margin-bottom:10px;">FILES CHANGED (${changedFiles.length} total)</div>
    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:14px 16px;">
      ${Object.entries(areas).map(([k,v]) => areaSection(k,v)).join('')}
    </div>
  </div>` : ''}

  <!-- Next steps -->
  ${nextSteps.length ? `
  <div style="margin-bottom:24px;">
    <div style="font-size:11px;font-weight:600;color:#475569;letter-spacing:0.06em;margin-bottom:8px;">RECOMMENDED NEXT STEPS</div>
    <div style="background:#0c1a2e;border:1px solid #1e3a5f;border-radius:8px;padding:14px 16px;">
      ${nextSteps.map((s,i) => `
        <div style="display:flex;gap:10px;padding:4px 0;${i > 0 ? 'border-top:1px solid #1e293b;margin-top:6px;padding-top:10px;' : ''}">
          <span style="color:#3b82f6;font-weight:600;font-size:13px;flex-shrink:0;">${i+1}.</span>
          <span style="font-size:13px;color:#cbd5e1;">${esc(s)}</span>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Footer -->
  <div style="border-top:1px solid #1e293b;padding-top:16px;font-size:12px;color:#475569;">
    Inner Animal Media · inneranimalmedia.com · Auto-generated by deploy pipeline
  </div>

</div>
</body>
</html>`;

process.stdout.write(html);
