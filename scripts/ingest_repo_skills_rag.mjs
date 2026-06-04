#!/usr/bin/env node
/**
 * ingest_repo_skills_rag.mjs - embed repo skill SKILL.md files into documents lane (1536 + Vectorize)
 *
 * For D1 skills with retrieval_strategy=r2 (body on R2, empty content_markdown in D1).
 * Runtime: hydrateSkillRowFromR2. Search: this script → Supabase + AGENTSAM_VECTORIZE_DOCUMENTS.
 *
 * Usage:
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs --dry-run
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/ingest_repo_skills_rag.mjs --only mcp-oauth-field-guide,docx
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

const EMBED_MODEL = 'text-embedding-3-large';
const EMBED_DIMS = 1536;
const EMBED_BATCH = 8;
const VECTORIZE_BATCH = 100;
const TABLE = 'agentsam_documents_oai3large_1536';
const VECTORIZE_INDEX = 'agentsam-documents-oai3large-1536';
const VECTORIZE_BINDING = 'AGENTSAM_VECTORIZE_DOCUMENTS';

const KNOWN_WORKSPACE_UUIDS = Object.freeze({
  ws_inneranimalmedia: 'fa1f12a8-c841-4b79-a26c-d53a78b17dac',
});

function parseArgs(argv) {
  const out = { dryRun: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--only' && argv[i + 1]) {
      out.only = new Set(
        String(argv[++i])
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (a.startsWith('--only=')) {
      out.only = new Set(
        a
          .slice(7)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
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

function stripFrontmatter(md) {
  const s = String(md).replace(/\r\n/g, '\n');
  if (!s.startsWith('---\n')) return s;
  const end = s.indexOf('\n---\n', 4);
  if (end === -1) return s;
  return s.slice(end + 5);
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

async function openaiEmbed(texts) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) die('OPENAI_API_KEY required');
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, dimensions: EMBED_DIMS }),
  });
  const json = await res.json();
  if (!res.ok) die(`OpenAI embed failed: ${JSON.stringify(json).slice(0, 400)}`);
  const data = [...(json.data || [])].sort((a, b) => a.index - b.index);
  return data.map((d) => d.embedding);
}

async function vectorizeUpsert(vectors) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) die('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`;
  const ndjson = vectors.map((v) => JSON.stringify(v)).join('\n');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-ndjson' },
    body: ndjson,
  });
  const text = await res.text();
  if (!res.ok) die(`Vectorize upsert failed: ${text.slice(0, 400)}`);
}

function discoverSkills(root, only) {
  const skillsRoot = join(root, 'skills');
  if (!existsSync(skillsRoot)) return [];
  const out = [];
  for (const name of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    if (only && !only.has(name.name)) continue;
    const skillPath = join(skillsRoot, name.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    out.push({ key: name.name, path: skillPath, rel: `skills/${name.name}/SKILL.md` });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function buildRows(skill, sections, workspaceUuid, gitSha) {
  const now = new Date().toISOString();
  return sections.map((sec, i) => {
    const body = sec.content;
    const h = contentHash(`${skill.key}:${i}:${body}`);
    const sourceRef = `skill/${skill.key}#${i}`;
    return {
      workspace_id: workspaceUuid,
      title: `${skill.key} — ${sec.section}`.slice(0, 200),
      content: body,
      source_type: 'knowledge',
      source_path: skill.rel,
      source_ref: sourceRef,
      source_url: `https://github.com/SamPrimeaux/inneranimalmedia/blob/${gitSha}/${skill.rel}`,
      heading_path: [skill.key, sec.section],
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
        skill_key: skill.key,
        section: sec.section,
        section_index: i,
        git_sha: gitSha,
        chunk_strategy: 'h2_section',
        r2_key: `skills/${skill.key}/SKILL.md`,
      },
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const d1Key = String(process.env.D1_WORKSPACE_KEY || 'ws_inneranimalmedia').trim();
  const workspaceUuid =
    String(process.env.SUPABASE_WORKSPACE_UUID || '').trim() ||
    KNOWN_WORKSPACE_UUIDS[d1Key] ||
    die(`Unknown workspace_key ${d1Key}`);
  let gitSha = 'main';
  try {
    gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    /* ignore */
  }

  const skills = discoverSkills(root, args.only);
  console.log(`ingest_repo_skills_rag — ${args.dryRun ? 'DRY RUN' : 'LIVE'} — ${skills.length} skill(s)`);

  const pending = [];
  for (const skill of skills) {
    const raw = readFileSync(skill.path, 'utf8');
    const md = stripFrontmatter(raw);
    const sections = splitByH2(md);
    const rows = buildRows(skill, sections, workspaceUuid, gitSha);
    console.log(`  ${skill.key}: ${sections.length} H2 sections (~${Math.ceil(md.length / 4)} tok total)`);
    pending.push(...rows);
  }

  console.log(`Total chunks: ${pending.length}`);
  if (args.dryRun) return;

  if (!pending.length) {
    console.log('Nothing to embed.');
    return;
  }

  const savedRows = [];
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const vecs = await openaiEmbed(batch.map((r) => r.content));
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = vecs[j];
    }
    const inserted = await supabasePost(TABLE, batch, 'content_hash');
    savedRows.push(...(Array.isArray(inserted) ? inserted : [inserted]));
    console.log(`  ✓ Supabase ${batch.length} (${Math.min(i + batch.length, pending.length)}/${pending.length})`);
  }

  let upserted = 0;
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
            skill_key: row.metadata?.skill_key || '',
          },
        };
      })
      .filter(Boolean);
    if (!vectors.length) continue;
    await vectorizeUpsert(vectors);
    upserted += vectors.length;
    console.log(`  ✓ Vectorize ${vectors.length} (${upserted}/${savedRows.length})`);
  }

  console.log(`Done — ${savedRows.length} skill chunks in ${TABLE} + ${VECTORIZE_INDEX}`);
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e);
  process.exit(1);
});
