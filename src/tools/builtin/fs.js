/**
 * File system tools — source-envelope writes via change_sets (pending → apply).
 * Read paths delegate to src/tools/fs.js (unchanged).
 */
import { handlers as legacyFsHandlers } from '../fs.js';
import {
  loadUserCloudflareR2Credentials,
  mergeR2S3EnvFromUserStorage,
} from '../../core/user-storage-r2-credentials.js';
import { signR2Request, r2ObjectPathForS3 } from '../../core/r2.js';
import { getUserGithubToken, githubCommitHandshake } from '../../integrations/github.js';
import { getIntegrationToken } from '../../integrations/tokens.js';
import { resolveOAuthAccessToken } from '../../api/oauth.js';

function toolContext(params, runContext = {}) {
  const sess = params?.session && typeof params.session === 'object' ? params.session : {};
  return {
    userId: String(runContext.userId || params.user_id || sess.user_id || '').trim(),
    tenantId: String(runContext.tenantId || params.tenant_id || sess.tenant_id || '').trim(),
    workspaceId: String(
      runContext.workspaceId || params.workspace_id || params.workspaceId || sess.workspace_id || '',
    ).trim(),
    conversationId: String(
      runContext.conversationId || params.conversation_id || params.conversationId || '',
    ).trim(),
    sessionId: String(runContext.sessionId || params.session_id || sess.session_id || '').trim(),
    agentRunId: String(runContext.agentRunId || params.agent_run_id || '').trim(),
  };
}

function pickFirst(...vals) {
  for (const v of vals) {
    const s = v != null ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

/** Normalize write params + active_file_* aliases from T005 envelope. */
export function resolveFileEnvelope(params = {}) {
  const source = pickFirst(
    params.source,
    params.active_file_source,
    params.activeFileSource,
  ).toLowerCase();

  const r2Bucket = pickFirst(params.r2Bucket, params.r2_bucket, params.active_file_r2_bucket);
  const r2Key = pickFirst(params.r2Key, params.r2_key, params.active_file_r2_key);
  const githubRepo = pickFirst(params.githubRepo, params.github_repo, params.active_file_github_repo);
  const githubPath = pickFirst(params.githubPath, params.github_path, params.active_file_github_path);
  const githubBranch = pickFirst(
    params.githubBranch,
    params.github_branch,
    params.active_file_github_branch,
    'main',
  );
  const driveFileId = pickFirst(
    params.driveFileId,
    params.drive_file_id,
    params.active_file_drive_id,
  );
  const workspacePath = pickFirst(
    params.workspacePath,
    params.workspace_path,
    params.active_file_workspace_path,
    params.path,
  );

  const content =
    params.content != null
      ? String(params.content)
      : params.proposed_content != null
        ? String(params.proposed_content)
        : '';

  return {
    source,
    r2Bucket,
    r2Key,
    githubRepo,
    githubPath,
    githubBranch,
    driveFileId,
    workspacePath,
    content,
  };
}

function newChangeSetId() {
  const hex =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  return `cs_${hex}`;
}

function resolveFilePath(envelope) {
  if (envelope.source === 'r2') return envelope.r2Key || envelope.workspacePath || 'unknown';
  if (envelope.source === 'github') return envelope.githubPath || envelope.workspacePath || 'unknown';
  if (envelope.source === 'drive') return envelope.driveFileId || envelope.workspacePath || 'unknown';
  return envelope.workspacePath || 'unknown';
}

async function insertPendingChangeSet(env, ctx, envelope) {
  if (!env?.DB) return { error: 'Database not configured' };
  if (!ctx.userId) return { error: 'user_id required' };
  if (!ctx.tenantId) return { error: 'tenant_id required' };
  if (!envelope.content && envelope.content !== '') {
    return { error: 'content required' };
  }

  const filePath = resolveFilePath(envelope);
  const changeSetId = newChangeSetId();

  await env.DB.prepare(
    `INSERT INTO change_sets (
      id, tenant_id, workspace_id, user_id, agent_run_id, conversation_id,
      source, file_path, r2_bucket, r2_key, github_repo, github_path, github_branch,
      drive_file_id, proposed_content, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
  )
    .bind(
      changeSetId,
      ctx.tenantId,
      ctx.workspaceId || null,
      ctx.userId,
      ctx.agentRunId || null,
      ctx.conversationId || null,
      envelope.source,
      filePath,
      envelope.r2Bucket || null,
      envelope.r2Key || null,
      envelope.githubRepo || null,
      envelope.githubPath || null,
      envelope.githubBranch || null,
      envelope.driveFileId || null,
      envelope.content,
    )
    .run();

  return { changeSetId, filePath };
}

async function applyR2Change(env, userId, row) {
  const creds = await loadUserCloudflareR2Credentials(env, userId);
  if (!creds) {
    return {
      error: 'R2 credentials not configured',
      hint: 'Add R2 keys in Settings → Storage',
    };
  }

  const bucket = String(row.r2_bucket || '').trim();
  const key = String(row.r2_key || '').trim();
  if (!bucket || !key) return { error: 'change_set missing r2_bucket or r2_key' };

  const mergedEnv = await mergeR2S3EnvFromUserStorage(env, { id: userId });
  const path = r2ObjectPathForS3(key);
  const body = String(row.proposed_content ?? '');
  const signed = await signR2Request('PUT', bucket, path, '', mergedEnv, {
    body,
    contentType: 'text/plain; charset=utf-8',
  });
  if (!signed) {
    return { error: 'R2 signed PUT failed — check user storage credentials' };
  }

  const res = await fetch(signed.endpoint, {
    method: 'PUT',
    headers: signed.headers,
    body: signed.bodyBytes?.byteLength ? signed.bodyBytes : undefined,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return { error: `R2 PUT failed (${res.status})`, detail };
  }

  return { bucket, key, path: `r2://${bucket}/${key}` };
}

async function applyGithubChange(env, userId, row) {
  const gh = await getUserGithubToken(env, userId);
  if (!gh?.token) {
    return {
      error: 'GitHub not connected',
      hint: 'Connect GitHub in Settings → Integrations',
    };
  }

  const repo = String(row.github_repo || '').trim();
  const path = String(row.github_path || '').trim();
  const branch = String(row.github_branch || 'main').trim() || 'main';
  const content = String(row.proposed_content ?? '');
  if (!repo || !path) return { error: 'change_set missing github_repo or github_path' };

  const authUser = { id: userId, user_id: userId };
  try {
    await githubCommitHandshake(env, authUser, repo, {
      path,
      content,
      message: `Agent Sam: update ${path}`,
      branch,
    });
    return { repo, path, branch, uri: `github:${repo}/${path}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function patchDriveFile(env, userId, fileId, content) {
  const tokenRow = await getIntegrationToken(env, userId, 'google_drive', '');
  const bearer = await resolveOAuthAccessToken(env, tokenRow);
  if (!bearer) {
    return {
      error: 'Google Drive not connected',
      hint: 'Connect Google Drive in Settings → Integrations',
    };
  }

  const bytes = new TextEncoder().encode(String(content ?? ''));
  const contentType = 'text/plain';
  const filename = 'agent-sam-edit.txt';
  const meta = JSON.stringify({ name: filename, mimeType: contentType });
  const boundary = '-------IAMFsBoundary';
  const part1 = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`;
  const part2 = `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const enc = new TextEncoder();
  const b1 = enc.encode(part1);
  const b2 = enc.encode(part2);
  const b3 = enc.encode(closing);
  const merged = new Uint8Array(b1.length + b2.length + bytes.length + b3.length);
  merged.set(b1, 0);
  merged.set(b2, b1.length);
  merged.set(bytes, b1.length + b2.length);
  merged.set(b3, b1.length + b2.length + bytes.length);

  const url = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
      'Content-Length': String(merged.length),
    },
    body: merged,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    return { error: `Drive PATCH failed (${res.status})`, detail };
  }

  const data = await res.json().catch(() => ({}));
  return { drive_file_id: data.id || fileId };
}

async function applyDriveChange(env, userId, row) {
  const fileId = String(row.drive_file_id || '').trim();
  if (!fileId) return { error: 'change_set missing drive_file_id' };
  return patchDriveFile(env, userId, fileId, row.proposed_content);
}

async function writeFileImpl(params, env, runContext = {}) {
  const ctx = toolContext(params, runContext);
  const envelope = resolveFileEnvelope(params);

  let source = envelope.source;
  if (!source) {
    if (envelope.r2Bucket && envelope.r2Key) source = 'r2';
    else if (envelope.githubRepo && envelope.githubPath) source = 'github';
    else if (envelope.driveFileId) source = 'drive';
    else source = 'local';
  }

  if (source === 'local' || source === 'buffer' || source === '') {
    return {
      status: 'local_file',
      message: 'Local file edits are applied via Accept/Reject in the editor',
      proposed_content: envelope.content,
      file_path: envelope.workspacePath || null,
    };
  }

  if (source === 'r2') {
    const creds = await loadUserCloudflareR2Credentials(env, ctx.userId);
    if (!creds) {
      return {
        error: 'R2 credentials not configured',
        hint: 'Add R2 keys in Settings → Storage',
      };
    }
    if (!envelope.r2Bucket || !envelope.r2Key) {
      return { error: 'r2_bucket and r2_key required for R2 writes' };
    }
    const ins = await insertPendingChangeSet(env, ctx, { ...envelope, source: 'r2' });
    if (ins.error) return ins;
    return {
      status: 'pending_confirmation',
      change_set_id: ins.changeSetId,
      message: `Proposed write to r2://${envelope.r2Bucket}/${envelope.r2Key} — Accept in editor to apply`,
    };
  }

  if (source === 'github') {
    const gh = await getUserGithubToken(env, ctx.userId);
    if (!gh?.token) {
      return {
        error: 'GitHub not connected',
        hint: 'Connect GitHub in Settings → Integrations',
      };
    }
    if (!envelope.githubRepo || !envelope.githubPath) {
      return { error: 'github_repo and github_path required for GitHub writes' };
    }
    const ins = await insertPendingChangeSet(env, ctx, { ...envelope, source: 'github' });
    if (ins.error) return ins;
    return {
      status: 'pending_confirmation',
      change_set_id: ins.changeSetId,
      message: `Proposed write to github:${envelope.githubRepo}/${envelope.githubPath} — Accept in editor to apply`,
    };
  }

  if (source === 'drive') {
    if (!envelope.driveFileId) {
      return { error: 'drive_file_id required for Drive writes' };
    }
    const ins = await insertPendingChangeSet(env, ctx, { ...envelope, source: 'drive' });
    if (ins.error) return ins;
    return {
      status: 'pending_confirmation',
      change_set_id: ins.changeSetId,
      message: 'Proposed write to Drive file — Accept in editor to apply',
    };
  }

  return { error: `Unsupported source: ${source}` };
}

async function applyChangeSetImpl(params, env, runContext = {}) {
  const ctx = toolContext(params, runContext);
  const changeSetId = pickFirst(params.change_set_id, params.changeSetId);
  const action = pickFirst(params.action).toLowerCase();

  if (!changeSetId) return { error: 'change_set_id required' };
  if (action !== 'accept' && action !== 'reject') {
    return { error: "action must be 'accept' or 'reject'" };
  }
  if (!env?.DB) return { error: 'Database not configured' };
  if (!ctx.userId) return { error: 'user_id required' };

  const row = await env.DB.prepare(
    `SELECT id, user_id, tenant_id, source, file_path, r2_bucket, r2_key,
            github_repo, github_path, github_branch, drive_file_id, proposed_content, status
     FROM change_sets WHERE id = ? LIMIT 1`,
  )
    .bind(changeSetId)
    .first();

  if (!row) return { error: 'change_set not found' };
  if (String(row.user_id) !== ctx.userId) {
    return { error: 'change_set not owned by current user' };
  }
  if (String(row.status) !== 'pending') {
    return { error: `change_set already ${row.status}` };
  }

  const now = Math.floor(Date.now() / 1000);

  if (action === 'reject') {
    await env.DB.prepare(
      `UPDATE change_sets SET status = 'rejected', rejected_at = ? WHERE id = ?`,
    )
      .bind(now, changeSetId)
      .run();
    return { status: 'rejected', change_set_id: changeSetId, source: row.source };
  }

  let applyResult;
  const src = String(row.source || '').toLowerCase();
  if (src === 'r2') applyResult = await applyR2Change(env, ctx.userId, row);
  else if (src === 'github') applyResult = await applyGithubChange(env, ctx.userId, row);
  else if (src === 'drive') applyResult = await applyDriveChange(env, ctx.userId, row);
  else return { error: `Cannot apply change_set for source: ${src}` };

  if (applyResult?.error) return applyResult;

  await env.DB.prepare(
    `UPDATE change_sets SET status = 'accepted', accepted_at = ? WHERE id = ?`,
  )
    .bind(now, changeSetId)
    .run();

  return {
    status: 'applied',
    change_set_id: changeSetId,
    source: src,
    path: applyResult.path || applyResult.uri || row.file_path,
    ...applyResult,
  };
}

export const handlers = {
  async read_file(params, env) {
    return legacyFsHandlers.read_file(params, env);
  },

  async list_dir(params, env) {
    return legacyFsHandlers.list_dir(params, env);
  },

  async list_files(params, env) {
    return legacyFsHandlers.list_dir(params, env);
  },

  async write_file(params, env, runContext) {
    return writeFileImpl(params, env, runContext);
  },

  async fs_write_file(params, env, runContext) {
    return writeFileImpl(params, env, runContext);
  },

  async fs_edit_file(params, env, runContext) {
    return writeFileImpl(params, env, runContext);
  },

  async save_file(params, env, runContext) {
    return writeFileImpl(params, env, runContext);
  },

  async put_file(params, env, runContext) {
    return writeFileImpl(params, env, runContext);
  },

  async apply_change_set(params, env, runContext) {
    return applyChangeSetImpl(params, env, runContext);
  },
};

export const definitions = [
  {
    name: 'read_file',
    description: 'Read the contents of a specific file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description: 'List contents of a directory',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' },
        recursive: { type: 'boolean', description: 'Whether to scan subdirectories' },
      },
    },
  },
  {
    name: 'write_file',
    description:
      'Propose a file write routed by source (r2, github, drive, local). Remote writes create a pending change_set.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['local', 'github', 'r2', 'drive', 'buffer'],
          description: 'Active file source from editor envelope',
        },
        content: { type: 'string', description: 'Full file content to write' },
        r2Bucket: { type: 'string' },
        r2Key: { type: 'string' },
        githubRepo: { type: 'string' },
        githubPath: { type: 'string' },
        githubBranch: { type: 'string' },
        driveFileId: { type: 'string' },
        workspacePath: { type: 'string' },
        path: { type: 'string', description: 'Legacy path alias' },
      },
      required: ['content'],
    },
  },
  {
    name: 'apply_change_set',
    description: 'Accept or reject a pending change_set and apply remote writes when accepted',
    parameters: {
      type: 'object',
      properties: {
        change_set_id: { type: 'string' },
        action: { type: 'string', enum: ['accept', 'reject'] },
      },
      required: ['change_set_id', 'action'],
    },
  },
];
