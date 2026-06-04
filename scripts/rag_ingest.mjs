#!/usr/bin/env node
/**
 * rag_ingest.mjs — dual-write Supabase pgvector + CF Vectorize sync
 *
 * Lanes:
 *   deep_archive  — 3072d golden docs (Supabase only, H2 chunking)
 *   documents     — sync embedded rows → agentsam-documents-oai3large-1536
 *   memory          — sync → agentsam-memory-oai3large-1536
 *   schema          — sync → agentsam-schema-oai3large-1536
 *   code            — sync → agentsam-codebase-oai3large-1536
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --dry-run --lane deep_archive
 *   ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane deep_archive
 *   ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane memory
 *   ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all
 *   ./scripts/with-cloudflare-env.sh node scripts/rag_ingest.mjs --lane all --update-registry
 *
 * Env: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN,
 *      D1_WORKSPACE_KEY (default ws_inneranimalmedia)
 */
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';

const EMBED_MODEL_1536 = 'text-embedding-3-large';
const EMBED_MODEL_3072 = 'text-embedding-3-large';
const VECTORIZE_BATCH = 100;
const EMBED_BATCH = 8;
const PATCH_CONCURRENCY = 12;

/** D1 workspace_key → Supabase UUID (agentsam.agentsam_workspaces.id) */
const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
  ws_connor_mcneely: '105ac2d1-8e61-4cec-80c8-ef2a0902448d',
  ws_meauxbility: '869137d3-cd65-4ac1-88cc-a1bad9844718',
});

/** @type {Record<string, {
 *   dims: number,
 *   table: string,
 *   index: string|null,
 *   binding: string|null,
 *   mode: 'ingest'|'sync',
 *   chunk: 'h2'|'existing',
 * }>} */
const LANES = {
  deep_archive: {
    dims: 3072,
    table: 'agentsam_deep_archive_oai3large_3072',
    index: null,
    binding: null,
    mode: 'ingest',
    chunk: 'h2',
  },
  documents: {
    dims: 1536,
    table: 'agentsam_documents_oai3large_1536',
    index: 'agentsam-documents-oai3large-1536',
    binding: 'AGENTSAM_VECTORIZE_DOCUMENTS',
    mode: 'sync',
    chunk: 'existing',
  },
  memory: {
    dims: 1536,
    table: 'agentsam_memory_oai3large_1536',
    index: 'agentsam-memory-oai3large-1536',
    binding: 'AGENTSAM_VECTORIZE_MEMORY',
    mode: 'sync',
    chunk: 'existing',
  },
  schema: {
    dims: 1536,
    table: 'agentsam_database_schema_oai3large_1536',
    index: 'agentsam-schema-oai3large-1536',
    binding: 'AGENTSAM_VECTORIZE_SCHEMA',
    mode: 'sync',
    chunk: 'existing',
  },
  code: {
    dims: 1536,
    table: 'agentsam_codebase_chunks_oai3large_1536',
    index: 'agentsam-codebase-oai3large-1536',
    binding: 'AGENTSAM_VECTORIZE_CODE',
    mode: 'sync',
    chunk: 'existing',
  },
};

const GOLDEN_SOURCES = [
  {
    key: 'platform-wiring',
    title: 'Platform Wiring Map',
    path: 'docs/platform/iam-runtime-architecture-2026-06.md',
    source_type: 'architecture',
    source_ref: 'platform-wiring-map-doc-27',
  },
  {
    key: 'platform-baseline',
    title: 'IAM Platform Baseline',
    path: 'docs/platform/platform-baseline-2026-06-03.md',
    source_type: 'architecture',
    source_ref: 'platform-baseline-2026-06-03',
  },
  {
    key: 'agent-layer-snapshot',
    title: 'Agent Layer Snapshot P0 RAG',
    path: 'docs/platform/agent-layer-snapshot-p0-rag-2026-06.md',
    source_type: 'architecture',
    source_ref: 'agent-layer-snapshot-p0-rag-2026-06',
  },
  {
    key: 'bindings-vectorize-api-map',
    title: 'Bindings Vectorize API Map',
    path: 'docs/platform/bindings-vectorize-api-map-2026-06.md',
    source_type: 'architecture',
    source_ref: 'bindings-vectorize-api-map-2026-06',
  },
  {
    key: 'browserview-wiring',
    title: 'BrowserView / MYBROWSER Wiring',
    path: 'docs/platform/browserview-mybrowser-wiring-2026-06.md',
    source_type: 'architecture',
    source_ref: 'browserview-mybrowser-wiring-doc-26',
  },
  {
    key: 'tenant-credential-lanes',
    title: 'Tenant Credential Lanes',
    path: 'docs/platform/tenant-credential-lanes-2026-06.md',
    source_type: 'architecture',
    source_ref: 'tenant-credential-lanes-2026-06',
  },
  {
    key: 'autorag-runtime-contract',
    title: 'AutoRAG Knowledge Retrieval Runtime Contract',
    path: 'docs/autorag/AUTORAG_KNOWLEDGE_RETRIEVAL_RUNTIME_CONTRACT.md',
    source_type: 'architecture',
    source_ref: 'inneranimalmedia.autorag.runtime_contract.v1',
  },
];

function parseArgs(argv) {
  /** @type {Record<string, unknown> & { _: string[], lanes?: string[] }} */
  const out = { _: [], lanes: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    if (eq !== -1) {
      const k = a.slice(2, eq);
      const v = a.slice(eq + 1);
      if (k === 'lane') out.lanes.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
      else out[k] = v;
      continue;
    }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--') || k === 'dry-run' || k === 'update-registry') {
      out[k] = true;
    } else {
      if (k === 'lane') out.lanes.push(...String(next).split(',').map((s) => s.trim()).filter(Boolean));
      else out[k] = next;
      i++;
    }
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

function contentHash(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/** PostgREST returns pgvector as a string like "[0.1,-0.2,...]" */
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

function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return { url, key };
}

function supabaseHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Profile': 'agentsam',
    'Content-Profile': 'agentsam',
    Prefer: 'return=representation',
    ...extra,
  };
}

async function supabaseGet(path, query = '') {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}${query ? `?${query}` : ''}`, {
    headers: supabaseHeaders(key),
  });
  const text = await res.text();
  if (!res.ok) die(`Supabase GET ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

async function supabasePost(path, rows, onConflict) {
  const { url, key } = supabaseConfig();
  const conflict = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  const res = await fetch(`${url}/rest/v1/${path}${conflict}`, {
    method: 'POST',
    headers: supabaseHeaders(key, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  if (!res.ok) die(`Supabase POST ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : [];
}

async function supabasePatch(path, query, patch) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${path}?${query}`, {
    method: 'PATCH',
    headers: supabaseHeaders(key, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase PATCH ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
}

async function supabasePatchWithRetry(path, query, patch, retries = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await supabasePatch(path, query, patch);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastErr;
}

async function patchVectorizeMirrorBatch(table, rows, lane) {
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += PATCH_CONCURRENCY) {
    const chunk = rows.slice(i, i + PATCH_CONCURRENCY);
    await Promise.all(
      chunk.map((row) =>
        supabasePatchWithRetry(
          table,
          `id=eq.${encodeURIComponent(String(row.id))}`,
          {
            vectorize_id: String(row.id),
            vectorize_binding: lane.binding,
            vectorize_index: lane.index,
            embedded_at: now,
          },
        ),
      ),
    );
  }
}

async function resolveWorkspaceUuid(d1WorkspaceKey) {
  const known = KNOWN_WORKSPACE_UUIDS[d1WorkspaceKey];
  if (known) return known;
  const rows = await supabaseGet(
    'agentsam_workspaces',
    `workspace_key=eq.${encodeURIComponent(d1WorkspaceKey)}&select=id,workspace_key&limit=1`,
  );
  const id = rows?.[0]?.id;
  if (!id) die(`Supabase workspace not found for workspace_key=${d1WorkspaceKey}`);
  return String(id);
}

function splitByH2(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  /** @type {{ section: string, content: string }[]} */
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

async function openaiEmbed(texts, dims) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  const body = { model: EMBED_MODEL_1536, input: texts };
  if (dims === 1536) body.dimensions = 1536;
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) die(`OpenAI embed failed: ${JSON.stringify(json).slice(0, 400)}`);
  const data = [...(json.data || [])].sort((a, b) => a.index - b.index);
  const vecs = data.map((d) => d.embedding);
  for (const v of vecs) {
    if (v.length !== dims) die(`Expected ${dims} dims, got ${v.length}`);
  }
  return vecs;
}

async function vectorizeUpsert(indexName, vectors) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for Vectorize sync');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${indexName}/upsert`;
  const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.success === false) {
    die(`Vectorize upsert ${indexName} failed: ${text.slice(0, 400)}`);
  }
  return json;
}

function gitHeadSha(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

async function planDeepArchive(root, workspaceUuid) {
  const sha = gitHeadSha(root);
  /** @type {any[]} */
  const pending = [];
  for (const source of GOLDEN_SOURCES) {
    const abs = join(root, source.path);
    if (!existsSync(abs)) {
      console.warn(`SKIP missing: ${source.path}`);
      continue;
    }
    const md = readFileSync(abs, 'utf8');
    const sections = splitByH2(md);
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const body = sec.content;
      pending.push({
        workspace_id: workspaceUuid,
        title: `${source.title} — ${sec.section}`,
        content: body,
        content_hash: contentHash(`${source.source_ref}:${i}:${body}`),
        source_type: source.source_type,
        archive_tier: 'golden',
        source_path: source.path,
        source_ref: `${source.source_ref}#${i}`,
        embedding_model: EMBED_MODEL_3072,
        embedding_dims: 3072,
        metadata: {
          doc_key: source.key,
          section: sec.section,
          section_index: i,
          git_sha: sha,
          chunk_strategy: 'h2_section',
        },
      });
    }
    console.log(`  ${source.key}: ${sections.length} H2 sections (${source.path})`);
  }
  return pending;
}

async function runDeepArchive({ dryRun, workspaceUuid }) {
  const root = repoRoot();
  console.log('\n=== lane: deep_archive (3072d Supabase only) ===');
  const rows = await planDeepArchive(root, workspaceUuid);
  console.log(`Total chunks: ${rows.length}`);
  if (dryRun) {
    for (const r of rows.slice(0, 8)) {
      console.log(`  • ${r.source_ref} (~${Math.ceil(r.content.length / 4)} tok)`);
    }
    if (rows.length > 8) console.log(`  … +${rows.length - 8} more`);
    return { lane: 'deep_archive', chunks: rows.length, vectorize: 0 };
  }

  let wrote = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const vecs = await openaiEmbed(
      batch.map((r) => r.content),
      3072,
    );
    const now = new Date().toISOString();
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vecs[j];
      batch[j].embedded_at = now;
    }
    await supabasePost(
      LANES.deep_archive.table,
      batch,
      'workspace_id,source_ref',
    );
    wrote += batch.length;
    console.log(`  ✓ Supabase upsert ${batch.length} (${wrote}/${rows.length})`);
  }
  return { lane: 'deep_archive', chunks: rows.length, vectorize: 0 };
}

async function fetchSyncCandidates(laneKey, workspaceUuid, limit = 5000) {
  const lane = LANES[laneKey];
  const table = lane.table;
  /** @type {Record<string, string>} */
  const selectByLane = {
    memory: 'id,memory_key,content,title,source,metadata,embedding',
    documents: 'id,title,content,source_ref,source_type,metadata,embedding,vectorize_id',
    schema:
      'id,title,content,database_kind,database_name,object_type,table_name,schema_name,metadata,embedding,vectorize_id',
    code: 'id,file_path,content,chunk_index,metadata,embedding',
  };
  const select = selectByLane[laneKey];
  if (!select) die(`No Supabase select for lane: ${laneKey}`);
  const q = [
    `workspace_id=eq.${encodeURIComponent(workspaceUuid)}`,
    'embedding=not.is.null',
    `select=${select}`,
    `limit=${limit}`,
  ].join('&');
  return supabaseGet(table, q);
}

function syncSourceRef(laneKey, row) {
  const id = String(row.id);
  if (laneKey === 'memory') return String(row.memory_key || row.title || id);
  if (laneKey === 'schema') {
    const parts = [row.database_name, row.object_type, row.table_name || row.title].filter(Boolean);
    return parts.length ? parts.join(':') : id;
  }
  if (laneKey === 'code') {
    const idx = row.chunk_index ?? 0;
    return row.file_path ? `${row.file_path}#${idx}` : id;
  }
  return String(row.source_ref || row.title || id);
}

function syncTitle(laneKey, row, sourceRef) {
  if (laneKey === 'code') return String(row.file_path || sourceRef).slice(0, 200);
  return String(row.title || row.memory_key || sourceRef).slice(0, 200);
}

function syncSourceType(laneKey, row) {
  if (laneKey === 'schema') return row.object_type || 'schema';
  if (laneKey === 'code') return 'code';
  return row.source_type || row.source || laneKey;
}

/** Lanes whose Supabase tables have vectorize_* mirror columns */
const LANES_WITH_VECTORIZE_COLS = new Set(['documents', 'schema']);

async function runVectorizeSync(laneKey, { dryRun, workspaceUuid, d1WorkspaceKey }) {
  const lane = LANES[laneKey];
  if (!lane.index) die(`Lane ${laneKey} has no Vectorize index`);
  console.log(`\n=== lane: ${laneKey} (sync → ${lane.index}) ===`);
  const rows = await fetchSyncCandidates(laneKey, workspaceUuid);
  for (const row of rows) {
    row.embedding = parseEmbedding(row.embedding);
  }
  const eligible = rows.filter((r) => Array.isArray(r.embedding) && r.embedding.length === lane.dims);
  console.log(`Supabase embedded rows: ${rows.length} (${eligible.length} with ${lane.dims}d vectors)`);
  if (!eligible.length) return { lane: laneKey, chunks: 0, vectorize: 0 };

  if (dryRun) {
    console.log(`  Would upsert ${eligible.length} vectors to ${lane.index}`);
    return { lane: laneKey, chunks: eligible.length, vectorize: eligible.length };
  }

  let upserted = 0;
  for (let i = 0; i < eligible.length; i += VECTORIZE_BATCH) {
    const batch = eligible.slice(i, i + VECTORIZE_BATCH);
    const vectors = batch.map((row) => {
      const id = String(row.id);
      const sourceRef = syncSourceRef(laneKey, row);
      return {
        id,
        values: row.embedding,
        metadata: {
          workspace_id: d1WorkspaceKey,
          source_ref: sourceRef,
          title: syncTitle(laneKey, row, sourceRef),
          source_type: syncSourceType(laneKey, row),
        },
      };
    });
    await vectorizeUpsert(lane.index, vectors);
    upserted += vectors.length;
    if (LANES_WITH_VECTORIZE_COLS.has(laneKey)) {
      await patchVectorizeMirrorBatch(lane.table, batch, lane);
    }
    console.log(`  ✓ Vectorize upsert ${vectors.length} (${upserted}/${eligible.length})`);
  }
  return { lane: laneKey, chunks: eligible.length, vectorize: upserted };
}

async function updateRegistryCounts(results) {
  const bindingUpdates = results.filter((r) => LANES[r.lane]?.binding && r.vectorize > 0);
  if (!bindingUpdates.length) {
    console.log('\n[registry] no vectorize upserts — skip D1 update');
    return;
  }
  console.log('\n[registry] update vectorize_index_registry.stored_vectors:');
  for (const r of bindingUpdates) {
    const binding = LANES[r.lane].binding;
    console.log(`  ${binding} → ${r.vectorize} (run D1 migration or dashboard to persist)`);
    console.log(
      `  SQL: UPDATE vectorize_index_registry SET stored_vectors = ${r.vectorize}, updated_at = datetime('now') WHERE binding_name = '${binding}';`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args['dry-run']);
  const laneFromFlags = Array.isArray(args.lanes) && args.lanes.length ? args.lanes : [];
  const laneArg = laneFromFlags.length
    ? laneFromFlags.join(',')
    : String(args.lane || 'all').trim().toLowerCase();
  const d1WorkspaceKey = String(process.env.D1_WORKSPACE_KEY || 'ws_inneranimalmedia').trim();

  const laneKeys =
    laneArg === 'all'
      ? ['deep_archive', 'documents', 'memory', 'schema', 'code']
      : laneArg.split(',').map((s) => s.trim()).filter(Boolean);
  for (const k of laneKeys) {
    if (!LANES[k]) die(`Unknown lane: ${k}. Use: ${Object.keys(LANES).join(', ')}, all`);
  }

  console.log(`rag_ingest.mjs — ${dryRun ? 'DRY RUN' : 'LIVE'} — lanes: ${laneKeys.join(', ')}`);
  console.log(`workspace_key: ${d1WorkspaceKey}`);

  let workspaceUuid = process.env.SUPABASE_WORKSPACE_UUID || '';
  if (!workspaceUuid) {
    try {
      workspaceUuid = await resolveWorkspaceUuid(d1WorkspaceKey);
    } catch (e) {
      if (!dryRun) throw e;
      workspaceUuid = '';
    }
  }
  if (!workspaceUuid && dryRun) {
    console.warn('workspace_uuid: unresolved (dry-run continues for deep_archive file counts only)');
  } else {
    console.log(`workspace_uuid: ${workspaceUuid}`);
  }

  /** @type {{ lane: string, chunks: number, vectorize: number }[]} */
  const results = [];

  for (const laneKey of laneKeys) {
    if (laneKey === 'deep_archive') {
      if (dryRun) {
        const rows = await planDeepArchive(repoRoot(), workspaceUuid || '00000000-0000-0000-0000-000000000000');
        results.push({ lane: laneKey, chunks: rows.length, vectorize: 0 });
        console.log(`\n=== lane: deep_archive ===\nTotal H2 chunks: ${rows.length}`);
      } else {
        results.push(await runDeepArchive({ dryRun: false, workspaceUuid }));
      }
      continue;
    }
      if (dryRun) {
        if (!workspaceUuid) {
          console.log(`\n=== lane: ${laneKey} ===\n  skip sync count (no SUPABASE creds / workspace)`);
          results.push({ lane: laneKey, chunks: 0, vectorize: 0 });
        } else {
          results.push(await runVectorizeSync(laneKey, { dryRun: true, workspaceUuid, d1WorkspaceKey }));
        }
    } else {
      results.push(await runVectorizeSync(laneKey, { dryRun: false, workspaceUuid, d1WorkspaceKey }));
    }
  }

  console.log('\n--- summary ---');
  for (const r of results) {
    console.log(`  ${r.lane}: chunks=${r.chunks} vectorize_upserts=${r.vectorize}`);
  }

  if (args['update-registry'] && !dryRun) {
    await updateRegistryCounts(results);
  }

  console.log(dryRun ? '\n[dry-run] complete — no writes' : '\nDone.');
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
