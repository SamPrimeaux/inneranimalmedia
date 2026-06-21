#!/usr/bin/env node
/**
 * Agentic Edge sprint plan → agentsam_documents_oai3large_1536 + AGENTSAM_VECTORIZE_DOCUMENTS.
 * Manifest: docs/platform/agentic-edge-sprint.manifest.json
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_agentic_edge_sprint_plan.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_agentic_edge_sprint_plan.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_agentic_edge_sprint_plan.mjs --file docs/platform/agentic-edge-sprint-plan.md
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
const VECTORIZE_INDEX = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';
const LANE = LANE_CONTRACTS.documents;
const SCRIPT_KEY = 'ingest_agentic_edge_sprint_plan';
const MANIFEST = 'docs/platform/agentic-edge-sprint.manifest.json';
const DOC_TYPE = 'agentic_edge_sprint_plan';
const TOPIC = 'agentic_edge_sprint';
const PROJECT_KEY = 'inneranimalmedia';
const D1_CONTEXT_ID = 'ctx_inneranimalmedia';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

function parseArgs(argv) {
  const out = { dryRun: false, file: null };
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
  return {
    workspaceKey: data.workspace_key || 'ws_inneranimalmedia',
    d1ContextId: data.d1_context_id || D1_CONTEXT_ID,
    entries,
  };
}

function resolveFiles(root, args) {
  if (args.file) {
    const rel = args.file.replace(/^\//, '');
    return [{ file: rel, topic: basename(rel, '.md'), lane_key: 'docs_knowledge_search' }];
  }
  const { entries } = loadManifest(root);
  return entries
    .filter((e) => e?.file)
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
    .map((e) => ({
      file: String(e.file).replace(/^\//, ''),
      topic: e.topic || basename(e.file, '.md'),
      lane_key: e.lane_key || 'docs_knowledge_search',
    }));
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
  return fallback.rows[0] || null;
}

function buildRows(relPath, docTitle, meta, sections, workspaceUuid, gitSha, laneKey) {
  const now = new Date().toISOString();
  const topic = meta.topic || basename(relPath, '.md');
  const docSlug = basename(relPath, '.md');
  const projectKey = meta.project_key || PROJECT_KEY;
  const d1ContextId = meta.d1_context_id || D1_CONTEXT_ID;
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${relPath}:${i}:${body}`);
    const sourceRef = `platform/${projectKey}/${docSlug}#${i}`;
    return {
      workspace_id: workspaceUuid,
      title: `${docTitle} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: 'knowledge',
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
        topic,
        project_key: projectKey,
        d1_context_id: d1ContextId,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_section',
        lane_key: laneKey || meta.lane_key || 'docs_knowledge_search',
        doc_type: meta.doc_type || DOC_TYPE,
      },
    };
  });
}

async function ingestOneFile({ root, rel, workspaceUuid, d1Key, gitSha, dryRun, client, runId }) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.warn(`skip missing: ${rel}`);
    return { skipped: true, chunks: 0 };
  }

  const raw = readFileSync(abs, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const docTitle = meta.title || basename(rel, '.md');
  const laneKey = meta.lane_key || 'docs_knowledge_search';
  const sections = splitByH2(body);
  const pending = buildRows(rel, docTitle, meta, sections, workspaceUuid, gitSha, laneKey);

  console.log(`\n── ${rel}`);
  console.log(`   chunks: ${pending.length} | lane: ${laneKey}`);
  for (const r of pending) {
    console.log(`   • ${r.source_ref} (~${r.token_count} tok)`);
  }

  if (dryRun || !pending.length) return { skipped: false, chunks: pending.length };

  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');

  const savedPairs = [];
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
      if (saved?.id) savedPairs.push({ row: saved, embedding: batch[j].embedding, pending: batch[j] });
    }
  }

  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

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
            source_type: 'knowledge',
            doc_type: DOC_TYPE,
            project_key: PROJECT_KEY,
            topic: TOPIC,
          },
        };
      })
      .filter(Boolean);
    if (!vectors.length) continue;
    await vectorizeUpsertNdjson({ accountId, token, index: VECTORIZE_INDEX, vectors });
  }

  const runSyncChunkId = `run:${SCRIPT_KEY}:${rel}`;
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
      chunks_embedded: savedPairs.length,
      files_indexed: 1,
      status: 'ok',
      source_path: rel,
      project_key: PROJECT_KEY,
      d1_context_id: D1_CONTEXT_ID,
    }),
    dryRun: false,
  });

  console.log(`   ✓ ${savedPairs.length} chunks → pgvector + Vectorize`);
  return { skipped: false, chunks: savedPairs.length };
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
  const files = resolveFiles(root, args);

  console.log(`ingest_agentic_edge_sprint_plan — ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`d1_context_id: ${D1_CONTEXT_ID}`);
  console.log(`files: ${files.length}`);

  if (args.dryRun) {
    for (const f of files) {
      await ingestOneFile({ root, rel: f.file, workspaceUuid, d1Key, gitSha, dryRun: true, client: null, runId });
    }
    return;
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required for live ingest');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let totalChunks = 0;
  try {
    for (const f of files) {
      const r = await ingestOneFile({
        root,
        rel: f.file,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: false,
        client,
        runId,
      });
      if (!r.skipped) totalChunks += r.chunks;
    }
    console.log(`\nDone — ${totalChunks} total chunks from ${files.length} BYOK sprint doc(s)`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
