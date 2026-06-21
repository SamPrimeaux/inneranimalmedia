#!/usr/bin/env node
/**
 * ingest_genmedia_brand_policy.mjs — brand policy docs → documents lane (source_type=policy).
 *
 * Prerequisite: apply supabase/migrations/20260621120000_documents_source_type_policy.sql
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_genmedia_brand_policy.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_genmedia_brand_policy.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';
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
const SCRIPT_KEY = 'ingest_genmedia_brand_policy';
const SOURCE_TYPE = 'policy';
const DEFAULT_MANIFEST = 'docs/inneranimalmedia/brand/ingest.manifest.json';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

function parseArgs(argv) {
  const out = { dryRun: false, manifest: DEFAULT_MANIFEST };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--manifest' && argv[i + 1]) out.manifest = String(argv[++i]);
    else if (a.startsWith('--manifest=')) out.manifest = a.slice(11);
  }
  return out;
}

function die(msg) {
  console.error(msg);
  process.exit(2);
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

async function openaiEmbed(texts) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  return openaiEmbedBatch({ apiKey, texts, model: EMBED_MODEL, dims: EMBED_DIMS });
}

async function vectorizeUpsert(vectors) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');
  await vectorizeUpsertNdjson({ accountId, token, index: VECTORIZE_INDEX, vectors });
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
      source_type = EXCLUDED.source_type,
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
      JSON.stringify(row.metadata),
    ],
  );
  return result.rows[0];
}

function buildRows(relPath, docTitle, sections, workspaceUuid, gitSha, sourceRefPrefix) {
  const now = new Date().toISOString();
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${relPath}:${i}:${body}`);
    const sourceRef = `${sourceRefPrefix}/${basename(relPath, '.md')}#${sec.section}`.slice(0, 500);
    return {
      workspace_id: workspaceUuid,
      title: `${docTitle} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: SOURCE_TYPE,
      source_path: relPath,
      source_ref: sourceRef,
      source_url: `https://github.com/SamPrimeaux/inneranimalmedia/blob/${gitSha}/${relPath}`,
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
        policy_lane: true,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_section',
        skill_key: 'on_brand_genmedia',
      },
    };
  });
}

async function main() {
  assertLaneContract(LANE);
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const manifestPath = join(root, args.manifest);
  if (!existsSync(manifestPath)) die(`Missing manifest: ${args.manifest}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const d1Key = String(manifest.workspace_id || 'ws_inneranimalmedia').trim();
  const workspaceUuid = KNOWN_WORKSPACE_UUIDS[d1Key] || die(`Unknown workspace ${d1Key}`);
  const sourceRefPrefix = String(manifest.source_ref_prefix || 'brand/inneranimalmedia').trim();
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!files.length) die('No files in manifest');

  const runId = createRunId();
  const gitSha = resolveGitCommitSha(root);
  console.log(`[ingest_genmedia_brand_policy] ${args.dryRun ? 'DRY RUN' : 'LIVE'} source_type=${SOURCE_TYPE} files=${files.length}`);

  if (args.dryRun) {
    for (const rel of files) {
      const abs = join(root, rel);
      if (!existsSync(abs)) {
        console.warn(`skip missing: ${rel}`);
        continue;
      }
      const raw = readFileSync(abs, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const docTitle = meta.title || basename(rel, '.md');
      const sections = splitByH2(body);
      console.log(`${rel}: ${sections.length} chunks`);
    }
    return;
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    let total = 0;
    for (const rel of files) {
      const abs = join(root, rel);
      if (!existsSync(abs)) {
        console.warn(`skip missing: ${rel}`);
        continue;
      }
      const raw = readFileSync(abs, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const docTitle = meta.title || basename(rel, '.md');
      const sections = splitByH2(body);
      const pending = buildRows(rel, docTitle, sections, workspaceUuid, gitSha, sourceRefPrefix);
      const savedRows = [];
      for (let i = 0; i < pending.length; i += EMBED_BATCH) {
        const batch = pending.slice(i, i + EMBED_BATCH);
        const vecs = await openaiEmbed(batch.map((r) => r.content));
        for (let j = 0; j < batch.length; j++) {
          batch[j].embedding = vecs[j];
          savedRows.push(await upsertDocumentRow(client, batch[j]));
        }
      }
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
                source_type: SOURCE_TYPE,
                skill_key: 'on_brand_genmedia',
              },
            };
          })
          .filter(Boolean);
        if (vectors.length) await vectorizeUpsert(vectors);
      }
      total += savedRows.length;
      console.log(`✓ ${rel} → ${savedRows.length} chunks`);
      writeVectorizeSyncReceipt({
        root,
        chunk_id: `run:${SCRIPT_KEY}:${rel}`,
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
          source_path: rel,
          source_type: SOURCE_TYPE,
        }),
        dryRun: false,
      });
    }
    console.log(`[ingest_genmedia_brand_policy] done total_chunks=${total}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
