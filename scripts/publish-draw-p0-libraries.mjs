#!/usr/bin/env node
/**
 * Upload P0 Excalidraw libraries to TOOLS R2 + seed draw_libraries (migration 783).
 * Usage: node scripts/publish-draw-p0-libraries.mjs [--downloads-only] [--skip-upload] [--skip-migration]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeExcalidrawLibraryPayload } from '../src/core/excalidraw-library-normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADS = path.join(process.env.HOME || '', 'Downloads');
const BUCKET = 'tools';
const R2_PREFIX = '__tools__/draw';
const PUBLIC_R2_PREFIX = 'draw';
const PUBLIC_BASE = 'https://tools.inneranimalmedia.com/draw';

/** @type {Array<{ slug: string, filename: string, name: string, category: string, icon: string, sort_order: number, auto_load: number, agent_tags: string[], description: string, localFile?: string }>} */
const P0 = [
  {
    slug: 'awesome-slides',
    filename: 'awesome-slides.excalidrawlib',
    name: 'Awesome Slides',
    category: 'Presentation',
    icon: '📊',
    sort_order: 30,
    auto_load: 0,
    agent_tags: ['slides', 'presentation', 'deck', 'pitch'],
    description: 'Slide frames, title blocks, and deck layout primitives for storyboards.',
  },
  {
    slug: 'mobile-kit',
    filename: 'mobile-kit.excalidrawlib',
    name: 'Mobile Kit',
    category: 'Wireframe',
    icon: '📱',
    sort_order: 11,
    auto_load: 1,
    agent_tags: ['wireframe', 'mobile', 'ios', 'android', 'ux'],
    description: 'Phone/tablet chrome and mobile UI blocks for app wireframes.',
  },
  {
    slug: 'apple-devices-frames',
    filename: 'apple-devices-frames.excalidrawlib',
    name: 'Apple Device Frames',
    category: 'Wireframe',
    icon: '🍎',
    sort_order: 12,
    auto_load: 1,
    agent_tags: ['wireframe', 'apple', 'device', 'mockup', 'ux'],
    description: 'iPhone/iPad/Mac device bezels for product mockups.',
  },
  {
    slug: 'universal-ui-kit',
    filename: 'universal-ui-kit.excalidrawlib',
    name: 'Universal UI Kit',
    category: 'Wireframe',
    icon: '🧩',
    sort_order: 13,
    auto_load: 1,
    agent_tags: ['wireframe', 'ui', 'components', 'ux', 'forms'],
    description: 'Cross-platform buttons, inputs, nav, cards, and layout blocks.',
  },
  {
    slug: 'web-kit',
    filename: 'web-kit.excalidrawlib',
    name: 'Web Kit',
    category: 'Wireframe',
    icon: '🌐',
    sort_order: 14,
    auto_load: 1,
    agent_tags: ['wireframe', 'web', 'landing', 'saas', 'ux'],
    description: 'Desktop web page sections, headers, heroes, and content blocks.',
  },
  {
    slug: 'gantt',
    filename: 'gantt.excalidrawlib',
    name: 'Gantt / Timeline',
    category: 'Planning',
    icon: '📅',
    sort_order: 40,
    auto_load: 0,
    agent_tags: ['gantt', 'timeline', 'planning', 'project'],
    description: 'Timeline bars, milestones, and schedule layout elements.',
  },
  {
    slug: 'lofi-wireframe',
    filename: 'lo-fi-wireframing-kit.excalidrawlib',
    name: 'Lo-Fi Wireframing',
    category: 'Wireframe',
    icon: '🖼',
    sort_order: 10,
    auto_load: 1,
    agent_tags: ['wireframe', 'lofi', 'sketch', 'ux'],
    description: 'Hand-drawn lo-fi boxes, arrows, and annotation marks.',
  },
  {
    slug: 'agentsam-system-design',
    filename: 'agentsam-system-design-template.excalidrawlib',
    name: 'Agent Sam System Design',
    category: 'Architecture',
    icon: '🏗',
    sort_order: 20,
    auto_load: 1,
    agent_tags: ['architecture', 'system-design', 'agentsam', 'diagram'],
    description: 'IAM system-design template — services, queues, data stores.',
    localFile: 'agentsam-system-design-template.excalidrawlib',
  },
  {
    slug: 'agentsam-forms',
    filename: 'agentsam_forms_excalidraw.excalidrawlib',
    name: 'Agent Sam Forms',
    category: 'Wireframe',
    icon: '📝',
    sort_order: 15,
    auto_load: 1,
    agent_tags: ['wireframe', 'forms', 'agentsam', 'ux'],
    description: 'Form fields, validation states, and wizard step patterns.',
    localFile: 'agentsam_forms_excalidraw.excalidrawlib',
  },
];

const args = new Set(process.argv.slice(2));
const skipUpload = args.has('--skip-upload');
const skipMigration = args.has('--skip-migration');

function wrangler(wrArgs, { json = false } = {}) {
  return execFileSync('./scripts/with-cloudflare-env.sh', ['npx', 'wrangler', ...wrArgs], {
    cwd: root,
    stdio: json ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
}

function resolveLocalPath(entry) {
  const name = entry.localFile || entry.filename;
  const candidates = [
    path.join(DOWNLOADS, name),
    path.join(root, 'static', 'draw', name),
  ];
  for (const p of candidates) {
    try {
      statSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(`Missing library file: ${name} (checked Downloads and static/draw)`);
}

function countItems(filePath, slug) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  return normalizeExcalidrawLibraryPayload(raw, { slug }).length;
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function buildUpsertSql(rows) {
  const lines = rows.map((r) => {
    const tags = sqlEscape(JSON.stringify(r.agent_tags));
    return `INSERT INTO draw_libraries (
  id, tenant_id, slug, name, filename, category, icon,
  r2_bucket, r2_key, public_url, file_size_bytes, item_count,
  is_active, sort_order, auto_load, agent_tags, description, updated_at
) VALUES (
  'lib_${r.slug.replace(/-/g, '_')}',
  'tenant_sam_primeaux',
  '${sqlEscape(r.slug)}',
  '${sqlEscape(r.name)}',
  '${sqlEscape(r.filename)}',
  '${sqlEscape(r.category)}',
  '${sqlEscape(r.icon)}',
  'tools',
  '${R2_PREFIX}/${sqlEscape(r.filename)}',
  '${PUBLIC_BASE}/${sqlEscape(r.filename)}',
  ${r.file_size_bytes},
  ${r.item_count},
  1,
  ${r.sort_order},
  ${r.auto_load},
  '${tags}',
  '${sqlEscape(r.description)}',
  unixepoch()
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  filename = excluded.filename,
  category = excluded.category,
  icon = excluded.icon,
  r2_bucket = excluded.r2_bucket,
  r2_key = excluded.r2_key,
  public_url = excluded.public_url,
  file_size_bytes = excluded.file_size_bytes,
  item_count = excluded.item_count,
  is_active = 1,
  sort_order = excluded.sort_order,
  auto_load = excluded.auto_load,
  agent_tags = excluded.agent_tags,
  description = excluded.description,
  updated_at = unixepoch();`;
  });
  return `-- P0 draw_libraries seed (generated by publish-draw-p0-libraries.mjs)\n${lines.join('\n\n')}\n`;
}

const enriched = [];

for (const entry of P0) {
  const localPath = resolveLocalPath(entry);
  const size = statSync(localPath).size;
  const itemCount = countItems(localPath, entry.slug);
  const r2Key = `${R2_PREFIX}/${entry.filename}`;

  console.log(`\n${entry.slug}: ${itemCount} items, ${size} bytes ← ${localPath}`);

  if (!skipUpload) {
    for (const key of [`${R2_PREFIX}/${entry.filename}`, `${PUBLIC_R2_PREFIX}/${entry.filename}`]) {
      wrangler([
        'r2', 'object', 'put', `${BUCKET}/${key}`,
        '--remote', '-c', 'wrangler.production.toml',
        '--file', localPath,
        '--content-type', 'application/json',
      ]);
    }
    const code = execFileSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', `${PUBLIC_BASE}/${entry.filename}`], {
      encoding: 'utf8',
    }).trim();
    console.log(`  public URL ${PUBLIC_BASE}/${entry.filename} → HTTP ${code}`);
  }

  enriched.push({ ...entry, file_size_bytes: size, item_count: itemCount });
}

const migrationPath = path.join(root, 'migrations/783_draw_libraries_p0_seed.sql');
const sql = buildUpsertSql(enriched);
if (!skipMigration) {
  writeFileSync(migrationPath, sql);
  console.log(`\nWrote ${migrationPath}`);
  wrangler([
    'd1', 'execute', 'inneranimalmedia-business',
    '--remote', '-c', 'wrangler.production.toml',
    '--file', migrationPath,
  ]);
  console.log('D1 migration 783 applied.');
} else {
  console.log('\n--skip-migration: SQL not written/applied.');
}

console.log('\nDone. P0 libraries:', enriched.map((r) => r.slug).join(', '));
