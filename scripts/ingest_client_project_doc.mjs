#!/usr/bin/env node
/**
 * Embed repo client project briefs → agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_client_project_doc.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_client_project_doc.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_client_project_doc.mjs --file docs/clients/companionscpas/project-brief.md
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_client_project_doc.mjs --manifest docs/clients/companionscpas/ingest.manifest.json
 */
import { readFileSync, existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
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
const SCRIPT_KEY = 'ingest_client_project_doc';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

const DEFAULT_FILE = 'docs/clients/companionscpas/project-brief.md';
const DEFAULT_MANIFEST = 'docs/clients/companionscpas/ingest.manifest.json';

function parseArgs(argv) {
  const out = { dryRun: false, file: null, manifest: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--file' && argv[i + 1]) out.file = String(argv[++i]);
    else if (a.startsWith('--file=')) out.file = a.slice(7);
    else if (a === '--manifest' && argv[i + 1]) out.manifest = String(argv[++i]);
    else if (a.startsWith('--manifest=')) out.manifest = a.slice(11);
  }
  if (!out.file && !out.manifest) out.file = DEFAULT_FILE;
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
  if (result.rows[0]) return result.rows[0];
  const fallback = await client.query(
    `SELECT id, source_ref, title, embedding
       FROM agentsam.agentsam_documents_oai3large_1536
      WHERE workspace_id = $1 AND source_path = $2 AND chunk_index = $3
      LIMIT 1`,
    [row.workspace_id, row.source_path, row.chunk_index],
  );
  const existing = fallback.rows[0];
  if (!existing) return null;
  return {
    ...existing,
    embedding: row.embedding || existing.embedding,
  };
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

function buildRows(relPath, docTitle, projectKey, sections, workspaceUuid, gitSha, meta = {}) {
  const now = new Date().toISOString();
  const slug = relPath.replace(/\.md$/i, '').replace(/\//g, '-');
  const docSlug = basename(relPath, '.md');
  const laneKey = meta.lane_key || 'client_project_semantic_search';
  const docType = meta.doc_type || 'client_project_brief';
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${relPath}:${i}:${body}`);
    const sourceRef = `clients/${projectKey || basename(dirname(relPath))}/${docSlug}#${i}`;
    return {
      workspace_id: workspaceUuid,
      title: `${docTitle} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: 'clients',
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
        project_key: projectKey || slug,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_section',
        lane_key: laneKey,
        doc_type: docType,
      },
    };
  });
}

function loadManifest(root, manifestPath) {
  const p = join(root, manifestPath);
  if (!existsSync(p)) die(`Missing manifest: ${manifestPath}`);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  return {
    workspaceKey: data.workspace_key || 'ws_inneranimalmedia',
    projectKey: data.project_key || 'companionscpas',
    entries: Array.isArray(data.entries) ? data.entries : [],
  };
}

function resolveFiles(root, args) {
  if (args.file) {
    return [{ file: args.file.replace(/^\//, ''), lane_key: 'client_project_semantic_search' }];
  }
  const manifestPath = args.manifest || DEFAULT_MANIFEST;
  const { entries } = loadManifest(root, manifestPath);
  return entries
    .filter((e) => e?.file)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .map((e) => ({
      file: String(e.file).replace(/^\//, ''),
      lane_key: e.lane_key || 'client_project_semantic_search',
      topic: e.topic || null,
    }));
}

async function ingestOneFile({ root, rel, workspaceUuid, d1Key, gitSha, dryRun, client, runId, defaultProjectKey }) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.warn(`skip missing: ${rel}`);
    return { chunks: 0, projectKey: defaultProjectKey };
  }

  const raw = readFileSync(abs, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const docTitle = meta.title || basename(rel, '.md');
  const projectKey = meta.project_key || defaultProjectKey || basename(dirname(rel));
  const sections = splitByH2(body);
  const pending = buildRows(rel, docTitle, projectKey, sections, workspaceUuid, gitSha, meta);

  console.log(`\n── ${rel}`);
  console.log(`   project_key: ${projectKey}`);
  console.log(`   chunks: ${pending.length} (H2 sections)`);
  for (const r of pending) {
    console.log(`   • ${r.source_ref} (~${r.token_count} tok)`);
  }

  if (dryRun || !pending.length) return { chunks: pending.length, projectKey };

  const runSyncChunkId = `run:${SCRIPT_KEY}:${rel}`;
  const savedRows = [];
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const vecs = await openaiEmbed(batch.map((r) => r.content));
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vecs[j];
      if (!Array.isArray(batch[j].embedding)) {
        die(`OpenAI returned no embedding for ${batch[j].source_ref}`);
      }
      const saved = await upsertDocumentRow(client, batch[j]);
      if (!saved?.id) die(`Upsert returned no row for ${batch[j].source_ref}`);
      savedRows.push(saved);
    }
    console.log(`   ✓ Supabase ${batch.length} (${Math.min(i + batch.length, pending.length)}/${pending.length})`);
  }

  let upserted = 0;
  for (let i = 0; i < savedRows.length; i += VECTORIZE_BATCH) {
    const batch = savedRows.slice(i, i + VECTORIZE_BATCH);
    const vectors = batch
      .filter(Boolean)
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
            source_type: 'clients',
            project_key: projectKey,
          },
        };
      })
      .filter(Boolean);
    if (!vectors.length) continue;
    await vectorizeUpsert(vectors);
    upserted += vectors.length;
    console.log(`   ✓ Vectorize ${vectors.length} (${upserted}/${savedRows.length})`);
  }

  writeVectorizeSyncReceipt({
    root,
    chunk_id: runSyncChunkId,
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
      project_key: projectKey,
    }),
    dryRun: false,
  });

  return { chunks: savedRows.length, projectKey };
}

async function main() {
  assertLaneContract(LANE);
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const files = resolveFiles(root, args);
  if (!files.length) die('No files to ingest');

  const runId = createRunId();
  const manifestMeta = args.manifest ? loadManifest(root, args.manifest) : null;
  const d1Key = String(process.env.D1_WORKSPACE_KEY || manifestMeta?.workspaceKey || 'ws_inneranimalmedia').trim();
  const workspaceUuid =
    String(process.env.SUPABASE_WORKSPACE_UUID || '').trim() ||
    KNOWN_WORKSPACE_UUIDS[d1Key] ||
    die(`Unknown workspace_key ${d1Key}`);
  const gitSha = resolveGitCommitSha(root);
  const defaultProjectKey = manifestMeta?.projectKey || 'companionscpas';

  console.log(`ingest_client_project_doc — ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`files: ${files.length}`);
  if (args.manifest) console.log(`manifest: ${args.manifest}`);

  if (args.dryRun) {
    for (const entry of files) {
      await ingestOneFile({
        root,
        rel: entry.file,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: true,
        client: null,
        runId,
        defaultProjectKey,
      });
    }
    return;
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required for live ingest');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    let totalChunks = 0;
    for (const entry of files) {
      const result = await ingestOneFile({
        root,
        rel: entry.file,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: false,
        client,
        runId,
        defaultProjectKey,
      });
      totalChunks += result.chunks;
    }

    const countRes = await client.query(
      `SELECT COUNT(*)::int AS c
         FROM agentsam.agentsam_documents_oai3large_1536
        WHERE workspace_id = $1
          AND metadata->>'project_key' = $2`,
      [workspaceUuid, defaultProjectKey],
    );
    const projectRows = countRes.rows[0]?.c ?? 0;

    console.log(`\nDone — ${totalChunks} chunks across ${files.length} file(s) → agentsam.${TABLE} + ${VECTORIZE_INDEX}`);
    console.log(`Supabase row count (project_key=${defaultProjectKey}): ${projectRows}`);
    console.log(`Receipt: .scratch/vectorize-sync/${SCRIPT_KEY}/run:${SCRIPT_KEY}:* (see latest under repo .scratch/)`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
