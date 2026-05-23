/**
 * Resolve `agentsam_subagent_profile` for Agent Sam chat / spawn dispatch.
 */

const WRITE_TOOL_RE = /write|edit|patch|delete|terminal|deploy|run_command|create_|update_|insert_/i;

function parseAllowedToolGlobs(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch {
    /* plain comma list */
  }
  return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}

function toolNameOf(t) {
  return String(t?.name || t?.tool_name || '').trim();
}

/**
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {{
 *   userId: string,
 *   workspaceId?: string | null,
 *   tenantId?: string | null,
 *   profileId?: string | null,
 *   slug?: string | null,
 * }} opts
 */
export async function resolveSubagentProfileForChat(db, opts) {
  if (!db) return null;
  const userId = String(opts.userId || '').trim();
  if (!userId) return null;
  const wsKey = opts.workspaceId != null ? String(opts.workspaceId).trim() : '';
  const profileId = opts.profileId != null ? String(opts.profileId).trim() : '';
  const slug = opts.slug != null ? String(opts.slug).trim() : '';
  if (!profileId && !slug) return null;

  const bindUserScoped = async (sql, ...binds) => {
    try {
      return await db.prepare(sql).bind(...binds).first();
    } catch {
      return null;
    }
  };

  if (profileId) {
    const row = await bindUserScoped(
      `SELECT * FROM agentsam_subagent_profile
       WHERE id = ? AND user_id = ? AND COALESCE(workspace_id, '') = ?
         AND is_active = 1
       LIMIT 1`,
      profileId,
      userId,
      wsKey,
    );
    if (row) return row;
  }

  if (slug) {
    const row = await bindUserScoped(
      `SELECT * FROM agentsam_subagent_profile
       WHERE slug = ? AND user_id = ? AND COALESCE(workspace_id, '') = ?
         AND is_active = 1
       LIMIT 1`,
      slug,
      userId,
      wsKey,
    );
    if (row) return row;

    const tenantId = opts.tenantId != null ? String(opts.tenantId).trim() : '';
    const global = await bindUserScoped(
      `SELECT * FROM agentsam_subagent_profile
       WHERE slug = ? AND COALESCE(is_platform_global, 0) = 1 AND is_active = 1
         AND (tenant_id IS NULL OR tenant_id = '' OR tenant_id = ?)
       LIMIT 1`,
      slug,
      tenantId,
    );
    if (global) return global;
  }

  return null;
}

/** @param {string} systemPrompt @param {Record<string, unknown>} profile */
export function appendSubagentProfileToSystemPrompt(systemPrompt, profile) {
  const base = String(systemPrompt || '').trim();
  const name = String(profile.display_name || profile.slug || 'Subagent').trim();
  const slug = String(profile.slug || '').trim();
  const instructions = String(profile.instructions_markdown || '').trim();
  const description = String(profile.description || '').trim();
  const tone = profile.personality_tone != null ? String(profile.personality_tone) : '';
  const traits = profile.personality_traits != null ? String(profile.personality_traits) : '';
  const rules = profile.personality_rules != null ? String(profile.personality_rules) : '';

  let block = `## Subagent: ${name}`;
  if (slug) block += ` (\`${slug}\`)`;
  if (description) block += `\n\n${description}`;
  if (tone) block += `\n\n**Tone:** ${tone}`;
  if (traits) block += `\n\n**Traits:** ${traits}`;
  if (rules) block += `\n\n**Personality rules:**\n${rules}`;
  if (instructions) block += `\n\n### Instructions\n${instructions}`;
  block += '\n\nOperate strictly within this subagent profile for this turn.';

  return base ? `${block}\n\n---\n\n${base}` : block;
}

/**
 * Apply subagent tool policy (read_only + optional allowed_tool_globs).
 * @param {Array<Record<string, unknown>>} tools
 * @param {Record<string, unknown> | null} profile
 */
export function filterToolsForSubagentProfile(tools, profile) {
  if (!profile || !Array.isArray(tools)) return tools;
  let out = tools;

  const globs = parseAllowedToolGlobs(profile.allowed_tool_globs);
  if (globs?.length) {
    const allow = new Set(globs.map((g) => g.toLowerCase()));
    out = out.filter((t) => {
      const n = toolNameOf(t).toLowerCase();
      for (const g of allow) {
        if (n.includes(g)) return true;
      }
      return false;
    });
  }

  if (String(profile.access_mode || '') === 'read_only') {
    out = out.filter((t) => !WRITE_TOOL_RE.test(toolNameOf(t)));
  }

  return out;
}

/**
 * Legacy pin: only when routing arms are unavailable (no agent_slug column).
 * With per-agent Thompson arms, profile.default_model_id is cold-start prior via ensureAgentRoutingArmsColdStart.
 */
export function applySubagentDefaultModelToBody(body, profile, opts = {}) {
  if (opts.useRoutingArms === true) return;
  if (!profile?.default_model_id || !body || typeof body !== 'object') return;
  const subModel = String(profile.default_model_id).trim();
  if (!subModel) return;
  const raw = body.model != null ? String(body.model).trim().toLowerCase() : '';
  const isAuto = !raw || raw === 'auto';
  if (!isAuto) return;
  body.model = subModel;
  body._subagent_default_model = subModel;
}
