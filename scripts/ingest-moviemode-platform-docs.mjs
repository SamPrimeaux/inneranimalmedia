#!/usr/bin/env node
/**
 * MovieMode platform docs → R2 autorag + agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS + docs_index_log.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-moviemode-platform-docs.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-moviemode-platform-docs.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-moviemode-platform-docs.mjs --verify-only
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-moviemode-platform-docs.mjs --skip-r2
 */
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { execFileSync } from 'child_process';
import pg from 'pg';
import {
  LANE_CONTRACTS,
  assertLaneContract,
  buildReceiptDetails,
  contentHash,
  createRunId,
  openaiEmbedBatch,
  resolveGitCommitSha,
  vectorizeUpsertNdjson,
  writeVectorizeSyncReceipt,
} from './lib/rag-ingest-protocol.mjs';

const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;
const EMBED_BATCH = 8;
const VECTORIZE_BATCH = 100;
const TABLE = 'agentsam_documents_oai3large_1536';
const VECTORIZE_INDEX = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';
const LANE = LANE_CONTRACTS.documents;
const SCRIPT_KEY = 'ingest_moviemode_platform_docs';
const MANIFEST = 'docs/platform/moviemode-platform-docs.manifest.json';
const AUTORAG_BUCKET = 'inneranimalmedia-autorag';
const D1_DB = 'inneranimalmedia-business';
const WRANGLER_CONFIG = 'wrangler.production.toml';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

function parseArgs(argv) {
  const out = { dryRun: false, verifyOnly: false, skipR2: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--verify-only') out.verifyOnly = true;
    else if (a === '--skip-r2') out.skipR2 = true;
    else if (a === '--file' && argv[i + 1]) out.file = String(argv[++i]);
    else if (a.startsWith('--file=')) out.file = a.slice(7);
  }
  return out;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith('[')) return null;
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function parseFrontmatter(md) {
  const s = String(md).replace(/\r\n/g, '\n');
  if (!s.startsWith('---\n')) return { meta: {}, body: s };
  const end = s.indexOf('\n---\n', 4);
  if (end === -1) return { meta: {}, body: s };
  const raw = s.slice(4, end);
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([a-z0-9_]+):\s*(.*)$/i);
    if (!m) continue;
    meta[m[1]] = m[2].trim();
  }
  return { meta, body: s.slice(end + 5) };
}

function splitByH2(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const chunks = [];
  let title = 'Overview';
  let buf = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body.length >= 40) chunks.push({ section: title, content: body });
  };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      title = line.slice(3).trim();
      buf = [line];
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

function loadManifest(root) {
  const p = join(root, MANIFEST);
  if (!existsSync(p)) die(`Missing ${MANIFEST}`);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  const entries = Array.isArray(data.entries) ? data.entries : [];
  return { workspaceKey: data.workspace_key || 'ws_inneranimalmedia', entries };
}

function resolveEntries(root, args) {
  const { entries } = loadManifest(root);
  const mapped = entries
    .filter((e) => e?.file && e?.autorag_key)
    .map((e) => ({
      file: String(e.file).replace(/^\//, ''),
      autoragKey: String(e.autorag_key).replace(/^\//, ''),
      topic: e.topic || basename(e.file, '.md'),
      lane_key: e.lane_key || 'docs_knowledge_search',
    }));
  if (args.file) {
    const rel = args.file.replace(/^\//, '');
    const hit = mapped.find((e) => e.file === rel || e.autoragKey === rel);
    if (hit) return [hit];
    return [{ file: rel, autoragKey: rel, topic: basename(rel, '.md'), lane_key: 'docs_knowledge_search' }];
  }
  return mapped;
}

function runD1Command(root, sql) {
  const wrapper = join(root, 'scripts', 'with-cloudflare-env.sh');
  const out = execFileSync(
    wrapper,
    [
      'npx',
      'wrangler',
      'd1',
      'execute',
      D1_DB,
      '--remote',
      '-c',
      WRANGLER_CONFIG,
      '--json',
      '--command',
      sql,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

function upsertDocsIndexLog(root, autoragKey, chunkCount, dryRun) {
  const keyEsc = String(autoragKey).replace(/'/g, "''");
  const sql = `INSERT OR REPLACE INTO docs_index_log (key, chunk_count, indexed_at, deleted_at, source, status)
    VALUES ('${keyEsc}', ${Number(chunkCount) || 0}, datetime('now'), NULL, 'ingest_script', 'indexed')`;
  if (dryRun) {
    console.log(`  [dry-run] docs_index_log: ${autoragKey} → ${chunkCount} chunks`);
    return;
  }
  runD1Command(root, sql);
}

function uploadToAutorag(root, absPath, autoragKey, dryRun) {
  if (dryRun) {
    console.log(`  [dry-run] PUT r2://${AUTORAG_BUCKET}/${autoragKey}`);
    return;
  }
  const wrapper = join(root, 'scripts', 'with-cloudflare-env.sh');
  execFileSync(
    wrapper,
    [
      'npx',
      'wrangler',
      'r2',
      'object',
      'put',
      `${AUTORAG_BUCKET}/${autoragKey}`,
      '--file',
      absPath,
      '--content-type',
      'text/markdown; charset=utf-8',
      '--config',
      WRANGLER_CONFIG,
      '--remote',
    ],
    { cwd: root, stdio: 'inherit' },
  );
}

async function upsertDocumentRow(client, row) {
  const vecLiteral = `[${row.embedding.join(',')}]`;
  const now = row.embedded_at || new Date().toISOString();
  const slug = String(row.source_path || '')
    .replace(/\.md$/i, '')
    .replace(/\//g, '-');
  const result = await client.query(
    `INSERT INTO agentsam.agentsam_documents_oai3large_1536 (
      workspace_id, user_id, title, content, source_type, source_url, source_path, source_ref,
      slug, heading_path, chunk_index, chunk_type, content_hash, token_count,
      embedding, embedding_model, embedding_dims, embedded_at,
      vectorize_binding, vectorize_index, metadata, created_at, updated_at
    ) VALUES (
      $1, NULL, $2, $3, $4, $5, $6, $7,
      $8, $9::text[], $10, 'section', $11, $12,
      $13::vector, $14, $15, $16,
      $17, $18, $19::jsonb, $16, $16
    )
    ON CONFLICT (workspace_id, source_path, chunk_index)
    DO UPDATE SET
      content = EXCLUDED.content,
      content_hash = EXCLUDED.content_hash,
      embedding = EXCLUDED.embedding,
      embedded_at = EXCLUDED.embedded_at,
      token_count = EXCLUDED.token_count,
      title = EXCLUDED.title,
      heading_path = EXCLUDED.heading_path,
      metadata = EXCLUDED.metadata,
      vectorize_binding = EXCLUDED.vectorize_binding,
      vectorize_index = EXCLUDED.vectorize_index,
      updated_at = EXCLUDED.updated_at
    WHERE agentsam.agentsam_documents_oai3large_1536.content_hash IS DISTINCT FROM EXCLUDED.content_hash
       OR agentsam.agentsam_documents_oai3large_1536.embedding IS NULL
    RETURNING id, source_ref, title, embedding`,
    [
      row.workspace_id,
      row.title,
      row.content,
      row.source_type,
      row.source_url,
      row.source_path,
      row.source_ref,
      slug,
      row.heading_path,
      row.chunk_index,
      row.content_hash,
      row.token_count,
      vecLiteral,
      row.embedding_model,
      row.embedding_dims,
      now,
      row.vectorize_binding,
      row.vectorize_index,
      JSON.stringify(row.metadata || {}),
    ],
  );
  return result.rows[0];
}

function buildRows(entry, docTitle, meta, sections, workspaceUuid, gitSha, laneKey) {
  const now = new Date().toISOString();
  const sourcePath = entry.autoragKey;
  const topic = entry.topic || meta.topic || basename(entry.file, '.md');
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${sourcePath}:${i}:${body}`);
    const sourceRef = `platform/${topic}#${i}`;
    return {
      workspace_id: workspaceUuid,
      title: `${docTitle} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: 'knowledge',
      source_path: sourcePath,
      source_ref: sourceRef,
      source_url: `https://github.com/SamPrimeaux/inneranimalmedia/blob/${gitSha}/${entry.file}`,
      heading_path: [docTitle, sec.section],
      chunk_index: i,
      chunk_type: 'section',
      content_hash: h,
      token_count: Math.max(1, Math.ceil(body.length / 4)),
      embedding_model: EMBED_MODEL,
      embedding_dims: EMBED_DIMS,
      embedded_at: now,
      vectorize_binding: VECTORIZE_BINDING,
      vectorize_index: VECTORIZE_INDEX,
      metadata: {
        topic,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_section',
        lane_key: laneKey || meta.lane_key || 'docs_knowledge_search',
        doc_type: 'platform_doc',
        autorag_key: sourcePath,
        repo_path: entry.file,
      },
    };
  });
}

async function ingestOneFile({ root, entry, workspaceUuid, d1Key, gitSha, dryRun, skipR2, client, runId }) {
  const abs = join(root, entry.file);
  if (!existsSync(abs)) {
    console.warn(`skip missing: ${entry.file}`);
    return { skipped: true, chunks: 0, autoragKey: entry.autoragKey };
  }

  const raw = readFileSync(abs, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const docTitle = meta.title || basename(entry.file, '.md');
  const laneKey = entry.lane_key || meta.lane_key || 'docs_knowledge_search';
  const sections = splitByH2(body);
  const pending = buildRows(entry, docTitle, meta, sections, workspaceUuid, gitSha, laneKey);

  console.log(`\n── ${entry.file} → ${entry.autoragKey}`);
  console.log(`   chunks: ${pending.length} | lane: ${laneKey}`);
  for (const r of pending) {
    console.log(`   • ${r.source_ref} (~${r.token_count} tok)`);
  }

  if (!skipR2) {
    console.log(`   R2 upload…`);
    uploadToAutorag(root, abs, entry.autoragKey, dryRun);
  }

  if (dryRun || !pending.length) {
    upsertDocsIndexLog(root, entry.autoragKey, pending.length, dryRun);
    return { skipped: false, chunks: pending.length, autoragKey: entry.autoragKey };
  }

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');

  const savedRows = [];
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const vecs = await openaiEmbedBatch({ apiKey, texts: batch.map((r) => r.content), model: EMBED_MODEL, dims: EMBED_DIMS });
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vecs[j];
      const saved = await upsertDocumentRow(client, batch[j]);
      savedRows.push(saved);
    }
  }

  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

  for (let i = 0; i < savedRows.length; i += VECTORIZE_BATCH) {
    const batch = savedRows.slice(i, i + VECTORIZE_BATCH);
    const vectors = batch
      .map((row) => {
        const emb = parseEmbedding(row.embedding);
        if (!emb || emb.length !== EMBED_DIMS) return null;
        return {
          id: String(row.id),
          values: emb,
          metadata: {
            workspace_id: d1Key,
            source_ref: String(row.source_ref || ''),
            title: String(row.title || '').slice(0, 200),
            source_type: 'knowledge',
            doc_type: 'platform_doc',
            key: entry.autoragKey,
          },
        };
      })
      .filter(Boolean);
    if (!vectors.length) continue;
    await vectorizeUpsertNdjson({ accountId, token, index: VECTORIZE_INDEX, vectors });
  }

  writeVectorizeSyncReceipt({
    root,
    chunk_id: `run:${SCRIPT_KEY}:${entry.autoragKey}`,
    vectorize_index: VECTORIZE_INDEX,
    status: 'ok',
    details: buildReceiptDetails({
      run_id: runId,
      script_key: SCRIPT_KEY,
      git_commit_sha: gitSha,
      workspace_id: d1Key,
      workspace_uuid: workspaceUuid,
      vectorize_index: VECTORIZE_INDEX,
      lane: LANE.lane,
      binding: VECTORIZE_BINDING,
      embed_model: EMBED_MODEL,
      embed_dims: EMBED_DIMS,
      chunks_embedded: savedRows.length,
      files_indexed: 1,
      status: 'ok',
      source_path: entry.autoragKey,
      extra: { autorag_key: entry.autoragKey, repo_path: entry.file },
    }),
    dryRun: false,
  });

  upsertDocsIndexLog(root, entry.autoragKey, savedRows.length, false);

  console.log(`   ✓ ${savedRows.length} chunks → pgvector + Vectorize + docs_index_log`);
  return { skipped: false, chunks: savedRows.length, autoragKey: entry.autoragKey };
}

async function verifyIngest(root, entries, workspaceUuid) {
  console.log('\n=== Verification ===\n');

  const keys = entries.map((e) => e.autoragKey.replace(/'/g, "''"));
  const inList = keys.map((k) => `'${k}'`).join(', ');
  const d1Sql = `SELECT key, chunk_count, status, source, indexed_at FROM docs_index_log WHERE key IN (${inList}) ORDER BY key`;
  console.log('D1 docs_index_log:');
  try {
    const d1 = runD1Command(root, d1Sql);
    const rows = d1?.[0]?.results ?? [];
    if (!rows.length) {
      console.log('  (no rows found)');
    } else {
      for (const r of rows) {
        console.log(`  ${r.key}: chunks=${r.chunk_count} status=${r.status} source=${r.source} at=${r.indexed_at}`);
      }
    }
  } catch (e) {
    console.error('  D1 query failed:', e?.message || e);
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.log('\nSupabase: skipped (SUPABASE_DB_URL not set)');
    return;
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    console.log('\nSupabase agentsam_documents_oai3large_1536:');
    for (const entry of entries) {
      const res = await client.query(
        `SELECT source_path, COUNT(*)::int AS chunks,
                MAX(embedded_at) AS latest_embed,
                COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embedding
         FROM agentsam.agentsam_documents_oai3large_1536
         WHERE workspace_id = $1::uuid AND source_path = $2
         GROUP BY source_path`,
        [workspaceUuid, entry.autoragKey],
      );
      if (!res.rows.length) {
        console.log(`  ${entry.autoragKey}: (no rows)`);
      } else {
        const r = res.rows[0];
        console.log(
          `  ${r.source_path}: chunks=${r.chunks} embedded=${r.with_embedding} latest=${r.latest_embed}`,
        );
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  assertLaneContract(LANE);
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const runId = createRunId();
  const { workspaceKey } = loadManifest(root);
  const d1Key = String(process.env.D1_WORKSPACE_KEY || workspaceKey).trim();
  const workspaceUuid =
    String(process.env.SUPABASE_WORKSPACE_UUID || '').trim() ||
    KNOWN_WORKSPACE_UUIDS[d1Key] ||
    die(`Unknown workspace_key ${d1Key}`);
  const gitSha = resolveGitCommitSha(root);
  const entries = resolveEntries(root, args);

  if (args.verifyOnly) {
    await verifyIngest(root, entries, workspaceUuid);
    return;
  }

  console.log(`ingest_moviemode_platform_docs — ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`files: ${entries.length}`);

  if (args.dryRun) {
    for (const entry of entries) {
      await ingestOneFile({
        root,
        entry,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: true,
        skipR2: args.skipR2,
        client: null,
        runId,
      });
    }
    await verifyIngest(root, entries, workspaceUuid);
    return;
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required for live ingest');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let totalChunks = 0;
  try {
    for (const entry of entries) {
      const r = await ingestOneFile({
        root,
        entry,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: false,
        skipR2: args.skipR2,
        client,
        runId,
      });
      if (!r.skipped) totalChunks += r.chunks;
    }
    console.log(`\nDone — ${totalChunks} total chunks from ${entries.length} platform doc(s)`);
  } finally {
    await client.end().catch(() => {});
  }

  await verifyIngest(root, entries, workspaceUuid);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
