/**
 * Resolve projects table ids ↔ workspace_projects ids for agentsam_chat_sessions.project_id.
 * Chat sessions store workspace_projects.id; dashboard projects UI uses projects.id.
 */

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Project ref from chat POST body — explicit project_id or sessionStorage mirror in workspaceContext.
 * @param {Record<string, unknown>|null|undefined} body
 * @returns {string|null}
 */
export function parseSessionProjectIdFromChatBody(body) {
  if (!body || typeof body !== 'object') return null;
  const direct = trim(body.project_id ?? body.projectId);
  if (direct) return direct;

  const wsRaw = body.workspaceContext ?? body.workspace_context;
  if (wsRaw == null || wsRaw === '') return null;

  /** @type {Record<string, unknown>|null} */
  let ws = null;
  if (typeof wsRaw === 'string') {
    try {
      const parsed = JSON.parse(wsRaw);
      ws = parsed && typeof parsed === 'object' ? /** @type {Record<string, unknown>} */ (parsed) : null;
    } catch {
      return null;
    }
  } else if (typeof wsRaw === 'object') {
    ws = /** @type {Record<string, unknown>} */ (wsRaw);
  }
  if (!ws) return null;

  const fromWs = trim(ws.session_project_id ?? ws.sessionProjectId);
  return fromWs || null;
}

/**
 * @param {any} env
 * @param {string|null|undefined} projectRef
 * @param {string|null|undefined} [workspaceId]
 * @returns {Promise<string|null>}
 */
export async function resolveChatProjectId(env, projectRef, workspaceId = null) {
  if (!env?.DB) return null;
  const ref = String(projectRef || '').trim();
  if (!ref) return null;

  /** @type {string|null} */
  let resolved = null;

  try {
    const direct = await env.DB.prepare(`SELECT id FROM workspace_projects WHERE id = ? LIMIT 1`)
      .bind(ref)
      .first();
    if (direct?.id) resolved = String(direct.id);
  } catch {
    /* optional table */
  }

  if (!resolved) {
    try {
      let sql = `SELECT id FROM workspace_projects WHERE json_extract(metadata_json, '$.projects_table_id') = ?`;
      const binds = [ref];
      if (workspaceId) {
        sql += ` AND workspace_id = ?`;
        binds.push(String(workspaceId));
      }
      sql += ` LIMIT 1`;
      const linked = await env.DB.prepare(sql).bind(...binds).first();
      if (linked?.id) resolved = String(linked.id);
    } catch {
      /* */
    }
  }

  if (!resolved) {
    try {
      const proj = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? LIMIT 1`).bind(ref).first();
      if (proj?.id) resolved = ref;
    } catch {
      /* */
    }
  }

  if (!resolved) resolved = ref;

  const projectsId = await resolveProjectsTableId(env, resolved);
  return projectsId || resolved;
}

/**
 * @param {any} env
 * @param {string|null|undefined} chatProjectId workspace_projects.id or projects.id
 * @returns {Promise<string|null>} projects.id when linked
 */
export async function resolveProjectsTableId(env, chatProjectId) {
  if (!env?.DB) return null;
  const ref = String(chatProjectId || '').trim();
  if (!ref) return null;

  try {
    const proj = await env.DB.prepare(`SELECT id FROM projects WHERE id = ? LIMIT 1`).bind(ref).first();
    if (proj?.id) return String(proj.id);
  } catch {
    /* */
  }

  try {
    const wp = await env.DB.prepare(
      `SELECT json_extract(metadata_json, '$.projects_table_id') AS projects_table_id
       FROM workspace_projects WHERE id = ? LIMIT 1`,
    )
      .bind(ref)
      .first();
    const linked = wp?.projects_table_id != null ? String(wp.projects_table_id).trim() : '';
    if (linked) return linked;
  } catch {
    /* */
  }

  return null;
}

/**
 * @param {any} env
 * @param {string|null|undefined} projectRef
 * @param {string|null|undefined} [workspaceId]
 * @returns {Promise<{ wpId: string|null, projectsId: string|null }>}
 */
export async function expandChatProjectRefs(env, projectRef, workspaceId = null) {
  const ref = String(projectRef || '').trim();
  if (!ref) return { wpId: null, projectsId: null };

  const wpId = await resolveChatProjectId(env, ref, workspaceId);
  const projectsId = wpId ? (await resolveProjectsTableId(env, wpId)) || ref : ref;

  let finalWp = wpId;
  if (!finalWp || finalWp === projectsId) {
    finalWp = await resolveChatProjectId(env, projectsId, workspaceId);
  }

  return {
    wpId: finalWp || null,
    projectsId: projectsId || null,
  };
}
