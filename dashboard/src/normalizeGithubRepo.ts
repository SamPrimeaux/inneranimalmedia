/** Canonical owner/repo slug for D1 workspaces.github_repo and chat context. */
export function normalizeGithubRepo(full: string): string {
  return String(full || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}
