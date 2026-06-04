import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

/** Load gitignored .env.cloudflare without overriding existing process.env. */
export function loadEnvCloudflare(repoRoot = REPO_ROOT) {
  const p = path.join(repoRoot, '.env.cloudflare');
  if (!existsSync(p)) return { path: p, loaded: false };
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('export ')) {
      const m = trimmed.match(/^export\s+([A-Z0-9_]+)=(.*)/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
  return { path: p, loaded: true };
}
