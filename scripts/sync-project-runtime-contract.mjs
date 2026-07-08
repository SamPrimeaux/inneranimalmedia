#!/usr/bin/env node
/**
 * Sync AGENTSAM.md → agentsam_rules_document (rule_{slug}_runtimecontract) via Worker API.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/sync-project-runtime-contract.mjs \
 *     --project proj_companions_cpas_web \
 *     --file docs/clients/companionscpas/AGENTSAM.md
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/sync-project-runtime-contract.mjs \
 *     --project ws_inneranimalmedia --file AGENTSAM.md
 *
 * Requires IAM session cookie or IAM_SYNC_BEARER in env for POST /api/projects/:id/runtime-contract/sync
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

function parseArgs(argv) {
  /** @type {{ project: string|null, file: string|null, baseUrl: string, force: boolean, dryRun: boolean }} */
  const out = {
    project: null,
    file: null,
    baseUrl: process.env.IAM_BASE_URL || 'https://inneranimalmedia.com',
    force: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--force') out.force = true;
    else if (a === '--project' && argv[i + 1]) out.project = String(argv[++i]).trim();
    else if (a.startsWith('--project=')) out.project = a.slice(10).trim();
    else if (a === '--file' && argv[i + 1]) out.file = String(argv[++i]).trim();
    else if (a.startsWith('--file=')) out.file = a.slice(7).trim();
    else if (a === '--base-url' && argv[i + 1]) out.baseUrl = String(argv[++i]).replace(/\/$/, '');
    else if (a.startsWith('--base-url=')) out.baseUrl = a.slice(11).replace(/\/$/, '');
  }
  return out;
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) die('Usage: --project <projects.id|workspace_id> [--file path/to/AGENTSAM.md] [--force]');
  if (!args.file) die('--file path/to/AGENTSAM.md is required for repo sync');

  const root = repoRoot();
  const filePath = join(root, args.file);
  if (!existsSync(filePath)) die(`File not found: ${filePath}`);

  const agentsamMarkdown = readFileSync(filePath, 'utf8');
  if (agentsamMarkdown.trim().length < 40) die('AGENTSAM.md too short — refusing empty sync');

  const bearer = process.env.IAM_SYNC_BEARER || process.env.IAM_API_BEARER || '';
  const url = `${args.baseUrl}/api/projects/${encodeURIComponent(args.project)}/runtime-contract/sync`;

  if (args.dryRun) {
    console.log(JSON.stringify({ dry_run: true, url, project: args.project, file: args.file, chars: agentsamMarkdown.length }, null, 2));
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agentsam_markdown: agentsamMarkdown,
      force: args.force,
      source_file: args.file,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    die(`Non-JSON response (${res.status}): ${text.slice(0, 400)}`);
  }

  if (!res.ok || !data.ok) {
    die(`Sync failed (${res.status}): ${JSON.stringify(data)}`);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => die(e?.message || String(e)));
