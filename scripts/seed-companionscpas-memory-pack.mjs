#!/usr/bin/env node
/**
 * Idempotent CompanionsCPAS Agent Sam memory pack (state + policy + decision).
 * D1 agentsam_memory + mirror to agentsam.agentsam_memory.
 *
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-companionscpas-memory-pack.mjs
 *   ./scripts/with-cloudflare-env.sh node scripts/seed-companionscpas-memory-pack.mjs --mirror-only
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { mapD1RowToPrivateMemory } from '../src/core/agentsam-private-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TENANT_ID = 'tenant_sam_primeaux';
const WORKSPACE_ID = 'ws_inneranimalmedia';
const USER_ID = 'au_871d920d1233cbd1';

const MEMORIES = [
  {
    key: 'companionscpas_cms_publish_flow_live_2026_05_29',
    memory_type: 'state',
    title: 'CompanionsCPAS CMS publish flow — live production snapshot',
    importance: 8,
    tags: ['companionscpas', 'cms', 'publish', 'r2', 'kv', 'production', 'may29'],
    source: 'cursor_memory_pack_20260529',
    value: `# Agent Sam Memory Pack — CompanionsCPAS CMS / R2 / KV / OAuth / Publish Flow

CompanionsCPAS public CMS publish flow is now confirmed end-to-end working on production.

Confirmed live production route:
https://companionscpas.meauxbility.workers.dev

Latest repo baseline:

* afe5324 — Repair CompanionsCPAS public hero and mobile drawer design
* 2379ef6 — Include shared JS in CMS rendered public shell
* d5cdb07 — Unify CompanionsCPAS public CMS serving
* d4e18ac — Normalize CompanionsCPAS CMS publish contract
* b68a338 — Repair CompanionsCPAS mobile public shell

Confirmed deployed Worker Version ID after final CSS/design patch:
2d822a96-91d4-48e0-850a-d1ed5aa3b0cc

Confirmed live CSS marker:
/* cpas-public-design-repair-v2-marker */
Live marker appeared at line 1874 from:
/static/global/shared.css

Public pages confirmed with unified shell references:

* /
* /about
* /adopt
* /services
* /donate

Each route confirmed live with:

* class="site-main"
* correct data-route
* href="/static/global/shared.css"
* src="/static/global/shared.js"
* site-header

All five pages successfully published through authenticated /api/cms/publish:

* / → static/pages/index.html
* /about → static/pages/about/index.html
* /adopt → static/pages/adopt/index.html
* /services → static/pages/services/index.html
* /donate → static/pages/donate/index.html

Successful publish job IDs from the first confirmed end-to-end run:

* / → pub_mpqsvknd_ehi6za
* /about → pub_mpqsvmtc_8s1eve
* /adopt → pub_mpqsvok0_fxunzu
* /services → pub_mpqsvps9_plceui
* /donate → pub_mpqsvr29_s4uvpk

Confirmed production bindings:

* D1 DB: companionscpas
* R2 bucket: companionscpas
* KV namespace binding: CMS_CACHE
* KV namespace id: 0b410337a8494fc982ea04c5bde1eab4
* R2 global CSS key: static/global/shared.css
* R2 global JS key: static/global/shared.js

Important auth note:
/api/cms/publish requires an authenticated dashboard session cookie. The cookie name is cpas_session, discovered in src/api/session_api.js. Do not paste live session values into chat. Use locally only.`,
  },
  {
    key: 'companionscpas_non_negotiable_change_sync_contract',
    memory_type: 'policy',
    title: 'CompanionsCPAS non-negotiable change sync contract',
    importance: 9,
    tags: ['companionscpas', 'policy', 'cms', 'deploy', 'sync'],
    source: 'cursor_memory_pack_20260529',
    value: `For CompanionsCPAS and similar CMS/D1/KV/R2-driven page/component work, every repair, refinement, or update must follow the full sync pipeline. Do not make one-off CSS/HTML/source edits without syncing source of truth, deploy/runtime assets, cache, verification, and git.

Non-negotiable command flow:

1. Inspect/audit the live issue and relevant source files.
2. Patch the source of truth, not stale generated artifacts when avoidable.
3. Validate syntax/smoke:

   * node --check for changed JS files
   * grep/marker checks for CSS and route contracts
4. Deploy Worker/assets with:

   * wrangler deploy -c wrangler.toml
5. Publish global R2 assets when shared CSS/JS changed:

   * wrangler r2 object put companionscpas/static/global/shared.css --remote --file public/_shared.css --content-type "text/css; charset=utf-8" -c wrangler.toml
   * wrangler r2 object put companionscpas/static/global/shared.js --remote --file public/_shared.js --content-type "application/javascript; charset=utf-8" -c wrangler.toml
6. Publish CMS page artifacts when page/section/render changes affect public pages:

   * POST authenticated /api/cms/publish
   * pages: /, /about, /adopt, /services, /donate
7. Purge remote KV cache:

   * brand:tenant_companionscpas
   * page:/
   * page:/home
   * page:/about
   * page:/adopt
   * page:/services
   * page:/donate
8. Verify live route contract:

   * every public route must include /static/global/shared.css
   * every public route must include /static/global/shared.js
   * every public route must include site-header
   * every public route must include class="site-main"
   * every public route must include the correct data-route
   * no Unsupported section type
   * no Page unavailable
9. Commit and push tracked files to main.
10. Leave working tree clean or explicitly report untracked files.

This contract exists because CompanionsCPAS is not a static/basic website. It is intended to be a nonprofit OS with D1-driven CMS, R2 artifacts, KV cache, Agent Sam support, forms, donations, Resend/email, OAuth integrations, Meta/Google/YouTube-style integrations, and self-service editing.`,
  },
  {
    key: 'companionscpas_architecture_decisions_2026_05_29',
    memory_type: 'decision',
    title: 'CompanionsCPAS architecture decisions 2026-05-29',
    importance: 8,
    tags: ['companionscpas', 'architecture', 'cms', 'oauth', 'memory'],
    source: 'cursor_memory_pack_20260529',
    value: `CompanionsCPAS architecture decisions confirmed:

1. Public page runtime must be unified.
   The public pages /, /about, /adopt, /services, and /donate should use the same CMS serving contract instead of mixed hardcoded handlers. src/index.js now imports renderPage and uses servePublicPage() for the public CMS pages.

2. Runtime contract:
   D1 CMS rows → /api/cms/publish → renderPage() → renderSection() → R2 static page artifacts → KV page cache → live public routes.

3. Shared global shell assets:
   Every public page must reference:

* /static/global/shared.css
* /static/global/shared.js

4. Home page should no longer stay on separate renderHome() serving logic in src/index.js. The unified CMS public page route is the preferred path.

5. render_page.js was patched to include shared JS in the assembled CMS-rendered shell:
   <script src="/static/global/shared.js"></script>

6. render_section.js was patched to support fundraising sections by mapping:
   fundraising: renderDonationBlock

7. OAuth direction:
   Use one OAuth/control-plane lane, not dual-laned chaos. Current dashboard auth works behind custom OAuth/session gate. Integration OAuth for Google, YouTube, Meta Business, Instagram, Resend-adjacent workflows should be unified under oauth_integrations plus secret_vault_items, not fragmented into unrelated auth systems.

8. oauth_integrations now has added control-plane secret reference columns:

* connection_scope
* access_secret_id
* refresh_secret_id
* client_secret_id
* webhook_secret_id

9. Operational Agent Sam memory policy:
   Use agentsam_memory_save for durable/private operational truth, backed by D1 agentsam_memory and agentsam.agentsam_memory, no Vectorize required, no public.agent_memory.

10. Semantic/RAG memory lane:
    Use agentsam_memory_write only for Vectorize semantic/RAG lane. Do not use it for operational state/policy memory.

Preferred operational memory types:

* policy for durable rule / guardrail / operating law
* state for current production/runtime snapshot
* project for milestone/session summary
* decision for architecture/product decision
* error for known issue/bug/fix context
* skill for reusable process
* preference for Sam/user preference
* fact for stable reference`,
  },
  {
    key: 'companionscpas_stripe_elements_donation_live_2026_06',
    memory_type: 'state',
    title: 'CompanionsCPAS Stripe Elements donation — live Jun 2026',
    importance: 9,
    tags: ['companionscpas', 'donations', 'stripe', 'elements', 'webhook', 'production', 'jun2026', 'smoke-passed'],
    source: 'donation_smoke_20260612',
    value: `CompanionsCPAS Stripe Elements in-modal donation flow is live and smoke-tested on companionsofcaddo.org (Jun 2026).

Flow: Support Our Mission on /donate → donate-modal.js → campaign + amount → Stripe PaymentElement (mode elements) → confirm in-modal; hosted Checkout fallback (mode checkout).

API: POST /api/donations/checkout — elements returns client_secret; checkout returns checkout_url.

Stripe webhook destination we_1ThIx5RGnRsvqnfiDsw6zLfE → POST /api/webhooks/stripe.

SMOKE PASSED 2026-06-12 13:12:05 UTC:
- PaymentIntent pi_3ThUsRRGnRsvqnfi1kMVqPb5 — $30.00 (3000 cents) succeeded
- stripe_webhooks: payment_intent.succeeded + checkout.session.completed — both processed
- donations row created (succeeded)
- Worker STRIPE_WEBHOOK_SECRET rotated; deploy 070fcadb-c51b-4874-840a-958553ce1fa5

Known follow-up: dual webhook events can duplicate donations (same stripe_payment_intent_id) — PI idempotency on checkout.session.completed in payments_email.js.

Active campaigns: campaign_companions_second_chances_2026, camp_medical, camp_food, camp_transport.`,
  },
];

const UPSERT_SQL = `
INSERT INTO agentsam.agentsam_memory (
  tenant_id, workspace_id, user_id, memory_type, memory_key,
  title, content, summary, value_json, source, external_ref, tags,
  confidence, importance, expires_at, is_pinned, is_archived,
  embedding, embedded_at, sync_key, d1_id, updated_at
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9::jsonb, $10, $11, $12::text[],
  $13, $14, $15::timestamptz, $16, false,
  NULL, NULL, $17, $18, now()
)
ON CONFLICT (tenant_id, user_id, memory_key) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  memory_type = EXCLUDED.memory_type,
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  summary = EXCLUDED.summary,
  value_json = EXCLUDED.value_json,
  source = EXCLUDED.source,
  tags = EXCLUDED.tags,
  confidence = EXCLUDED.confidence,
  importance = EXCLUDED.importance,
  sync_key = EXCLUDED.sync_key,
  updated_at = now()`;

function loadEnvCloudflare() {
  const p = resolve(ROOT, '.env.cloudflare');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

function d1ExecuteFile(sqlPath) {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--file',
      sqlPath,
    ],
    { cwd: ROOT, stdio: 'inherit', env: process.env },
  );
}

function upsertD1(mem) {
  const now = Math.floor(Date.now() / 1000);
  const syncKey = `${TENANT_ID}:${USER_ID}:${mem.key}`;
  const summary = mem.value.slice(0, 400);
  const tagsJson = JSON.stringify(mem.tags);
  const id = `mem_${mem.key.replace(/[^a-z0-9]+/gi, '_').slice(0, 48)}`;
  const sql = `INSERT INTO agentsam_memory (
  id, tenant_id, user_id, workspace_id, memory_type, key, value, title, summary,
  source, tags, confidence, importance, is_pinned, sync_key, updated_at
) VALUES (
  '${sqlEscape(id)}',
  '${sqlEscape(TENANT_ID)}',
  '${sqlEscape(USER_ID)}',
  '${sqlEscape(WORKSPACE_ID)}',
  '${sqlEscape(mem.memory_type)}',
  '${sqlEscape(mem.key)}',
  '${sqlEscape(mem.value)}',
  '${sqlEscape(mem.title)}',
  '${sqlEscape(summary)}',
  '${sqlEscape(mem.source)}',
  '${sqlEscape(tagsJson)}',
  1.0,
  ${mem.importance},
  1,
  '${sqlEscape(syncKey)}',
  ${now}
)
ON CONFLICT(tenant_id, user_id, key) DO UPDATE SET
  value = excluded.value,
  memory_type = excluded.memory_type,
  title = excluded.title,
  summary = excluded.summary,
  workspace_id = excluded.workspace_id,
  source = excluded.source,
  tags = excluded.tags,
  importance = excluded.importance,
  is_pinned = excluded.is_pinned,
  sync_key = excluded.sync_key,
  updated_at = excluded.updated_at;`;
  const scratch = resolve(ROOT, '.scratch', `seed_cpas_mem_${mem.key}.sql`);
  writeFileSync(scratch, sql, 'utf8');
  try {
    d1ExecuteFile(scratch);
  } finally {
    try {
      unlinkSync(scratch);
    } catch {
      /* ignore */
    }
  }
}

function d1Json(sql) {
  const out = execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'inneranimalmedia-business',
      '--remote',
      '-c',
      'wrangler.production.toml',
      '--json',
      '--command',
      sql,
    ],
    { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024 },
  );
  const start = out.indexOf('[');
  return JSON.parse(out.slice(start))[0]?.results ?? [];
}

function pgOptions(dbUrl) {
  const useSsl =
    /\.supabase\.co\b/.test(dbUrl) ||
    /\.pooler\.supabase\.com\b/.test(dbUrl) ||
    /supabase\.com/.test(dbUrl);
  return {
    connectionString: dbUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

async function mirrorKeys(keys) {
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL — skip PG mirror');
    return { ok: false, error: 'no_supabase_db_url' };
  }
  const inList = keys.map((k) => `'${sqlEscape(k)}'`).join(',');
  const rows = d1Json(
    `SELECT * FROM agentsam_memory WHERE tenant_id = '${sqlEscape(TENANT_ID)}' AND user_id = '${sqlEscape(USER_ID)}' AND key IN (${inList})`,
  );
  const client = new pg.Client(pgOptions(dbUrl));
  await client.connect();
  const report = { upserted: [], errors: [] };
  try {
    for (const row of rows) {
      const m = mapD1RowToPrivateMemory(row);
      if (!m.workspace_id) m.workspace_id = WORKSPACE_ID;
      try {
        await client.query(UPSERT_SQL, [
          m.tenant_id,
          m.workspace_id,
          m.user_id,
          m.memory_type,
          m.memory_key,
          m.title,
          m.content,
          m.summary,
          JSON.stringify(m.value_json),
          m.source,
          m.external_ref,
          m.tags,
          m.confidence,
          m.importance,
          m.expires_at,
          m.is_pinned,
          m.sync_key,
          m.d1_id,
        ]);
        report.upserted.push({
          memory_key: m.memory_key,
          sync_key: m.sync_key,
          memory_type: m.memory_type,
        });
      } catch (e) {
        report.errors.push({
          key: m.memory_key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
  report.ok = report.errors.length === 0;
  return report;
}

async function main() {
  loadEnvCloudflare();
  const mirrorOnly = process.argv.includes('--mirror-only');
  const report = { d1: [], mirror: null };

  if (!mirrorOnly) {
    for (const mem of MEMORIES) {
      upsertD1(mem);
      report.d1.push({ key: mem.key, memory_type: mem.memory_type, ok: true });
    }
  }

  report.mirror = await mirrorKeys(MEMORIES.map((m) => m.key));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.mirror?.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
