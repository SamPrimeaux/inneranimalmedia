#!/usr/bin/env node
/**
 * Batch theme preview / package generation — delegates to generate-theme-package.mjs.
 *
 *   node scripts/themes/generate-theme-previews.mjs --slug iam-storm-white --dry-run
 *   node scripts/themes/generate-theme-previews.mjs --all-active --limit 20 --upload-r2 --remote
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgScript = path.join(__dirname, "generate-theme-package.mjs");

function parseArgs(argv) {
  let slug = "";
  let allActive = false;
  let limit = 0;
  let uploadR2 = false;
  let remote = false;
  let dryRun = false;
  for (const a of argv) {
    if (a.startsWith("--slug=")) slug = a.slice("--slug=".length).trim();
    else if (a === "--all-active") allActive = true;
    else if (a.startsWith("--limit=")) limit = Math.max(0, parseInt(a.slice("--limit=".length), 10) || 0);
    else if (a === "--upload-r2") uploadR2 = true;
    else if (a === "--remote") remote = true;
    else if (a === "--dry-run") dryRun = true;
  }
  return { slug, allActive, limit, uploadR2, remote, dryRun };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const extra = [];
  if (opts.uploadR2) extra.push("--upload-r2");
  if (opts.remote) extra.push("--remote");
  if (opts.dryRun) extra.push("--dry-run");
  if (opts.limit > 0) extra.push(`--limit=${opts.limit}`);

  if (opts.slug) {
    execFileSync(process.execPath, [pkgScript, `--slug=${opts.slug}`, ...extra], { stdio: "inherit" });
    return;
  }

  if (opts.allActive) {
    execFileSync(process.execPath, [pkgScript, "--all-active", ...extra], { stdio: "inherit" });
    return;
  }

  console.error("Use --slug=<slug> or --all-active");
  process.exit(1);
}

await main();
