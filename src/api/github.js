/**
 * API Layer: GitHub
 * Thin adapter — all logic lives in src/integrations/github.js.
 *
 * Handles three path prefixes routed here from router.js:
 *   /api/github/*
 *   /api/agent/github/*
 *   /api/integrations/github/*
 *
 * Normalizes /api/integrations/github/repos → /api/github/repos
 * so the integration handler's canonical path stripping works correctly.
 */
import { handleGitHubApi } from '../integrations/github.js';

export async function handleGithubApi(request, url, env, ctx) {
  // Normalize /api/integrations/github/* → /api/github/*
  // so handleGitHubApi's prefix stripping produces the right canonical path.
  if (url.pathname.startsWith('/api/integrations/github')) {
    const normalized = url.pathname.replace('/api/integrations/github', '/api/github');
    const rewritten  = new URL(request.url);
    rewritten.pathname = normalized;
    return handleGitHubApi(new Request(rewritten.toString(), request), env);
  }

  return handleGitHubApi(request, env);
}
