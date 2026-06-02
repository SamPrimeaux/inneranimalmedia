#!/usr/bin/env node
/**
 * Register an uploaded quality report in D1 (agentsam_quality_reports).
 * Used by upload-playwright-report-to-r2.sh after R2 PUT.
 *
 * Env: REPORT_DATE, REPORT_TIME, R2_PREFIX, REPORT_ID, UPLOADED_FILES, IAM_ORIGIN
 * Optional: INGEST_SECRET + curl to prod API; else wrangler d1 execute locally.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const reportDate = process.env.REPORT_DATE || '';
const reportTime = process.env.REPORT_TIME || '';
const r2Prefix = (process.env.R2_PREFIX || '').replace(/\/+$/, '') + '/';
const reportId = process.env.QUALITY_REPORT_ID || process.env.REPORT_ID || '';
const uploadedFiles = Number(process.env.UPLOADED_FILES || 0);
const origin = (process.env.IAM_ORIGIN || 'https://inneranimalmedia.com').replace(/\/$/, '');
const publicPath = `/qualityreport/${reportDate}/${reportTime}/`;
const publicUrl = process.env.PUBLIC_URL || `${origin}${publicPath}`;
const id = `aqr_${reportDate.replace(/-/g, '')}_${reportTime}`;

if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !/^\d{6}$/.test(reportTime)) {
  console.error('register-quality-report-d1: REPORT_DATE and REPORT_TIME required (YYYY-MM-DD, HHMMSS)');
  process.exit(1);
}

const payload = {
  id,
  report_id: reportId || `quality-report-${reportDate}-${reportTime}`,
  report_date: reportDate,
  report_time: reportTime,
  r2_bucket: process.env.R2_BUCKET || 'inneranimalmedia',
  r2_prefix: r2Prefix,
  public_path: publicPath,
  public_url: publicUrl,
  uploaded_files: uploadedFiles,
  workspace_id: process.env.IAM_WORKSPACE_ID || null,
  tenant_id: process.env.IAM_TENANT_ID || null,
  user_id: process.env.IAM_USER_ID || null,
};

function loadIngestSecret() {
  const envFile = path.join(REPO_ROOT, '.env.cloudflare');
  if (!existsSync(envFile)) return process.env.INGEST_SECRET || '';
  const text = readFileSync(envFile, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^INGEST_SECRET=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env.INGEST_SECRET || '';
}

async function registerViaApi() {
  const secret = loadIngestSecret();
  if (!secret) return false;
  const res = await fetch(`${origin}/api/quality-reports/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ingest-Secret': secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`API register failed (${res.status}): ${text.slice(0, 400)}`);
    return false;
  }
  console.log(text);
  return true;
}

function sqlEscape(s) {
  return String(s ?? '').replace(/'/g, "''");
}

function registerViaWrangler() {
  const config = process.env.WRANGLER_CONFIG || path.join(REPO_ROOT, 'wrangler.production.toml');
  const sql = `INSERT INTO agentsam_quality_reports (
    id, report_id, tenant_id, workspace_id, user_id,
    report_date, report_time, r2_bucket, r2_prefix,
    public_path, public_url, label, uploaded_files,
    scope, is_public, metadata_json, created_at, updated_at
  ) VALUES (
    '${sqlEscape(id)}', '${sqlEscape(payload.report_id)}',
    ${payload.tenant_id ? `'${sqlEscape(payload.tenant_id)}'` : 'NULL'},
    ${payload.workspace_id ? `'${sqlEscape(payload.workspace_id)}'` : 'NULL'},
    ${payload.user_id ? `'${sqlEscape(payload.user_id)}'` : 'NULL'},
    '${sqlEscape(reportDate)}', '${sqlEscape(reportTime)}',
    '${sqlEscape(payload.r2_bucket)}', '${sqlEscape(r2Prefix)}',
    '${sqlEscape(publicPath)}', '${sqlEscape(publicUrl)}',
    'quality-report', ${uploadedFiles},
    '${payload.workspace_id ? 'workspace' : 'platform'}', 1, '{}', unixepoch(), unixepoch()
  )
  ON CONFLICT(id) DO UPDATE SET
    public_url = excluded.public_url,
    public_path = excluded.public_path,
    r2_prefix = excluded.r2_prefix,
    uploaded_files = excluded.uploaded_files,
    updated_at = unixepoch();`;

  execSync(
    `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c "${config}" --command "${sql.replace(/"/g, '\\"')}"`,
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  console.log(JSON.stringify({ ok: true, id, public_url: publicUrl, via: 'd1' }));
}

const ok = await registerViaApi();
if (!ok) registerViaWrangler();
