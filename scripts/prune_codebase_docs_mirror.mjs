#!/usr/bin/env node
/**
 * Remove legacy docs/* rows mistakenly indexed into the codebase chunks lane.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/prune_codebase_docs_mirror.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/prune_codebase_docs_mirror.mjs --execute
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sbRequest } from './lib/supabase-rest.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

try {
  const lines = readFileSync(resolve(ROOT, '.env.cloudflare'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, '');
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  /* optional .env.cloudflare */
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--') || k === 'dry-run' || k === 'execute') {
      out[k] = true;
    } else {
      out[k] = next;
      i++;
    }
  }
  return out;
}

async function countViaPg(client, workspaceId) {
  const chunks = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM agentsam.agentsam_codebase_chunks_oai3large_1536
      WHERE workspace_id = $1::uuid
        AND file_path LIKE 'docs/%'`,
    [workspaceId],
  );
  const files = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM agentsam.agentsam_codebase_files_oai3large_1536
      WHERE workspace_id = $1::uuid
        AND file_path LIKE 'docs/%'`,
    [workspaceId],
  );
  return { chunks: chunks.rows[0]?.n ?? 0, files: files.rows[0]?.n ?? 0 };
}

async function deleteViaPg(client, workspaceId) {
  const chunks = await client.query(
    `DELETE FROM agentsam.agentsam_codebase_chunks_oai3large_1536
      WHERE workspace_id = $1::uuid
        AND file_path LIKE 'docs/%'`,
    [workspaceId],
  );
  const files = await client.query(
    `DELETE FROM agentsam.agentsam_codebase_files_oai3large_1536
      WHERE workspace_id = $1::uuid
        AND file_path LIKE 'docs/%'`,
    [workspaceId],
  );
  return { chunks: chunks.rowCount ?? 0, files: files.rowCount ?? 0 };
}

async function countViaRest(supabaseUrl, supabaseKey, workspaceId) {
  const chunksUrl =
    `${supabaseUrl}/rest/v1/agentsam_codebase_chunks_oai3large_1536?select=id&workspace_id=eq.${encodeURIComponent(workspaceId)}&file_path=like.docs/%25`;
  const filesUrl =
    `${supabaseUrl}/rest/v1/agentsam_codebase_files_oai3large_1536?select=id&workspace_id=eq.${encodeURIComponent(workspaceId)}&file_path=like.docs/%25`;
  const headers = { Prefer: 'count=exact', 'Accept-Profile': 'agentsam', 'Content-Profile': 'agentsam' };
  const chunksRes = await fetch(chunksUrl, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, ...headers },
  });
  const filesRes = await fetch(filesUrl, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, ...headers },
  });
  const chunksRange = chunksRes.headers.get('content-range') || '';
  const filesRange = filesRes.headers.get('content-range') || '';
  const parseCount = (range) => {
    const m = /\/(\d+)$/.exec(range);
    return m ? Number(m[1]) : 0;
  };
  if (!chunksRes.ok) throw new Error(`count chunks failed: ${chunksRes.status}`);
  if (!filesRes.ok) throw new Error(`count files failed: ${filesRes.status}`);
  return { chunks: parseCount(chunksRange), files: parseCount(filesRange) };
}

async function deleteViaRest(supabaseUrl, supabaseKey, workspaceId) {
  const chunksUrl =
    `${supabaseUrl}/rest/v1/agentsam_codebase_chunks_oai3large_1536?workspace_id=eq.${encodeURIComponent(workspaceId)}&file_path=like.docs/%25`;
  const filesUrl =
    `${supabaseUrl}/rest/v1/agentsam_codebase_files_oai3large_1536?workspace_id=eq.${encodeURIComponent(workspaceId)}&file_path=like.docs/%25`;
  const headers = { Prefer: 'return=minimal', 'Accept-Profile': 'agentsam', 'Content-Profile': 'agentsam' };
  await sbRequest('DELETE', chunksUrl, supabaseKey, null, headers);
  await sbRequest('DELETE', filesUrl, supabaseKey, null, headers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const execute = Boolean(args.execute);
  const dryRun = !execute;
  const workspaceId = String(args['workspace-id'] || DEFAULT_WORKSPACE_UUID).trim();
  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  console.log('[prune_codebase_docs_mirror] workspace_id=%s dry_run=%s', workspaceId, dryRun);

  if (dbUrl) {
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const before = await countViaPg(client, workspaceId);
      console.log('[prune_codebase_docs_mirror] before chunks=%s files=%s', before.chunks, before.files);
      if (dryRun) return;
      const deleted = await deleteViaPg(client, workspaceId);
      const after = await countViaPg(client, workspaceId);
      console.log('[prune_codebase_docs_mirror] deleted chunks=%s files=%s', deleted.chunks, deleted.files);
      console.log('[prune_codebase_docs_mirror] after chunks=%s files=%s', after.chunks, after.files);
      return;
    } finally {
      await client.end();
    }
  }

  if (!supabaseUrl || !supabaseKey) die('SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  const before = await countViaRest(supabaseUrl, supabaseKey, workspaceId);
  console.log('[prune_codebase_docs_mirror] before chunks=%s files=%s', before.chunks, before.files);
  if (dryRun) return;
  await deleteViaRest(supabaseUrl, supabaseKey, workspaceId);
  const after = await countViaRest(supabaseUrl, supabaseKey, workspaceId);
  console.log('[prune_codebase_docs_mirror] after chunks=%s files=%s', after.chunks, after.files);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
