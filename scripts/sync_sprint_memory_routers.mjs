#!/usr/bin/env node
/**
 * Sync pinned sprint/platform memory routers to vector + private pg + D1 embedding_id.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_sprint_memory_routers.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_sprint_memory_routers.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/sync_sprint_memory_routers.mjs --key byok_sprint_router_v1
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRunId, resolveGitCommitSha } from './lib/rag-ingest-protocol.mjs';
import { syncSprintMemoryRouter } from './lib/sync-sprint-memory-router.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TENANT_ID = 'tenant_sam_primeaux';
const USER_ID = 'au_871d920d1233cbd1';
const WORKSPACE_D1 = 'ws_inneranimalmedia';
const WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';

const ROUTERS = [
  {
    memoryKey: 'iam_platform_context_router_v1',
    scriptKey: 'sync_platform_context_router_memory_vector',
    topic: 'iam_platform_snapshot',
    docType: 'platform_context_router',
    defaultSource: 'migration_639_platform_router',
  },
  {
    memoryKey: 'byok_sprint_router_v1',
    scriptKey: 'sync_byok_sprint_memory_vector',
    topic: 'byok_sprint',
    docType: 'byok_sprint_router',
    defaultSource: 'migration_640_byok_sprint_router',
  },
  {
    memoryKey: 'designstudio_sprint_router_v1',
    scriptKey: 'sync_designstudio_sprint_memory_vector',
    topic: 'designstudio_sprint',
    docType: 'designstudio_sprint_router',
    defaultSource: 'migration_641_designstudio_sprint_router',
  },
  {
    memoryKey: 'team_pipeline_cross_tool_v1',
    scriptKey: 'sync_sprint_memory_routers',
    topic: 'team_pipeline',
    docType: 'team_pipeline_router',
    defaultSource: 'migration_642_team_pipeline',
  },
];

function parseArgs(argv) {
  const out = { dryRun: false, key: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--key' && argv[i + 1]) out.key = String(argv[++i]);
    else if (a.startsWith('--key=')) out.key = a.slice(6);
  }
  return out;
}

async function main() {
  const { dryRun, key } = parseArgs(process.argv.slice(2));
  const runId = createRunId();
  const gitSha = resolveGitCommitSha(ROOT);
  const targets = key ? ROUTERS.filter((r) => r.memoryKey === key) : ROUTERS;
  if (!targets.length) {
    console.error(`Unknown --key ${key}. Known: ${ROUTERS.map((r) => r.memoryKey).join(', ')}`);
    process.exit(1);
  }

  console.log(`sync_sprint_memory_routers — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`targets: ${targets.map((t) => t.memoryKey).join(', ')}`);

  for (const r of targets) {
    console.log(`\n── ${r.memoryKey}`);
    await syncSprintMemoryRouter({
      root: ROOT,
      runId,
      gitSha,
      memoryKey: r.memoryKey,
      tenantId: TENANT_ID,
      userId: USER_ID,
      workspaceD1: WORKSPACE_D1,
      workspaceUuid: WORKSPACE_UUID,
      scriptKey: r.scriptKey,
      topic: r.topic,
      docType: r.docType,
      defaultSource: r.defaultSource,
      dryRun,
    });
  }

  if (!dryRun) {
    console.log(`\nDone — synced ${targets.length} memory router(s)`);
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
