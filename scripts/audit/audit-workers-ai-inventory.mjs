#!/usr/bin/env node
/**
 * Audit Workers AI catalog vs agentsam_ai picker; flag stale paths and duplicates.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function query(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  const raw = execSync(
    `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --json --command ${JSON.stringify(oneLine)}`,
    { cwd: root, encoding: 'utf8' },
  );
  return JSON.parse(raw)[0]?.results ?? [];
}

const catalog = query(`
SELECT model_key, workers_ai_model_id, is_active
FROM agentsam_model_catalog
WHERE provider='workers_ai' AND workers_ai_model_id IS NOT NULL
ORDER BY workers_ai_model_id
`);

const picker = query(`
SELECT id, model_key, status, show_in_picker, sort_order
FROM agentsam_ai
WHERE provider='workers_ai' AND mode='model'
ORDER BY model_key, status
`);

const activePicker = picker.filter((r) => r.status === 'active' && r.show_in_picker === 1);
const catalogActive = catalog.filter((r) => r.is_active === 1);

const byModelKey = new Map();
for (const row of picker) {
  const k = row.model_key;
  if (!byModelKey.has(k)) byModelKey.set(k, []);
  byModelKey.get(k).push(row);
}
const duplicateKeys = [...byModelKey.entries()].filter(([, rows]) => rows.length > 1);

const catalogIds = new Set(catalogActive.map((r) => r.workers_ai_model_id));
const pickerKeys = new Set(activePicker.map((r) => r.model_key));
const catalogOnly = catalogActive.filter((r) => !pickerKeys.has(r.workers_ai_model_id) && !pickerKeys.has(r.model_key));
const pickerWithoutCatalog = activePicker.filter(
  (r) => !catalogIds.has(r.model_key) && !catalog.some((c) => c.model_key === r.model_key && c.is_active === 1),
);

const report = {
  generated_at: new Date().toISOString(),
  catalog_active: catalogActive.length,
  picker_active: activePicker.length,
  duplicate_model_keys: duplicateKeys.map(([k, rows]) => ({
    model_key: k,
    ids: rows.map((r) => ({ id: r.id, status: r.status })),
  })),
  catalog_active_not_in_picker: catalogOnly.map((r) => r.workers_ai_model_id),
  picker_active_without_catalog: pickerWithoutCatalog.map((r) => r.model_key),
  execos_notes: {
    minimax_m3: catalogActive.some((r) => r.workers_ai_model_id === '@cf/minimax/m3') ? 'catalog_on' : 'missing',
    glm_fallback: activePicker.some((r) => r.model_key === '@cf/zai-org/glm-4.7-flash') ? 'picker_on' : 'missing',
  },
};

console.log(JSON.stringify(report, null, 2));
if (duplicateKeys.length) process.exitCode = 2;
