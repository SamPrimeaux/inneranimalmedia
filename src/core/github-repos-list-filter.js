/**
 * GitHub /user/repos list scoping for dashboard + agent surfaces.
 * Drops org-wide read visibility (organization_member) and platform operator repos
 * for accounts that are not the platform owner.
 */

export const GITHUB_USER_REPOS_AFFILIATION = 'owner,collaborator';

/** GitHub owners/orgs that belong to the platform operator — hide from other logins. */
export const PLATFORM_GITHUB_OWNERS = new Set(['samprimeaux', 'inneranimalmedia']);

function trim(v) {
  return v == null ? '' : String(v).trim();
}

function parseOwnerFromRepo(repo) {
  const ownerLogin = trim(repo?.owner?.login);
  if (ownerLogin) return ownerLogin.toLowerCase();
  const full = trim(repo?.full_name);
  if (!full.includes('/')) return '';
  return full.slice(0, full.indexOf('/')).trim().toLowerCase();
}

function hasWriteCollaboration(repo) {
  const perms = repo?.permissions || {};
  return !!(perms.push || perms.admin || perms.maintain);
}

/**
 * @param {unknown[]} repos
 * @param {string} userLogin — connected GitHub account (e.g. connordmcneely96)
 * @param {{ allowPlatformRepos?: boolean }} [opts]
 * @returns {unknown[]}
 */
export function filterGithubReposListForUser(repos, userLogin, opts = {}) {
  const login = trim(userLogin).toLowerCase();
  if (!login || !Array.isArray(repos)) return [];
  if (opts.allowPlatformRepos === true) return repos;

  return repos.filter((repo) => {
    const owner = parseOwnerFromRepo(repo);
    if (!owner) return false;

    if (owner === login) return true;

    if (PLATFORM_GITHUB_OWNERS.has(owner)) return false;

    return hasWriteCollaboration(repo);
  });
}
