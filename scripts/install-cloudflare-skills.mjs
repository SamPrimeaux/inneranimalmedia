#!/usr/bin/env node
/**
 * Install Cloudflare skills suite: fetch from github.com/cloudflare/skills,
 * write .cursor/rules/*.mdc, emit migrations/461_cloudflare_skills.sql
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RULES_DIR = path.join(ROOT, '.cursor', 'rules');
const MIGRATION = path.join(ROOT, 'migrations', '461_cloudflare_skills.sql');

const CF_MCP_SERVERS = [
  'cloudflare-api',
  'cloudflare-docs',
  'cloudflare-bindings',
  'cloudflare-builds',
  'cloudflare-observability',
];

const SKILLS = [
  {
    id: 'skill_cf_cloudflare',
    dir: 'cloudflare',
    name: 'Cloudflare Platform',
    description:
      'Comprehensive Cloudflare platform guidance: Workers, D1, R2, KV, Queues, Vectorize, Agents SDK, security, and IaC.',
    slash_trigger: '/cf',
    task_types_json: '["deploy","debug","infra","worker","d1","r2","kv","queue"]',
    route_keys_json: '["cf_ops","debug","agent_cloudflare","db_read","db_write"]',
    tags_json: '["cloudflare","workers","d1","r2","kv","queues","vectorize","platform"]',
    file_path: 'skills/cloudflare/SKILL.md',
    mdc: 'cloudflare.mdc',
    mdc_description: 'Cloudflare platform — Workers, storage, AI, networking (official CF skills)',
    globs: 'src/**/*.js,wrangler*.toml,wrangler.production.toml',
    sort_order: 10,
  },
  {
    id: 'skill_cf_agents_sdk',
    dir: 'agents-sdk',
    name: 'Cloudflare Agents SDK',
    description: 'Build stateful AI agents on Cloudflare with WebSockets, state, tools, and workflows.',
    slash_trigger: '/cf-agent',
    task_types_json: '["agent","workflow","websocket","mcp"]',
    route_keys_json: '["agent_spawn","cf_ops","agent_cloudflare"]',
    tags_json: '["cloudflare","agents","websocket","stateful","mcp","streaming"]',
    file_path: 'skills/agents-sdk/SKILL.md',
    mdc: 'cloudflare-agents-sdk.mdc',
    mdc_description: 'Cloudflare Agents SDK — stateful agents, WebSockets, MCP',
    globs: 'src/**/*agent*.js,src/**/*worker*.js',
    sort_order: 11,
  },
  {
    id: 'skill_cf_durable_objects',
    dir: 'durable-objects',
    name: 'Cloudflare Durable Objects',
    description: 'Durable Objects: coordination, SQLite storage, RPC, WebSockets, alarms.',
    slash_trigger: '/do',
    task_types_json: '["durable_object","coordination","realtime"]',
    route_keys_json: '["cf_ops","debug"]',
    tags_json: '["cloudflare","durable-objects","sqlite","rpc","realtime","coordination"]',
    file_path: 'skills/durable-objects/SKILL.md',
    mdc: 'cloudflare-durable-objects.mdc',
    mdc_description: 'Cloudflare Durable Objects patterns',
    globs: 'src/**/*durable*.js,src/**/*do*.js',
    sort_order: 12,
  },
  {
    id: 'skill_cf_wrangler',
    dir: 'wrangler',
    name: 'Wrangler CLI',
    description: 'Wrangler deploy, bindings, D1, R2, KV, Vectorize, and Workers configuration.',
    slash_trigger: '/wrangler',
    task_types_json: '["deploy","config","d1","r2","kv","vectorize"]',
    route_keys_json: '["cf_ops","terminal_execution","db_read","db_write"]',
    tags_json: '["wrangler","deploy","cli","config","workers","bindings"]',
    file_path: 'skills/wrangler/SKILL.md',
    mdc: 'cloudflare-wrangler.mdc',
    mdc_description: 'Wrangler CLI — deploy and bindings',
    globs: 'wrangler*.toml,scripts/with-cloudflare-env.sh',
    sort_order: 13,
  },
  {
    id: 'skill_cf_sandbox_sdk',
    dir: 'sandbox-sdk',
    name: 'Cloudflare Sandbox SDK',
    description: 'Sandboxed code execution for secure interpreters and CI-style isolation.',
    slash_trigger: '/sandbox',
    task_types_json: '["code_execution","ci","security"]',
    route_keys_json: '["terminal_execution","cf_ops"]',
    tags_json: '["sandbox","code-execution","security","ci","isolation"]',
    file_path: 'skills/sandbox-sdk/SKILL.md',
    mdc: 'cloudflare-sandbox-sdk.mdc',
    mdc_description: 'Cloudflare Sandbox SDK — isolated execution',
    globs: 'src/**/*sandbox*.js,src/**/*exec*.js',
    sort_order: 14,
  },
  {
    id: 'skill_cf_web_perf',
    dir: 'web-perf',
    name: 'Web Performance (Core Web Vitals)',
    description: 'Measure and improve FCP, LCP, CLS, INP; audit dashboard and static assets.',
    slash_trigger: '/perf',
    task_types_json: '["performance","audit","vitals"]',
    route_keys_json: '["debug","agent_frontend"]',
    tags_json: '["performance","core-web-vitals","fcp","lcp","cls","audit"]',
    file_path: 'skills/web-perf/SKILL.md',
    mdc: 'cloudflare-web-perf.mdc',
    mdc_description: 'Web performance and Core Web Vitals',
    globs: 'dashboard/**/*.html,dashboard/**/*.js,dashboard/**/*.tsx',
    sort_order: 15,
  },
  {
    id: 'skill_cf_building_mcp_server',
    dir: 'building-mcp-server-on-cloudflare',
    name: 'Building MCP Server on Cloudflare',
    description: 'Remote MCP servers on Workers with tools, OAuth, and deployment.',
    slash_trigger: '/mcp-build',
    task_types_json: '["mcp","tool","oauth"]',
    route_keys_json: '["cf_ops","agent_spawn"]',
    tags_json: '["mcp","oauth","remote","tools","cloudflare"]',
    file_path: 'skills/building-mcp-server-on-cloudflare/SKILL.md',
    mdc: 'cloudflare-mcp-server.mdc',
    mdc_description: 'Build remote MCP servers on Cloudflare Workers',
    globs: 'src/api/mcp*.js,mcp-server/**/*.js',
    fallbackPath:
      '/Users/samprimeaux/.cursor/plugins/cache/cursor-public/cloudflare/fe4f2e9999991b36568e3d81a13de06a2b26bb20/skills/building-mcp-server-on-cloudflare/SKILL.md',
    sort_order: 16,
  },
  {
    id: 'skill_cf_building_ai_agent',
    dir: 'building-ai-agent-on-cloudflare',
    name: 'Building AI Agent on Cloudflare',
    description: 'Stateful AI agents with Agents SDK, tools, WebSockets, and durable execution.',
    slash_trigger: '/agent-build',
    task_types_json: '["agent","workflow","tool"]',
    route_keys_json: '["agent_spawn","cf_ops"]',
    tags_json: '["agent","cloudflare","websocket","tools","stateful"]',
    file_path: 'skills/building-ai-agent-on-cloudflare/SKILL.md',
    mdc: 'cloudflare-ai-agent.mdc',
    mdc_description: 'Build AI agents on Cloudflare',
    globs: 'src/api/cursor-agent.js,src/api/agent.js',
    fallbackPath:
      '/Users/samprimeaux/.cursor/plugins/cache/cursor-public/cloudflare/fe4f2e9999991b36568e3d81a13de06a2b26bb20/skills/building-ai-agent-on-cloudflare/SKILL.md',
    sort_order: 17,
  },
];

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

async function fetchSkill(skill) {
  const url = `https://raw.githubusercontent.com/cloudflare/skills/main/skills/${skill.dir}/SKILL.md`;
  const res = await fetch(url, { redirect: 'follow' });
  if (res.ok) return res.text();
  if (skill.fallbackPath) {
    try {
      await access(skill.fallbackPath);
      console.warn(`  fallback local: ${skill.fallbackPath}`);
      return readFile(skill.fallbackPath, 'utf8');
    } catch {
      /* continue */
    }
  }
  throw new Error(`fetch ${url} → ${res.status}`);
}

function buildMdc(skill, body) {
  return `---
description: ${skill.mdc_description}
globs: ${skill.globs}
alwaysApply: false
---

${body.trim()}
`;
}

function buildSkillInsert(skill, body) {
  const md = sqlEscape(body.trim());
  const desc = sqlEscape(skill.description);
  return `INSERT OR REPLACE INTO agentsam_skill (
  id, tenant_id, user_id, person_uuid, workspace_id, name, description,
  content_markdown, file_path, scope, slash_trigger, globs, always_apply,
  task_types_json, route_keys_json, default_model_key, model_constraints_json,
  access_mode, icon, tags_json, metadata_json, token_estimate, version,
  retrieval_strategy, is_active, sort_order, created_at, updated_at
) VALUES (
  '${skill.id}',
  'platform',
  'platform',
  '',
  NULL,
  '${sqlEscape(skill.name)}',
  '${desc}',
  '${md}',
  '${sqlEscape(skill.file_path)}',
  'global',
  '${sqlEscape(skill.slash_trigger)}',
  '${sqlEscape(skill.globs)}',
  0,
  '${skill.task_types_json}',
  '${skill.route_keys_json}',
  NULL,
  '{}',
  'read_only',
  'cloud',
  '${skill.tags_json}',
  '{"source":"github.com/cloudflare/skills","skill_dir":"${sqlEscape(skill.dir)}"}',
  ${Math.max(500, Math.ceil(body.length / 4))},
  1,
  'db',
  1,
  ${skill.sort_order},
  datetime('now'),
  datetime('now')
);`;
}

async function main() {
  await mkdir(RULES_DIR, { recursive: true });

  const sqlParts = [
    '-- 461: Cloudflare official skills suite (agentsam_skill + MCP servers + routes + commands)',
    '-- Source: https://github.com/cloudflare/skills',
    '-- Apply: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=migrations/461_cloudflare_skills.sql',
    '',
  ];

  for (const skill of SKILLS) {
    console.log(`fetch ${skill.dir}…`);
    const body = await fetchSkill(skill);
    const mdcPath = path.join(RULES_DIR, skill.mdc);
    await writeFile(mdcPath, buildMdc(skill, body), 'utf8');
    console.log(`  wrote ${path.relative(ROOT, mdcPath)}`);
    sqlParts.push(buildSkillInsert(skill, body));
    sqlParts.push('');
  }

  sqlParts.push(`-- CF remote MCP servers (bearer auth from env at runtime — never store tokens here)`);
  for (const row of [
    ['cloudflare-api', 'Cloudflare API', 'https://api.cloudflare.com/mcp', 'bearer'],
    ['cloudflare-docs', 'Cloudflare Docs', 'https://docs.cloudflare.com/mcp', 'none'],
    [
      'cloudflare-bindings',
      'Cloudflare Bindings',
      'https://bindings.mcp.cloudflare.com/mcp',
      'bearer',
    ],
    ['cloudflare-builds', 'Cloudflare Builds', 'https://builds.mcp.cloudflare.com/mcp', 'bearer'],
    [
      'cloudflare-observability',
      'Cloudflare Observability',
      'https://observability.mcp.cloudflare.com/mcp',
      'bearer',
    ],
  ]) {
    sqlParts.push(
      `INSERT OR IGNORE INTO agentsam_mcp_servers (server_key, display_name, url, auth_type, is_active, workspace_id, tenant_id) VALUES ('${row[0]}', '${row[1]}', '${row[2]}', '${row[3]}', 1, NULL, NULL);`,
    );
  }
  sqlParts.push('');

  const mcpTemplate = JSON.stringify(CF_MCP_SERVERS);
  sqlParts.push(
    `-- Route → CF MCP server keys (mcp_template JSON array; consumed by tool/MCP resolution)`,
  );
  for (const rk of ['cf_ops', 'debug', 'terminal_execution', 'db_write', 'db_read']) {
    sqlParts.push(
      `UPDATE agentsam_prompt_routes SET mcp_template = '${sqlEscape(mcpTemplate)}', updated_at = unixepoch() WHERE route_key = '${rk}' AND is_active = 1;`,
    );
  }
  sqlParts.push('');

  sqlParts.push(`-- Slash palette: Cloudflare build commands (platform workspace scope)`);
  sqlParts.push(`INSERT OR IGNORE INTO agentsam_commands (
  id, workspace_id, slug, display_name, description,
  mapped_command, category, risk_level, show_in_slash,
  task_type, modes_json, is_active, is_global, sort_order, execution_mode, router_type
) VALUES
  ('cmd_cf_build_agent', 'platform',
   'cloudflare:build-agent', 'Build CF AI Agent',
   'Build a stateful AI agent on Cloudflare using the Agents SDK with WebSockets, state, and tool integration.',
   '/cloudflare:build-agent', 'cloudflare', 'low', 1,
   'agent_workflow', '["agent","auto"]', 1, 1, 200, 'agent', 'skill'),
  ('cmd_cf_build_mcp', 'platform',
   'cloudflare:build-mcp', 'Build CF MCP Server',
   'Build a remote MCP server on Cloudflare with tools, OAuth, and deployment.',
   '/cloudflare:build-mcp', 'cloudflare', 'low', 1,
   'agent_workflow', '["agent","auto"]', 1, 1, 201, 'agent', 'skill');`);
  sqlParts.push('');
  sqlParts.push(`UPDATE agentsam_commands SET
  show_in_slash = 1,
  is_active = 1,
  updated_at = unixepoch()
WHERE id IN ('cmd_cf_build_agent', 'cmd_cf_build_mcp');`);

  await writeFile(MIGRATION, sqlParts.join('\n'), 'utf8');
  console.log(`wrote ${path.relative(ROOT, MIGRATION)} (${sqlParts.join('\n').length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
