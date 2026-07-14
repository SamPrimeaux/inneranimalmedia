#!/usr/bin/env node
/**
 * reindex_codebase_dashboard_agent.mjs
 *
 * Targeted reindex of dashboard/agent source (git-discovered + policy) into:
 *   - Supabase agentsam.agentsam_codebase_files_oai3large_1536
 *   - Supabase agentsam.agentsam_codebase_chunks_oai3large_1536
 *   - CF Vectorize agentsam-codebase-oai3large-1536 (REST v2 NDJSON)
 *   - D1 vectorize_sync_log (one row per run: chunk_id = run:reindex_codebase_dashboard_agent)
 *
 * Required env (from .env.cloudflare or shell):
 *   OPENAI_API_KEY
 *   SUPABASE_DB_URL          — direct Postgres (not Hyperdrive)
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID    — default ede6590ac0d2fb7daf155b35653457b2
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --dry-run --verbose
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --no-prune
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --src-batch1 --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --src-batch1
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --runtime --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/reindex_codebase_dashboard_agent.mjs --runtime --runtime-prefix=src/api
 *   npm run run:reindex_runtime:safe   # caffeinate + auto-restart + resume checkpoint
 */
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pg from 'pg';
import {
  LANE_CONTRACTS,
  assertLaneContract,
  buildReceiptDetails,
  createRunId,
  openaiEmbedSingle,
  pruneCodebaseMirrorMissingPaths,
  resolveGitCommitSha,
  sleep,
  vectorizeUpsertNdjson,
  writeVectorizeSyncReceipt,
  contentHash,
} from './lib/rag-ingest-protocol.mjs';
import {
  buildEligibleManifest,
  loadPreviouslyIndexedPaths,
  printManifestDriftSummary,
  summarizeManifestDrift,
} from './lib/dashboard-index-manifest.mjs';
import { buildCreateSurfacesManifest } from './lib/create-surfaces-manifest.mjs';
import { MILESTONE_WORKER_CODE_PATHS } from './lib/milestone-worker-code-paths.mjs';
import { SRC_WORKER_BATCH1_PATHS } from './lib/src-worker-batch1-paths.mjs';
import { buildRuntimeEligibleManifest, RUNTIME_REQUIRED_FILES } from './lib/runtime-code-index-manifest.mjs';
import {
  createCodeIndexJobTracker,
  resolveCodeIndexJobId,
} from './lib/code-index-job-d1.mjs';
import {
  checkpointPath,
  loadCheckpoint,
  createEmptyCheckpoint,
  saveCheckpoint,
  markFileDone,
  markFileFailed,
  isCheckpointDone,
  summarizeCheckpoint,
} from './lib/code-reindex-checkpoint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
} catch { /* no .env.cloudflare in CI */ }

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'ede6590ac0d2fb7daf155b35653457b2';
const WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';
const WORKSPACE_KEY = 'ws_inneranimalmedia';
const VECTORIZE_INDEX = 'agentsam-codebase-oai3large-1536';
const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;
const REPO = 'SamPrimeaux/inneranimalmedia';
const BRANCH = 'main';

const MIN_TOKENS = 10;
const MAX_TOKENS = 400;
const OVERLAP_TOKENS = 0;
const EMBED_DELAY_MS = 200;
const VECTORIZE_BATCH = 100;

const DRY_RUN = process.argv.includes('--dry-run');
const CREATE_SURFACES_ONLY = process.argv.includes('--create-surfaces-only');
const MILESTONE_WORKER_ONLY = process.argv.includes('--milestone-worker-only');
const SRC_BATCH1 = process.argv.includes('--src-batch1');
const RUNTIME = process.argv.includes('--runtime');
const runtimePrefixArg = process.argv.find((a) => a.startsWith('--runtime-prefix='));
const RUNTIME_PREFIX = runtimePrefixArg ? runtimePrefixArg.slice('--runtime-prefix='.length).trim() : null;
const NO_PRUNE =
  process.argv.includes('--no-prune') ||
  CREATE_SURFACES_ONLY ||
  MILESTONE_WORKER_ONLY ||
  SRC_BATCH1 ||
  RUNTIME;
const VERBOSE = process.argv.includes('--verbose');
const FRESH = process.argv.includes('--fresh');
const NO_RESUME = process.argv.includes('--no-resume');
/** Auto-resume via .scratch checkpoint for long runtime / batch1 runs (unless --fresh / --no-resume). */
const USE_CHECKPOINT = !DRY_RUN && !FRESH && !NO_RESUME && (RUNTIME || SRC_BATCH1 || process.argv.includes('--resume'));
const LANE = LANE_CONTRACTS.code;
const RUN_ID = createRunId();
const GIT_COMMIT_SHA = resolveGitCommitSha(ROOT);
const SCRIPT_KEY = RUNTIME
  ? RUNTIME_PREFIX
    ? `reindex_runtime_${RUNTIME_PREFIX.replace(/[^\w.-]+/g, '_')}`
    : 'reindex_runtime_code'
  : SRC_BATCH1
    ? 'reindex_src_worker_batch1'
    : MILESTONE_WORKER_ONLY
      ? 'reindex_milestone_worker_code'
      : CREATE_SURFACES_ONLY
        ? 'ingest_create_surfaces_rag'
        : 'reindex_codebase_dashboard_agent';
const SOURCE = RUNTIME
  ? 'reindex_runtime_code'
  : SRC_BATCH1
    ? 'reindex_src_batch1'
    : MILESTONE_WORKER_ONLY
      ? 'reindex_milestone_worker_code'
      : CREATE_SURFACES_ONLY
        ? 'ingest_create_surfaces_rag'
        : 'reindex_dashboard_agent';
const RUN_SYNC_CHUNK_ID = `run:${SCRIPT_KEY}`;

const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const CF_TOKEN = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const DB_URL = (process.env.SUPABASE_DB_URL || '').trim();

if (!DRY_RUN) {
  if (!OPENAI_KEY) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }
  if (!CF_TOKEN) {
    console.error('Missing CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }
  if (!DB_URL) {
    console.error('Missing SUPABASE_DB_URL');
    process.exit(1);
  }
}


function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

function languageFromPath(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.mjs') return 'javascript';
  if (ext === '.css') return 'css';
  if (ext === '.py') return 'python';
  return 'text';
}

function pgClientOptions() {
  const useSsl =
    /\.supabase\.co\b/.test(DB_URL) ||
    /\.pooler\.supabase\.com\b/.test(DB_URL) ||
    /supabase\.com/.test(DB_URL);
  return {
    connectionString: DB_URL,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

const TOP_LEVEL_START_RE =
  /^\s*(?:export\s+default\s+|export\s+(?:async\s+)?function\*?\s+\w|export\s+(?:async\s+)?function\s*\(|export\s+(?:async\s+)?function\s+|(?:async\s+)?function\s+\w|(?:async\s+)?function\s*\(|class\s+\w|const\s+\w+\s*=\s*(?:async\s*)?\(|const\s+\w+\s*=\s*(?:async\s+)?function|let\s+\w+\s*=\s*(?:async\s*)?\(|var\s+\w+\s*=\s*(?:async\s*)?\()/;

function braceDelta(line) {
  let delta = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (ch === '/' && next === '/') {
        inLineComment = true;
        continue;
      }
      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }
    }
    if (inSingle) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') inTemplate = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '{') delta++;
    if (ch === '}') delta--;
  }
  return delta;
}

/**
 * Split TS/TS/JS on top-level declarations.
 * @param {string} text
 * @returns {string[]}
 */
function splitJsTsBlocks(text) {
  const lines = String(text ?? '').split('\n');
  if (!lines.length) return [];

  const blocks = [];
  let cur = [];
  let depth = 0;

  const flush = () => {
    const content = cur.join('\n').trim();
    if (content) blocks.push(content);
    cur = [];
  };

  for (const line of lines) {
    const atTop = depth === 0;
    const isBoundary = atTop && cur.length > 0 && TOP_LEVEL_START_RE.test(line);
    if (isBoundary) flush();
    cur.push(line);
    depth = Math.max(0, depth + braceDelta(line));
  }
  flush();

  return blocks.length ? blocks : [String(text ?? '').trim()].filter(Boolean);
}

/**
 * Split CSS on top-level rule blocks (closing brace at depth 0).
 * @param {string} text
 * @returns {string[]}
 */
function splitCssBlocks(text) {
  const lines = String(text ?? '').split('\n');
  if (!lines.length) return [];

  const blocks = [];
  let cur = [];
  let depth = 0;

  const flush = () => {
    const content = cur.join('\n').trim();
    if (content) blocks.push(content);
    cur = [];
  };

  for (const line of lines) {
    cur.push(line);
    depth = Math.max(0, depth + braceDelta(line));
    if (depth === 0 && line.includes('}')) flush();
  }
  if (cur.length) flush();

  return blocks.length ? blocks : [String(text ?? '').trim()].filter(Boolean);
}

/**
 * Split a text block into windows of at most maxTokens (overlap 0).
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string[]}
 */
function splitByTokenWindow(text, maxTokens) {
  const src = String(text ?? '').trim();
  if (!src) return [];
  if (estimateTokens(src) <= maxTokens) return [src];

  const lines = src.split('\n');
  const out = [];
  let buf = [];

  const flush = () => {
    const content = buf.join('\n').trim();
    if (content) out.push(content);
    buf = [];
  };

  for (const line of lines) {
    const candidate = buf.length ? `${buf.join('\n')}\n${line}` : line;
    if (buf.length && estimateTokens(candidate) > maxTokens) {
      flush();
      buf.push(line);
      if (estimateTokens(line) > maxTokens) {
        let rest = line;
        while (estimateTokens(rest) > maxTokens) {
          const targetChars = maxTokens * 4;
          out.push(rest.slice(0, targetChars).trim());
          rest = rest.slice(targetChars);
        }
        if (rest.trim()) buf = [rest.trim()];
        else buf = [];
      }
    } else {
      buf.push(line);
    }
  }
  flush();
  return out.length ? out : [src];
}

/**
 * Merge small blocks (< minTokens) forward; split large blocks (> maxTokens).
 * @param {string[]} blocks
 * @returns {string[]}
 */
function normalizeTokenBounds(blocks) {
  const merged = [];
  let pending = '';

  for (const block of blocks) {
    const parts = splitByTokenWindow(block, MAX_TOKENS);
    for (const part of parts) {
      if (!part) continue;
      if (estimateTokens(part) < MIN_TOKENS) {
        pending = pending ? `${pending}\n\n${part}` : part;
        if (estimateTokens(pending) >= MIN_TOKENS) {
          merged.push(pending);
          pending = '';
        }
      } else if (pending) {
        if (estimateTokens(`${pending}\n\n${part}`) <= MAX_TOKENS) {
          merged.push(`${pending}\n\n${part}`);
          pending = '';
        } else {
          merged.push(pending);
          pending = part;
        }
      } else {
        merged.push(part);
      }
    }
  }

  if (pending) {
    if (merged.length) {
      const last = merged.pop();
      merged.push(`${last}\n\n${pending}`);
    } else {
      merged.push(pending);
    }
  }

  const final = [];
  for (const chunk of merged) {
    if (estimateTokens(chunk) > MAX_TOKENS) {
      final.push(...splitByTokenWindow(chunk, MAX_TOKENS));
    } else {
      final.push(chunk);
    }
  }

  return final.filter((c) => c.trim());
}

/**
 * @param {string} text
 * @param {string} language
 * @returns {string[]}
 */
function chunkFile(text, language) {
  let blocks;
  if (language === 'css') {
    blocks = splitCssBlocks(text);
  } else if (language === 'typescript' || language === 'javascript') {
    blocks = splitJsTsBlocks(text);
  } else {
    blocks = [String(text ?? '').trim()].filter(Boolean);
  }
  return normalizeTokenBounds(blocks);
}

async function embedText(text) {
  return openaiEmbedSingle({
    apiKey: OPENAI_KEY,
    text,
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
  });
}

async function vectorizeUpsertBatch(vectors) {
  await vectorizeUpsertNdjson({
    accountId: ACCOUNT_ID,
    token: CF_TOKEN,
    index: VECTORIZE_INDEX,
    vectors,
    dryRun: DRY_RUN,
  });
}

function writeRunReceipt(stats, status = 'ok', error = null) {
  const details = buildReceiptDetails({
    run_id: RUN_ID,
    script_key: SCRIPT_KEY,
    git_commit_sha: GIT_COMMIT_SHA,
    workspace_id: WORKSPACE_KEY,
    workspace_uuid: WORKSPACE_UUID,
    vectorize_index: VECTORIZE_INDEX,
    lane: LANE.lane,
    binding: LANE.binding,
    embed_model: EMBED_MODEL,
    embed_dims: EMBED_DIMS,
    repo: REPO,
    branch: BRANCH,
    files_indexed: stats.filesIndexed,
    files_skipped: stats.filesSkipped,
    chunks_embedded: stats.chunksEmbedded,
    files_missing: stats.missing,
    files_deleted: stats.filesDeleted ?? 0,
    status,
    error,
    extra: stats.drift
      ? {
          eligible_count: stats.drift.eligibleCount,
          indexed_count: stats.drift.indexedCount,
          new_eligible_count: stats.drift.newEligible.length,
          stale_indexed_count: stats.drift.staleIndexed.length,
          manifest_source: 'git_ls_files_policy',
        }
      : { manifest_source: 'git_ls_files_policy' },
  });
  writeVectorizeSyncReceipt({
    root: ROOT,
    chunk_id: RUN_SYNC_CHUNK_ID,
    vectorize_index: VECTORIZE_INDEX,
    status,
    details,
    dryRun: DRY_RUN,
  });
  if (!DRY_RUN && status === 'ok') {
    writeVectorizeSyncReceipt({
      root: ROOT,
      chunk_id: `${RUN_SYNC_CHUNK_ID}:${RUN_ID}`,
      vectorize_index: VECTORIZE_INDEX,
      status,
      details,
      dryRun: false,
    });
  }
}

async function fetchExistingFileHash(client, filePath) {
  const res = await client.query(
    `SELECT id,
            metadata->>'content_hash' AS content_hash,
            COALESCE((metadata->>'total_chunks')::int, -1) AS total_chunks
     FROM agentsam.agentsam_codebase_files_oai3large_1536
     WHERE workspace_id = $1::uuid AND file_path = $2
     LIMIT 1`,
    [WORKSPACE_UUID, filePath],
  );
  return res.rows[0] ?? null;
}

async function countChunksForFile(client, filePath) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM agentsam.agentsam_codebase_chunks_oai3large_1536
     WHERE workspace_id = $1::uuid AND file_path = $2`,
    [WORKSPACE_UUID, filePath],
  );
  return Number(res.rows[0]?.n) || 0;
}

function isPgConnectionError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    /connection terminated|Connection terminated|ECONNRESET|EPIPE|not queryable|Connection refused|timeout|57P01|08006|08003/i.test(
      msg,
    ) || ['ECONNRESET', 'EPIPE', '57P01', '08006', '08003'].includes(code)
  );
}

async function upsertFileRow(client, { filePath, language, sizeBytes, hash, totalChunks }) {
  const now = new Date().toISOString();
  const metadata = {
    content_hash: hash,
    repo: REPO,
    branch: BRANCH,
    file_path: filePath,
    total_chunks: totalChunks,
    embedding_model: EMBED_MODEL,
  };
  const res = await client.query(
    `INSERT INTO agentsam.agentsam_codebase_files_oai3large_1536 (
      workspace_id, file_path, language, size_bytes, last_indexed, last_reindexed_at, metadata, updated_at
    ) VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz, $6::jsonb, $5::timestamptz)
    ON CONFLICT (workspace_id, file_path) DO UPDATE SET
      last_indexed = EXCLUDED.last_indexed,
      last_reindexed_at = EXCLUDED.last_reindexed_at,
      size_bytes = EXCLUDED.size_bytes,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at
    RETURNING id`,
    [WORKSPACE_UUID, filePath, language, sizeBytes, now, JSON.stringify(metadata)],
  );
  return res.rows[0]?.id;
}

async function deleteChunksForFile(client, filePath) {
  await client.query(
    `DELETE FROM agentsam.agentsam_codebase_chunks_oai3large_1536
     WHERE workspace_id = $1::uuid AND file_path = $2`,
    [WORKSPACE_UUID, filePath],
  );
}

async function insertChunkRow(client, { chunkId, fileId, filePath, content, chunkIndex, tokenCount, embedding }) {
  const metadata = {
    repo: REPO,
    branch: BRANCH,
    source: SOURCE,
    file_path: filePath,
    chunk_index: chunkIndex,
    workspace_id: WORKSPACE_KEY,
    workspace_uuid: WORKSPACE_UUID,
    embedding_model: EMBED_MODEL,
  };
  const vecLiteral = `[${embedding.join(',')}]`;
  const res = await client.query(
    `INSERT INTO agentsam.agentsam_codebase_chunks_oai3large_1536 (
      id, workspace_id, file_id, file_path, content, embedding, chunk_index, token_count, metadata
    ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::vector, $7, $8, $9::jsonb)
    RETURNING id`,
    [
      chunkId,
      WORKSPACE_UUID,
      fileId,
      filePath,
      content,
      vecLiteral,
      chunkIndex,
      tokenCount,
      JSON.stringify(metadata),
    ],
  );
  return res.rows[0]?.id ?? chunkId;
}

async function main() {
  assertLaneContract(LANE);
  if (EMBED_MODEL !== LANE.embed_model || EMBED_DIMS !== LANE.embed_dims || VECTORIZE_INDEX !== LANE.vectorize_index) {
    throw new Error('Script constants diverge from LANE_CONTRACTS.code — fix before run');
  }

  const manifest = RUNTIME
    ? buildRuntimeEligibleManifest(ROOT, { prefix: RUNTIME_PREFIX })
    : SRC_BATCH1
      ? { paths: SRC_WORKER_BATCH1_PATHS.filter((p) => existsSync(join(ROOT, p))), deniedSkipped: 0 }
      : MILESTONE_WORKER_ONLY
        ? { paths: MILESTONE_WORKER_CODE_PATHS.filter((p) => existsSync(join(ROOT, p))), deniedSkipped: 0 }
        : CREATE_SURFACES_ONLY
          ? buildCreateSurfacesManifest(ROOT)
          : buildEligibleManifest(ROOT);
  const { paths: eligiblePaths, deniedSkipped } = manifest;
  const rootCounts = RUNTIME && manifest.rootCounts ? manifest.rootCounts : null;

  console.log(`\n${SCRIPT_KEY}`);
  console.log(`mode: ${DRY_RUN ? 'DRY RUN (zero writes)' : 'LIVE'}`);
  console.log(`run_id: ${RUN_ID}`);
  console.log(`git_commit_sha: ${GIT_COMMIT_SHA}`);
  console.log(
    `manifest: ${
      RUNTIME
        ? RUNTIME_PREFIX
          ? `runtime code (prefix=${RUNTIME_PREFIX})`
          : 'runtime Worker/services/containers (full)'
        : SRC_BATCH1
          ? 'src worker batch1 (delete-before-insert validate)'
          : MILESTONE_WORKER_ONLY
            ? 'milestone worker/execos/cad paths'
            : CREATE_SURFACES_ONLY
              ? 'create-surfaces focused'
              : 'git ls-files + policy'
    } (${eligiblePaths.length} eligible)`,
  );
  if (rootCounts) {
    console.log('roots:');
    for (const [root, n] of Object.entries(rootCounts)) {
      console.log(`  ${String(n).padStart(4)}  ${root}`);
    }
  }
  console.log(`workspace: ${WORKSPACE_UUID} (${WORKSPACE_KEY})`);
  console.log(`vectorize_index: ${VECTORIZE_INDEX}`);
  console.log(`prune: ${NO_PRUNE ? 'disabled' : 'enabled after successful full run'}`);
  console.log(`chunk bounds: min=${MIN_TOKENS} max=${MAX_TOKENS} overlap=${OVERLAP_TOKENS}\n`);

  const stats = {
    filesIndexed: 0,
    filesSkipped: 0,
    chunksEmbedded: 0,
    missing: 0,
    filesDeleted: 0,
    drift: null,
  };

  /** @type {pg.Client | null} */
  let client = null;
  if (!DRY_RUN || DB_URL) {
    if (DB_URL) {
      client = new pg.Client(pgClientOptions());
      await client.connect();
    }
  }

  const indexedPaths = client
    ? await loadPreviouslyIndexedPaths(client, WORKSPACE_UUID)
    : new Set();
  const drift = summarizeManifestDrift({
    eligiblePaths,
    indexedPaths,
    requiredFiles: RUNTIME
      ? RUNTIME_PREFIX
        ? []
        : RUNTIME_REQUIRED_FILES
      : SRC_BATCH1 || MILESTONE_WORKER_ONLY || CREATE_SURFACES_ONLY
        ? []
        : undefined,
  });
  stats.drift = drift;
  printManifestDriftSummary(drift, deniedSkipped);

  if (
    !CREATE_SURFACES_ONLY &&
    !MILESTONE_WORKER_ONLY &&
    !SRC_BATCH1 &&
    !RUNTIME &&
    !drift.requiredIncluded
  ) {
    throw new Error('Required paths missing from eligible manifest — aborting');
  }

  const vectorizeQueue = [];
  const approvedPaths = new Set(eligiblePaths);

  const cpPath = checkpointPath(ROOT, SCRIPT_KEY, RUNTIME_PREFIX);
  /** @type {ReturnType<typeof createEmptyCheckpoint> | null} */
  let checkpoint = null;
  if (FRESH && existsSync(cpPath)) {
    unlinkSync(cpPath);
    console.log(`checkpoint: wiped --fresh (${cpPath})`);
  }
  if (!DRY_RUN && (RUNTIME || SRC_BATCH1 || process.argv.includes('--resume'))) {
    checkpoint = USE_CHECKPOINT ? loadCheckpoint(cpPath) : null;
    if (!checkpoint) {
      checkpoint = createEmptyCheckpoint({
        absPath: cpPath,
        scriptKey: SCRIPT_KEY,
        prefix: RUNTIME_PREFIX,
        gitCommitSha: GIT_COMMIT_SHA,
        fileCount: eligiblePaths.length,
      });
    } else {
      checkpoint.fileCount = eligiblePaths.length;
      checkpoint.gitCommitSha = GIT_COMMIT_SHA;
      checkpoint.status = 'running';
      const sum = summarizeCheckpoint(checkpoint, eligiblePaths);
      console.log(
        `checkpoint: resume ${sum.doneCount}/${eligiblePaths.length} done, ${sum.remaining} remaining, chunks≈${sum.chunksTotal}`,
      );
      console.log(`  path: ${cpPath}`);
    }
    saveCheckpoint(cpPath, checkpoint);
  }

  let shuttingDown = false;
  const onSignal = (sig) => {
    if (shuttingDown) {
      console.warn(`\n[${sig}] second signal — force exit`);
      process.exit(130);
    }
    shuttingDown = true;
    console.warn(`\n[${sig}] finishing current file then pausing for resume…`);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  async function ensurePgClient() {
    if (!DB_URL) return null;
    if (client) return client;
    client = new pg.Client(pgClientOptions());
    await client.connect();
    return client;
  }

  async function withPg(fn) {
    await ensurePgClient();
    try {
      return await fn(client);
    } catch (err) {
      if (!isPgConnectionError(err)) throw err;
      console.warn(`[pg] reconnect after: ${err?.message || err}`);
      try {
        await client?.end();
      } catch {
        /* ignore */
      }
      client = null;
      await ensurePgClient();
      return await fn(client);
    }
  }

  /** @type {ReturnType<typeof createCodeIndexJobTracker> | null} */
  let jobTracker = null;
  const initialDone = checkpoint
    ? eligiblePaths.filter((p) => checkpoint.done?.[p]).length
    : 0;
  const initialChunks = checkpoint ? Number(checkpoint.chunksTotal) || 0 : 0;
  if (!DRY_RUN && process.env.SKIP_CODE_INDEX_JOB !== '1') {
    try {
      jobTracker = createCodeIndexJobTracker({
        jobId: resolveCodeIndexJobId({ srcBatch1: SRC_BATCH1, runtime: RUNTIME }),
        triggeredBy: SCRIPT_KEY,
        fileCount: eligiblePaths.length,
        sourcePath: RUNTIME_PREFIX
          ? RUNTIME_PREFIX
          : SRC_BATCH1
            ? 'src-batch1'
            : RUNTIME
              ? 'runtime'
              : 'dashboard-agent',
        repoFullName: REPO,
        vectorBackend: 'supabase_pgvector+vectorize',
        progressEvery: eligiblePaths.length > 50 ? 10 : 1,
        resume: initialDone > 0,
        initialIndexed: initialDone,
        initialChunks,
        initialFailed: checkpoint ? Object.keys(checkpoint.failed || {}).length : 0,
      });
      jobTracker.markRunning();
    } catch (e) {
      console.warn(
        `[code-index-job] D1 bookkeeping start failed (continuing embed): ${e?.message || e}`,
      );
      jobTracker = null;
    }
  }

  try {
    for (const filePath of eligiblePaths) {
      if (shuttingDown) {
        if (checkpoint) {
          checkpoint.status = 'interrupted';
          saveCheckpoint(cpPath, checkpoint);
        }
        try {
          jobTracker?.interrupt('signal_interrupt');
        } catch {
          /* ignore */
        }
        console.warn('paused — re-run the same command to resume from checkpoint');
        process.exit(130);
      }

      const abs = join(ROOT, filePath);
      if (!existsSync(abs)) {
        console.error(`  missing: ${filePath}`);
        stats.missing++;
        if (checkpoint) {
          markFileFailed(checkpoint, filePath, 'missing_on_disk');
          saveCheckpoint(cpPath, checkpoint);
        }
        try {
          jobTracker?.tick({ failed: true });
        } catch (e) {
          console.warn(`[code-index-job] progress failed: ${e?.message || e}`);
        }
        continue;
      }

      const raw = readFileSync(abs, 'utf8');
      const hash = contentHash(raw);
      const language = languageFromPath(filePath);
      const sizeBytes = Buffer.byteLength(raw, 'utf8');
      const chunks = chunkFile(raw, language);

      if (checkpoint && isCheckpointDone(checkpoint, filePath, hash)) {
        if (VERBOSE) console.log(`  skip (checkpoint): ${filePath}`);
        stats.filesSkipped++;
        // Already counted in jobTracker initialIndexed/initialChunks — do not tick again.
        continue;
      }

      if (client || DB_URL) {
        try {
          const existing = await withPg((c) => fetchExistingFileHash(c, filePath));
          if (existing?.content_hash === hash && chunks.length > 0) {
            const liveCount = await withPg((c) => countChunksForFile(c, filePath));
            const metaChunks = Number(existing.total_chunks);
            const okCount =
              liveCount === chunks.length ||
              (metaChunks > 0 && liveCount === metaChunks);
            if (okCount) {
              if (VERBOSE) console.log(`  skip (unchanged): ${filePath}`);
              stats.filesSkipped++;
              if (checkpoint) {
                markFileDone(checkpoint, filePath, { hash, chunks: liveCount || chunks.length });
                saveCheckpoint(cpPath, checkpoint);
              }
              try {
                jobTracker?.tick({ chunksAdded: liveCount || chunks.length });
              } catch (e) {
                console.warn(`[code-index-job] progress failed: ${e?.message || e}`);
              }
              continue;
            }
            console.warn(
              `  reindex (incomplete prior write): ${filePath} hash ok but chunks=${liveCount} expected=${chunks.length}`,
            );
          }
        } catch (e) {
          console.warn(`  hash check failed for ${filePath}: ${e?.message || e}`);
        }
      }

      if (!chunks.length) {
        if (VERBOSE) console.log(`  skip (empty): ${filePath}`);
        if (checkpoint) {
          markFileDone(checkpoint, filePath, { hash, chunks: 0 });
          saveCheckpoint(cpPath, checkpoint);
        }
        try {
          jobTracker?.tick({ chunksAdded: 0 });
        } catch (e) {
          console.warn(`[code-index-job] progress failed: ${e?.message || e}`);
        }
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [dry-run] ${filePath} (${language}) → ${chunks.length} chunks`);
        if (VERBOSE) {
          for (let i = 0; i < chunks.length; i++) {
            const tokens = estimateTokens(chunks[i]);
            const preview = chunks[i].slice(0, 80).replace(/\s+/g, ' ');
            console.log(`    chunk ${i}: ~${tokens} tokens — ${preview}${chunks[i].length > 80 ? '…' : ''}`);
          }
        }
        stats.filesIndexed++;
        stats.chunksEmbedded += chunks.length;
        continue;
      }

      try {
        await withPg(async (c) => {
          await deleteChunksForFile(c, filePath);
          // Placeholder file row without final hash until chunks succeed (resume-safe).
          const fileId = await upsertFileRow(c, {
            filePath,
            language,
            sizeBytes,
            hash: `partial:${hash}`,
            totalChunks: chunks.length,
          });
          if (!fileId) throw new Error(`file upsert returned no id: ${filePath}`);

          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            if (shuttingDown) {
              throw Object.assign(new Error('signal_interrupt_mid_file'), { code: 'INTERRUPT' });
            }
            const content = chunks[chunkIndex];
            const tokenCount = estimateTokens(content);
            const embedding = await embedText(content);
            await sleep(EMBED_DELAY_MS);

            const chunkId = randomUUID();
            const rowId = await insertChunkRow(c, {
              chunkId,
              fileId,
              filePath,
              content,
              chunkIndex,
              tokenCount,
              embedding,
            });

            vectorizeQueue.push({
              id: rowId,
              values: embedding,
              metadata: {
                file_path: filePath,
                chunk_index: chunkIndex,
                source: SOURCE,
                workspace_id: WORKSPACE_KEY,
                workspace_uuid: WORKSPACE_UUID,
                repo: REPO,
                branch: BRANCH,
              },
            });

            if (vectorizeQueue.length >= VECTORIZE_BATCH) {
              await vectorizeUpsertBatch(vectorizeQueue.splice(0, VECTORIZE_BATCH));
            }

            stats.chunksEmbedded++;
          }

          if (vectorizeQueue.length > 0) {
            await vectorizeUpsertBatch(vectorizeQueue.splice(0));
          }

          // Final hash only after all chunks + vectorize flush — mid-file crash will reindex.
          await upsertFileRow(c, {
            filePath,
            language,
            sizeBytes,
            hash,
            totalChunks: chunks.length,
          });
        });

        stats.filesIndexed++;
        console.log(`  indexed: ${filePath} (${chunks.length} chunks)`);
        if (checkpoint) {
          markFileDone(checkpoint, filePath, { hash, chunks: chunks.length });
          saveCheckpoint(cpPath, checkpoint);
        }
        try {
          jobTracker?.tick({ chunksAdded: chunks.length });
        } catch (e) {
          console.warn(`[code-index-job] progress failed: ${e?.message || e}`);
        }
      } catch (err) {
        if (err?.code === 'INTERRUPT' || shuttingDown) {
          if (checkpoint) {
            checkpoint.status = 'interrupted';
            saveCheckpoint(cpPath, checkpoint);
          }
          try {
            jobTracker?.interrupt('signal_interrupt_mid_file');
          } catch {
            /* ignore */
          }
          console.warn(`paused mid-file ${filePath} — will reindex that file on resume`);
          process.exit(130);
        }
        if (checkpoint) {
          markFileFailed(checkpoint, filePath, err);
          saveCheckpoint(cpPath, checkpoint);
        }
        throw err;
      }
    }

    if (stats.missing > 0) {
      throw new Error(`${stats.missing} approved source file(s) missing from disk — aborting before prune`);
    }

    if (client && !NO_PRUNE && stats.missing === 0) {
      console.log('\nprune: removing mirror rows for paths not in approved source set…');
      const prune = await pruneCodebaseMirrorMissingPaths({
        client,
        workspaceUuid: WORKSPACE_UUID,
        approvedPaths,
        accountId: ACCOUNT_ID,
        token: CF_TOKEN,
        vectorizeIndex: VECTORIZE_INDEX,
        dryRun: DRY_RUN,
      });
      stats.filesDeleted = prune.deletedFiles.length;
      if (prune.deletedFiles.length) {
        console.log(`  pruned ${prune.deletedFiles.length} file(s), ${prune.deletedChunks} chunk(s), ${prune.deletedVectors} vector(s)`);
      } else {
        console.log('  nothing to prune');
      }
    }

    if (checkpoint) {
      checkpoint.status = 'completed';
      saveCheckpoint(cpPath, checkpoint);
    }
    try {
      jobTracker?.complete();
    } catch (e) {
      console.warn(`[code-index-job] complete failed: ${e?.message || e}`);
    }
  } catch (err) {
    if (checkpoint && !DRY_RUN) {
      checkpoint.status = 'failed';
      saveCheckpoint(cpPath, checkpoint);
    }
    try {
      jobTracker?.fail(err);
    } catch {
      /* already logged inside fail */
    }
    if (!DRY_RUN) {
      try {
        writeRunReceipt(stats, 'failed', err?.message || String(err));
      } catch (receiptErr) {
        console.error('Failed to write error receipt:', receiptErr?.message || receiptErr);
      }
    }
    throw err;
  } finally {
    if (client) await client.end().catch(() => {});
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(
    `done — files indexed: ${stats.filesIndexed}, skipped (unchanged): ${stats.filesSkipped}, chunks embedded: ${stats.chunksEmbedded}, missing: ${stats.missing}, pruned: ${stats.filesDeleted}`,
  );
  if (!DRY_RUN) {
    writeRunReceipt(stats, 'ok');
    console.log(`Vectorize index: ${VECTORIZE_INDEX} (propagation ~5–10s after upsert)`);
    console.log(`D1 sync log: ${RUN_SYNC_CHUNK_ID} (+ history ${RUN_SYNC_CHUNK_ID}:${RUN_ID})`);
    if (jobTracker) console.log(`D1 code index job: ${jobTracker.jobId}`);
    if (checkpoint) console.log(`checkpoint: ${cpPath} (status=${checkpoint.status})`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  if (stats.missing > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
