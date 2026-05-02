#!/usr/bin/env node
/**
 * Pulls filtered D1 table DDL from production and writes docs/d1-agentic-schema.md
 * (one ## per table for ingest chunking).
 *
 * Requires: ./scripts/with-cloudflare-env.sh + wrangler (remote D1).
 * Run: node scripts/generate-d1-agentic-schema.js
 */
import fs from 'fs';
import pathMod from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = pathMod.dirname(fileURLToPath(import.meta.url));
const root = pathMod.join(__dirname, '..');
const outPath = pathMod.join(root, 'docs', 'd1-agentic-schema.md');

const SQL = `SELECT name, sql FROM sqlite_master
WHERE type='table'
AND name NOT LIKE 'sqlite_%'
AND name NOT LIKE '_cf_%'
AND (
  name LIKE 'agent_%' OR
  name LIKE 'agentsam_%' OR
  name LIKE 'ai_%' OR
  name LIKE 'mcp_%' OR
  name LIKE 'cursor_%' OR
  name LIKE 'workflow_%' OR
  name LIKE 'terminal_%' OR
  name LIKE 'tool_%' OR
  name LIKE 'command_%' OR
  name LIKE 'project_memory%' OR
  name LIKE 'prompt_%' OR
  name LIKE 'iam_%' OR
  name LIKE 'kanban_%' OR
  name LIKE 'task%' OR
  name LIKE 'dev_workflow%' OR
  name LIKE 'memory_%' OR
  name LIKE 'execution_%' OR
  name LIKE 'hook_%' OR
  name LIKE 'work_session%' OR
  name LIKE 'brainstorm_%'
)
ORDER BY name`;

const wrapper = pathMod.join(root, 'scripts', 'with-cloudflare-env.sh');
const args = [
  'npx',
  'wrangler',
  'd1',
  'execute',
  'inneranimalmedia-business',
  '--remote',
  '-c',
  'wrangler.production.toml',
  '--command',
  SQL,
  '--json',
];

let raw;
try {
  raw = execFileSync(wrapper, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw.trim());
} catch (e) {
  console.error('Failed to parse wrangler JSON:', raw.slice(0, 500));
  process.exit(1);
}

const rows = parsed[0]?.results ?? parsed.results ?? [];
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('No rows from D1');
  process.exit(1);
}

let md = `# D1 agentic schema (filtered)

Source: remote D1 \`inneranimalmedia-business\`, \`sqlite_master\`.

Filter: \`sqlite_master\` tables excluding \`sqlite_%\` and \`_cf_%\`, including prefixes \`agent_%\`, \`agentsam_%\`, \`ai_%\`, \`mcp_%\`, \`cursor_%\`, \`workflow_%\`, \`terminal_%\`, \`tool_%\`, \`command_%\`, \`project_memory%\`, \`prompt_%\`, \`iam_%\`, \`kanban_%\`, \`task%\`, \`dev_workflow%\`, \`memory_%\`, \`execution_%\`, \`hook_%\`, \`work_session%\`, \`brainstorm_%\`.

Total tables: **${rows.length}**.

Each \`##\` section is one ingest chunk.

`;

for (const row of rows) {
  const name = row.name;
  const sql = row.sql || '';
  md += `## ${name}\n\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n`;
}

fs.mkdirSync(pathMod.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, 'utf8');
console.log('Wrote', outPath, 'tables:', rows.length);
