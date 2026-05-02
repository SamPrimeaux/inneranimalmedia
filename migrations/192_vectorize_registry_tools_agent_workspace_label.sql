-- 192: Relabel vidx_d1_cosine_knowledge -> TOOLS bucket / agent workspace (not AutoRAG, not D1-only RAG).
-- Replaces misleading MANUAL_D1_RAG copy from 191.
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/192_vectorize_registry_tools_agent_workspace_label.sql

UPDATE vectorize_index_registry
SET
  id = 'vidx_tools_agent_workspace',
  binding_name = 'MANUAL_TOOLS_AGENT_WORKSPACE',
  index_name = 'tools-inneranimalmedia-com',
  display_name = 'TOOLS bucket — agent workspace (Monaco, Excalidraw, shell)',
  source_type = 'r2_bucket',
  source_r2_bucket = 'tools',
  source_r2_prefix = NULL,
  is_preferred = 0,
  description = 'Registry row for the tools R2 bucket (public tools.inneranimalmedia.com): IAM workspace shell HTML, Monaco saves under monaco/, Excalidraw scenes under excalidraw/, and related agent-authored artifacts. This is not the AutoRAG knowledge index (see VECTORIZE_INDEX / vidx_autorag). Not a Cloudflare Vectorize index unless you add a separate index job over this bucket.',
  use_cases = '["monaco_save","excalidraw_scene","iam_workspace_shell","tools_public_url"]',
  updated_at = datetime('now')
WHERE id = 'vidx_d1_cosine_knowledge';
