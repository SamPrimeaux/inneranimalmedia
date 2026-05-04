/**
 * MY_QUEUE message type `codebase_index_sync`:
 * Pull latest route-map + index-priority artifacts from R2 → Supabase `codebase_files` + `codebase_chunks`.
 *
 * Skips `file-inventory.json` (large); optional `repo-snapshot.json` / `manifests/latest.json` for snapshot_id.
 */

const CHARS_PER_TOKEN = 4;

/** ~500-token windows with ~50-token overlap (heuristic). */
export function splitTextIntoTokenChunks(text, targetTokens = 500, overlapTokens = 50) {
  const s = String(text ?? '');
  if (!s) return [];
  const win = Math.max(200, Math.floor(targetTokens * CHARS_PER_TOKEN));
  const ov = Math.max(0, Math.floor(overlapTokens * CHARS_PER_TOKEN));
  const out = [];
  let start = 0;
  while (start < s.length) {
    const end = Math.min(s.length, start + win);
    out.push(s.slice(start, end));
    if (end >= s.length) break;
    start = end - ov;
    if (start < 0) start = 0;
  }
  return out;
}

export function estimateTokenCount(text) {
  return Math.max(1, Math.ceil(String(text).length / CHARS_PER_TOKEN));
}

async function readR2Text(binding, key) {
  if (!binding?.get) return null;
  const obj = await binding.get(key);
  if (!obj) return null;
  return obj.text();
}

function pickR2Binding(env) {
  return env?.ASSETS || env?.DASHBOARD || env?.R2 || null;
}

async function supabaseInsert(env, table, row, prefer = 'return=representation') {
  const base = env?.SUPABASE_URL && String(env.SUPABASE_URL).trim().replace(/\/$/, '');
  const key = env?.SUPABASE_SERVICE_ROLE_KEY && String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
  if (!base || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  const res = await fetch(`${base}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify(row),
  });
  const txt = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${table} ${res.status}: ${txt.slice(0, 800)}`);
  }
  if (prefer === 'return=minimal' || !txt.trim()) return null;
  try {
    const j = JSON.parse(txt);
    return Array.isArray(j) ? j[0] : j;
  } catch {
    return null;
  }
}

async function resolveSnapshotId(env, r2, workspaceId, body) {
  if (body?.snapshot_id && String(body.snapshot_id).trim()) return String(body.snapshot_id).trim();
  const manifestKey = `codebase-index/${workspaceId}/manifests/latest.json`;
  const manRaw = await readR2Text(r2, manifestKey);
  if (manRaw) {
    try {
      const m = JSON.parse(manRaw);
      if (m?.snapshot_id && String(m.snapshot_id).trim()) return String(m.snapshot_id).trim();
    } catch {
      /* ignore */
    }
  }
  const snapKey = `codebase-index/${workspaceId}/latest/repo-snapshot.json`;
  const snapRaw = await readR2Text(r2, snapKey);
  if (snapRaw) {
    try {
      const s = JSON.parse(snapRaw);
      if (s?.snapshot_id && String(s.snapshot_id).trim()) return String(s.snapshot_id).trim();
      const ga = s?.generated_at;
      const cs = s?.commit_sha;
      if (ga && cs) {
        const ts = String(ga).replace(/[-:]/g, '').replace(/Z$/, '');
        const c7 = String(cs).slice(0, 7);
        return `${ts}Z-${c7}`;
      }
    } catch {
      /* ignore */
    }
  }
  return `queue-${Date.now().toString(36)}`;
}

async function insertFileAndChunks(env, opts) {
  const {
    snapshot_id,
    workspace_id,
    tenant_id,
    file_path,
    fullText,
    metadata,
    r2_key,
  } = opts;
  const meta = {
    ...metadata,
    r2_key: r2_key || null,
    ingested_via: 'codebase_index_sync',
    ingested_at: new Date().toISOString(),
  };

  let fileRow = null;
  try {
    fileRow = await supabaseInsert(env, 'codebase_files', {
      snapshot_id,
      workspace_id,
      file_path,
      content: fullText,
      metadata_jsonb: meta,
    });
  } catch (e) {
    console.warn('[codebase_index_sync] codebase_files insert failed, chunk-only fallback', e?.message ?? e);
  }

  const fileId = fileRow?.id != null ? String(fileRow.id) : null;
  const parts = splitTextIntoTokenChunks(fullText, 500, 50);

  let idx = 0;
  for (const chunk of parts) {
    const token_count = estimateTokenCount(chunk);
    const row = {
      snapshot_id,
      workspace_id,
      tenant_id,
      file_path,
      chunk_index: idx,
      content: chunk,
      token_count,
      chunk_type: file_path.endsWith('.md') ? 'markdown' : 'other',
      line_start: null,
      line_end: null,
      language: (file_path.split('.').pop() || 'text').slice(0, 32),
    };
    if (fileId) row.file_id = fileId;

    try {
      await supabaseInsert(env, 'codebase_chunks', row, 'return=minimal');
    } catch (e2) {
      const msg = String(e2?.message || e2);
      if (msg.includes('file_id') || msg.includes('PGRST')) {
        const { file_id: _omit, ...rest } = row;
        try {
          await supabaseInsert(env, 'codebase_chunks', rest, 'return=minimal');
        } catch (e3) {
          const { token_count: _t, chunk_type: _c, line_start: _ls, line_end: _le, language: _lg, ...minimal } = rest;
          await supabaseInsert(env, 'codebase_chunks', minimal, 'return=minimal');
        }
      } else if (msg.includes('token_count') || msg.includes('chunk_type')) {
        const { token_count: _t, chunk_type: _c, line_start: _ls, line_end: _le, language: _lg, ...minimal } = row;
        const m2 = { ...minimal };
        if (m2.file_id == null) delete m2.file_id;
        await supabaseInsert(env, 'codebase_chunks', m2, 'return=minimal');
      } else {
        throw e2;
      }
    }
    idx += 1;
  }
  return idx;
}

/**
 * @param {import('@cloudflare/workers-types').ExecutionContext} [_ctx]
 */
export async function handleCodebaseIndexSyncFromQueue(env, body, _ctx) {
  const tenant_id = body?.tenantId ?? body?.tenant_id;
  const workspace_id = body?.workspaceId ?? body?.workspace_id;
  if (!tenant_id || !workspace_id) {
    console.warn('[codebase-index-sync] missing tenant/workspace, skipping');
    return;
  }

  const r2 = pickR2Binding(env);
  if (!r2) throw new Error('No R2 binding (ASSETS/DASHBOARD/R2) for codebase_index_sync');

  const snapshot_id = await resolveSnapshotId(env, r2, workspace_id, body);
  const prefix = `codebase-index/${workspace_id}/latest`;

  const routeMap = await readR2Text(r2, `${prefix}/route-map.md`);
  const priorityRaw = await readR2Text(r2, `${prefix}/index-priority-files.json`);

  let chunksTotal = 0;
  if (routeMap && routeMap.trim()) {
    const n = await insertFileAndChunks(env, {
      snapshot_id,
      workspace_id,
      tenant_id,
      file_path: 'docs/route-map.md',
      fullText: routeMap,
      metadata: { kind: 'route_map', r2_key: `${prefix}/route-map.md` },
      r2_key: `${prefix}/route-map.md`,
    });
    chunksTotal += n;
  } else {
    console.warn('[codebase_index_sync] missing or empty route-map.md at', `${prefix}/route-map.md`);
  }

  if (priorityRaw && priorityRaw.trim()) {
    let list = [];
    try {
      const parsed = JSON.parse(priorityRaw);
      list = Array.isArray(parsed) ? parsed : parsed.files || parsed.items || [];
    } catch (e) {
      console.warn('[codebase_index_sync] index-priority-files.json parse error', e?.message ?? e);
    }
    const cap = Math.min(Number(body?.max_priority_files) || 40, 80);
    let used = 0;
    for (const ent of list) {
      if (used >= cap) break;
      const file_path = ent.path || ent.file_path || ent.name;
      const content = ent.content || ent.source || ent.text;
      if (!file_path || !content || String(content).length < 8) continue;
      const text = String(content);
      if (text.length > 120_000) {
        console.warn('[codebase_index_sync] skip oversized priority file', file_path, text.length);
        continue;
      }
      const n = await insertFileAndChunks(env, {
        snapshot_id,
        workspace_id,
        tenant_id,
        file_path: String(file_path).slice(0, 2048),
        fullText: text,
        metadata: { kind: 'priority_file', r2_key: `${prefix}/index-priority-files.json` },
        r2_key: `${prefix}/index-priority-files.json`,
      });
      chunksTotal += n;
      used += 1;
    }
  } else {
    console.warn('[codebase_index_sync] missing index-priority-files.json at', `${prefix}/index-priority-files.json`);
  }

  console.log(
    '[codebase_index_sync] done snapshot_id=%s workspace=%s chunks_written≈%s',
    snapshot_id,
    workspace_id,
    chunksTotal,
  );
  return { snapshot_id, workspace_id, chunksTotal };
}
