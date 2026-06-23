/**
 * Workspace-scoped delivery workflow for in-app Agent Sam.
 * Injects ship discipline (implement → validate → commit/push → deploy → next steps)
 * only for IAM-managed build workspaces — never assumed globally.
 */
import { getAgentsamWorkspace, parseWorkspaceMetadata } from './agentsam-workspace.js';

function trim(v) {
  return v == null ? '' : String(v).trim();
}

/** Collab / client IAM build lanes (not main platform or MCP). */
const IAM_COLLAB_SHIP_SLUGS = new Set(['fuelnfreetime', 'companionscpas']);

const MCP_REPO = 'SamPrimeaux/inneranimalmedia-mcp-server';
const MCP_ROOT_DEFAULT = '/Users/samprimeaux/inneranimalmedia-mcp-server';
const MAIN_REPO = 'SamPrimeaux/inneranimalmedia';
const MAIN_ROOT_DEFAULT = '/Users/samprimeaux/inneranimalmedia';

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function workspaceSlugFromRow(row) {
  if (!row) return '';
  return trim(row.workspace_slug || row.worker_name || row.id?.replace(/^ws_/, '')).toLowerCase();
}

/**
 * MCP worker workspace — separate repo, worker, and deploy path from main IAM app.
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isMcpServerWorkspace(row) {
  if (!row) return false;
  const slug = workspaceSlugFromRow(row);
  if (slug === 'inneranimalmedia-mcp') return true;
  const gh = trim(row.github_repo).toLowerCase();
  if (gh === MCP_REPO.toLowerCase()) return true;
  const worker = trim(row.worker_name).toLowerCase();
  if (worker === 'inneranimalmedia-mcp-server') return true;
  const kind = trim(parseWorkspaceMetadata(row.metadata_json).workspace_kind).toLowerCase();
  return kind === 'mcp_server';
}

/**
 * Main IAM platform app (inneranimalmedia.com) — not the MCP server repo.
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isMainIamPlatformWorkspace(row) {
  if (!row) return false;
  if (isMcpServerWorkspace(row)) return false;
  const slug = workspaceSlugFromRow(row);
  if (slug === 'inneranimalmedia') return true;
  const gh = trim(row.github_repo).toLowerCase();
  return gh === MAIN_REPO.toLowerCase();
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function workspaceHasShipProfile(row) {
  if (!row) return false;
  if (isMcpServerWorkspace(row) || isMainIamPlatformWorkspace(row)) return true;
  const slug = workspaceSlugFromRow(row);
  if (slug && IAM_COLLAB_SHIP_SLUGS.has(slug)) return true;
  const meta = parseWorkspaceMetadata(row.metadata_json);
  if (meta.delivery_workflow === true || meta.ship_workflow === true) return true;
  return false;
}

function deployPatternsFromRow(row) {
  const meta = parseWorkspaceMetadata(row?.metadata_json);
  const patterns = meta.deploy_patterns;
  return patterns && typeof patterns === 'object' ? patterns : {};
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function resolveWorkspaceShipProfile(row) {
  if (!workspaceHasShipProfile(row)) return null;

  const slug = workspaceSlugFromRow(row);
  const githubRepo = trim(row.github_repo) || null;
  const meta = parseWorkspaceMetadata(row.metadata_json);
  const patterns = deployPatternsFromRow(row);
  const deployFromMeta = trim(meta.deploy_command || meta.deployCommand);
  const rootPath =
    trim(row.root_path) ||
    trim(meta.repo?.local_path) ||
    (isMcpServerWorkspace(row) ? MCP_ROOT_DEFAULT : isMainIamPlatformWorkspace(row) ? MAIN_ROOT_DEFAULT : null);

  if (isMcpServerWorkspace(row)) {
    const deployCommand =
      deployFromMeta ||
      trim(patterns.full) ||
      'npm run deploy:full';
    return {
      kind: 'mcp_server',
      slug,
      githubRepo: githubRepo || MCP_REPO,
      workerName: trim(row.worker_name) || 'inneranimalmedia-mcp-server',
      rootPath: rootPath || MCP_ROOT_DEFAULT,
      deployCommand,
      validateHint:
        trim(patterns.validate_worker) ||
        'node --check src/index.js — MCP worker repo only (no dashboard/vite build)',
      deployUrl: trim(row.deploy_url) || 'https://mcp.inneranimalmedia.com',
      repoNote:
        'This is the **MCP server** repo (`inneranimalmedia-mcp-server`), not `inneranimalmedia`. ' +
        'Edit, commit, and deploy only from the MCP repo root. Never run main-app `npm run build:vite-only` here.',
      migrationsNote:
        'D1 migrations for MCP live in the MCP repo when changed — do not apply inneranimalmedia migrations from the wrong repo.',
    };
  }

  if (isMainIamPlatformWorkspace(row)) {
    const deployCommand =
      deployFromMeta ||
      trim(patterns.full) ||
      'npm run deploy:full';
    return {
      kind: 'main_saas',
      slug,
      githubRepo: githubRepo || MAIN_REPO,
      workerName: trim(row.worker_name) || 'inneranimalmedia',
      rootPath: rootPath || MAIN_ROOT_DEFAULT,
      deployCommand,
      validateHint:
        [
          trim(patterns.build_vite) ? `${trim(patterns.build_vite)} when dashboard touched` : null,
          trim(patterns.validate_worker) || 'node --check on edited worker .js',
        ]
          .filter(Boolean)
          .join('; '),
      deployUrl: trim(row.deploy_url) || 'https://inneranimalmedia.com',
      repoNote:
        'This is the **main IAM platform** repo (`inneranimalmedia`). ' +
        'For MCP OAuth/tools work, switch to the `inneranimalmedia-mcp` workspace — separate repo and deploy.',
      migrationsNote:
        'Apply inneranimalmedia D1 migrations via wrangler against inneranimalmedia-business when SQL changed.',
    };
  }

  const deployCommand =
    deployFromMeta ||
    trim(patterns.full) ||
    (trim(row.deploy_url)
      ? `Deploy worker ${trim(row.worker_name) || slug} (${trim(row.deploy_url)})`
      : null);

  return {
    kind: 'collab',
    slug,
    githubRepo,
    workerName: trim(row.worker_name) || null,
    rootPath,
    deployCommand,
    validateHint: 'Build/lint/check touched files for this workspace repo before commit.',
    deployUrl: trim(row.deploy_url) || null,
    repoNote: rootPath ? `Work in repo root: ${rootPath}` : null,
    migrationsNote: null,
  };
}

const DELIVERY_HEADING = '## Delivery workflow (LOCKED — active workspace)';

/**
 * @param {ReturnType<typeof resolveWorkspaceShipProfile>} profile
 * @param {{ mode?: string }} [opts]
 */
export function buildDeliveryWorkflowPromptBlock(profile, opts = {}) {
  if (!profile) return '';
  if (trim(opts.mode).toLowerCase() === 'ask') return '';

  const cwdLine = profile.rootPath
    ? `All file edits, git, and terminal work: **\`${profile.rootPath}\`** (this workspace repo only).`
    : 'Work only in this workspace repo — do not assume the main IAM app root.';

  const lines = [
    DELIVERY_HEADING,
    '',
    profile.repoNote || '',
    cwdLine,
    '',
    'Unless the user explicitly says **local only**, **no commit**, **no push**, **no deploy**, **plan only**, or **review only**, complete this order for every implementation task:',
    '',
    '1. **Finish the work** — end-to-end; no partial handoffs.',
    `2. **Validate locally** — ${profile.validateHint || 'build/lint/check touched files.'}`,
    `3. **Commit + push** — in \`${profile.githubRepo || 'this repo'}\`; why-focused message; never secrets.`,
  ];

  if (profile.deployCommand) {
    lines.push(
      `4. **Deploy** — from repo root \`${profile.rootPath || 'see workspace root'}\`: \`${profile.deployCommand}\`.`,
    );
    if (profile.migrationsNote) lines.push(`   ${profile.migrationsNote}`);
  } else {
    lines.push('4. **Deploy** — only when this workspace has a documented deploy path.');
  }

  lines.push(
    '5. **Follow up** — shipped, verified checks, git commit hash, and 1–3 logical next steps.',
    '',
    'Do **not** ask permission to commit or deploy when no opt-out was given — execute the workflow.',
    'Never force-push main. Never skip hooks unless the user asked.',
  );

  const ctx = [
    profile.kind ? `lane: ${profile.kind}` : null,
    profile.slug ? `slug: ${profile.slug}` : null,
    profile.workerName ? `worker: ${profile.workerName}` : null,
    profile.deployUrl ? `live: ${profile.deployUrl}` : null,
  ].filter(Boolean);
  if (ctx.length) lines.push('', `Context: ${ctx.join(' · ')}`);

  return lines.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
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
