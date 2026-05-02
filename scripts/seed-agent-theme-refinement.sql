-- Seed Agent Sam knowledge base: Theme and component refinement
-- Run once so Agent Sam can help refine/repair/redesign themes and dashboard components from the Agent UI.
-- Usage: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/seed-agent-theme-refinement.sql
--
-- Schema: ai_knowledge_base (id TEXT PK, tenant_id, title, content, content_type, category, source_url, author, metadata_json, embedding_*, chunk_count, token_count, is_indexed, is_active, created_at, updated_at)

-- Insert or replace the theme/component refinement guide (system-wide so every tenant's agent sees it)
-- Content is under 1500 chars so it fits in the agent's knowledge blurb.
INSERT OR REPLACE INTO ai_knowledge_base (
  id,
  tenant_id,
  title,
  content,
  content_type,
  category,
  source_url,
  author,
  metadata_json,
  chunk_count,
  token_count,
  is_indexed,
  is_active,
  created_at,
  updated_at
) VALUES (
  'kb_theme_component_refinement',
  'system',
  'Theme and component refinement',
  'Themes: Table cms_themes (id, name, slug, config JSON). GET /api/themes lists themes. Config keys: text (--text-nav, --text-primary), textSecondary (--text-secondary), nav, bg, surface, border, primary. To fix dark-theme contrast set config.text and config.textSecondary to light hex (#f1f5f9, #94a3b8). SQL to update: UPDATE cms_themes SET config = json_set(coalesce(json(config), ''{}''), ''$.text'', ''#f1f5f9'', ''$.textSecondary'', ''#94a3b8'') WHERE slug = ?; User refreshes dashboard after update; no deploy. Suggest SQL first, wait for approval. Other components: Dashboard HTML in repo dashboard/*.html; served from R2 agent-sam at static/dashboard/<name>.html. To publish: upload file to R2 then npm run deploy. Upload one file: ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml. Full doc: docs/AGENT_THEME_AND_COMPONENT_REFINEMENT.md.',
  'document',
  'design',
  NULL,
  NULL,
  '{}',
  0,
  0,
  0,
  1,
  unixepoch(),
  unixepoch()
);

-- Invalidate compiled context cache so next agent chat picks up the new knowledge
DELETE FROM ai_compiled_context_cache WHERE context_hash LIKE '%system%';
