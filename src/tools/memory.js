/**
 * Tool: Memory (D1-backed)
 * Reads, writes, searches, and expires entries in agentsam_memory.
 * Mirrors the Anthropic BetaLocalFilesystemMemoryTool interface but backed by D1.
 * All ops are scoped to (tenant_id, user_id) — never cross-tenant.
 */

// ---------------------------------------------------------------------------
// Tool schemas — registered with the model via buildAnthropicMessagesTools
// ---------------------------------------------------------------------------

export const MEMORY_TOOL_SCHEMAS = [
  {
    name: 'memory_write',
    description:
      'Store or update a memory entry. Use for facts, preferences, decisions, errors, ' +
      'project context, or skills learned. key must be concise and unique per user. ' +
      'Overwrites existing entry with the same key.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Short unique identifier, e.g. "preferred_model", "last_deploy_error"',
        },
        value: {
          type: 'string',
          description: 'The memory content to store.',
        },
        memory_type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'skill', 'error', 'decision'],
          description: 'Category of memory.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for grouping, e.g. ["deploy", "anthropic"]',
        },
        confidence: {
          type: 'number',
          description: 'Certainty score 0.0–1.0. Default 1.0.',
        },
        ttl_days: {
          type: 'number',
          description: 'Optional TTL in days. Omit for permanent storage.',
        },
        source: {
          type: 'string',
          description: 'Where this memory came from, e.g. "user_statement", "inferred"',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'memory_read',
    description:
      'Read one or more memory entries by exact key(s). Returns current value and metadata.',
    input_schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of keys to retrieve.',
        },
      },
      required: ['keys'],
    },
  },
  {
    name: 'memory_search',
    description:
      'Search memory by type, tags, or a text substring in key/value. ' +
      'Returns up to 20 results ordered by recall_count desc, last_recalled_at desc.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Substring to match against key or value.',
        },
        memory_type: {
          type: 'string',
          enum: ['fact', 'preference', 'project', 'skill', 'error', 'decision'],
          description: 'Filter by memory type.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter: entries must contain ALL listed tags.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return. Default 20, max 50.',
        },
      },
    },
  },
  {
    name: 'memory_delete',
    description: 'Permanently delete a memory entry by key.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key to delete.' },
      },
      required: ['key'],
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function safeJson(str, fallback = []) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/**
 * Strip expired entries — called opportunistically on read/search, not blocking.
 * @param {D1Database} db
 * @param {string} tenantId
 * @param {string} userId
 */
async function sweepExpired(db, tenantId, userId) {
  const now = nowUnix();
  await db
    .prepare(
      `DELETE FROM agentsam_memory
       WHERE tenant_id = ? AND user_id = ? AND expires_at IS NOT NULL AND expires_at < ?`
    )
    .bind(tenantId, userId, now)
    .run()
    .catch(() => null); // non-blocking; ignore errors
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * memory_write — upsert a memory entry.
 */
export async function memoryWrite(input, env, context = {}) {
  const { tenantId, userId, workspaceId, agentId, sessionId } = context;
  if (!tenantId || !userId) {
    return { error: 'memory_write requires tenantId and userId in context' };
  }

  const {
    key,
    value,
    memory_type = 'fact',
    tags = [],
    confidence = 1.0,
    ttl_days,
    source = 'agent',
  } = input;

  const now = nowUnix();
  const expiresAt = ttl_days != null ? now + Math.round(ttl_days * 86400) : null;
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);

  await env.DB.prepare(
    `INSERT INTO agentsam_memory
       (tenant_id, user_id, workspace_id, key, value, memory_type, source,
        confidence, tags, expires_at, agent_id, session_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
       value         = excluded.value,
       memory_type   = excluded.memory_type,
       source        = excluded.source,
       confidence    = excluded.confidence,
       tags          = excluded.tags,
       expires_at    = excluded.expires_at,
       agent_id      = excluded.agent_id,
       session_id    = excluded.session_id,
       updated_at    = excluded.updated_at`
  )
    .bind(
      tenantId, userId, workspaceId ?? null, key, value, memory_type,
      source, confidence, tagsJson, expiresAt, agentId ?? null, sessionId ?? null, now
    )
    .run();

  return { ok: true, key, memory_type, expires_at: expiresAt };
}

/**
 * memory_read — fetch entries by key, bump recall stats.
 */
export async function memoryRead(input, env, context = {}) {
  const { tenantId, userId } = context;
  if (!tenantId || !userId) {
    return { error: 'memory_read requires tenantId and userId in context' };
  }

  const { keys } = input;
  if (!Array.isArray(keys) || keys.length === 0) {
    return { error: 'keys must be a non-empty array' };
  }

  // Sweep expired first (fire-and-forget)
  sweepExpired(env.DB, tenantId, userId);

  const now = nowUnix();
  const placeholders = keys.map(() => '?').join(', ');
  const rows = await env.DB
    .prepare(
      `SELECT id, key, value, memory_type, source, confidence, decay_score,
              recall_count, last_recalled_at, expires_at, tags, created_at, updated_at
       FROM agentsam_memory
       WHERE tenant_id = ? AND user_id = ? AND key IN (${placeholders})
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .bind(tenantId, userId, ...keys, now)
    .all();

  const found = rows.results ?? [];

  // Bump recall stats (no await — non-blocking)
  if (found.length > 0) {
    const ids = found.map(r => r.id);
    const idPlaceholders = ids.map(() => '?').join(', ');
    env.DB.prepare(
      `UPDATE agentsam_memory
       SET recall_count = recall_count + 1, last_recalled_at = ?
       WHERE id IN (${idPlaceholders})`
    )
      .bind(now, ...ids)
      .run()
      .catch(() => null);
  }

  return {
    found: found.map(r => ({
      key: r.key,
      value: r.value,
      memory_type: r.memory_type,
      source: r.source,
      confidence: r.confidence,
      tags: safeJson(r.tags, []),
      recall_count: r.recall_count,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    missing: keys.filter(k => !found.some(r => r.key === k)),
  };
}

/**
 * memory_search — fuzzy search by query substring, type, or tags.
 */
export async function memorySearch(input, env, context = {}) {
  const { tenantId, userId } = context;
  if (!tenantId || !userId) {
    return { error: 'memory_search requires tenantId and userId in context' };
  }

  sweepExpired(env.DB, tenantId, userId);

  const { query, memory_type, tags, limit = 20 } = input;
  const cap = Math.min(Number(limit) || 20, 50);
  const now = nowUnix();

  const conditions = [
    'tenant_id = ?',
    'user_id = ?',
    '(expires_at IS NULL OR expires_at > ?)',
  ];
  const binds = [tenantId, userId, now];

  if (query) {
    conditions.push('(key LIKE ? OR value LIKE ?)');
    binds.push(`%${query}%`, `%${query}%`);
  }
  if (memory_type) {
    conditions.push('memory_type = ?');
    binds.push(memory_type);
  }
  // Tag filter: check each required tag exists in the JSON array
  if (Array.isArray(tags) && tags.length > 0) {
    for (const tag of tags) {
      conditions.push(`tags LIKE ?`);
      binds.push(`%"${tag}"%`);
    }
  }

  binds.push(cap);

  const rows = await env.DB
    .prepare(
      `SELECT key, value, memory_type, source, confidence, tags, recall_count, updated_at
       FROM agentsam_memory
       WHERE ${conditions.join(' AND ')}
       ORDER BY recall_count DESC, last_recalled_at DESC NULLS LAST
       LIMIT ?`
    )
    .bind(...binds)
    .all();

  return {
    results: (rows.results ?? []).map(r => ({
      key: r.key,
      value: r.value,
      memory_type: r.memory_type,
      source: r.source,
      confidence: r.confidence,
      tags: safeJson(r.tags, []),
      recall_count: r.recall_count,
      updated_at: r.updated_at,
    })),
    count: (rows.results ?? []).length,
  };
}

/**
 * memory_delete — hard delete a single entry by key.
 */
export async function memoryDelete(input, env, context = {}) {
  const { tenantId, userId } = context;
  if (!tenantId || !userId) {
    return { error: 'memory_delete requires tenantId and userId in context' };
  }

  const { key } = input;
  const result = await env.DB
    .prepare(
      `DELETE FROM agentsam_memory WHERE tenant_id = ? AND user_id = ? AND key = ?`
    )
    .bind(tenantId, userId, key)
    .run();

  return { ok: true, key, deleted: result.meta?.changes ?? 0 };
}

// ---------------------------------------------------------------------------
// Unified dispatch — plug into your existing tool router
// ---------------------------------------------------------------------------

export const handlers = {
  memory_write:  (input, env, ctx) => memoryWrite(input, env, ctx),
  memory_read:   (input, env, ctx) => memoryRead(input, env, ctx),
  memory_search: (input, env, ctx) => memorySearch(input, env, ctx),
  memory_delete: (input, env, ctx) => memoryDelete(input, env, ctx),
};
