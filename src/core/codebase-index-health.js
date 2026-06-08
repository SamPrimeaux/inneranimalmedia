/**
 * Weekly codebase index staleness — pgvector catalog vs GitHub file history.
 * Flags files where last_reindexed_at is older than 30 days and Git has newer commits.
 */
import { runHyperdriveQuery, isHyperdriveUsable } from './hyperdrive-query.js';
import { getAdminGithubToken } from '../integrations/github.js';

const DEFAULT_REPO = 'SamPrimeaux/inneranimalmedia';
const DEFAULT_WORKSPACE_UUID = 'fa1f12a8-c841-4b79-a26c-d53a78b17dac';
const STALE_DAYS = 30;
const MAX_CANDIDATES = 120;
const MAX_STALE_IN_JSON = 40;
const GITHUB_CONCURRENCY = 6;

/**
 * @param {string} isoOrNull
 * @returns {number|null}
 */
function parseTs(isoOrNull) {
  if (!isoOrNull) return null;
  const t = Date.parse(String(isoOrNull));
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {any} env
 * @param {string} repo
 * @param {string} filePath
 * @param {string} token
 * @returns {Promise<number|null>}
 */
async function fetchGitHubLastCommitMs(env, repo, filePath, token) {
  const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'IAM-Codebase-Index-Health',
    },
  });
  if (!res.ok) return null;
  const commits = await res.json();
  if (!Array.isArray(commits) || !commits[0]) return null;
  return parseTs(commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date);
}

/**
 * @param {any} env
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<string|null>}
 */
async function fetchGitHubHeadSha(env, repo, token) {
  const url = `https://api.github.com/repos/${repo}/commits/main?per_page=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'IAM-Codebase-Index-Health',
    },
  });
  if (!res.ok) return null;
  const commits = await res.json();
  const sha = commits?.[0]?.sha;
  return sha ? String(sha) : null;
}

/**
 * @param {(sql: string, params: unknown[]) => Promise<{ ok: boolean, rows?: Record<string, unknown>[], error?: string }>} queryFn
 * @param {string} workspaceUuid
 */
async function loadStaleCandidatesWith(queryFn, workspaceUuid) {
  const sql = `
    SELECT file_path,
           last_indexed,
           last_reindexed_at,
           metadata
      FROM agentsam.agentsam_codebase_files_oai3large_1536
     WHERE workspace_id = $1::uuid
       AND file_path NOT LIKE 'docs/%'
       AND COALESCE(
             last_reindexed_at,
             last_indexed,
             to_timestamp(0)
           ) < NOW() - INTERVAL '${STALE_DAYS} days'
     ORDER BY COALESCE(last_reindexed_at, last_indexed) ASC
     LIMIT $2`;
  const r = await queryFn(sql, [workspaceUuid, MAX_CANDIDATES]);
  if (!r.ok) return { rows: [], error: r.error || 'hyperdrive_query_failed' };
  return { rows: r.rows || [] };
}

/**
 * @param {(sql: string, params: unknown[]) => Promise<{ ok: boolean, rows?: Record<string, unknown>[], error?: string }>} queryFn
 * @param {string} workspaceUuid
 * @returns {Promise<number>}
 */
async function countIndexedFilesWith(queryFn, workspaceUuid) {
  const r = await queryFn(
    `SELECT COUNT(*)::int AS n
       FROM agentsam.agentsam_codebase_files_oai3large_1536
      WHERE workspace_id = $1::uuid
        AND file_path NOT LIKE 'docs/%'`,
    [workspaceUuid],
  );
  return r.ok ? Number(r.rows?.[0]?.n ?? 0) : 0;
}

/**
 * @param {any} env
 * @param {string} workspaceUuid
 * @returns {Promise<{ rows: Record<string, unknown>[], error?: string }>}
 */
async function loadStaleCandidates(env, workspaceUuid) {
  return loadStaleCandidatesWith((sql, params) => runHyperdriveQuery(env, sql, params), workspaceUuid);
}

/**
 * @param {any} env
 * @param {string} workspaceUuid
 * @returns {Promise<number>}
 */
async function countIndexedFiles(env, workspaceUuid) {
  return countIndexedFilesWith((sql, params) => runHyperdriveQuery(env, sql, params), workspaceUuid);
}

/**
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
async function runPool(tasks, concurrency) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  });
  await Promise.all(workers);
}

/**
 * @param {any} env
 * @param {{ workspaceUuid?: string, workspaceKey?: string, repo?: string, queryRunner?: (sql: string, params: unknown[]) => Promise<{ ok: boolean, rows?: Record<string, unknown>[], error?: string }> }} [opts]
 */
export async function runCodebaseIndexWeeklyHealth(env, opts = {}) {
  const workspaceUuid = String(opts.workspaceUuid || DEFAULT_WORKSPACE_UUID).trim();
  const workspaceKey = String(opts.workspaceKey || env?.WORKSPACE_ID || 'ws_inneranimalmedia').trim();
  const repo = String(opts.repo || DEFAULT_REPO).trim();
  const checkedAt = Math.floor(Date.now() / 1000);
  const weekStart = new Date(checkedAt * 1000).toISOString().slice(0, 10);
  const queryFn =
    typeof opts.queryRunner === 'function'
      ? opts.queryRunner
      : (sql, params) => runHyperdriveQuery(env, sql, params);

  if (!opts.queryRunner && !isHyperdriveUsable(env)) {
    return { ok: false, skipped: true, reason: 'hyperdrive_unavailable' };
  }
  if (!env?.DB) {
    return { ok: false, skipped: true, reason: 'd1_unavailable' };
  }

  const gh = getAdminGithubToken(env);
  if (!gh?.token) {
    return { ok: false, skipped: true, reason: 'github_token_unavailable' };
  }

  const [totalIndexed, candidateLoad, headSha] = await Promise.all([
    countIndexedFilesWith(queryFn, workspaceUuid),
    loadStaleCandidatesWith(queryFn, workspaceUuid),
    fetchGitHubHeadSha(env, repo, gh.token),
  ]);

  if (candidateLoad.error) {
    return { ok: false, error: candidateLoad.error };
  }

  /** @type {Array<Record<string, unknown>>} */
  const staleFiles = [];

  const tasks = (candidateLoad.rows || []).map((row) => async () => {
    const filePath = String(row.file_path || '').trim();
    if (!filePath) return;
    const reindexedMs =
      parseTs(row.last_reindexed_at) ??
      parseTs(row.last_indexed) ??
      0;
    const gitMs = await fetchGitHubLastCommitMs(env, repo, filePath, gh.token);
    if (gitMs == null || gitMs <= reindexedMs) return;
    staleFiles.push({
      file_path: filePath,
      last_reindexed_at: row.last_reindexed_at ?? row.last_indexed ?? null,
      last_indexed: row.last_indexed ?? null,
      git_last_commit_at: new Date(gitMs).toISOString(),
      days_since_reindex: Math.floor((Date.now() - reindexedMs) / 86400000),
    });
  });

  await runPool(tasks, GITHUB_CONCURRENCY);
  staleFiles.sort((a, b) => Number(b.days_since_reindex || 0) - Number(a.days_since_reindex || 0));

  const id = `cbix_${workspaceKey}_${weekStart}`;
  const payload = {
    stale_threshold_days: STALE_DAYS,
    candidates_checked: candidateLoad.rows?.length ?? 0,
    github_repo: repo,
  };

  await env.DB.prepare(
    `INSERT INTO agentsam_codebase_index_health (
       id, workspace_id, workspace_key, checked_at, week_start,
       total_indexed, stale_index_count, stale_files_json, head_sha, repo, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       checked_at = excluded.checked_at,
       total_indexed = excluded.total_indexed,
       stale_index_count = excluded.stale_index_count,
       stale_files_json = excluded.stale_files_json,
       head_sha = excluded.head_sha,
       repo = excluded.repo,
       metadata_json = excluded.metadata_json`,
  )
    .bind(
      id,
      workspaceUuid,
      workspaceKey,
      checkedAt,
      weekStart,
      totalIndexed,
      staleFiles.length,
      JSON.stringify(staleFiles.slice(0, MAX_STALE_IN_JSON)),
      headSha,
      repo,
      JSON.stringify(payload),
    )
    .run();

  return {
    ok: true,
    workspace_id: workspaceUuid,
    workspace_key: workspaceKey,
    week_start: weekStart,
    total_indexed: totalIndexed,
    stale_index_count: staleFiles.length,
    stale_files: staleFiles.slice(0, MAX_STALE_IN_JSON),
    head_sha: headSha,
    repo,
    rowsWritten: 1,
  };
}
