#!/usr/bin/env node
/**
 * guard-engineering-laws.mjs — mechanical checks for AGENTS.md §3 / §5 / §9.
 * Exit non-zero on violation. Wire into ship paths: npm run guard:engineering-laws
 *
 * Checks:
 *  1. AGENTS.md exists at repo root with required section markers
 *  2. Trail writers must not contain GIT_SHORT / git_sha_short
 *  3. Loader must treat apply_mode=always as authoritative (no exclusive system|keyword SQL filter)
 *  4. New/edited migrations that INSERT agentsam_rules_document with apply_mode always
 *     must set trigger_type to system or keyword (scan migrations/9*.sql + 10*.sql)
 *  5. Optional remote: --remote fails if any active always-rule still has bad trigger_type
 *  6. Optional remote: rule body backticks that look like tool_keys must exist in
 *     agentsam_tools (is_active=1). Tables + Vectorize lane names are excluded.
 *
 * Meta (1–5) vs content (6): infrastructure wiring vs live catalog drift.
 * Prefer: npm run guard:engineering-laws:remote
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const remote = process.argv.includes('--remote');
let failures = 0;

function fail(msg) {
  console.error(`❌ guard:engineering-laws: ${msg}`);
  failures += 1;
}

function ok(msg) {
  console.error(`✅ ${msg}`);
}

// 1) AGENTS.md
const agentsPath = join(ROOT, 'AGENTS.md');
if (!existsSync(agentsPath)) {
  fail('AGENTS.md missing at repo root');
} else {
  const body = readFileSync(agentsPath, 'utf8');
  for (const needle of [
    'Proof over narration',
    'Timestamps are epoch integers',
    'Identifiers are full-length',
    'Flags are computed or actively reconciled',
    'Fail loud',
    'Independent verification',
    'Durable enforcement',
    'No new tables',
    'Rules only load',
    'rule_platform_lockdown_engineering_law',
  ]) {
    if (!body.includes(needle)) fail(`AGENTS.md missing required marker: ${needle}`);
  }
  if (!body.includes('MISSING_MARKER_THAT_DOES_NOT_EXIST')) {
    /* keep linter quiet — markers checked above */
  }
  if (failures === 0) ok('AGENTS.md present with law markers');
  else if (existsSync(agentsPath)) ok('AGENTS.md present (see marker failures above)');
}

// 2) Trail writer — no short-hash concept
const pdr = join(ROOT, 'scripts/post-deploy-record.sh');
if (existsSync(pdr)) {
  const t = readFileSync(pdr, 'utf8');
  if (/\bGIT_SHORT\b/.test(t)) fail('post-deploy-record.sh still defines/uses GIT_SHORT');
  if (/git_sha_short/.test(t)) fail('post-deploy-record.sh still writes git_sha_short');
  if (!/\[0-9a-f\]\{40\}/.test(t)) fail('post-deploy-record.sh missing 40-char SHA hard-fail');
  else ok('post-deploy-record.sh: no GIT_SHORT / requires 40-char SHA');
} else {
  fail('scripts/post-deploy-record.sh missing');
}

// 3) Loader must not exclusively filter system|keyword (disease that silenced LOCKED rules)
const loader = join(ROOT, 'src/core/agent-skills-rules.js');
if (existsSync(loader)) {
  const t = readFileSync(loader, 'utf8');
  // Only flag live SQL — ignore doc comments that quote the historical footgun.
  const sqlish = t
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/)/.test(line) && !/\*\s/.test(line.trim().slice(0, 2)))
    .join('\n');
  if (/trigger_type\s+IN\s*\(\s*'system'\s*,\s*'keyword'\s*\)/i.test(sqlish)) {
    fail(
      "agent-skills-rules.js still filters trigger_type IN ('system','keyword') — apply_mode=always rules with DEFAULT manual are invisible",
    );
  } else {
    ok('loader: apply_mode=always authoritative (no exclusive system|keyword SQL filter)');
  }
} else {
  fail('src/core/agent-skills-rules.js missing');
}

// 4) Migrations: INSERT agentsam_rules_document blocks should set trigger_type when always
const migDir = join(ROOT, 'migrations');
const migFiles = existsSync(migDir)
  ? readdirSync(migDir).filter((f) => /^([89]\d{2}|9\d{2}|10\d{2})_.*\.sql$/.test(f))
  : [];
for (const f of migFiles) {
  const sql = readFileSync(join(migDir, f), 'utf8');
  if (!/INSERT\s+(OR\s+REPLACE\s+|OR\s+IGNORE\s+)?INTO\s+agentsam_rules_document/i.test(sql)) {
    continue;
  }
  // Heuristic: if file mentions apply_mode always / 'always' near rules insert, require trigger_type
  const hasAlways =
    /apply_mode[^,]*,\s*'always'/i.test(sql) ||
    /'always'\s*,\s*'platform'/i.test(sql) ||
    (/LOCKED/i.test(sql) && /agentsam_rules_document/i.test(sql));
  if (!hasAlways) continue;
  if (!/trigger_type/i.test(sql)) {
    // Legacy pre-1005 inserts omitted trigger_type (hit DEFAULT manual). Flag only 1005+ style files
    // that claim always without the column — warn for 1002/1003 historically, fail for new.
    const num = parseInt(f.slice(0, 4), 10);
    if (num >= 1005) {
      fail(`${f}: agentsam_rules_document INSERT must set trigger_type explicitly`);
    }
  }
}

// 5) Optional remote D1 check (uses same env loader as other gate scripts)
if (remote) {
  try {
    const { loadEnvCloudflare, REPO_ROOT } = await import('./lib/load-env-cloudflare.mjs');
    const { d1Query } = await import('./lib/d1-remote.mjs');
    loadEnvCloudflare(REPO_ROOT);
    const rows = d1Query(
      `SELECT id, trigger_type FROM agentsam_rules_document
       WHERE COALESCE(is_active,0)=1
         AND lower(COALESCE(apply_mode,''))='always'
         AND lower(COALESCE(trigger_type,'')) NOT IN ('system','keyword')
       LIMIT 20`,
    );
    if (rows.length) {
      fail(
        `remote: ${rows.length} always-rules still non-system/keyword: ${rows.map((x) => x.id).join(',')}`,
      );
    } else {
      ok('remote D1: no invisible apply_mode=always rows');
    }
    const law = d1Query(
      `SELECT id, trigger_type, apply_mode, sort_order, source_stored
       FROM agentsam_rules_document WHERE id='rule_platform_lockdown_engineering_law' LIMIT 1`,
    )[0];
    if (!law || law.trigger_type !== 'system' || String(law.apply_mode) !== 'always') {
      fail(`remote: rule_platform_lockdown_engineering_law missing or misconfigured: ${JSON.stringify(law)}`);
    } else {
      ok(`remote D1: engineering law live (sort_order=${law.sort_order}, source=${law.source_stored})`);
    }

    // 6) Rule content drift — backtick identifiers that look like tools must be active tool_keys
    const activeTools = new Set(
      d1Query(`SELECT tool_key FROM agentsam_tools WHERE COALESCE(is_active, 1) = 1`).map(
        (r) => r.tool_key,
      ),
    );
    const tables = new Set(
      d1Query(`SELECT name FROM sqlite_master WHERE type = 'table'`).map((r) => r.name),
    );
    const rules = d1Query(
      `SELECT id, body_markdown FROM agentsam_rules_document WHERE COALESCE(is_active, 0) = 1`,
    );
    const IDENT_RE = /`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g;
    const looksLikeTool = (ident) => /^(agentsam_|fs_|browser_|gmail_|pty_|cdt_)/.test(ident);
    // Vectorize index / binding lane names share agentsam_ prefix but are not tools.
    const isVectorizeLane = (ident) =>
      /_(?:oai3large|gemini\d*|1536|3072)\b|_1536$|_3072$/.test(ident);
    let toolDrift = 0;
    for (const rule of rules) {
      const body = String(rule.body_markdown || '');
      const seen = new Set();
      let m;
      IDENT_RE.lastIndex = 0;
      while ((m = IDENT_RE.exec(body))) {
        const ident = m[1];
        if (!looksLikeTool(ident) || seen.has(ident)) continue;
        seen.add(ident);
        if (activeTools.has(ident)) continue;
        if (tables.has(ident)) continue;
        if (isVectorizeLane(ident)) continue;
        fail(`${rule.id}: references \`${ident}\` — not an active tool_key`);
        toolDrift += 1;
      }
    }
    if (!toolDrift) ok('remote D1: no rule references a nonexistent/inactive tool');
  } catch (e) {
    fail(`remote D1 check failed: ${e?.message || e}`);
  }
}

if (failures) {
  console.error(`\nguard:engineering-laws FAILED (${failures}) — see AGENTS.md`);
  process.exit(1);
}
console.error('\nguard:engineering-laws OK');
process.exit(0);
