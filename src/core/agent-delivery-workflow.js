/**
 * Workspace-scoped delivery workflow for in-app Agent Sam.
 * Injects ship discipline (implement → validate → commit/push → deploy → next steps)
 * only for IAM-managed build workspaces — never assumed globally.
 */
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Slugs where IAM expects full delivery workflow by default. */
const IAM_SHIP_SLUGS = new Set([
  'inneranimalmedia',
  'inneranimalmedia-mcp',
  'fuelnfreetime',
  'companionscpas',
]);

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function workspaceSlugFromRow(row) {
  if (!row) return '';
  return trim(row.workspace_slug || row.worker_name || row.id?.replace(/^ws_/, '')).toLowerCase();
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function workspaceHasShipProfile(row) {
  if (!row) return false;
  const slug = workspaceSlugFromRow(row);
  if (slug && IAM_SHIP_SLUGS.has(slug)) return true;
  const gh = trim(row.github_repo).toLowerCase();
  if (gh.startsWith('samprimeaux/inneranimalmedia')) return true;
  const meta = parseWorkspaceMetadata(row.metadata_json);
  if (meta.delivery_workflow === true || meta.ship_workflow === true) return true;
  return false;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolveWorkspaceShipProfile(row) {
  if (!workspaceHasShipProfile(row)) return null;
  const slug = workspaceSlugFromRow(row);
  const githubRepo = trim(row.github_repo) || null;
  const meta = parseWorkspaceMetadata(row.metadata_json);
  const deployFromMeta = trim(meta.deploy_command || meta.deployCommand);

  let deployCommand = deployFromMeta || null;
  let validateHint =
    'Run project build/lint on touched areas (inneranimalmedia: npm run build:vite-only, node --check on edited .js).';

  if (!deployCommand) {
    if (slug === 'inneranimalmedia-mcp' || (githubRepo && githubRepo.toLowerCase().includes('mcp-server'))) {
      deployCommand = 'cd inneranimalmedia-mcp-server && npm run deploy:full';
    } else if (slug === 'inneranimalmedia' || githubRepo?.toLowerCase() === 'samprimeaux/inneranimalmedia') {
      deployCommand = 'npm run deploy:full (inneranimalmedia repo root — not deploy alone)';
    } else if (trim(row.deploy_url)) {
      deployCommand = `Deploy to ${trim(row.deploy_url)} using this workspace worker (${trim(row.worker_name) || slug}).`;
    }
  }

  return {
    slug,
    githubRepo,
    workerName: trim(row.worker_name) || null,
    deployCommand,
    validateHint,
    rootPath: trim(row.root_path) || null,
  };
}

const DELIVERY_HEADING = '## Delivery workflow (LOCKED — active workspace)';

/**
 * @param {{ slug?: string, githubRepo?: string|null, workerName?: string|null, deployCommand?: string|null, validateHint?: string, rootPath?: string|null }} profile
 * @param {{ mode?: string }} [opts]
 */
export function buildDeliveryWorkflowPromptBlock(profile, opts = {}) {
  if (!profile) return '';
  if (trim(opts.mode).toLowerCase() === 'ask') return '';

  const lines = [
    DELIVERY_HEADING,
    '',
    'Unless the user explicitly says **local only**, **no commit**, **no push**, **no deploy**, **plan only**, or **review only**, complete this order for every implementation task:',
    '',
    '1. **Finish the work** — end-to-end; no partial handoffs.',
    `2. **Validate locally** — ${profile.validateHint || 'build/lint/check touched files.'}`,
    '3. **Commit + push** — why-focused message; never commit secrets (.env, tokens).',
  ];

  if (profile.deployCommand) {
    lines.push(`4. **Deploy** — \`${profile.deployCommand}\`. Apply D1 migrations separately when SQL files changed.`);
  } else {
    lines.push(
      '4. **Deploy** — only when this workspace has a known deploy path; do not guess for unknown repos.',
    );
  }

  lines.push(
    '5. **Follow up** — state shipped, verified checks, git commit hash, and 1–3 logical next steps.',
    '',
    'Do **not** ask permission to commit or deploy when no opt-out was given — execute the workflow.',
    'Never force-push main. Never skip hooks unless the user asked.',
  );

  const ctx = [
    profile.slug ? `workspace slug: ${profile.slug}` : null,
    profile.githubRepo ? `github: ${profile.githubRepo}` : null,
    profile.workerName ? `worker: ${profile.workerName}` : null,
    profile.rootPath ? `root: ${profile.rootPath}` : null,
  ].filter(Boolean);
  if (ctx.length) lines.push('', `Context: ${ctx.join(' · ')}`);

  return lines.join('\n');
}

/**
 * @param {any} env
 * @param {string} systemPrompt
 * @param {{ workspaceId?: string|null, mode?: string }} opts
 */
export async function appendDeliveryWorkflowToPrompt(env, systemPrompt, opts = {}) {
  const ws = trim(opts.workspaceId);
  if (!ws || trim(opts.mode).toLowerCase() === 'ask') return systemPrompt;

  const row = await getAgentsamWorkspace(env, ws);
  const profile = resolveWorkspaceShipProfile(row);
  if (!profile) return systemPrompt;

  const block = buildDeliveryWorkflowPromptBlock(profile, opts);
  if (!block || systemPrompt.includes(DELIVERY_HEADING)) return systemPrompt;

  return `${systemPrompt}\n\n${block}\n`;
}
