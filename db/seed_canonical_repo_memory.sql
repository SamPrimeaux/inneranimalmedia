-- One-time / idempotent: canonical Inner Animal Media monorepo (clean root).
-- DB: inneranimalmedia-business
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=db/seed_canonical_repo_memory.sql

INSERT INTO agentsam_memory (
  tenant_id,
  user_id,
  workspace_id,
  memory_type,
  key,
  value,
  source,
  confidence
) VALUES (
  'tenant_sam_primeaux',
  'sam_primeaux',
  'ws_inneranimalmedia',
  'fact',
  'repo_canonical_inneranimalmedia_v1',
  'Git remote: https://github.com/SamPrimeaux/inneranimalmedia | branch: main. Local path: /Users/samprimeaux/inneranimalmedia. Worker entry: src/index.js. Deploy: npm run deploy:full. Platform context router: agentsam_memory.key=iam_platform_context_router_v1 (pinned). D1 compass: ctx_inneranimalmedia. Do not use inneranimalmedia-agentsam-dashboard or ~/Downloads/inneranimalmedia.',
  'sam_platform_setup_2026-05-02',
  1.0
)
ON CONFLICT(user_id, workspace_id, key) DO UPDATE SET
  value = excluded.value,
  source = excluded.source,
  confidence = excluded.confidence,
  updated_at = unixepoch();

-- Project context SSOT: ctx_inneranimalmedia only (see migrations/637_ctx_inneranimalmedia_platform_refresh.sql).
-- ctx_inneranimalmedia_clean_root was deleted 2026-06-14 — do not re-seed a duplicate row.
