-- 193: vectorize_index_registry — align binding_name with Worker R2 binding env.TOOLS (do not rename wrangler binding).
--
-- Apply prod:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/193_vectorize_registry_binding_tools.sql

UPDATE vectorize_index_registry
SET
  binding_name = 'TOOLS',
  description = 'Registry row for the tools R2 bucket bound as env.TOOLS in worker (public tools.inneranimalmedia.com): IAM workspace shell HTML, Monaco saves under monaco/, Excalidraw under excalidraw/. Not AutoRAG (see VECTORIZE_INDEX / vidx_autorag). Not a Cloudflare Vectorize index unless you add one.',
  updated_at = datetime('now')
WHERE id = 'vidx_tools_agent_workspace';
