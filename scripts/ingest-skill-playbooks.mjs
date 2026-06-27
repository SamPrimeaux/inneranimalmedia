#!/usr/bin/env node
/**
 * Skill playbooks → inneranimalmedia-autorag/skills/{skill_key}/SKILL.md
 * → chunk → OpenAI embed → Supabase agentsam_documents_oai3large_1536
 * → AGENTSAM_VECTORIZE_DOCUMENTS + D1 agentsam_skill.file_path update.
 *
 * Sources: docs/skills-playbooks/{skill_key}/SKILL.md (canonical in repo)
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-skill-playbooks.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest-skill-playbooks.mjs
 *   npm run run:ingest_skill_playbooks
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
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
import { WORKER_R2_BINDING_SPECS } from '../src/core/r2-storage-scope.js';

const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;
const EMBED_BATCH = 8;
const VECTORIZE_BATCH = 100;
const VECTORIZE_INDEX = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';
const SOURCE_TYPE = 'skill_playbook';
const SCRIPT_KEY = 'ingest_skill_playbooks';
const LANE = LANE_CONTRACTS.documents;
const autoragSpec = WORKER_R2_BINDING_SPECS.find((s) => s.bindingKey === 'AUTORAG_BUCKET');
const R2_BUCKET = autoragSpec?.bucketName || 'inneranimalmedia-autorag';
const WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || 'wrangler.production.toml';
const D1_DB = 'inneranimalmedia-business';
const MIN_CHUNK_TOKENS = 400;
const MAX_CHUNK_TOKENS = 600;

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

/** @type {Array<{ skill_key: string, skill_id: string, localRel: string, r2Key: string }>} */
const SKILL_PLAYBOOKS = [
  {
    skill_key: 'on_brand_genmedia',
    skill_id: 'skill_on_brand_genmedia',
    localRel: 'docs/skills-playbooks/on_brand_genmedia/SKILL.md',
    r2Key: 'skills/on_brand_genmedia/SKILL.md',
  },
  {
    skill_key: 'marketing_agency',
    skill_id: 'skill_marketing_agency',
    localRel: 'docs/skills-playbooks/marketing_agency/SKILL.md',
    r2Key: 'skills/marketing_agency/SKILL.md',
  },
  {
    skill_key: 'brand_aligned_presentations',
    skill_id: 'skill_brand_aligned_presentations',
    localRel: 'docs/skills-playbooks/brand_aligned_presentations/SKILL.md',
    r2Key: 'skills/brand_aligned_presentations/SKILL.md',
  },
  {
    skill_key: 'blogger_agent',
    skill_id: 'skill_blogger_agent',
    localRel: 'docs/skills-playbooks/blogger_agent/SKILL.md',
    r2Key: 'skills/blogger_agent/SKILL.md',
  },
  {
    skill_key: 'deep_search',
    skill_id: 'skill_deep_search',
    localRel: 'docs/skills-playbooks/deep_search/SKILL.md',
    r2Key: 'skills/deep_search/SKILL.md',
  },
  {
    skill_key: 'genmedia_commerce',
    skill_id: 'skill_genmedia_commerce',
    localRel: 'docs/skills-playbooks/genmedia_commerce/SKILL.md',
    r2Key: 'skills/genmedia_commerce/SKILL.md',
  },
  {
    skill_key: 'data_engineering',
    skill_id: 'skill_data_engineering',
    localRel: 'docs/skills-playbooks/data_engineering/SKILL.md',
    r2Key: 'skills/data_engineering/SKILL.md',
  },
  {
    skill_key: 'meshy_3d_designstudio',
    skill_id: 'skill_meshy_3d_designstudio',
    localRel: 'docs/skills-playbooks/meshy_3d_designstudio/SKILL.md',
    r2Key: 'skills/meshy_3d_designstudio/SKILL.md',
  },
  {
    skill_key: 'cms_edit',
    skill_id: 'skill_iam_cms_edit',
    localRel: 'docs/skills-playbooks/cms_edit/SKILL.md',
    r2Key: 'skills/cms_edit/SKILL.md',
  },
];

function parseArgs(argv) {
  const out = { dryRun: false, skipR2: false, skipD1: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-r2') out.skipR2 = true;
    else if (a === '--skip-d1') out.skipD1 = true;
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

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function headingSlug(heading) {
  return String(heading || 'overview')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

function splitByH2(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  /** @type {Array<{ section: string, content: string }>} */
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

/**
 * Merge small sections and split large ones to target 400–600 tokens.
 *
 * @param {Array<{ section: string, content: string }>} sections
 */
function chunkForTargetTokens(sections) {
  /** @type {Array<{ section: string, content: string }>} */
  const normalized = [];
  for (const sec of sections) {
    let content = sec.content;
    let tokens = estimateTokens(content);
    if (tokens > MAX_CHUNK_TOKENS) {
      const paras = content.split(/\n\n+/);
      let part = '';
      let partTitle = sec.section;
      for (const p of paras) {
        const candidate = part ? `${part}\n\n${p}` : p;
        if (estimateTokens(candidate) > MAX_CHUNK_TOKENS && part) {
          normalized.push({ section: partTitle, content: part.trim() });
          part = p;
          partTitle = `${sec.section} (cont.)`;
        } else {
          part = candidate;
        }
      }
      if (part.trim()) normalized.push({ section: partTitle, content: part.trim() });
      continue;
    }
    normalized.push(sec);
  }

  /** @type {Array<{ section: string, content: string }>} */
  const merged = [];
  let acc = null;
  for (const sec of normalized) {
    const t = estimateTokens(sec.content);
    if (!acc) {
      acc = { ...sec };
      continue;
    }
    const combined = `${acc.content}\n\n${sec.content}`;
    if (estimateTokens(combined) <= MAX_CHUNK_TOKENS && estimateTokens(acc.content) < MIN_CHUNK_TOKENS) {
      acc = { section: `${acc.section} + ${sec.section}`, content: combined.trim() };
    } else {
      merged.push(acc);
      acc = { ...sec };
    }
  }
  if (acc) merged.push(acc);
  return merged;
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

function r2PutObject(localAbs, r2Key, dryRun) {
  if (dryRun) {
    console.log(`  [dry-run] R2 put ${R2_BUCKET}/${r2Key}`);
    return;
  }
  execFileSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${r2Key}`,
      '--file',
      localAbs,
      '--content-type',
      'text/markdown; charset=utf-8',
      '--config',
      WRANGLER_CONFIG,
      '--remote',
    ],
    { stdio: 'inherit', env: process.env },
  );
}

async function r2ListSkillsPrefix() {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) return [];
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET}/objects?prefix=skills/&limit=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  return (json.result?.objects || []).map((o) => o.key);
}

async function queryExistingSkillPlaybookChunks(client) {
  try {
    const r = await client.query(
      `SELECT source_path, COUNT(*)::int AS chunks, MAX(updated_at) AS latest
         FROM agentsam.agentsam_documents_oai3large_1536
        WHERE source_type = $1
        GROUP BY source_path
        ORDER BY source_path`,
      [SOURCE_TYPE],
    );
    return r.rows;
  } catch {
    return [];
  }
}

async function upsertDocumentRow(client, row) {
  const vecLiteral = `[${row.embedding.join(',')}]`;
  const now = row.embedded_at || new Date().toISOString();
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
      slug = EXCLUDED.slug,
      source_type = EXCLUDED.source_type,
      metadata = EXCLUDED.metadata,
      vectorize_binding = EXCLUDED.vectorize_binding,
      vectorize_index = EXCLUDED.vectorize_index,
      updated_at = EXCLUDED.updated_at
    WHERE agentsam.agentsam_documents_oai3large_1536.content_hash IS DISTINCT FROM EXCLUDED.content_hash
       OR agentsam.agentsam_documents_oai3large_1536.embedding IS NULL
    RETURNING id, source_ref, title, embedding, content_hash`,
    [
      row.workspace_id,
      row.title,
      row.content,
      row.source_type,
      row.source_url,
      row.source_path,
      row.source_ref,
      row.slug,
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
    `SELECT id, source_ref, title, embedding, content_hash
       FROM agentsam.agentsam_documents_oai3large_1536
      WHERE workspace_id = $1 AND source_path = $2 AND chunk_index = $3
      LIMIT 1`,
    [row.workspace_id, row.source_path, row.chunk_index],
  );
  return fallback.rows[0] || null;
}

function updateD1SkillPath(skillId, r2Key, dryRun) {
  if (dryRun) {
    console.log(`  [dry-run] D1 UPDATE agentsam_skill ${skillId} → ${r2Key}`);
    return;
  }
  const sql = `UPDATE agentsam_skill SET file_path = '${r2Key.replace(/'/g, "''")}', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = '${skillId.replace(/'/g, "''")}';`;
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      D1_DB,
      '--remote',
      '-c',
      WRANGLER_CONFIG,
      '--command',
      sql,
    ],
    { stdio: 'inherit', env: process.env },
  );
}

function buildRows(entry, sections, workspaceUuid, gitSha) {
  const now = new Date().toISOString();
  const sourcePath = entry.r2Key;
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${sourcePath}:${i}:${body}`);
    const slugPart = headingSlug(sec.section);
    const slug = `${entry.skill_key}_${slugPart}`.slice(0, 120);
    return {
      workspace_id: workspaceUuid,
      title: `${entry.skill_key} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: SOURCE_TYPE,
      source_path: sourcePath,
      source_ref: `skill_playbook/${entry.skill_key}#${slugPart}`,
      source_url: `r2://${R2_BUCKET}/${sourcePath}`,
      slug,
      heading_path: [entry.skill_key, sec.section],
      chunk_index: i,
      content_hash: h,
      token_count: estimateTokens(body),
      embedding_model: EMBED_MODEL,
      embedding_dims: EMBED_DIMS,
      embedded_at: now,
      vectorize_binding: VECTORIZE_BINDING,
      vectorize_index: VECTORIZE_INDEX,
      metadata: {
        skill_key: entry.skill_key,
        skill_id: entry.skill_id,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_target_400_600',
        r2_bucket: R2_BUCKET,
        lane_key: 'docs_knowledge_search',
      },
    };
  });
}

async function ingestOneSkill({
  root,
  entry,
  workspaceUuid,
  d1Key,
  gitSha,
  dryRun,
  skipR2,
  skipD1,
  client,
  runId,
  apiKey,
  accountId,
  token,
}) {
  const localAbs = join(root, entry.localRel);
  if (!existsSync(localAbs)) die(`Missing playbook: ${entry.localRel}`);

  const raw = readFileSync(localAbs, 'utf8');
  const h2 = splitByH2(raw);
  const sections = chunkForTargetTokens(h2);
  console.log(`\n── ${entry.skill_key}`);
  console.log(`   local: ${entry.localRel}`);
  console.log(`   r2:    ${entry.r2Key}`);
  console.log(`   chunks: ${sections.length} (target ${MIN_CHUNK_TOKENS}–${MAX_CHUNK_TOKENS} tok)`);

  if (!skipR2) r2PutObject(localAbs, entry.r2Key, dryRun);
  if (!skipD1) updateD1SkillPath(entry.skill_id, entry.r2Key, dryRun);

  if (dryRun) {
    for (const sec of sections) {
      console.log(`   • ${sec.section} (~${estimateTokens(sec.content)} tok)`);
    }
    return { chunks: sections.length, embedded: 0, skipped_embed: 0 };
  }

  const pending = buildRows(entry, sections, workspaceUuid, gitSha);
  const savedPairs = [];
  let skippedEmbed = 0;

  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const needEmbed = [];
    /** @type {number[]} */
    const needIdx = [];
    for (let j = 0; j < batch.length; j++) {
      const existing = await client.query(
        `SELECT content_hash, embedding FROM agentsam.agentsam_documents_oai3large_1536
          WHERE workspace_id = $1 AND source_path = $2 AND chunk_index = $3 LIMIT 1`,
        [batch[j].workspace_id, batch[j].source_path, batch[j].chunk_index],
      );
      const row = existing.rows[0];
      if (row?.content_hash === batch[j].content_hash && row?.embedding != null) {
        skippedEmbed += 1;
        savedPairs.push({
          row: { id: null, source_ref: batch[j].source_ref, title: batch[j].title },
          embedding: null,
          pending: batch[j],
          skipped: true,
        });
      } else {
        needEmbed.push(batch[j].content);
        needIdx.push(j);
      }
    }
    if (needEmbed.length) {
      const vecs = await openaiEmbedBatch({
        apiKey,
        texts: needEmbed,
        model: EMBED_MODEL,
        dims: EMBED_DIMS,
      });
      for (let k = 0; k < needIdx.length; k++) {
        const j = needIdx[k];
        batch[j].embedding = vecs[k];
        const saved = await upsertDocumentRow(client, batch[j]);
        if (saved?.id) {
          savedPairs.push({ row: saved, embedding: batch[j].embedding, pending: batch[j], skipped: false });
        }
      }
    }
  }

  for (let i = 0; i < savedPairs.length; i += VECTORIZE_BATCH) {
    const batch = savedPairs.slice(i, i + VECTORIZE_BATCH).filter((p) => !p.skipped && p.row?.id);
    const vectors = batch
      .map(({ row, embedding, pending: p }) => {
        const emb = parseEmbedding(embedding ?? row?.embedding);
        if (!emb || emb.length !== EMBED_DIMS) return null;
        return {
          id: String(row.id),
          values: emb,
          metadata: {
            workspace_id: d1Key,
            source_ref: String(p.source_ref || ''),
            title: String(p.title || '').slice(0, 200),
            source_type: SOURCE_TYPE,
            skill_key: entry.skill_key,
          },
        };
      })
      .filter(Boolean);
    if (vectors.length) {
      await vectorizeUpsertNdjson({ accountId, token, index: VECTORIZE_INDEX, vectors });
    }
  }

  writeVectorizeSyncReceipt({
    root,
    chunk_id: `run:${SCRIPT_KEY}:${entry.skill_key}`,
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
      chunks_embedded: savedPairs.filter((p) => !p.skipped).length,
      files_indexed: 1,
      status: 'ok',
      source_path: entry.r2Key,
      source_type: SOURCE_TYPE,
      skill_key: entry.skill_key,
    }),
    dryRun: false,
  });

  const embedded = savedPairs.filter((p) => !p.skipped).length;
  console.log(`   ✓ R2 + D1 path; ${embedded} embedded, ${skippedEmbed} unchanged skipped`);
  return { chunks: sections.length, embedded, skipped_embed: skippedEmbed };
}

async function main() {
  assertLaneContract(LANE);
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const runId = createRunId();
  const gitSha = resolveGitCommitSha(root);
  const d1Key = String(process.env.D1_WORKSPACE_KEY || 'ws_inneranimalmedia').trim();
  const workspaceUuid =
    String(process.env.SUPABASE_WORKSPACE_UUID || '').trim() ||
    KNOWN_WORKSPACE_UUIDS[d1Key] ||
    die(`Unknown workspace ${d1Key}`);

  console.log(`ingest-skill-playbooks — ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`run_id: ${runId}`);
  console.log(`bucket: ${R2_BUCKET}`);
  console.log(`skills: ${SKILL_PLAYBOOKS.length}`);

  const existingR2 = await r2ListSkillsPrefix();
  console.log(`R2 skills/ objects (before): ${existingR2.length}`);
  if (existingR2.length) {
    existingR2
      .filter((k) => k.endsWith('SKILL.md'))
      .slice(0, 15)
      .forEach((k) => console.log(`  • ${k}`));
  }

  if (args.dryRun) {
    for (const entry of SKILL_PLAYBOOKS) {
      await ingestOneSkill({
        root,
        entry,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: true,
        skipR2: args.skipR2,
        skipD1: args.skipD1,
        client: null,
        runId,
        apiKey: '',
        accountId: '',
        token: '',
      });
    }
    return;
  }

  const dbUrl = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) die('SUPABASE_DB_URL required');
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const existing = await queryExistingSkillPlaybookChunks(client);
    if (existing.length) {
      console.log('\nExisting skill_playbook chunks (skip re-embed when content_hash matches):');
      for (const row of existing) {
        console.log(`  ${row.source_path}: ${row.chunks} chunks, latest ${row.latest}`);
      }
    } else {
      console.log('\nNo existing skill_playbook chunks in Supabase.');
    }

    let totalChunks = 0;
    let totalEmbedded = 0;
    for (const entry of SKILL_PLAYBOOKS) {
      const r = await ingestOneSkill({
        root,
        entry,
        workspaceUuid,
        d1Key,
        gitSha,
        dryRun: false,
        skipR2: args.skipR2,
        skipD1: args.skipD1,
        client,
        runId,
        apiKey,
        accountId,
        token,
      });
      totalChunks += r.chunks;
      totalEmbedded += r.embedded;
    }

    const afterR2 = await r2ListSkillsPrefix();
    const skillMd = afterR2.filter((k) => k.endsWith('SKILL.md'));
    console.log(`\nDone — ${totalChunks} chunks, ${totalEmbedded} newly embedded`);
    console.log(`R2 SKILL.md objects: ${skillMd.length}`);
    skillMd.forEach((k) => console.log(`  ✓ ${k}`));

    const verify = await client.query(
      `SELECT source_path, COUNT(*)::int AS chunks
         FROM agentsam.agentsam_documents_oai3large_1536
        WHERE source_type = $1
        GROUP BY source_path ORDER BY source_path`,
      [SOURCE_TYPE],
    );
    console.log('\nSupabase skill_playbook chunks:');
    for (const row of verify.rows) {
      console.log(`  ${row.source_path}: ${row.chunks}`);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
