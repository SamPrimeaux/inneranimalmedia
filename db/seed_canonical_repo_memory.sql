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
  'Git remote: https://github.com/SamPrimeaux/inneranimalmedia | branch: main | baseline commit: 81d3ed3 chore: establish clean inneranimalmedia repo root. Local path: /Users/samprimeaux/Downloads/inneranimalmedia. Layout: dashboard/ = Dashboard Vite app; public marketing HTML = R2 pages/* via ASSETS; src/ = Worker; scripts/ = root deploy scripts; wrangler.jsonc + wrangler.production.toml. Do not use legacy path inneranimalmedia-agentsam-dashboard, old origin history, or nested agent-dashboard roots. Never commit .env.cloudflare or real secrets.',
  'sam_platform_setup_2026-05-02',
  1.0
)
ON CONFLICT(user_id, workspace_id, key) DO UPDATE SET
  value = excluded.value,
  source = excluded.source,
  confidence = excluded.confidence,
  updated_at = unixepoch();

INSERT INTO agentsam_project_context (
  id,
  project_key,
  project_name,
  project_type,
  status,
  priority,
  description,
  goals,
  key_files,
  related_routes,
  notes,
  workspace_id,
  tenant_id,
  created_by
) VALUES (
  'ctx_inneranimalmedia_clean_root',
  'inneranimalmedia_monorepo',
  'Inner Animal Media (clean root)',
  'platform',
  'active',
  100,
  'Single canonical repository for worker (src/) and dashboard (dashboard/) after repo flattening.',
  'Keep dashboard build via npm run build:vite-only from repo root; deploy worker with wrangler.production.toml; public marketing HTML remains R2 (ASSETS) with shared iam-header; do not regress to nested agent-dashboard-only workflows.',
  'package.json, wrangler.production.toml, wrangler.jsonc, dashboard/, src/index.js, scripts/promote-to-prod.sh (if present)',
  '/dashboard/agent, /api/*, public ASSET_ROUTES in src/index.js',
  'Linked memory key: repo_canonical_inneranimalmedia_v1. Supersedes ad-hoc notes about inneranimalmedia-agentsam-dashboard checkout.',
  'ws_inneranimalmedia',
  'tenant_sam_primeaux',
  'sam_primeaux'
)
ON CONFLICT(id) DO UPDATE SET
  project_name = excluded.project_name,
  description = excluded.description,
  goals = excluded.goals,
  key_files = excluded.key_files,
  related_routes = excluded.related_routes,
  notes = excluded.notes,
  updated_at = unixepoch();
