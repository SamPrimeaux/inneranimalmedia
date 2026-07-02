/**
 * Bundle Gorilla shell templates from agentsam-sdk into a Worker-importable module.
 * Run after updating ../agentsam-sdk/templates/gorilla-shell/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sdkRoot = path.resolve(repoRoot, '..', 'agentsam-sdk');
const templateDir = path.join(sdkRoot, 'templates', 'gorilla-shell');
const outFile = path.join(repoRoot, 'src/core/sdk-gorilla-template.generated.js');

const FILES = {
  'gorilla/App.tsx': 'App.tsx',
  'gorilla/main.jsx': 'main.jsx',
  'gorilla/index.html': 'index.html',
  'vite.config.js': 'vite.config.js',
};

if (!fs.existsSync(templateDir)) {
  console.error(`Missing template dir: ${templateDir}`);
  process.exit(1);
}

const bundled = {};
for (const [dest, src] of Object.entries(FILES)) {
  const full = path.join(templateDir, src);
  if (!fs.existsSync(full)) {
    console.error(`Missing template file: ${full}`);
    process.exit(1);
  }
  bundled[dest] = fs.readFileSync(full, 'utf8');
}

const body = `/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: agentsam-sdk/templates/gorilla-shell/
 * Regenerate: node scripts/bundle-sdk-gorilla-template.mjs
 */
export const SDK_GORILLA_TEMPLATE_RAW = ${JSON.stringify(bundled, null, 2)};
`;

fs.writeFileSync(outFile, body, 'utf8');
console.log(`Wrote ${outFile} (${Object.keys(bundled).length} files)`);
