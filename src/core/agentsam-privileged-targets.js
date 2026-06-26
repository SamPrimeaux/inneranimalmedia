/**
 * D1-driven sudo / privileged ops policy per terminal_connections target.
 * Mac and unlisted targets stay locked unless a row exists in agentsam_privileged_targets.
 */

/** @typedef {{ allowed: true, sudoersUser?: string|null, target?: object|null }} SudoAllowed */
/** @typedef {{ allowed: false, reason: string }} SudoDenied */

/**
 * Normalize sudo operand to allowlist token (apt, systemctl, cloudflared, workspace, …).
 * Supports /usr/local/sbin/iam-ops-* wrappers and bare binaries.
 * @param {string} command
 * @returns {string|null}
 */
export function sudoAllowlistTokenFromCommand(command) {
  const trimmed = String(command || '').trim();
  if (!/\bsudo\b/i.test(trimmed)) return null;

  const segments = trimmed.split(/\s*(?:&&|\|\||\||;)\s*/);
  const tokens = [];
  for (const segment of segments) {
    const parts = segment.trim().split(/\s+/);
    if (!parts.length || !/^sudo$/i.test(parts[0])) continue;
    const cmdWord = parts[1];
    if (!cmdWord) return null;
    const base = cmdWord.replace(/^.*\//, '');
    if (base.startsWith('iam-ops-')) {
      tokens.push(base.slice('iam-ops-'.length));
      continue;
    }
    if (base === 'apt-get') {
      tokens.push('apt');
      continue;
    }
    tokens.push(base);
  }
  return tokens.length ? tokens[tokens.length - 1] : null;
}

/**
 * @param {string|null|undefined} allowedCommandsJson
 * @param {string} command
 * @returns {boolean}
 */
export function commandMatchesAllowedList(allowedCommandsJson, command) {
  if (!allowedCommandsJson) return true;
  let allowed;
  try {
    allowed = JSON.parse(String(allowedCommandsJson));
  } catch {
    return false;
  }
  if (!Array.isArray(allowed) || allowed.length === 0) return true;

  const trimmed = String(command || '').trim();
  const segments = trimmed.split(/\s*(?:&&|\|\||\||;)\s*/);
  for (const segment of segments) {
    const parts = segment.trim().split(/\s+/);
    if (!parts.length || !/^sudo$/i.test(parts[0])) continue;
    const token = sudoAllowlistTokenFromCommand(segment);
    if (!token || !allowed.includes(token)) return false;
  }
  return true;
}

/**
 * Resolve privileged target lookup id from a terminal_connections row id.
 * @param {import('@cloudflare/workers-types').D1Database|null|undefined} db
 * @param {string|null|undefined} connectionId
 * @returns {Promise<string|null>}
 */
export async function resolvePrivilegedTargetLookupId(db, connectionId) {
  const cid = String(connectionId || '').trim();
  if (!cid || !db) return cid || null;
  try {
    const row = await db
      .prepare(
        `SELECT privileged_target_id FROM terminal_connections WHERE id = ? LIMIT 1`,
      )
      .bind(cid)
      .first();
    const mapped = row?.privileged_target_id != null ? String(row.privileged_target_id).trim() : '';
    return mapped || cid;
  } catch {
    return cid;
  }
}

/**
 * @param {import('@cloudflare/workers-types').D1Database|null|undefined} db
 * @param {string|null|undefined} targetId terminal_connections.id or privileged_target_id
 * @returns {Promise<object|null>}
 */
export async function loadPrivilegedTarget(db, targetId) {
  const lookup = String(targetId || '').trim();
  if (!lookup || !db) return null;
  try {
    return await db
      .prepare(
        `SELECT * FROM agentsam_privileged_targets
         WHERE target_id = ? AND enabled = 1
         LIMIT 1`,
      )
      .bind(lookup)
      .first();
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} env
 * @param {string|null|undefined} targetId
 * @param {string} command
 * @returns {Promise<SudoAllowed|SudoDenied>}
 */
export async function checkSudoPermission(env, targetId, command) {
  const cmd = String(command || '').trim();
  if (!/\bsudo\b/i.test(cmd)) {
    return { allowed: true };
  }

  const escalation = [
    /\bsudo\s+-[uSgH]/i,
    /\bsudo\s+--(?:user|group|login)=/i,
    /\bsudo\s+su\b/i,
    /\bsudo\s+\/bin\/(?:ba)?sh\b/i,
    /\bsudo\s+\/usr\/bin\/(?:ba)?sh\b/i,
  ];
  for (const pattern of escalation) {
    if (pattern.test(cmd)) {
      return { allowed: false, reason: 'sudo privilege escalation not permitted' };
    }
  }

  const db = env?.DB;
  const lookupId = await resolvePrivilegedTargetLookupId(db, targetId);
  const target = await loadPrivilegedTarget(db, lookupId);

  if (!target) {
    return { allowed: false, reason: 'sudo not permitted: target not in privileged allowlist' };
  }

  const mode = String(target.privilege_mode || 'none').trim();
  if (mode === 'none') {
    return { allowed: false, reason: 'sudo not permitted: target explicitly disabled' };
  }

  if (mode === 'full_sudo') {
    return { allowed: true, sudoersUser: target.sudoers_user ?? null, target };
  }

  if (mode === 'scoped_sudo') {
    if (!commandMatchesAllowedList(target.allowed_commands, cmd)) {
      const token = sudoAllowlistTokenFromCommand(cmd);
      return {
        allowed: false,
        reason: token
          ? `sudo not permitted: '${token}' not in allowlist for this target`
          : 'sudo not permitted: command not in allowlist for this target',
      };
    }
    return { allowed: true, sudoersUser: target.sudoers_user ?? null, target };
  }

  return { allowed: false, reason: 'sudo not permitted: unknown privilege_mode' };
}

/**
 * @param {SudoDenied} check
 * @returns {{ ok: false, error: string, blocked: true, detail: { stderr: string } }}
 */
export function formatTerminalExec403(check) {
  return {
    ok: false,
    error: 'terminal_exec_403',
    blocked: true,
    detail: { stderr: `IAM Security: blocked: ${check.reason}` },
  };
}

/**
 * Resolve on-box exec identity for audit + transport headers (distinct from auth_users).
 * @param {import('@cloudflare/workers-types').D1Database|null|undefined} db
 * @param {Record<string, unknown>|null|undefined} connection
 * @param {object|null|undefined} privilegedTarget
 * @returns {Promise<{ execUser: string|null, sshIdentitySecret: string|null, privilegedTargetId: string|null }>}
 */
export async function resolveTerminalExecIdentity(db, connection, privilegedTarget = null) {
  const conn = connection && typeof connection === 'object' ? connection : null;
  let privilegedTargetId =
    conn?.privileged_target_id != null ? String(conn.privileged_target_id).trim() : '';
  if (!privilegedTargetId && conn?.id) {
    privilegedTargetId = await resolvePrivilegedTargetLookupId(db, String(conn.id));
  }
  const target = privilegedTarget || (privilegedTargetId ? await loadPrivilegedTarget(db, privilegedTargetId) : null);
  const execUser =
    (conn?.remote_exec_user != null ? String(conn.remote_exec_user).trim() : '') ||
    (target?.sudoers_user != null ? String(target.sudoers_user).trim() : '') ||
    null;
  const sshIdentitySecret =
    conn?.ssh_identity_secret_name != null ? String(conn.ssh_identity_secret_name).trim() : null;
  return {
    execUser,
    sshIdentitySecret,
    privilegedTargetId: privilegedTargetId || (target?.target_id != null ? String(target.target_id) : null),
  };
}

/** @param {{ execUser?: string|null, privilegedTargetId?: string|null }} identity */
export function buildExecTransportHeaders(identity = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const execUser = identity.execUser != null ? String(identity.execUser).trim() : '';
  if (execUser) headers['X-IAM-Exec-Identity'] = execUser;
  const pt = identity.privilegedTargetId != null ? String(identity.privilegedTargetId).trim() : '';
  if (pt) headers['X-IAM-Privileged-Target'] = pt;
  return headers;
}
