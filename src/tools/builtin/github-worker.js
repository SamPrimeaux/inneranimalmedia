/**
 * GitHub tools — user OAuth from D1 (no cookie round-trip to dashboard).
 */
import { getUserGithubToken, githubCommitHandshake } from '../../integrations/github.js';
import { resolveIntegrationUserId } from '../../core/integration-user-id.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function asInt(v, fallback = null) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function missingNonEmptyStrings(params, fields) {
  const missing = [];
  for (const f of fields) {
    if (!trim(params?.[f])) missing.push(f);
  }
  return missing;
}

function missingDefined(params, fields) {
  const missing = [];
  for (const f of fields) {
    if (params?.[f] == null) missing.push(f);
  }
  return missing;
}

function missingRequiredInput(params, missing) {
  const tool = trim(params?.tool) || null;
  const operation = trim(params?.operation) || null;
  return {
    success: false,
    error: 'missing_required_input',
    missing,
    tool,
    operation,
  };
}

function toolMeta(params) {
  return {
    tool: trim(params?.tool) || null,
    operation: trim(params?.operation) || null,
  };
}

function structuredError(params, error, message, extra = null) {
  return {
    success: false,
    error,
    message: message != null ? String(message) : null,
    ...toolMeta(params),
    ...(extra && typeof extra === 'object' ? extra : null),
  };
}

function authUserFromParams(params, canonicalUserId) {
  const uid = canonicalUserId || (params.user_id != null ? String(params.user_id).trim() : '');
  if (!uid) return null;
  return { id: uid, user_id: uid };
}

async function ghGetToken(env, params) {
  const rawUid = params.user_id != null ? String(params.user_id).trim() : '';
  if (!rawUid) return structuredError(params, 'missing_required_input', 'user_id is required', { missing: ['user_id'] });
  const canonicalUserId = (await resolveIntegrationUserId(env, { id: rawUid })) || rawUid;
  const account = params.account != null ? String(params.account) : params.account_identifier != null ? String(params.account_identifier) : '';
  const row = await getUserGithubToken(env, canonicalUserId, account);
  if (!row?.token) {
    return structuredError(
      params,
      'github_not_connected',
      'GitHub account not linked — sign in with GitHub or connect in Integrations',
    );
  }
  return {
    token: row.token,
    account_identifier: row.account_identifier || '',
    user: authUserFromParams(params, canonicalUserId),
  };
}

async function ghJson(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'InnerAnimalMedia-AgentSam',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      error: 'github_api_error',
      status: res.status,
      message: `GitHub ${method} ${path} → ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`,
    };
  }
  return { success: true, data: json };
}

async function ghText(token, method, path, accept) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || 'application/vnd.github+json',
      'User-Agent': 'InnerAnimalMedia-AgentSam',
    },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    return {
      success: false,
      error: 'github_api_error',
      status: res.status,
      message: `GitHub ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`,
    };
  }
  return { success: true, data: text };
}

async function ghPaged(token, pathBase, maxPages = 5) {
  const out = [];
  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const join = pathBase.includes('?') ? '&' : '?';
    const url = `${pathBase}${join}per_page=100&page=${page}`;
    const res = await ghJson(token, 'GET', url, null);
    if (res?.success === false) return res;
    const data = res?.data;
    if (!Array.isArray(data)) return structuredError({}, 'github_api_error', 'Expected array response from GitHub paging endpoint');
    out.push(...data);
    if (data.length < 100) break;
  }
  return { success: true, data: out };
}

export const handlers = {
  async github_repos(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id']);
    if (missing.length) return missingRequiredInput(params, missing);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const data = await ghPaged(
      t.token,
      '/user/repos?sort=updated&affiliation=owner,collaborator,organization_member',
      2,
    );
    if (data?.success === false) return { ...data, ...toolMeta(params) };
    return { success: true, repos: Array.isArray(data.data) ? data.data : [] };
  },

  async github_file(params, env) {
    return await handlers.github_get_file(params, env);
  },

  async github_get_file(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'path']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = String(params.repo).trim();
    const path = String(params.path).trim();
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const ref = trim(params.ref) || trim(params.branch);
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/contents/${enc}${qs}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    const data = res.data || {};
    let text = '';
    if (typeof data.content === 'string' && data.encoding === 'base64') {
      try {
        text = new TextDecoder().decode(
          Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)),
        );
      } catch {
        text = '';
      }
    }
    return {
      success: true,
      path,
      repo,
      sha: data.sha || null,
      size: data.size ?? null,
      encoding: data.encoding || null,
      text,
    };
  },

  async github_update_file(params, env) {
    // update_file requires sha (caller should read first).
    const missing = [
      ...missingNonEmptyStrings(params, ['user_id', 'repo', 'path', 'message', 'sha']),
      ...missingDefined(params, ['content']),
    ];
    if (missing.length) return missingRequiredInput(params, [...new Set(missing)]);
    const repo = String(params.repo).trim();
    const path = String(params.path).trim();
    const content = String(params.content);
    const message = String(params.message).trim();
    const branch = trim(params.branch);
    const sha = trim(params.sha);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const res = await ghJson(t.token, 'PUT', `/repos/${repo}/contents/${enc}`, {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
      ...(branch ? { branch } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, commit: res.data?.commit ?? null, content: res.data?.content ?? null };
  },

  async github_create_file(params, env) {
    const missing = [
      ...missingNonEmptyStrings(params, ['user_id', 'repo', 'path', 'message']),
      ...missingDefined(params, ['content']),
    ];
    if (missing.length) return missingRequiredInput(params, [...new Set(missing)]);
    const repo = String(params.repo).trim();
    const path = String(params.path).trim();
    const content = String(params.content);
    const message = String(params.message).trim();
    const branch = trim(params.branch);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const res = await ghJson(t.token, 'PUT', `/repos/${repo}/contents/${enc}`, {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      ...(branch ? { branch } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, commit: res.data?.commit ?? null, content: res.data?.content ?? null };
  },

  async github_delete_file(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'path', 'message']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = String(params.repo).trim();
    const path = String(params.path).trim();
    const message = String(params.message).trim();
    const branch = trim(params.branch);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;

    // Must provide sha to delete via Contents API; accept provided sha or resolve it.
    let sha = trim(params.sha);
    if (!sha) {
      const get = await handlers.github_get_file({ ...params, repo, path }, env);
      if (get?.success === false) return get;
      sha = trim(get?.sha);
    }
    if (!sha) return structuredError(params, 'github_delete_failed', 'Unable to resolve file sha for deletion');

    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const res = await ghJson(t.token, 'DELETE', `/repos/${repo}/contents/${enc}`, {
      message,
      sha,
      ...(branch ? { branch } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, commit: res.data?.commit ?? null, content: res.data?.content ?? null };
  },

  async github_read_dir(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'path']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const path = trim(params.path).replace(/^\/+/, '');
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const enc = path
      .split('/')
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const ref = trim(params.ref) || trim(params.branch);
    const qs = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/contents/${enc}${qs}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    const data = res.data;
    if (!Array.isArray(data)) {
      return structuredError(params, 'github_api_error', 'Expected array response for directory read');
    }
    return { success: true, entries: data };
  },

  async github_get_tree(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'branch']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const branch = trim(params.branch);
    const recursive = params.recursive == null ? true : Boolean(params.recursive);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const refRes = await ghJson(t.token, 'GET', `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, null);
    if (refRes?.success === false) return { ...refRes, ...toolMeta(params) };
    const sha = trim(refRes.data?.object?.sha);
    if (!sha) return structuredError(params, 'github_api_error', 'Unable to resolve branch SHA');
    const res = await ghJson(
      t.token,
      'GET',
      `/repos/${repo}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`,
      null,
    );
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, tree: res.data?.tree || [], sha: res.data?.sha || sha, branch };
  },

  async github_batch_read(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const files = Array.isArray(params.files) ? params.files : null;
    if (!files || files.length === 0) return missingRequiredInput(params, ['files']);
    const repo = trim(params.repo);
    const out = [];
    for (const f of files) {
      const path = trim(f?.path ?? f);
      if (!path) continue;
      const got = await handlers.github_get_file(
        {
          ...params,
          repo,
          path,
          ref: f?.ref ?? params.ref,
          branch: f?.branch ?? params.branch,
        },
        env,
      );
      if (got?.success === false) {
        out.push({ path, sha: null, text: '', error: got?.message || got?.error || 'read_failed' });
        continue;
      }
      out.push({ path, sha: got?.sha ?? null, text: got?.text ?? '' });
    }
    return { success: true, files: out };
  },

  async github_create_pr(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'title', 'head']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = String(params.repo).trim();
    const title = String(params.title).trim();
    const head = String(params.head).trim();
    const base = params.base != null ? String(params.base).trim() : 'main';
    const body = params.body != null ? String(params.body) : '';
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'POST', `/repos/${repo}/pulls`, {
      title,
      head,
      base: base || 'main',
      body: body || undefined,
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    const data = res.data || {};
    return { success: true, html_url: data.html_url, number: data.number, state: data.state };
  },

  async github_update_pr(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'pull_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const pullNumber = asInt(params.pull_number, null);
    if (!pullNumber || pullNumber <= 0) {
      return structuredError(params, 'invalid_input', 'pull_number must be a positive integer');
    }
    const body = {};
    if (params.title != null) body.title = String(params.title);
    if (params.body != null) body.body = String(params.body);
    if (params.state != null) body.state = String(params.state);
    if (params.base != null) body.base = String(params.base);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'PATCH', `/repos/${repo}/pulls/${pullNumber}`, body);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, pr: res.data };
  },

  async github_get_pr(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'pull_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const pullNumber = asInt(params.pull_number, null);
    if (!pullNumber || pullNumber <= 0) {
      return structuredError(params, 'invalid_input', 'pull_number must be a positive integer');
    }
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/pulls/${pullNumber}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, pr: res.data };
  },

  async github_list_prs(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const state = trim(params.state) || 'open';
    const base = trim(params.base);
    const head = trim(params.head);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const qs = new URLSearchParams();
    if (state) qs.set('state', state);
    if (base) qs.set('base', base);
    if (head) qs.set('head', head);
    const res = await ghPaged(t.token, `/repos/${repo}/pulls?${qs.toString()}`, 3);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, prs: Array.isArray(res.data) ? res.data : [] };
  },

  async github_list_pr_files(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'pull_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const pullNumber = asInt(params.pull_number, null);
    if (!pullNumber || pullNumber <= 0) {
      return structuredError(params, 'invalid_input', 'pull_number must be a positive integer');
    }
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghPaged(t.token, `/repos/${repo}/pulls/${pullNumber}/files`, 5);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, files: Array.isArray(res.data) ? res.data : [] };
  },

  async github_get_pr_diff(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'pull_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const pullNumber = asInt(params.pull_number, null);
    if (!pullNumber || pullNumber <= 0) {
      return structuredError(params, 'invalid_input', 'pull_number must be a positive integer');
    }
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghText(t.token, 'GET', `/repos/${repo}/pulls/${pullNumber}`, 'application/vnd.github.v3.diff');
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, diff: String(res.data || '') };
  },

  async github_merge_pr(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'pull_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const pullNumber = asInt(params.pull_number, null);
    if (!pullNumber || pullNumber <= 0) {
      return structuredError(params, 'invalid_input', 'pull_number must be a positive integer');
    }
    const mergeMethod = trim(params.merge_method) || trim(params.method) || 'merge'; // merge|squash|rebase
    const commitTitle = params.commit_title != null ? String(params.commit_title) : undefined;
    const commitMessage = params.commit_message != null ? String(params.commit_message) : undefined;
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'PUT', `/repos/${repo}/pulls/${pullNumber}/merge`, {
      merge_method: mergeMethod,
      ...(commitTitle ? { commit_title: commitTitle } : {}),
      ...(commitMessage ? { commit_message: commitMessage } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, result: res.data };
  },

  async github_create_comment(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'issue_number', 'body']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const issueNumber = asInt(params.issue_number, null);
    if (!issueNumber || issueNumber <= 0) {
      return structuredError(params, 'invalid_input', 'issue_number must be a positive integer');
    }
    const body = String(params.body);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'POST', `/repos/${repo}/issues/${issueNumber}/comments`, { body });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, comment: res.data };
  },

  async github_list_issues(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const state = trim(params.state) || 'open';
    const labels = trim(params.labels);
    const assignee = trim(params.assignee);
    const creator = trim(params.creator);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const qs = new URLSearchParams();
    if (state) qs.set('state', state);
    if (labels) qs.set('labels', labels);
    if (assignee) qs.set('assignee', assignee);
    if (creator) qs.set('creator', creator);
    const res = await ghPaged(t.token, `/repos/${repo}/issues?${qs.toString()}`, 3);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    const list = Array.isArray(res.data) ? res.data : [];
    // Filter out PRs (GitHub represents PRs in issues list with pull_request field)
    const issues = list.filter((x) => !x?.pull_request);
    return { success: true, issues };
  },

  async github_get_issue(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'issue_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const issueNumber = asInt(params.issue_number, null);
    if (!issueNumber || issueNumber <= 0) {
      return structuredError(params, 'invalid_input', 'issue_number must be a positive integer');
    }
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/issues/${issueNumber}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, issue: res.data };
  },

  async github_create_issue(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'title']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const title = String(params.title).trim();
    const body = params.body != null ? String(params.body) : undefined;
    const labels = Array.isArray(params.labels) ? params.labels : undefined;
    const assignees = Array.isArray(params.assignees) ? params.assignees : undefined;
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'POST', `/repos/${repo}/issues`, {
      title,
      ...(body != null ? { body } : {}),
      ...(labels ? { labels } : {}),
      ...(assignees ? { assignees } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, issue: res.data };
  },

  async github_update_issue(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'issue_number']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const issueNumber = asInt(params.issue_number, null);
    if (!issueNumber || issueNumber <= 0) {
      return structuredError(params, 'invalid_input', 'issue_number must be a positive integer');
    }
    const body = {};
    if (params.title != null) body.title = String(params.title);
    if (params.body != null) body.body = String(params.body);
    if (params.state != null) body.state = String(params.state);
    if (Array.isArray(params.labels)) body.labels = params.labels;
    if (Array.isArray(params.assignees)) body.assignees = params.assignees;
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'PATCH', `/repos/${repo}/issues/${issueNumber}`, body);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, issue: res.data };
  },

  async github_close_issue(params, env) {
    return await handlers.github_update_issue({ ...params, state: 'closed' }, env);
  },

  async github_search_code(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'q']);
    if (missing.length) return missingRequiredInput(params, missing);
    const q = String(params.q).trim();
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/search/code?q=${encodeURIComponent(q)}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, results: res.data };
  },

  async github_search_issues_prs(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'q']);
    if (missing.length) return missingRequiredInput(params, missing);
    const q = String(params.q).trim();
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/search/issues?q=${encodeURIComponent(q)}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, results: res.data };
  },

  async github_list_branches(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghPaged(t.token, `/repos/${repo}/branches`, 3);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, branches: Array.isArray(res.data) ? res.data : [] };
  },

  async github_create_branch(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'base', 'name']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const base = trim(params.base); // base branch name or SHA
    const name = trim(params.name);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;

    // Resolve base to SHA if it looks like a branch name.
    let sha = base;
    if (!/^[a-f0-9]{40}$/i.test(base)) {
      const refRes = await ghJson(t.token, 'GET', `/repos/${repo}/git/refs/heads/${encodeURIComponent(base)}`, null);
      if (refRes?.success === false) return { ...refRes, ...toolMeta(params) };
      sha = refRes.data?.object?.sha || '';
    }
    if (!trim(sha)) return structuredError(params, 'github_branch_create_failed', 'Unable to resolve base ref SHA');

    const res = await ghJson(t.token, 'POST', `/repos/${repo}/git/refs`, {
      ref: `refs/heads/${name}`,
      sha,
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, ref: res.data };
  },

  async github_delete_branch(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'branch']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const branch = trim(params.branch);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'DELETE', `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true };
  },

  async github_get_commit(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'sha']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const sha = trim(params.sha);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/commits/${encodeURIComponent(sha)}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, commit: res.data };
  },

  async github_compare_commits(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'base', 'head']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const base = trim(params.base);
    const head = trim(params.head);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(
      t.token,
      'GET',
      `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
      null,
    );
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, compare: res.data };
  },

  async github_list_workflow_runs(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const branch = trim(params.branch);
    const workflowId = trim(params.workflow_id);
    const status = trim(params.status);
    const event = trim(params.event);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const qs = new URLSearchParams();
    if (branch) qs.set('branch', branch);
    if (status) qs.set('status', status);
    if (event) qs.set('event', event);
    const path = workflowId
      ? `/repos/${repo}/actions/workflows/${encodeURIComponent(workflowId)}/runs?${qs.toString()}`
      : `/repos/${repo}/actions/runs?${qs.toString()}`;
    const res = await ghJson(t.token, 'GET', path, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, runs: res.data?.workflow_runs || res.data?.runs || [] };
  },

  async github_get_workflow_run(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'run_id']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const runId = asInt(params.run_id, null);
    if (!runId || runId <= 0) return structuredError(params, 'invalid_input', 'run_id must be a positive integer');
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/actions/runs/${runId}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, run: res.data };
  },

  async github_list_workflow_jobs(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'run_id']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const runId = asInt(params.run_id, null);
    if (!runId || runId <= 0) return structuredError(params, 'invalid_input', 'run_id must be a positive integer');
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/actions/runs/${runId}/jobs`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, jobs: res.data?.jobs || [] };
  },

  async github_get_job_logs(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'job_id']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const jobId = asInt(params.job_id, null);
    if (!jobId || jobId <= 0) return structuredError(params, 'invalid_input', 'job_id must be a positive integer');
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Authorization: `Bearer ${t.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'InnerAnimalMedia-AgentSam',
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return structuredError(params, 'github_api_error', `GitHub GET job logs → ${res.status}: ${detail.slice(0, 200)}`);
    }
    const text = await res.text().catch(() => '');
    return { success: true, log: text };
  },

  async github_get_commit_status(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'sha']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const sha = trim(params.sha);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}/commits/${encodeURIComponent(sha)}/status`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, status: res.data };
  },

  async github_set_commit_status(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo', 'sha', 'state']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const sha = trim(params.sha);
    const state = trim(params.state);
    const context = trim(params.context) || 'agentsam';
    const description = params.description != null ? String(params.description) : undefined;
    const target_url = params.target_url != null ? String(params.target_url) : undefined;
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'POST', `/repos/${repo}/statuses/${encodeURIComponent(sha)}`, {
      state,
      context,
      ...(description != null ? { description } : {}),
      ...(target_url != null ? { target_url } : {}),
    });
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    return { success: true, status: res.data };
  },

  async github_check_permission(params, env) {
    const missing = missingNonEmptyStrings(params, ['user_id', 'repo']);
    if (missing.length) return missingRequiredInput(params, missing);
    const repo = trim(params.repo);
    const t = await ghGetToken(env, params);
    if (t.success === false || t.error) return t;
    const res = await ghJson(t.token, 'GET', `/repos/${repo}`, null);
    if (res?.success === false) return { ...res, ...toolMeta(params) };
    const perms = res.data?.permissions || {};
    let permission = 'none';
    if (perms.admin) permission = 'admin';
    else if (perms.push) permission = 'write';
    else if (perms.pull) permission = 'read';
    return { success: true, permission, permissions: perms };
  },
};
