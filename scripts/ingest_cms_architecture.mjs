#!/usr/bin/env node
/**
 * CMS_ARCHITECTURE.md → agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS.
 *
 * Platform-scoped pattern doc (not workspace-private memory).
 * Chunks on ## headers; keeps tables inside section chunks.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_cms_architecture.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_cms_architecture.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';
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
const VECTORIZE_INDEX = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';
const LANE = LANE_CONTRACTS.documents;
const SCRIPT_KEY = 'ingest_cms_architecture';
const SOURCE_TYPE = 'architecture_note';
const SOURCE_PATH = 'knowledge/patterns/cms-d1-r2-kv/CMS_ARCHITECTURE.md';
const DOC_TITLE = 'CMS Architecture — D1→R2→KV pattern';
const VERIFIED_AGAINST_COMMIT = 'cf43417';
const SCOPE = 'platform';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

const DEFAULT_FILE = join(
  process.env.HOME || '',
  'companionscpas/CMS_ARCHITECTURE.md',
);

function parseArgs(argv) {
  const out = { dryRun: false, file: DEFAULT_FILE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
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

function companionsGitSha(filePath) {
  try {
    return execFileSync('git', ['-C', join(filePath, '..'), 'rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
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
      source_type = EXCLUDED.source_type,
      source_url = EXCLUDED.source_url,
      source_ref = EXCLUDED.source_ref,
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
  if (result.rows[0]) return result.rows[0];
  const fallback = await client.query(
    `SELECT id, source_ref, title, embedding
       FROM agentsam.agentsam_documents_oai3large_1536
      WHERE workspace_id = $1 AND source_path = $2 AND chunk_index = $3
      LIMIT 1`,
    [row.workspace_id, row.source_path, row.chunk_index],
  );
  return fallback.rows[0] || null;
}

function buildRows(sections, workspaceUuid, fileSha) {
  const now = new Date().toISOString();
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${SOURCE_PATH}:${i}:${body}`);
    const sourceRef = `platform/cms-d1-r2-kv/CMS_ARCHITECTURE#${i}`;
    return {
      workspace_id: workspaceUuid,
      title: `${DOC_TITLE} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: SOURCE_TYPE,
      source_path: SOURCE_PATH,
      source_ref: sourceRef,
      source_url: `https://rag.inneranimalmedia.com/${SOURCE_PATH}`,
      heading_path: [DOC_TITLE, sec.section],
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
        scope: SCOPE,
        source_type: 'architecture',
        archive_tier: 'golden',
        verified_against_commit: VERIFIED_AGAINST_COMMIT,
        section: sec.section,
        section_index: i,
        chunk_strategy: 'h2_section',
        lane_key: 'docs_knowledge_search',
        doc_type: 'cms_architecture_pattern',
        companions_doc_sha: fileSha,
        r2_cms_key: 'instructions/patterns/CMS_ARCHITECTURE.md',
        r2_autorag_key: SOURCE_PATH,
      },
    };
  });
}

async function main() {
  assertLaneContract(LANE);
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const runId = createRunId();
  const d1Key = String(process.env.D1_WORKSPACE_KEY || 'ws_inneranimalmedia').trim();
  const workspaceUuid =
    String(process.env.SUPABASE_WORKSPACE_UUID || '').trim() ||
    KNOWN_WORKSPACE_UUIDS[d1Key] ||
    die(`Unknown workspace_key ${d1Key}`);
  const iamGitSha = resolveGitCommitSha(root);

  if (!existsSync(args.file)) die(`Missing file: ${args.file}`);
  const raw = readFileSync(args.file, 'utf8');
  const fileSha = companionsGitSha(args.file);
  const sections = splitByH2(raw);
  const pending = buildRows(sections, workspaceUuid, fileSha);

  console.log(`ingest_cms_architecture — ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`file: ${args.file}`);
  console.log(`source_path: ${SOURCE_PATH}`);
  console.log(`verified_against_commit: ${VERIFIED_AGAINST_COMMIT}`);
  console.log(`chunks: ${pending.length}`);
  for (const r of pending) {
    console.log(`  • [${r.chunk_index}] ${r.metadata.section} (~${r.token_count} tok)`);
  }

  if (args.dryRun || !pending.length) return;

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required');
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const savedPairs = [];
  try {
    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      const batch = pending.slice(i, i + EMBED_BATCH);
      const vecs = await openaiEmbedBatch({
        apiKey,
        texts: batch.map((r) => r.content),
        model: EMBED_MODEL,
        dims: EMBED_DIMS,
      });
      for (let j = 0; j < batch.length; j++) {
        batch[j].embedding = vecs[j];
        const saved = await upsertDocumentRow(client, batch[j]);
        if (saved?.id) {
          savedPairs.push({ row: saved, embedding: batch[j].embedding, pending: batch[j] });
          await client.query(
            `UPDATE agentsam.agentsam_documents_oai3large_1536
                SET vectorize_id = $1::text, updated_at = now()
              WHERE id = $1::uuid`,
            [String(saved.id)],
          );
        }
      }
    }

    for (let i = 0; i < savedPairs.length; i += VECTORIZE_BATCH) {
      const batch = savedPairs.slice(i, i + VECTORIZE_BATCH);
      const vectors = batch
        .map(({ row, embedding, pending: p }) => {
          const emb = parseEmbedding(embedding ?? row?.embedding);
          if (!emb || emb.length !== EMBED_DIMS) return null;
          return {
            id: String(row.id),
            values: emb,
            metadata: {
              workspace_id: d1Key,
              source_ref: String(p.source_ref || row.source_ref || ''),
              title: String(p.title || row.title || '').slice(0, 200),
              source_type: SOURCE_TYPE,
              scope: SCOPE,
              verified_against_commit: VERIFIED_AGAINST_COMMIT,
              section: String(p.metadata?.section || ''),
              source_path: SOURCE_PATH,
            },
          };
        })
        .filter(Boolean);
      if (!vectors.length) continue;
      await vectorizeUpsertNdjson({ accountId, token, index: VECTORIZE_INDEX, vectors });
    }

    writeVectorizeSyncReceipt({
      root,
      chunk_id: `run:${SCRIPT_KEY}:${SOURCE_PATH}`,
      vectorize_index: VECTORIZE_INDEX,
      status: 'ok',
      details: buildReceiptDetails({
        run_id: runId,
        script_key: SCRIPT_KEY,
        git_commit_sha: iamGitSha,
        workspace_id: d1Key,
        workspace_uuid: workspaceUuid,
        vectorize_index: VECTORIZE_INDEX,
        lane: LANE.lane,
        binding: VECTORIZE_BINDING,
        embed_model: EMBED_MODEL,
        embed_dims: EMBED_DIMS,
        chunks_embedded: savedPairs.length,
        files_indexed: 1,
        status: 'ok',
        source_path: SOURCE_PATH,
        verified_against_commit: VERIFIED_AGAINST_COMMIT,
        companions_doc_sha: fileSha,
      }),
      dryRun: false,
    });

    console.log(`\nDone — ${savedPairs.length} chunks → pgvector + Vectorize`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
